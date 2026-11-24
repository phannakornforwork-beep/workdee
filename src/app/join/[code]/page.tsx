import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { ActionForm, SubmitButton } from '@/components/forms';
import { acceptInviteAction } from '@/lib/actions/company';
import { thaiDate } from '@/lib/format';

export const metadata: Metadata = { title: 'คำเชิญเข้าทีม' };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const [{ data: preview }, { data: auth }] = await Promise.all([supabase.rpc('invite_preview', { p_code: code }), supabase.auth.getUser()]);
  const p = (preview || { valid: false }) as { valid: boolean; company_name?: string; position_title?: string; expires_at?: string; for_email?: boolean };
  if (!p.valid) {
    return (
      <AuthShell title="ลิงก์เชิญใช้ไม่ได้">
        <p className="muted">ลิงก์หมดอายุ ขอลิงก์ใหม่จากหัวหน้าหรือ HR</p>
        <Link href="/" className="btn ghost">
          กลับหน้าแรก
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`เข้าร่วมทีม ${p.company_name}`} sub={`ตำแหน่ง ${p.position_title} · ลิงก์ใช้ได้ถึง ${thaiDate(p.expires_at)}`}>
      <div className="alert privacy small">
        บริษัทไม่เห็นการหางานหรือแผนอาชีพของคุณ
      </div>
      {auth.user ? (
        <ActionForm action={acceptInviteAction}>
          <input type="hidden" name="code" value={code} />
          <SubmitButton className="btn block">เข้าร่วมทีม</SubmitButton>
        </ActionForm>
      ) : (
        <div className="stack">
          {p.for_email ? <p className="small muted">ใช้อีเมลที่ได้รับคำเชิญ</p> : null}
          <Link href={`/signup?next=${encodeURIComponent(`/join/${code}`)}`} className="btn block">
            สมัครบัญชีแล้วเข้าร่วม
          </Link>
          <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className="btn outline block">
            มีบัญชีแล้ว เข้าสู่ระบบ
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
