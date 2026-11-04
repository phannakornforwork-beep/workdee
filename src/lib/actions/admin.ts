'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { done, fail, str } from '@/lib/actions/util';
import { dispatchSoon } from '@/lib/notify/dispatch';
import type { ActionState } from '@/lib/types';

// ทุกฟังก์ชันตรวจสิทธิ์ผู้ดูแลระบบซ้ำในฐานข้อมูล (require_admin)
async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/admin');
  return supabase;
}

export async function reviewCompanyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await db();
  const approve = str(fd, 'decision') === 'approve';
  const { error } = await supabase.rpc('admin_review_company', { p_company: str(fd, 'company_id'), p_approve: approve, p_note: str(fd, 'note') || null });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath('/admin');
  return done(approve ? 'ยืนยันบริษัทแล้ว' : 'แจ้งผลไม่ผ่านแล้ว');
}

export async function setCompanyStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await db();
  const status = str(fd, 'status');
  const note = str(fd, 'note');
  if (status === 'suspended' && note.length < 5) return fail({ message: 'ระบุเหตุผลที่ระงับ (บริษัทเห็นข้อความนี้)' });
  const { error } = await supabase.rpc('admin_set_company_status', { p_company: str(fd, 'company_id'), p_status: status, p_note: note || null });
  if (error) return fail(error);
  revalidatePath('/admin');
  return done('เปลี่ยนสถานะแล้ว');
}

export async function reviewEducationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await db();
  const approve = str(fd, 'decision') === 'approve';
  const { error } = await supabase.rpc('admin_review_education', { p_education: str(fd, 'education_id'), p_approve: approve, p_note: str(fd, 'note') || null });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath('/admin');
  return done(approve ? 'ยืนยันวุฒิแล้ว' : 'แจ้งผลไม่ผ่านแล้ว');
}

export async function reviewLanguageCertAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await db();
  const level = str(fd, 'decision');
  const { error } = await supabase.rpc('admin_review_language_cert', {
    p_id: str(fd, 'cert_id'),
    p_level: level,
    p_note: str(fd, 'note') || null,
    p_verify_url: str(fd, 'verify_url') || null
  });
  if (error) return fail(error);
  revalidatePath('/admin');
  return done(level === 'official' ? 'ยืนยันกับผู้จัดสอบแล้ว' : level === 'doc' ? 'ยืนยันว่าตรวจเอกสารแล้ว' : 'แจ้งผลไม่ผ่านแล้ว');
}
