'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dispatchPending, dispatchSoon } from '@/lib/notify/dispatch';
import { all, bool, done, errorMessage, fail, list, num, str } from '@/lib/actions/util';
import type { ActionState } from '@/lib/types';

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return { supabase, user: data.user };
}

function jobFields(fd: FormData) {
  return {
    title: str(fd, 'title'),
    department_id: str(fd, 'department_id'),
    job_type: str(fd, 'job_type') || 'full_time',
    description: str(fd, 'description'),
    responsibilities: str(fd, 'responsibilities'),
    requirements: str(fd, 'requirements'),
    skills: list(fd, 'skills'),
    province: str(fd, 'province'),
    work_mode: str(fd, 'work_mode') || 'onsite',
    salary_min: str(fd, 'salary_min').replace(/,/g, ''),
    salary_max: str(fd, 'salary_max').replace(/,/g, ''),
    pay_unit: str(fd, 'pay_unit') || 'month',
    gig_days: str(fd, 'gig_days'),
    gig_start: str(fd, 'gig_start'),
    gig_end: str(fd, 'gig_end'),
    headcount: str(fd, 'headcount') || '1',
    challenge_seats: str(fd, 'challenge_seats') || '10',
    closes_at: str(fd, 'closes_at') ? `${str(fd, 'closes_at')}T23:59:00+07:00` : ''
  };
}

function challengeFields(fd: FormData) {
  const names = all(fd, 'crit_name');
  const weights = all(fd, 'crit_weight');
  const criteria = names
    .map((n, i) => ({ name: n.trim(), weight: Number(weights[i] || 0) }))
    .filter((c) => c.name);
  return {
    title: str(fd, 'ch_title'),
    brief: str(fd, 'ch_brief'),
    deliverable: str(fd, 'ch_deliverable'),
    time_limit_minutes: str(fd, 'ch_minutes') || '60',
    due_days: str(fd, 'ch_due_days') || '3',
    criteria,
    ai_policy: str(fd, 'ch_ai_policy') || 'allowed_declare',
    skill_key: str(fd, 'ch_skill_key'),
    accept_reuse: bool(fd, 'ch_accept_reuse')
  };
}

export async function saveJobAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const cid = str(fd, 'company_id');
  const jobId = str(fd, 'job_id') || null;
  const intent = str(fd, 'intent');
  const fields = jobFields(fd);
  if (fields.title.length < 2) return fail({ message: 'ตั้งชื่อตำแหน่งงาน' });
  const { data, error } = await supabase.rpc('save_job', { p_company: cid, p_job: jobId, p_fields: fields });
  if (error) return fail(error);
  const id = data as string;
  if (str(fd, 'ch_title') || str(fd, 'ch_brief')) {
    const { error: e2 } = await supabase.rpc('save_challenge', { p_job: id, p_fields: challengeFields(fd) });
    if (e2) {
      revalidatePath(`/c/${cid}/jobs`);
      return fail({ message: `บันทึกประกาศแล้ว แต่โจทย์ยังไม่ผ่าน: ${errorMessage(e2)}` });
    }
  }
  if (intent === 'publish') {
    const { data: status, error: e3 } = await supabase.rpc('submit_job', { p_job: id });
    if (e3) {
      revalidatePath(`/c/${cid}/jobs`);
      return fail({ message: `บันทึกร่างแล้ว แต่ยังเผยแพร่ไม่ได้: ${errorMessage(e3)}` });
    }
    dispatchSoon();
    revalidatePath(`/c/${cid}`, 'layout');
    redirect(`/c/${cid}/jobs/${id}?published=${status as string}`);
  }
  revalidatePath(`/c/${cid}`, 'layout');
  if (!jobId) redirect(`/c/${cid}/jobs/${id}?saved=1`);
  return done('บันทึกแล้ว');
}

