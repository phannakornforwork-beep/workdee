'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dispatchSoon } from '@/lib/notify/dispatch';
import { done, fail, str } from '@/lib/actions/util';
import type { ActionState } from '@/lib/types';

// เชิญผู้หางานที่เปิดให้ค้นหา (บริษัทยังไม่เห็นชื่อ จนกว่าเขาจะกดสมัคร)
export async function inviteTalentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const cid = str(fd, 'company_id');
  const jobId = str(fd, 'job_id');
  if (!jobId) return fail({ message: 'เลือกประกาศที่จะเชิญ' });
  const { error } = await supabase.rpc('invite_talent', { p_job: jobId, p_handle: str(fd, 'handle'), p_message: str(fd, 'message') });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${cid}/talent`);
  return done('ส่งคำเชิญแล้ว ผู้หางานจะได้รับแจ้งเตือนพร้อมลิงก์ประกาศ');
}
