'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { all, bool, done, fail, list, num, str } from '@/lib/actions/util';
import type { ActionState } from '@/lib/types';

function pairs(text: string, keys: [string, string]) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((l) => {
      const [a, ...rest] = l.split('|');
      return { [keys[0]]: a.trim().slice(0, 160), [keys[1]]: rest.join('|').trim().slice(0, 300) };
    });
}

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return { supabase, user: data.user };
}

export async function saveProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await me();
  const fullName = str(fd, 'full_name');
  if (fullName.length < 2) return fail({ message: 'กรอกชื่อ-นามสกุล' });
  const birthYear = num(fd, 'birth_year');
  const row = {
    user_id: user.id,
    full_name: fullName,
    headline: str(fd, 'headline'),
    intro: str(fd, 'intro'),
    province: str(fd, 'province') || null,
    birth_year: birthYear,
    show_age: bool(fd, 'show_age'),
    skills: list(fd, 'skills').slice(0, 40),
    tools: list(fd, 'tools').slice(0, 40),
    languages: pairs(str(fd, 'languages'), ['name', 'detail']),
    certificates: pairs(str(fd, 'certificates'), ['name', 'detail']),
    projects: pairs(str(fd, 'projects'), ['title', 'detail']),
    experiences: pairs(str(fd, 'experiences'), ['title', 'detail']),
    pref_job_types: all(fd, 'pref_job_types'),
    pref_provinces: all(fd, 'pref_provinces'),
    expected_salary: num(fd, 'expected_salary')
  };
  const { error } = await supabase.from('candidate_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) return fail(error);
  const phone = str(fd, 'phone');
  const { error: e2 } = await supabase.from('profiles').update({ display_name: fullName, phone: phone || null }).eq('id', user.id);
  if (e2) return fail(e2);
  revalidatePath('/me', 'layout');
  return done('บันทึกโปรไฟล์แล้ว');
}

export async function saveEducationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await me();
  const id = str(fd, 'id');
  const row = {
    user_id: user.id,
    institution_id: str(fd, 'institution_id') || null,
    institution_name: str(fd, 'institution_name'),
    level: str(fd, 'level') || 'bachelor',
    faculty: str(fd, 'faculty') || null,
    major: str(fd, 'major') || null,
    status: str(fd, 'status') || 'studying',
    year_label: str(fd, 'year_label') || null,
    gpa: str(fd, 'gpa') ? Number(str(fd, 'gpa')) : null
  };
  if (row.institution_name.length < 2) return fail({ message: 'กรอกชื่อสถาบัน' });
  if (row.gpa !== null && (Number.isNaN(row.gpa) || row.gpa < 0 || row.gpa > 4)) return fail({ message: 'เกรดเฉลี่ยต้องอยู่ระหว่าง 0.00–4.00' });
  const res = id ? await supabase.from('educations').update(row).eq('id', id) : await supabase.from('educations').insert(row);
  if (res.error) return fail(res.error);
  revalidatePath('/me/profile');
  return done(id ? 'บันทึกการศึกษาแล้ว' : 'เพิ่มการศึกษาแล้ว');
}

export async function deleteEducationAction(fd: FormData): Promise<void> {
  const { supabase } = await me();
  await supabase.from('educations').delete().eq('id', str(fd, 'id'));
  revalidatePath('/me/profile');
}

// หลังอัปโหลดใบรับรองผลการศึกษาแล้ว ขอให้ทีมตรวจ
export async function requestVerifyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const path = str(fd, 'doc_path');
  if (!path) return fail({ message: 'แนบไฟล์ใบรับรองผลการศึกษาก่อน' });
  const { error } = await supabase.from('educations').update({ doc_path: path, verify_level: 'doc_pending' }).eq('id', str(fd, 'id'));
  if (error) return fail(error);
  revalidatePath('/me/profile');
  return done('ส่งตรวจแล้ว ทีมงานจะตรวจภายใน 2 วันทำการ');
}

export async function applyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const { data, error } = await supabase.rpc('apply_to_job', {
    p_job: str(fd, 'job_id'),
    p_intro: str(fd, 'intro'),
    p_expected_salary: num(fd, 'expected_salary'),
    p_share_plan: bool(fd, 'share_plan')
  });
  if (error) return fail(error);
  revalidatePath('/me', 'layout');
  redirect(`/me/applications/${data as string}?applied=1`);
}

