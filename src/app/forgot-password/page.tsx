import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ActionForm, SubmitButton } from '@/components/forms';
import { requestResetAction } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="ลืมรหัสผ่าน" sub="ใส่อีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้">
      <ActionForm action={requestResetAction}>
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <SubmitButton className="btn block" pendingText="กำลังส่ง…">
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
