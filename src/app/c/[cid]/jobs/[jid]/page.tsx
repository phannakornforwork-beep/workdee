import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireCompany } from '@/lib/auth';
import { JobForm } from '@/components/JobForm';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { Alert, Badge } from '@/components/ui';
import { closeJobAction, deleteJobAction } from '@/lib/actions/hiring';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = { title: 'จัดการประกาศ' };

export default async function JobPage({ params, searchParams }: { params: Promise<{ cid: string; jid: string }>; searchParams: Promise<{ published?: string; saved?: string }> }) {
  const { cid, jid } = await params;
  const sp = await searchParams;
  const { supabase } = await requireCompany(cid);
  const [{ data: job }, { data: challenge }, { data: positions }, { count: submitted }] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', jid).eq('company_id', cid).maybeSingle(),
    supabase.from('challenges').select('*').eq('job_id', jid).maybeSingle(),
    supabase.from('positions').select('id, title, is_department, parent_id').eq('company_id', cid).order('created_at'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jid).not('challenge_invited_at', 'is', null)
  ]);
  if (!job) notFound();
  const departments = ((positions || []) as { id: string; title: string; is_department: boolean; parent_id: string | null }[])
    .filter((p) => p.is_department || !p.parent_id)
    .map((p) => ({ id: p.id, title: p.parent_id ? p.title : `${p.title} (ทั้งบริษัท)` }));
  const status = job.status as string;
  return (
    <>
      <Link href={`/c/${cid}/jobs`} className="small">
        ← ประกาศทั้งหมด
      </Link>
      <div className="row-between">
        <div className="row">
          <h1>{job.title as string}</h1>
          <Badge tone={status === 'open' ? 'teal' : status === 'pending_approval' ? 'orange' : 'gray'}>
            {status === 'open' ? 'เปิดรับ' : status === 'pending_approval' ? 'รออนุมัติ' : status === 'draft' ? 'ร่าง' : 'ปิดแล้ว'}
          </Badge>
        </div>
        {status === 'open' ? (
          <Link href={`/jobs/${jid}`} className="btn small ghost" target="_blank">
            ดูหน้าประกาศ
          </Link>
        ) : null}
      </div>
      {sp.published === 'open' ? <Alert tone="success">เผยแพร่แล้ว แชร์ลิงก์นี้ลงเพจหรือกลุ่ม LINE ได้: {SITE_URL}/jobs/{jid}</Alert> : null}
      {sp.published === 'pending_approval' ? <Alert tone="info">ส่งให้หัวหน้าแผนกอนุมัติแล้ว ระบบแจ้งผู้อนุมัติให้ ถ้าไม่ตอบใน 24 ชั่วโมงจะส่งต่อหัวหน้าถัดขึ้นไป</Alert> : null}
      {sp.saved ? <Alert tone="success">บันทึกร่างแล้ว</Alert> : null}
      {status === 'draft' && job.approval_note ? <Alert tone="warn">ผู้อนุมัติไม่อนุมัติ: {job.approval_note as string}</Alert> : null}

      {status === 'closed' ? (
        <Alert tone="info">ประกาศนี้ปิดแล้ว ดูผู้สมัครที่ยังอยู่ในรอบสัมภาษณ์หรือข้อเสนอได้ในหน้าผู้สมัคร</Alert>
      ) : status === 'pending_approval' ? (
        <Alert tone="info">รออนุมัติอยู่ แก้ไขไม่ได้จนกว่าผู้อนุมัติจะตัดสิน หรือยกเลิกคำขอในหน้าทีมและตำแหน่ง</Alert>
      ) : (
        <JobForm companyId={cid} departments={departments} job={job} challenge={challenge} status={status} locked={(submitted || 0) > 0} />
      )}

      {status === 'open' ? (
        <section className="card warn">
          <h2>ปิดรับประกาศ</h2>
          <p className="small">ผู้สมัครที่ยังรอคัดหรืออยู่ในรอบโจทย์จะได้รับข้อความพร้อมเหตุผล &ldquo;ปิดรับตำแหน่งแล้ว&rdquo; ทันที โจทย์ที่ส่งแล้วต้องให้คะแนนก่อน</p>
          <ActionForm action={closeJobAction}>
            <input type="hidden" name="company_id" value={cid} />
            <input type="hidden" name="job_id" value={jid} />
            <div className="field">
              <label htmlFor="message">ข้อความถึงผู้สมัครที่รออยู่ (ใช้ {'{ชื่อ}'} {'{ตำแหน่ง}'} {'{บริษัท}'} ได้)</label>
              <textarea id="message" name="message" className="textarea" defaultValue="สวัสดีค่ะคุณ{ชื่อ} ตำแหน่ง{ตำแหน่ง} ปิดรับแล้ว ขอบคุณที่สนใจ{บริษัท} ข้อมูลและผลงานของคุณยังอยู่ในโปรไฟล์ ใช้สมัครงานอื่นได้ทันที" />
            </div>
            <SubmitButton className="btn danger" pendingText="กำลังปิด…">
              ปิดรับและตอบผู้สมัครที่รออยู่
            </SubmitButton>
          </ActionForm>
        </section>
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
