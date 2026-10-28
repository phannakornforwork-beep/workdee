import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ActionForm, SubmitButton } from '@/components/forms';
import { updatePasswordAction } from '@/lib/actions/auth';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่' };

export default async function ResetPasswordPage() {
  await requireUser('/reset-password');
  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่">
      <ActionForm action={updatePasswordAction}>
        <div className="field">
          <label htmlFor="password">รหัสผ่านใหม่</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">ยืนยันรหัสผ่านใหม่</label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        <SubmitButton className="btn block">บันทึกรหัสผ่าน</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
