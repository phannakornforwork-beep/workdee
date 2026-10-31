'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/env';
import { bool, done, fail, num, str } from '@/lib/actions/util';
import { PERMS } from '@/lib/format';
import type { ActionState } from '@/lib/types';

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return { supabase, user: data.user };
}

function grantsFrom(fd: FormData): Record<string, number> {
  const g: Record<string, number> = {};
  for (const p of PERMS) {
    if (p.key === 'billing') continue;
    const v = num(fd, `grant:${p.key}`);
    if (v !== null && v > 0) g[p.key] = v;
  }
  return g;
}

export async function createCompanyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('create_company', {
    p_name: str(fd, 'name'),
    p_reg_no: str(fd, 'reg_no').replace(/\D/g, ''),
    p_size: str(fd, 'size_range') || null,
    p_industry: str(fd, 'industry') || null,
    p_province: str(fd, 'province') || null
  });
  if (error) return fail(error);
  const id = data as string;
  if (bool(fd, 'template')) await supabase.rpc('apply_org_template', { p_company: id });
  redirect(`/c/${id}/settings?new=1`);
}

export async function setCertificateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const path = str(fd, 'cert_path');
  if (!path) return fail({ message: 'แนบหนังสือรับรองบริษัทก่อน' });
  const { error } = await supabase.rpc('set_company_certificate', { p_company: company, p_path: path });
  if (error) return fail(error);
  revalidatePath(`/c/${company}`, 'layout');
  return done('ส่งเอกสารแล้ว ทีมงานจะตรวจภายใน 1–2 วันทำการ ระหว่างนี้ร่างประกาศและชวนทีมได้เลย');
}

export async function updateCompanyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const fields: Record<string, string> = {};
  for (const k of ['about', 'website', 'province', 'industry', 'size_range', 'quiet_start', 'quiet_end']) {
    if (fd.has(k)) fields[k] = str(fd, k);
  }
  const { error } = await supabase.rpc('update_company_profile', { p_company: company, p_fields: fields });
  if (error) return fail(error);
  const logo = str(fd, 'logo_path');
  if (logo || bool(fd, 'clear_logo')) {
    const { error: e2 } = await supabase.rpc('set_company_logo', { p_company: company, p_path: logo || null });
    if (e2) return fail(e2);
  }
  revalidatePath(`/c/${company}`, 'layout');
  return done('บันทึกข้อมูลบริษัทแล้ว');
}

export async function setRuleAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  await supabase.rpc('set_approval_rule', { p_company: company, p_rule: str(fd, 'rule'), p_enabled: str(fd, 'enabled') === 'true' });
  revalidatePath(`/c/${company}/settings`);
}

export async function applyTemplateAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  await supabase.rpc('apply_org_template', { p_company: company });
  revalidatePath(`/c/${company}/team`);
}

export async function createPositionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const { error } = await supabase.rpc('create_position', {
    p_company: company,
    p_parent: str(fd, 'parent_id'),
    p_title: str(fd, 'title'),
    p_is_department: bool(fd, 'is_department'),
    p_grants: grantsFrom(fd)
  });
  if (error) return fail(error);
  revalidatePath(`/c/${company}/team`);
  return done('สร้างตำแหน่งแล้ว');
}

// บันทึกสิทธิ์ของตำแหน่ง เปลี่ยนเฉพาะสิทธิ์ที่ต่างจากเดิม (ลดสิทธิ์จะลดตามลงไปทั้งสาย)
export async function saveGrantsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const position = str(fd, 'position_id');
  const title = str(fd, 'title');
  if (title && title !== str(fd, 'old_title')) {
    const { error } = await supabase.rpc('update_position', { p_position: position, p_title: title, p_is_department: bool(fd, 'is_department') });
    if (error) return fail(error);
  } else if (bool(fd, 'is_department') !== bool(fd, 'old_is_department')) {
    const { error } = await supabase.rpc('update_position', { p_position: position, p_title: title || str(fd, 'old_title'), p_is_department: bool(fd, 'is_department') });
    if (error) return fail(error);
  }
  for (const p of PERMS) {
    if (p.key === 'billing') continue;
    const now = num(fd, `grant:${p.key}`) ?? 0;
    const before = num(fd, `old:${p.key}`) ?? 0;
    if (now === before) continue;
    const { error } = await supabase.rpc('set_position_grant', { p_position: position, p_perm: p.key, p_level: now });
    if (error) return fail(error);
  }
  revalidatePath(`/c/${company}/team`);
  return done('บันทึกสิทธิ์แล้ว');
}

