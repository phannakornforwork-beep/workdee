import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ActionForm, SubmitButton } from '@/components/forms';
import { signUpAction } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'สมัครใช้งาน' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const sp = await searchParams;
  const next = sp.next || (sp.as === 'company' ? '/companies/new' : '/me/profile');
  return (
    <AuthShell
      title="สมัครใช้งาน WorkDee"
      sub={sp.as === 'company' ? 'สร้างบัญชีก่อน แล้วสร้างพื้นที่บริษัทต่อได้ทันที' : 'ฟรีสำหรับคนหางาน ข้อมูลของคุณเป็นของคุณ'}
    >
      <ActionForm action={signUpAction}>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="display_name">ชื่อที่ใช้แสดง</label>
          <input id="display_name" name="display_name" className="input" autoComplete="name" required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">รหัสผ่าน</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
          <span className="hint">อย่างน้อย 8 ตัวอักษร</span>
        </div>
        <label className="check">
          <input type="checkbox" name="accept" required />
          <span>
            ฉันอ่านและยอมรับ <Link href="/terms" target="_blank">ข้อตกลงการใช้งาน</Link> และ{' '}
            <Link href="/privacy" target="_blank">นโยบายความเป็นส่วนตัว</Link>
          </span>
        </label>
        <SubmitButton className="btn block" pendingText="กำลังสมัคร…">
          สมัครใช้งาน
        </SubmitButton>
      </ActionForm>
      <p className="small muted">
        มีบัญชีแล้ว? <Link href={`/login?next=${encodeURIComponent(next)}`}>เข้าสู่ระบบ</Link>
      </p>
    </AuthShell>
  );
}