export async function withdrawAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const { error } = await supabase.rpc('withdraw_application', { p_app: str(fd, 'app_id'), p_reason: str(fd, 'reason'), p_revoke: true });
  if (error) return fail(error);
  revalidatePath('/me', 'layout');
  return done('ถอนใบสมัครและถอนสิทธิ์การเข้าถึงโปรไฟล์แล้ว');
}

export async function revokeAccessAction(fd: FormData): Promise<void> {
  const { supabase } = await me();
  await supabase.rpc('revoke_application_access', { p_app: str(fd, 'app_id') });
  revalidatePath('/me', 'layout');
}

export async function startChallengeAction(fd: FormData): Promise<void> {
  const { supabase } = await me();
  await supabase.rpc('start_challenge', { p_app: str(fd, 'app_id') });
  revalidatePath(`/me/applications/${str(fd, 'app_id')}`);
}

export async function submitChallengeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const appId = str(fd, 'app_id');
  const { error } = await supabase.rpc('submit_challenge', {
    p_app: appId,
    p_answer: str(fd, 'answer'),
    p_links: list(fd, 'links').slice(0, 10),
    p_files: all(fd, 'files'),
    p_ai_use: str(fd, 'ai_use') || 'none',
    p_ai_detail: str(fd, 'ai_detail'),
    p_reasoning: str(fd, 'reasoning')
  });
  if (error) return fail(error);
  revalidatePath(`/me/applications/${appId}`);
  return done('ส่งโจทย์แล้ว บริษัทต้องให้คะแนนและตอบภายใน 7 วัน');
}

export async function reuseChallengeAction(fd: FormData): Promise<void> {
  const { supabase } = await me();
  const appId = str(fd, 'app_id');
  await supabase.rpc('reuse_challenge', { p_app: appId, p_source_app: str(fd, 'source_app') });
  revalidatePath(`/me/applications/${appId}`);
}

export async function bookInterviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const { error } = await supabase.rpc('book_interview', { p_interview: str(fd, 'interview_id'), p_slot: str(fd, 'slot_id') });
  if (error) return fail(error);
  revalidatePath(`/me/applications/${str(fd, 'app_id')}`);
  return done('ยืนยันเวลาสัมภาษณ์แล้ว');
}

export async function rescheduleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const { error } = await supabase.rpc('request_interview_reschedule', { p_interview: str(fd, 'interview_id'), p_note: str(fd, 'note') });
  if (error) return fail(error);
  revalidatePath(`/me/applications/${str(fd, 'app_id')}`);
  return done('ส่งคำขอเลื่อนแล้ว บริษัทจะเสนอเวลาใหม่');
}

export async function respondOfferAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await me();
  const accept = str(fd, 'decision') === 'accept';
  const { error } = await supabase.rpc('respond_offer', { p_offer: str(fd, 'offer_id'), p_accept: accept, p_reason: str(fd, 'reason') });
  if (error) return fail(error);
  revalidatePath('/me', 'layout');
  return done(accept ? 'ตอบรับข้อเสนองานแล้ว ยินดีด้วย!' : 'แจ้งปฏิเสธข้อเสนอแล้ว');
}

export async function savePlanAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await me();
  const steps = str(fd, 'steps')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => ({ title: l.slice(0, 200), done: false }));
  const { error } = await supabase.from('career_plans').upsert(
    { user_id: user.id, goal_title: str(fd, 'goal_title'), goal_detail: str(fd, 'goal_detail'), steps, share_with_companies: bool(fd, 'share') },
    { onConflict: 'user_id' }
  );
  if (error) return fail(error);
  const { error: e2 } = await supabase.from('career_private_notes').upsert({ user_id: user.id, life_notes: str(fd, 'life_notes') }, { onConflict: 'user_id' });
  if (e2) return fail(e2);
  revalidatePath('/me/plan');
  return done('บันทึกแผนอาชีพแล้ว');
}

export async function savePrivacyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await me();
  const { data: cp } = await supabase.from('candidate_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!cp) return fail({ message: 'กรอกโปรไฟล์ก่อน แล้วค่อยตั้งค่าความเป็นส่วนตัว' });
  const { error } = await supabase
    .from('candidate_profiles')
    .update({ show_age: bool(fd, 'show_age'), discoverable: bool(fd, 'discoverable'), hidden_company_ids: all(fd, 'hidden_company_ids') })
    .eq('user_id', user.id);
  if (error) return fail(error);
  revalidatePath('/me/privacy');
  return done('บันทึกการตั้งค่าแล้ว');
}
