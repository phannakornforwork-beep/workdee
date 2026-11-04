'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AI_MODEL, DEMO_MODEL, aiDemo, aiErrorMessage, type AiFile } from '@/lib/ai/client';
import { demoCert } from '@/lib/ai/demo';
import {
  checkCert, designJob, readLanguageCert, screenCandidate, suggestGrade,
  type GradeSuggestion, type JobDesign, type Qualification
} from '@/lib/ai/tasks';
import type { CompanyAccess, Criterion } from '@/lib/types';

type Result<T = undefined> = { ok: true; data?: T; message?: string; demo?: boolean } | { ok: false; error: string };

const DEMO_NOTE = 'โหมดสาธิต: ยังไม่ได้เชื่อม AI จริง';
const model = () => (aiDemo() ? DEMO_MODEL : AI_MODEL);

const MAX_FILE_MB = 8;

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  return { supabase, user: data.user };
}

async function companyPerm(supabase: Awaited<ReturnType<typeof createClient>>, cid: string, perm: string) {
  const { data } = await supabase.rpc('my_company_access', { p_company: cid });
  const a = data as CompanyAccess | null;
  if (!a || !(a.is_owner || (a.perms?.[perm] ?? 0) >= 1)) throw new Error('คุณไม่มีสิทธิ์ทำรายการนี้');
}

