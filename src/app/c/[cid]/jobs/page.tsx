import Link from 'next/link';
import type { Metadata } from 'next';
import { can, requireCompany } from '@/lib/auth';
import { Badge, Empty, PageTitle } from '@/components/ui';
import { JOB_TYPE, salaryRange, thaiDate } from '@/lib/format';

export const metadata: Metadata = { title: 'ประกาศงาน' };

type Row = {
  id: string; title: string; job_type: string; status: string; department_title: string; salary_min: number | null; salary_max: number | null; pay_unit: string;
  challenge_seats: number; seats_used: number; published_at: string | null; closes_at: string | null; closed_at: string | null; approval_note: string | null;
  has_challenge: boolean; total: number; n_applied: number; n_challenge: number; n_interview: number; n_offer: number; n_hired: number; n_urgent: number;
  can_edit: boolean; can_screen: boolean;
};

const STATUS: Record<string, [string, string]> = {
  open: ['เปิดรับ', 'teal'],
  pending_approval: ['รออนุมัติ', 'orange'],
  draft: ['ร่าง', 'gray'],
  closed: ['ปิดแล้ว', 'gray']
};

export default async function CompanyJobs({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, access } = await requireCompany(cid);
  const { data } = await supabase.rpc('company_jobs_overview', { p_company: cid });
  const rows = (data || []) as Row[];
  return (
    <>
      <PageTitle title="ประกาศงาน" sub="ทุกประกาศต้องตอบผู้สมัครภายใน 7 วัน ประกาศที่ปิดแล้วระบบตอบคนที่รออยู่ให้อัตโนมัติ">
        {can(access, 'post') ? (
          <Link href={`/c/${cid}/jobs/new`} className="btn">
            + ลงประกาศใหม่
          </Link>
        ) : null}
      </PageTitle>
      {rows.length === 0 ? <Empty>ยังไม่มีประกาศ เริ่มจากเทมเพลตได้เลย ไม่ต้องเขียนเองตั้งแต่ศูนย์</Empty> : null}
      <div className="stack">
        {rows.map((j) => (
          <div key={j.id} className="card">
            <div className="row-between">
              <div className="stack-sm">
                <div className="row">
                  <h3>{j.title}</h3>
                  <Badge tone={STATUS[j.status]?.[1]}>{STATUS[j.status]?.[0] || j.status}</Badge>
                  {j.n_urgent ? <Badge tone="red">ต้องตอบใน 2 วัน {j.n_urgent} คน</Badge> : null}
                </div>
                <span className="small muted">
                  {j.department_title} · {JOB_TYPE[j.job_type]} · {salaryRange(j.salary_min, j.salary_max, j.pay_unit)}
                  {j.published_at ? ` · เผยแพร่ ${thaiDate(j.published_at)}` : ''}
                  {j.closes_at && j.status === 'open' ? ` · ปิดรับ ${thaiDate(j.closes_at)}` : ''}
                </span>
                {j.approval_note && j.status === 'draft' ? <span className="small" style={{ color: 'var(--danger)' }}>ไม่อนุมัติ: {j.approval_note}</span> : null}
              </div>
              <div className="row">
                {j.can_screen && j.total ? (
                  <Link href={`/c/${cid}/pipeline?job=${j.id}`} className="btn small">
                    ผู้สมัคร {j.total}
                  </Link>
                ) : null}
                {j.can_edit ? (
                  <Link href={`/c/${cid}/jobs/${j.id}`} className="btn small ghost">
                    จัดการ
                  </Link>
                ) : null}
              </div>
            </div>
            {j.status !== 'draft' ? (
              <div className="row small muted">
                <span>รอคัด {j.n_applied}</span>
                <span>· รอบโจทย์ {j.n_challenge}</span>
                <span>· สัมภาษณ์ {j.n_interview}</span>
                <span>· เสนองาน {j.n_offer}</span>
                <span>· รับแล้ว {j.n_hired}</span>
                {j.has_challenge ? <span>· ที่นั่งรอบโจทย์ {j.seats_used}/{j.challenge_seats}</span> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
