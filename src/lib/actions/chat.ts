'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { done, fail, str } from '@/lib/actions/util';
import { dispatchSoon } from '@/lib/notify/dispatch';
import type { ActionState } from '@/lib/types';

// เตือนคนที่ยังไม่กดรับทราบประกาศ
export async function remindAnnouncementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect('/login');
  const company = str(fd, 'company_id');
  const room = str(fd, 'room_id');
  const { data, error } = await supabase.rpc('remind_announcement', { p_message: Number(str(fd, 'message_id')) });
  if (error) return fail(error);
  dispatchSoon();
  revalidatePath(`/c/${company}/chat/${room}`);
  const n = Number(data) || 0;
  return done(n ? `ส่งเตือน ${n} คนแล้ว (นอกเวลางานจะส่งตอนเช้า)` : 'ทุกคนรับทราบแล้ว');
}

// ปลุกการส่งแจ้งเตือนหลังส่งข้อความจากหน้าแชต
export async function afterChatSendAction(): Promise<void> {
  dispatchSoon();
}