export async function closeJobAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const cid = str(fd, 'company_id');
  const { data, error } = await supabase.rpc('close_job', { p_job: str(fd, 'job_id'), p_message: str(fd, 'message') || null });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${cid}`, 'layout');
  const r = data as { auto_replied: number; still_in_process: number };
  return done(`ปิดประกาศแล้ว ตอบผู้สมัครที่รออยู่ ${r.auto_replied} คน${r.still_in_process ? ` · ยังมี ${r.still_in_process} คนอยู่ในรอบสัมภาษณ์หรือข้อเสนอ ตอบในหน้าผู้สมัคร` : ''}`);
}

export async function deleteJobAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  const cid = str(fd, 'company_id');
  await supabase.rpc('delete_job', { p_job: str(fd, 'job_id') });
  revalidatePath(`/c/${cid}/jobs`);
  redirect(`/c/${cid}/jobs`);
}

// ---- ทำหลายคนพร้อมกัน (เรียกจากกระดานผู้สมัคร) ----
type BulkResult = { ok: boolean; error?: string; batchId?: string | null; info?: string };

export async function bulkRejectAction(cid: string, appIds: string[], reasons: string[], note: string, message: string): Promise<BulkResult> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('reject_applications', { p_apps: appIds, p_reasons: reasons, p_note: note || null, p_message: message || null });
  if (error) return { ok: false, error: errorMessage(error) };
  const r = data as { batch_id: string | null; rejected: number; pending_approval: number };
  revalidatePath(`/c/${cid}`, 'layout');
  return {
    ok: true,
    batchId: r.batch_id,
    info: `ปฏิเสธพร้อมเหตุผล ${r.rejected} คน${r.pending_approval ? ` · ส่งให้หัวหน้าเห็นชอบก่อน ${r.pending_approval} คน` : ''}`
  };
}

export async function bulkInviteChallengeAction(cid: string, appIds: string[], message: string): Promise<BulkResult> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('invite_to_challenge', { p_apps: appIds, p_message: message || null });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/c/${cid}`, 'layout');
  return { ok: true, batchId: data as string, info: `เชิญเข้ารอบโจทย์ ${appIds.length} คนแล้ว` };
}

export async function bulkMessageAction(cid: string, appIds: string[], message: string): Promise<BulkResult> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('message_applicants', { p_apps: appIds, p_message: message });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/c/${cid}`, 'layout');
  return { ok: true, batchId: data as string, info: `ส่งข้อความถึง ${appIds.length} คนแล้ว` };
}

export async function bulkInviteInterviewAction(cid: string, appIds: string[], slotIds: string[], message: string): Promise<BulkResult> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('invite_to_interview', { p_apps: appIds, p_slot_ids: slotIds, p_message: message || null });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/c/${cid}`, 'layout');
  return { ok: true, batchId: data as string, info: `เชิญสัมภาษณ์ ${appIds.length} คนแล้ว` };
}