// ดาวน์โหลดไฟล์ด้วยสิทธิ์ระบบ (ตรวจแล้วว่าเป็นไฟล์ของผู้ใช้เอง) แล้วแปลงเป็นรูปแบบที่ส่งให้ AI ได้
async function loadFile(bucket: string, path: string): Promise<AiFile> {
  const { data, error } = await createAdminClient().storage.from(bucket).download(path);
  if (error || !data) throw new Error('เปิดไฟล์ไม่ได้ ลองอัปโหลดใหม่');
  if (data.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB} MB`);
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const byExt: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mediaType = data.type && data.type !== 'application/octet-stream' ? data.type : byExt[ext] || '';
  return { mediaType, base64: Buffer.from(await data.arrayBuffer()).toString('base64') };
}

// ข้อความภาษาไทยที่เราเขียนเองแสดงให้ผู้ใช้ได้ ข้อผิดพลาดทางเทคนิคแสดงเป็นข้อความกลาง
function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof Error && /[฀-๿]/.test(e.message)) return { ok: false, error: e.message };
  return { ok: false, error: aiErrorMessage(e) };
}

// ---------------------------------------------------------------- B. สร้างคุณสมบัติ + โจทย์
export async function designJobAction(cid: string, title: string, jobType: string, objective: string): Promise<Result<JobDesign>> {
  try {
    const { supabase } = await session();
    await companyPerm(supabase, cid, 'post');
    if (!objective.trim()) throw new Error('พิมพ์ว่าอยากได้คนแบบไหน');
    const data = await designJob({ title, jobType, objective: objective.slice(0, 3000) });
    return { ok: true, data, demo: aiDemo() };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- C. คัดกรอง
type Snap = {
  headline?: string; intro?: string; skills?: string[]; tools?: string[];
  languages?: { name: string; detail: string }[]; certificates?: { name: string; detail: string }[];
  projects?: { title: string; detail: string }[]; experiences?: { title: string; detail: string }[];
  educations?: { level: string; faculty: string | null; major: string | null; status: string }[];
};

// ข้อความโปรไฟล์ที่ส่งให้ AI: ไม่มีชื่อ รูป อายุ จังหวัด หรือชื่อสถาบัน
function profileText(s: Snap, intro: string): string {
  const pairs = (xs: { name?: string; title?: string; detail: string }[] | undefined) => (xs || []).map((x) => `- ${x.name || x.title}: ${x.detail}`).join('\n');
  return [
    s.headline && `พาดหัว: ${s.headline}`,
    s.intro && `แนะนำตัว: ${s.intro}`,
    intro && `ข้อความถึงบริษัท: ${intro}`,
    s.skills?.length && `สกิล: ${s.skills.join(', ')}`,
    s.tools?.length && `เครื่องมือ: ${s.tools.join(', ')}`,
    s.experiences?.length && `ประสบการณ์:\n${pairs(s.experiences)}`,
    s.projects?.length && `ผลงาน:\n${pairs(s.projects)}`,
    s.certificates?.length && `ใบรับรอง:\n${pairs(s.certificates)}`,
    s.languages?.length && `ภาษา:\n${pairs(s.languages)}`,
    s.educations?.length && `การศึกษา: ${s.educations.map((e) => [e.level, e.faculty, e.major, e.status].filter(Boolean).join(' ')).join('; ')}`
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 12000);
}

async function qualificationsFor(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string): Promise<Qualification[]> {
  const { data: prof } = await supabase.from('job_ai_profiles').select('qualifications').eq('job_id', jobId).maybeSingle();
  const quals = (prof?.qualifications || []) as Qualification[];
  if (quals.length) return quals;
  // ประกาศที่ยังไม่ได้ใช้ AI สร้างคุณสมบัติ: ใช้สกิลในประกาศ น้ำหนักเท่ากัน
  const { data: job } = await supabase.from('jobs').select('skills').eq('id', jobId).maybeSingle();
  const skills = ((job?.skills || []) as string[]).slice(0, 8);
  if (!skills.length) throw new Error('ประกาศนี้ยังไม่มีคุณสมบัติให้เทียบ ใช้ "ให้ AI ช่วยออกแบบ" ในหน้าแก้ไขประกาศ หรือใส่สกิลที่ใช้');
  const base = Math.floor(100 / skills.length);
  return skills.map((s, i) => ({ name: s, description: s, must_have: false, weight: base + (i < 100 - base * skills.length ? 1 : 0) }));
}

async function screenOne(supabase: Awaited<ReturnType<typeof createClient>>, appId: string) {
  const { data } = await supabase.rpc('application_detail', { p_app: appId });
  const d = data as { app: { job_id: string; candidate_id: string; intro_message: string; profile_snapshot: Snap | null } } | null;
  if (!d) throw new Error('ไม่พบใบสมัคร หรือคุณไม่มีสิทธิ์');
  if (!d.app.profile_snapshot) throw new Error('ผู้สมัครถอนสิทธิ์การเข้าถึงโปรไฟล์แล้ว');
  const quals = await qualificationsFor(supabase, d.app.job_id);
  const result = await screenCandidate(quals, profileText(d.app.profile_snapshot, d.app.intro_message));
  const admin = createAdminClient();
  const { data: ev } = await admin.rpc('candidate_evidence', { p_user: d.app.candidate_id, p_exclude_app: appId });
  const evidence = (ev || { score: 0, items: [] }) as { score: number; items: unknown[] };
  const { error } = await admin.from('application_ai').upsert({
    application_id: appId,
    match_score: result.match_score,
    matches: result.matches,
    missing_must: result.missing_must,
    verified_score: evidence.score,
    verified_items: evidence.items,
    summary: result.summary,
    screened_at: new Date().toISOString(),
    model: model()
  });
  if (error) throw new Error('บันทึกผลคัดกรองไม่สำเร็จ');
}

export async function screenApplicationAction(cid: string, appId: string): Promise<Result> {
  try {
    const { supabase } = await session();
    await screenOne(supabase, appId);
    revalidatePath(`/c/${cid}`, 'layout');
    return { ok: true, message: aiDemo() ? `วิเคราะห์แล้ว (${DEMO_NOTE} ใช้การจับคำพ้องความหมาย)` : 'AI วิเคราะห์แล้ว', demo: aiDemo() };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- D. ร่างคะแนนโจทย์
export async function suggestGradeAction(cid: string, appId: string): Promise<Result<GradeSuggestion>> {
  try {
    const { supabase } = await session();
    const { data } = await supabase.rpc('application_detail', { p_app: appId });
    const d = data as {
      app: { job_id: string };
      challenge: { criteria: Criterion[] } | null;
      submission: { answer: string; links: string[]; file_paths: string[]; ai_use: string; ai_detail: string; reasoning: string; submitted_at: string | null } | null;
    } | null;
    if (!d) throw new Error('ไม่พบใบสมัคร หรือคุณไม่มีสิทธิ์');
    if (!d.challenge || !d.submission?.submitted_at) throw new Error('ผู้สมัครยังไม่ได้ส่งโจทย์');
    const { data: ch } = await supabase.from('challenges').select('brief, deliverable, criteria').eq('job_id', d.app.job_id).maybeSingle();
    let file: AiFile | undefined;
    const first = (d.submission.file_paths || []).find((p) => /\.(pdf|jpe?g|png|webp)$/i.test(p));
    if (first) {
      try {
        file = await loadFile('submissions', first);
      } catch {
        file = undefined; // ไฟล์ใหญ่หรือเปิดไม่ได้: ให้คะแนนจากข้อความแทน
      }
    }
    const criteria = ((ch?.criteria as Criterion[]) || d.challenge.criteria).map((c) => ({ name: c.name, weight: c.weight, description: c.description }));
    const data2 = await suggestGrade({
      criteria,
      brief: (ch?.brief as string) || '',
      deliverable: (ch?.deliverable as string) || '',
      answer: d.submission.answer,
      reasoning: d.submission.reasoning,
      links: d.submission.links || [],
      aiUse: `${d.submission.ai_use}${d.submission.ai_detail ? ` (${d.submission.ai_detail})` : ''}`,
      file
    });
    await createAdminClient().from('application_ai').upsert({ application_id: appId, grade_suggestion: data2, graded_at: new Date().toISOString(), model: model() });
    revalidatePath(`/c/${cid}/applications/${appId}`);
    return { ok: true, data: data2, demo: aiDemo(), message: aiDemo() ? `${DEMO_NOTE} คะแนนร่างจากการจับคำในคำตอบ ตรวจและแก้ก่อนบันทึก` : 'AI ร่างคะแนนแล้ว ตรวจและแก้ก่อนกดบันทึก' };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- E. แฟ้มผลงาน
export async function setPortfolioHiddenAction(appId: string, hidden: boolean): Promise<Result> {
  try {
    const { supabase, user } = await session();
    const { error } = hidden
      ? await supabase.from('portfolio_hidden').upsert({ user_id: user.id, application_id: appId })
      : await supabase.from('portfolio_hidden').delete().eq('application_id', appId).eq('user_id', user.id);
    if (error) throw new Error('บันทึกไม่สำเร็จ');
    revalidatePath('/me/portfolio');
    return { ok: true, message: hidden ? 'ซ่อนแล้ว บริษัทไม่นับรายการนี้' : 'แสดงแล้ว' };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- F. ใบรับรองภาษา
export async function submitLanguageCertAction(path: string): Promise<Result> {
  try {
    const { supabase, user } = await session();
    if (!path.startsWith(`${user.id}/lang/`)) throw new Error('คุณไม่มีสิทธิ์อ่านไฟล์นี้');
    const file = aiDemo() ? null : await loadFile('education-docs', path);
    const [{ data: cp }, { data: prof }] = await Promise.all([
      supabase.from('candidate_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
    ]);
    const names = [cp?.full_name, prof?.display_name, user.user_metadata?.full_name, user.user_metadata?.name].filter((x): x is string => typeof x === 'string' && x.length > 1);
    const read = file ? await readLanguageCert(file) : demoCert(names[0] || 'Demo User');
    const { checks, expires_on, exam_date, passed } = checkCert(read, names.length ? names : ['Demo User']);
    if (!checks.is_language_cert) {
      await createAdminClient().storage.from('education-docs').remove([path]);
      throw new Error('ไฟล์นี้ไม่ใช่ใบรับรองผลสอบภาษา');
    }
    const { error } = await createAdminClient().from('language_certificates').insert({
      user_id: user.id,
      exam: read.exam.slice(0, 60) || 'ไม่ทราบ',
      score_text: read.score_text.slice(0, 40) || '-',
      sub_scores: read.sub_scores || {},
      cert_number: read.cert_number?.slice(0, 80) || null,
      exam_date,
      expires_on,
      holder_name: read.holder_name?.slice(0, 160) || null,
      doc_path: path,
      trust: passed ? 'doc_pending' : 'self',
      checks: aiDemo() ? { ...checks, demo: true } : checks
    });
    if (error) throw new Error('บันทึกใบรับรองไม่สำเร็จ');
    revalidatePath('/me/profile');
    if (aiDemo()) return { ok: true, demo: true, message: `${DEMO_NOTE} บันทึกผลสอบตัวอย่าง (IELTS 6.5) ไม่ได้อ่านจากไฟล์ของคุณ ส่งให้ทีมงานตรวจแล้ว` };
    return {
      ok: true,
      message: passed ? 'AI อ่านผลสอบแล้ว ส่งให้ทีมงานตรวจ' : 'AI อ่านแล้วแต่ตรวจไม่ผ่านบางข้อ จึงเป็นระดับ "ระบุเอง" ดูรายละเอียดในรายการ'
    };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLanguageCertAction(id: string): Promise<Result> {
  try {
    const { supabase } = await session();
    const { data: row } = await supabase.from('language_certificates').select('doc_path').eq('id', id).maybeSingle();
    const { error } = await supabase.from('language_certificates').delete().eq('id', id);
    if (error) throw new Error('ลบไม่สำเร็จ');
    if (row?.doc_path) await createAdminClient().storage.from('education-docs').remove([row.doc_path as string]);
    revalidatePath('/me/profile');
    return { ok: true, message: 'ลบแล้ว' };
  } catch (e) {
    return fail(e);
  }
}
