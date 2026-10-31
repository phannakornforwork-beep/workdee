import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/actions/util';

// รับลิงก์จากอีเมล (ยืนยันอีเมล / ตั้งรหัสผ่านใหม่) และการกลับมาจาก Google แล้วสร้าง session
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  // ผู้ใช้กดยกเลิกที่หน้า Google หรือ provider ตอบข้อผิดพลาดกลับมา
  if (url.searchParams.get('error')) return NextResponse.redirect(new URL('/login?error=oauth', url.origin));
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email' | 'invite' | 'magiclink' | 'email_change'
    });
    if (!error) return NextResponse.redirect(new URL(type === 'recovery' ? '/reset-password' : next, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