export async function undoBatchAction(cid: string, batchId: string): Promise<BulkResult> {
  const { supabase } = await db();
  const { error } = await supabase.rpc('undo_batch', { p_batch: batchId });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/c/${cid}`, 'layout');
  return { ok: true, info: 'ยกเลิกแล้ว ไม่มีข้อความถึงผู้สมัคร' };
}

// เรียกหลังพ้นช่วงยกเลิก 30 วินาที เพื่อส่งอีเมล/LINE ที่ถึงเวลา
export async function flushDeliveriesAction(): Promise<void> {
  await dispatchPending(50);
}

export async function saveTemplateAction(cid: string, kind: string, label: string, body: string): Promise<BulkResult> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('save_template', { p_company: cid, p_kind: kind, p_label: label, p_body: body });
  if (error) return { ok: false, error: errorMessage(error) };
  return { ok: true, batchId: data as string, info: 'บันทึกเป็นข้อความสำเร็จรูปแล้ว ทุกคนในทีมใช้ได้' };
}

// ---- รายใบสมัคร ----
export async function gradeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const appId = str(fd, 'app_id');
  const names = all(fd, 'crit_name');
  const scores = names.map((n) => ({ name: n, score: num(fd, `score:${n}`) ?? -1 }));
  const { data, error } = await supabase.rpc('grade_challenge', { p_app: appId, p_scores: scores, p_feedback: str(fd, 'feedback') });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
  return done(`บันทึกคะแนนแล้ว รวม ${data as number}/100 ผู้สมัครเห็นคะแนนรายเกณฑ์แล้ว ตัดสินใจขั้นต่อไปด้านล่าง`);
}

export async function rejectOneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const reasons = all(fd, 'reasons');
  const { data, error } = await supabase.rpc('reject_applications', {
    p_apps: [str(fd, 'app_id')],
    p_reasons: reasons,
    p_note: str(fd, 'note') || null,
    p_message: str(fd, 'message') || null
  });
  if (error) return fail(error);
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
  const r = data as { pending_approval: number };
  return done(r.pending_approval ? 'ส่งให้หัวหน้าแผนกเห็นชอบก่อนแจ้งผู้สมัครแล้ว' : 'แจ้งผลพร้อมเหตุผลแล้ว (ยกเลิกได้ในกระดานผู้สมัครภายใน 30 วินาที)');
}

export async function inviteChallengeOneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { error } = await supabase.rpc('invite_to_challenge', { p_apps: [str(fd, 'app_id')], p_message: str(fd, 'message') || null });
  if (error) return fail(error);
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
  return done('เชิญเข้ารอบโจทย์แล้ว ผู้สมัครจะได้รับแจ้งใน 30 วินาที');
}

export async function inviteInterviewOneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const slots = all(fd, 'slot_ids');
  const { error } = await supabase.rpc('invite_to_interview', { p_apps: [str(fd, 'app_id')], p_slot_ids: slots, p_message: str(fd, 'message') || null });
  if (error) return fail(error);
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
  return done('เชิญสัมภาษณ์แล้ว ผู้สมัครเลือกเวลาเองจากที่คุณเสนอ');
}

export async function offerSlotsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { error } = await supabase.rpc('offer_interview_slots', { p_interview: str(fd, 'interview_id'), p_slot_ids: all(fd, 'slot_ids'), p_message: str(fd, 'message') || null });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
  return done('ส่งเวลาใหม่ให้ผู้สมัครแล้ว');
}

export async function completeInterviewAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  await supabase.rpc('complete_interview', { p_interview: str(fd, 'interview_id'), p_no_show: str(fd, 'outcome') === 'no_show' });
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
}

export async function makeOfferAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('make_offer', {
    p_app: str(fd, 'app_id'),
    p_salary: num(fd, 'salary'),
    p_pay_unit: str(fd, 'pay_unit') || 'month',
    p_start_date: str(fd, 'start_date') || null,
    p_note: str(fd, 'note'),
    p_expires_days: num(fd, 'expires_days') || 5
  });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
  return done(data === 'pending_approval' ? 'ค่าตอบแทนเกินช่วงในประกาศ ส่งให้เจ้าของกิจการอนุมัติก่อนแล้ว' : 'ส่งข้อเสนองานแล้ว');
}

export async function addNoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { error } = await supabase.rpc('add_application_note', { p_app: str(fd, 'app_id'), p_body: str(fd, 'body') });
  if (error) return fail(error);
  revalidatePath(`/c/${str(fd, 'company_id')}/applications/${str(fd, 'app_id')}`);
  return done('บันทึกแล้ว (เห็นเฉพาะทีมบริษัท)');
}

export async function createSlotsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const cid = str(fd, 'company_id');
  const date = str(fd, 'date');
  const start = str(fd, 'time');
  const minutes = num(fd, 'minutes') || 45;
  const count = Math.min(Math.max(num(fd, 'count') || 1, 1), 12);
  const gap = num(fd, 'gap') ?? 15;
  if (!date || !start) return fail({ message: 'เลือกวันและเวลาเริ่ม' });
  const first = new Date(`${date}T${start}:00+07:00`);
  if (Number.isNaN(first.getTime())) return fail({ message: 'วันหรือเวลาไม่ถูกต้อง' });
  const slots = Array.from({ length: count }, (_, i) => ({
    starts_at: new Date(first.getTime() + i * (minutes + gap) * 60000).toISOString(),
    minutes,
    mode: str(fd, 'mode') || 'online',
    location: str(fd, 'location'),
    meeting_url: str(fd, 'meeting_url'),
    capacity: num(fd, 'capacity') || 1
  }));
  const { data, error } = await supabase.rpc('create_interview_slots', { p_company: cid, p_job: str(fd, 'job_id') || null, p_slots: slots });
  if (error) return fail(error);
  revalidatePath(`/c/${cid}/interviews`);
  return done(`เพิ่มเวลาว่าง ${data as number} ช่วงแล้ว`);
}

export async function deleteSlotAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  await supabase.rpc('delete_interview_slot', { p_slot: str(fd, 'slot_id') });
  revalidatePath(`/c/${str(fd, 'company_id')}/interviews`);
}

// ---- ข้อความสำเร็จรูป (หน้าตั้งค่า) ----
export async function saveTemplateFormAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const cid = str(fd, 'company_id');
  const label = str(fd, 'label');
  const body = str(fd, 'body');
  if (!label || !body) return fail({ message: 'ใส่ชื่อและข้อความ' });
  const { error } = await supabase.rpc('save_template', { p_company: cid, p_kind: str(fd, 'kind') || 'message', p_label: label, p_body: body });
  if (error) return fail(error);
  revalidatePath(`/c/${cid}/settings`);
  return done('เพิ่มข้อความสำเร็จรูปแล้ว');
}

export async function deleteTemplateAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  await supabase.rpc('delete_template', { p_id: str(fd, 'template_id') });
  revalidatePath(`/c/${str(fd, 'company_id')}/settings`);
}
