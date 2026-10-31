'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/env';
import { done, fail, safeNext, str } from '@/lib/actions/util';
import type { ActionState } from '@/lib/types';

export async function signInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email').toLowerCase();
  const password = str(fd, 'password');
  if (!email || !password) return fail({ message: 'กรอกอีเมลและรหัสผ่าน' });
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) return fail({ message: 'ยืนยันอีเมลก่อน เปิดลิงก์ในอีเมลที่เราส่งให้' });
    return fail({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  redirect(safeNext(str(fd, 'next')));
}

// เข้าสู่ระบบหรือสมัครด้วย Google (บัญชีใหม่ถูกสร้างอัตโนมัติครั้งแรก)
export async function signInWithGoogleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const next = safeNext(str(fd, 'next'));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: 'select_account' }
    }
  });
  if (error || !data?.url) return fail({ message: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองอีกครั้ง หรือใช้อีเมลแทน' });
  redirect(data.url);
}

export async function signUpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email').toLowerCase();
  const password = str(fd, 'password');
  const name = str(fd, 'display_name');
  if (!name || name.length < 2) return fail({ message: 'กรอกชื่อที่ใช้แสดง' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail({ message: 'อีเมลไม่ถูกต้อง' });
  if (password.length < 8) return fail({ message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });
  if (fd.get('accept') !== 'on') return fail({ message: 'อ่านและยอมรับข้อตกลงการใช้งานและนโยบายความเป็นส่วนตัวก่อน' });
  const next = safeNext(str(fd, 'next'));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name, accepted_terms_at: new Date().toISOString() },
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });
  if (error) {
    if (/registered|exists/i.test(error.message)) return fail({ message: 'อีเมลนี้มีบัญชีแล้ว เข้าสู่ระบบแทน' });
    return fail(error);
  }
  if (data.session) redirect(next);
  return done('สมัครเรียบร้อย เราส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว เปิดลิงก์เพื่อเริ่มใช้งาน');
}

export async function requestResetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email').toLowerCase();
  if (!email) return fail({ message: 'กรอกอีเมล' });
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/callback?next=/reset-password` });
  // ไม่บอกว่าอีเมลมีในระบบหรือไม่ เพื่อความปลอดภัย
  return done('ถ้าอีเมลนี้มีบัญชี เราส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว');
}

export async function updatePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = str(fd, 'password');
  if (password.length < 8) return fail({ message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });
  if (password !== str(fd, 'confirm')) return fail({ message: 'รหัสผ่านสองช่องไม่ตรงกัน' });
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error);
  redirect('/spaces');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
