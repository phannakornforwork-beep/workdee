import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireCompany } from '@/lib/auth';
import { JobForm } from '@/components/JobForm';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { Alert, Badge, PageTitle } from '@/components/ui';
import { AiDemoNotice } from '@/components/ai/AiDemoNotice';
import { closeJobAction, deleteJobAction } from '@/lib/actions/hiring';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = { title: 'จัดการประกาศ' };
// งาน AI ใช้เวลานานกว่าหน้าปกติ
export const maxDuration = 60;

export default async function JobPage({ params, searchParams }: { params: Promise<{ cid: string; jid: string }>; searchParams: Promise<{ published?: string; saved?: string }> }) {
  const { cid, jid } = await params;
  const sp = await searchParams;
  const { supabase } = await requireCompany(cid);
  const [{ data: job }, { data: challenge }, { data: positions }, { count: submitted }, { data: aiProfile }] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', jid).eq('company_id', cid).maybeSingle(),
    supabase.from('challenges').select('*').eq('job_id', jid).maybeSingle(),
    supabase.from('positions').select('id, title, is_department, parent_id').eq('company_id', cid).order('created_at'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jid).not('challenge_invited_at', 'is', null),
    supabase.from('job_ai_profiles').select('objective, qualifications').eq('job_id', jid).maybeSingle()
  ]);
  if (!job) notFound();
  const departments = ((positions || []) as { id: string; title: string; is_department: boolean; parent_id: string | null }[])
    .filter((p) => p.is_department || !p.parent_id)
    .map((p) => ({ id: p.id, title: p.parent_id ? p.title : `${p.title} (ทั้งบริษัท)` }));
  const status = job.status as string;
  return (
    <>
      <PageTitle
        plain
        back={{ href: `/c/${cid}/jobs`, label: 'ประกาศงาน' }}
        title={job.title as string}
        sub={
          <Badge tone={status === 'open' ? 'teal' : status === 'pending_approval' ? 'orange' : 'gray'}>
            {status === 'open' ? 'เปิดรับ' : status === 'pending_approval' ? 'รออนุมัติ' : status === 'draft' ? 'ร่าง' : 'ปิดแล้ว'}
          </Badge>
        }
      >
        {status === 'open' ? (
          <Link href={`/jobs/${jid}`} className="btn small ghost" target="_blank">
            ดูหน้าประกาศ
          </Link>
        ) : null}
      </PageTitle>
      {sp.published === 'open' ? <Alert tone="success">เผยแพร่แล้ว ลิงก์: {SITE_URL}/jobs/{jid}</Alert> : null}
      {sp.published === 'pending_approval' ? <Alert tone="info">ส่งให้หัวหน้าแผนกอนุมัติแล้ว</Alert> : null}
      {sp.saved ? <Alert tone="success">บันทึกร่างแล้ว</Alert> : null}
      {status === 'draft' && job.approval_note ? <Alert tone="warn">ผู้อนุมัติไม่อนุมัติ: {job.approval_note as string}</Alert> : null}

      {status === 'closed' ? (
        <Alert tone="info">ประกาศนี้ปิดแล้ว</Alert>
      ) : status === 'pending_approval' ? (
        <Alert tone="info">รออนุมัติ แก้ไขไม่ได้ชั่วคราว</Alert>
      ) : (
        <>
          <AiDemoNotice />
          <JobForm companyId={cid} departments={departments} job={job} challenge={challenge} status={status} locked={(submitted || 0) > 0} aiProfile={aiProfile} />
        </>
      )}

      {status === 'open' ? (
        <details className="card warn">
          <summary className="strong" style={{ cursor: 'pointer' }}>ปิดรับประกาศ</summary>
          <p className="small">ผู้สมัครที่รออยู่จะได้รับข้อความนี้ทันที</p>
          <ActionForm action={closeJobAction}>
            <input type="hidden" name="company_id" value={cid} />
            <input type="hidden" name="job_id" value={jid} />
            <div className="field">
              <label htmlFor="message">ข้อความ</label>
              <textarea id="message" name="message" className="textarea" defaultValue="สวัสดีค่ะคุณ{ชื่อ} ตำแหน่ง{ตำแหน่ง} ปิดรับแล้ว ขอบคุณที่สนใจ{บริษัท} ข้อมูลและผลงานของคุณยังอยู่ในโปรไฟล์ ใช้สมัครงานอื่นได้ทันที" />
            </div>
            <SubmitButton className="btn danger" pendingText="กำลังปิด…">
              ปิดรับประกาศ
            </SubmitButton>
          </ActionForm>
        </details>
      ) : null}
      {status === 'draft' ? (
        <form action={deleteJobAction}>
          <input type="hidden" name="company_id" value={cid} />
          <input type="hidden" name="job_id" value={jid} />
          <ConfirmSubmit className="btn ghost small">ลบร่างนี้</ConfirmSubmit>
        </form>
      ) : null}
    </>
  );
}
