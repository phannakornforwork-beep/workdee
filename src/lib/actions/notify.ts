'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { bool, done, fail, str } from '@/lib/actions/util';
import type { ActionState } from '@/lib/types';

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function markAllReadAction(fd: FormData): Promise<void> {
  const { supabase } = await client();
  const company = str(fd, 'company_id') || null;
  await supabase.rpc('mark_notifications_read', { p_ids: null, p_company: company });
  revalidatePath(company ? `/c/${company}` : '/me', 'layout');
}

export async function savePrefsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await client();
  if (!user) return fail({ message: 'กรุณาเข้าสู่ระบบ' });
  const kinds = str(fd, 'kinds').split(',').filter(Boolean);
  const rows = kinds.map((k) => ({
    user_id: user.id,
    kind: k,
    email: bool(fd, `${k}:email`),
    line: bool(fd, `${k}:line`),
    sms: bool(fd, `${k}:sms`)
  }));
  const { error } = await supabase.from('notification_prefs').upsert(rows, { onConflict: 'user_id,kind' });
  if (error) return fail(error);
  if (fd.has('digest_present')) {
    const { error: e2 } = await supabase.from('user_settings').upsert({ user_id: user.id, digest_enabled: bool(fd, 'digest_enabled') }, { onConflict: 'user_id' });
    if (e2) return fail(e2);
  }
  return done('บันทึกการแจ้งเตือนแล้ว');
}

export async function createLineCodeAction(_prev: ActionState): Promise<ActionState> {
  const { supabase } = await client();
  const { data, error } = await supabase.rpc('create_line_link_code');
  if (error) return fail(error);
  return done(`รหัสเชื่อม LINE ของคุณคือ ${data as string} (ใช้ได้ 15 นาที) เพิ่มเพื่อนบัญชี LINE ของ WorkDee แล้วพิมพ์รหัสนี้ในแชต`, data);
}

export async function unlinkLineAction(): Promise<void> {
  const { supabase } = await client();
  await supabase.rpc('unlink_line');
  revalidatePath('/', 'layout');
}

export async function setQuietConsentAction(fd: FormData): Promise<void> {
  const { supabase } = await client();
  const company = str(fd, 'company_id');
  await supabase.rpc('set_quiet_consent', { p_company: company, p_consent: bool(fd, 'consent') });
  revalidatePath(`/c/${company}/notifications`);
}
