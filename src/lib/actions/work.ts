'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { bool, done, fail, str } from '@/lib/actions/util';
import { dispatchSoon } from '@/lib/notify/dispatch';
import type { ActionState } from '@/lib/types';

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return { supabase, user: data.user };
}

const STATUSES = ['todo', 'doing', 'review', 'blocked', 'done'];

// สร้างหรือแก้งาน (ฟิลด์ที่ไม่ได้ส่งมาจะไม่ถูกแก้)
export async function saveTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const task = str(fd, 'task_id') || null;
  const fields: Record<string, string> = {};
  for (const k of ['title', 'detail', 'assignee_id', 'project_id', 'due_date', 'status', 'blocked_note']) {
    if (fd.has(k)) fields[k] = str(fd, k);
  }
  if (!task && (fields.title || '').length < 2) return fail({ message: 'ตั้งชื่องานอย่างน้อย 2 ตัวอักษร' });
  if (fields.status && !STATUSES.includes(fields.status)) return fail({ message: 'สถานะไม่ถูกต้อง' });
  if (fields.status === 'blocked' && !fields.blocked_note) return fail({ message: 'บอกสั้น ๆ ว่าติดอะไร หัวหน้าจะได้ช่วยได้ถูกจุด' });
  if (fields.status && fields.status !== 'blocked') fields.blocked_note = '';
  const { error } = await supabase.rpc('save_task', { p_company: company, p_task: task, p_fields: fields });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${company}/work`);
  revalidatePath(`/c/${company}`);
  return done(task ? 'อัปเดตงานแล้ว' : 'เพิ่มงานแล้ว');
}

export async function deleteTaskAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  await supabase.rpc('delete_task', { p_task: str(fd, 'task_id') });
  revalidatePath(`/c/${company}/work`);
}

// ติดตามงาน: ได้แจ้งเตือนเมื่องานติดปัญหาหรือเสร็จ
export async function toggleFollowAction(fd: FormData): Promise<void> {
  const { supabase, user } = await db();
  const company = str(fd, 'company_id');
  const task = str(fd, 'task_id');
  if (bool(fd, 'follow')) {
    await supabase.from('task_follows').upsert({ task_id: task, user_id: user.id }, { onConflict: 'task_id,user_id', ignoreDuplicates: true });
  } else {
    await supabase.from('task_follows').delete().eq('task_id', task).eq('user_id', user.id);
  }
  revalidatePath(`/c/${company}/work`);
}

export async function saveProjectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const project = str(fd, 'project_id') || null;
  const name = str(fd, 'name');
  if (name.length < 2) return fail({ message: 'ตั้งชื่อโปรเจกต์อย่างน้อย 2 ตัวอักษร' });
  const { error } = await supabase.rpc('save_project', {
    p_company: company,
    p_project: project,
    p_name: name,
    p_description: str(fd, 'description'),
    p_due: str(fd, 'due_date') || null,
    p_status: str(fd, 'status') || 'active'
  });
  if (error) return fail(error);
  revalidatePath(`/c/${company}/work`);
  return done(project ? 'บันทึกโปรเจกต์แล้ว' : 'สร้างโปรเจกต์แล้ว');
}

export async function requestLeaveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  const start = str(fd, 'start_date');
  const end = str(fd, 'end_date') || start;
  if (!start) return fail({ message: 'เลือกวันที่ลา' });
  const { data, error } = await supabase.rpc('request_leave', {
    p_company: company,
    p_type: str(fd, 'leave_type') || 'personal',
    p_start: start,
    p_end: end,
    p_reason: str(fd, 'reason'),
    p_half_day: bool(fd, 'half_day')
  });
  if (error) return fail(error);
  const { data: row } = await supabase.from('leave_requests').select('status').eq('id', data as string).maybeSingle();
  dispatchSoon();
  revalidatePath(`/c/${company}/work`);
  revalidatePath(`/c/${company}`);
  return done((row as { status?: string } | null)?.status === 'approved' ? 'บันทึกการลาแล้ว' : 'ส่งคำขอลาแล้ว รอหัวหน้าอนุมัติ');
}

export async function cancelLeaveAction(fd: FormData): Promise<void> {
  const { supabase } = await db();
  const company = str(fd, 'company_id');
  await supabase.rpc('cancel_leave', { p_leave: str(fd, 'leave_id') });
  revalidatePath(`/c/${company}/work`);
}
