import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ActionForm, SubmitButton } from '@/components/forms';
import { signInAction } from '@/lib/actions/auth';
import { GoogleSignIn } from '@/components/GoogleSignIn';

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="เข้าสู่ระบบ" sub="บัญชีเดียว ใช้ได้ทั้งพื้นที่ส่วนตัวและพื้นที่บริษัท">
      {sp.error === 'oauth' ? (
        <div className="alert error">เข้าสู่ระบบด้วย Google ไม่สำเร็จหรือถูกยกเลิก ลองอีกครั้ง หรือใช้อีเมลแทน</div>
      ) : sp.error ? (
        <div className="alert error">ลิงก์หมดอายุหรือใช้ไปแล้ว ลองเข้าสู่ระบบอีกครั้ง</div>
      ) : null}
      <GoogleSignIn next={sp.next || '/spaces'} />
      <ActionForm action={signInAction}>
        <input type="hidden" name="next" value={sp.next || ''} />
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">รหัสผ่าน</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn block" pendingText="กำลังเข้าสู่ระบบ…">
          เข้าสู่ระบบ
        </SubmitButton>
      </ActionForm>
      <div className="row-between small">
        <Link href="/forgot-password">ลืมรหัสผ่าน</Link>
        <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}>ยังไม่มีบัญชี? สมัครฟรี</Link>
      </div>
    </AuthShell>
  );
}