export async function deletePositionAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  await supabase.rpc('delete_position', { p_position: str(fd, 'position_id') });
  revalidatePath(`/c/${str(fd, 'company_id')}/team`);
}

export async function createInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const email = str(fd, 'email');
  const { data, error } = await supabase.rpc('create_invite', {
    p_company: company,
    p_position: str(fd, 'position_id'),
    p_email: email || null,
    p_days: num(fd, 'days') || 7,
    p_max_uses: num(fd, 'max_uses') || 50,
    p_note: str(fd, 'note') || null
  });
  if (error) return fail(error);
  revalidatePath(`/c/${company}/team`);
  const link = `${SITE_URL}/join/${data as string}`;
  return done(email ? `สร้างคำเชิญสำหรับ ${email} แล้ว ส่งลิงก์นี้ให้เขา: ${link}` : `ลิงก์เชิญ (ใช้ได้ ${num(fd, 'days') || 7} วัน): ${link}`, link);
}

// นำเข้ารายชื่อจาก Excel ที่บันทึกเป็น CSV: email,ตำแหน่ง
export async function importInvitesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const fallback = str(fd, 'position_id');
  const file = fd.get('csv');
  if (!(file instanceof File) || file.size === 0) return fail({ message: 'เลือกไฟล์ CSV ก่อน' });
  if (file.size > 200_000) return fail({ message: 'ไฟล์ใหญ่เกินไป (ไม่เกิน 200 KB)' });
  const text = (await file.text()).replace(/^﻿/, '');
  const { data: positions } = await supabase.from('positions').select('id, title').eq('company_id', company);
  const byTitle = new Map(((positions || []) as { id: string; title: string }[]).map((p) => [p.title.trim(), p.id]));
  const results: string[] = [];
  const errors: string[] = [];
  const rows = text.split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))).filter((r) => r[0]);
  for (const [email, title] of rows.slice(0, 200)) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const pos = (title && byTitle.get(title)) || fallback;
    const { data, error } = await supabase.rpc('create_invite', { p_company: company, p_position: pos, p_email: email, p_days: 14, p_max_uses: 1, p_note: 'นำเข้าจากไฟล์' });
    if (error) errors.push(`${email}: ${error.message}`);
    else results.push(`${email} → ${SITE_URL}/join/${data as string}`);
  }
  revalidatePath(`/c/${company}/team`);
  if (!results.length) return fail({ message: errors[0] || 'ไม่พบอีเมลในไฟล์ ใช้รูปแบบ email,ตำแหน่ง บรรทัดละ 1 คน' });
  return done(`สร้างคำเชิญ ${results.length} คน${errors.length ? ` (ไม่สำเร็จ ${errors.length})` : ''} คนที่สมัครด้วยอีเมลนั้นจะเห็นคำเชิญในหน้าเลือกพื้นที่ทันที`, results);
}

export async function revokeInviteAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  await supabase.rpc('revoke_invite', { p_invite: str(fd, 'invite_id') });
  revalidatePath(`/c/${str(fd, 'company_id')}/team`);
}

export async function assignMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const { error } = await supabase.rpc('assign_member_position', { p_company: company, p_user: str(fd, 'user_id'), p_position: str(fd, 'position_id') });
  if (error) return fail(error);
  revalidatePath(`/c/${company}/team`);
  return done('ย้ายตำแหน่งแล้ว');
}

export async function removeMemberAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  await supabase.rpc('remove_member', { p_company: company, p_user: str(fd, 'user_id') });
  revalidatePath(`/c/${company}/team`);
}

export async function leaveCompanyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { error } = await supabase.rpc('leave_company', { p_company: str(fd, 'company_id') });
  if (error) return fail(error);
  redirect('/spaces');
}

export async function decideApprovalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const approve = str(fd, 'decision') === 'approve';
  const { error } = await supabase.rpc('decide_approval', { p_request: str(fd, 'request_id'), p_approve: approve, p_note: str(fd, 'note') || null });
  if (error) return fail(error);
  revalidatePath(`/c/${company}`, 'layout');
  return done(approve ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ แจ้งผู้ขอแล้ว');
}

export async function cancelApprovalAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  await supabase.rpc('cancel_approval', { p_request: str(fd, 'request_id') });
  revalidatePath(`/c/${str(fd, 'company_id')}`, 'layout');
}

export async function acceptInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc('accept_invite', { p_code: str(fd, 'code') });
  if (error) return fail(error);
  redirect(`/c/${data as string}?joined=1`);
}
