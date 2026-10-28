import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { Empty, StageBadge } from '@/components/ui';
import { CLOSED_STAGES, dueText, relative, shortDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'ใบสมัครของฉัน' };

type App = {
  id: string; job_title: string; company_name: string; stage: string; created_at: string; sla_due_at: string | null;
  candidate_due_at: string | null; closed_by_system: boolean; score_total: number | null;
  interview: { status: string; starts_at: string | null } | null; offer_status: string | null;
};

function nextStep(a: App): { text: string; mine: boolean } {
  switch (a.stage) {
    case 'challenge_invited':
      return { text: `ทำโจทย์ให้เสร็จ ${dueText(a.candidate_due_at)}`, mine: true };
    case 'interview':
      if (a.interview?.status === 'awaiting_candidate') return { text: `เลือกเวลาสัมภาษณ์ ${dueText(a.candidate_due_at)}`, mine: true };
      if (a.interview?.status === 'confirmed' && a.interview.starts_at) return { text: `สัมภาษณ์ ${shortDateTime(a.interview.starts_at)}`, mine: false };
      if (a.interview?.status === 'reschedule_requested') return { text: 'รอบริษัทเสนอเวลาใหม่', mine: false };
      return { text: `รอบริษัทแจ้งผล ${dueText(a.sla_due_at)}`, mine: false };
    case 'offer':
      return { text: `ตอบข้อเสนองาน ${dueText(a.candidate_due_at)}`, mine: true };
    case 'applied':
    case 'challenge_submitted':
      return { text: `บริษัทต้องตอบ ${dueText(a.sla_due_at)}`, mine: false };
    default:
      return { text: a.closed_by_system ? 'บริษัทไม่ได้ตอบใน 7 วัน ระบบปิดให้' : '', mine: false };
  }
}

export default async function MyApplications() {
  const { supabase } = await requireUser('/me/applications');
  const { data } = await supabase.rpc('my_applications');
  const apps = (data || []) as App[];
  const open = apps.filter((a) => !CLOSED_STAGES.includes(a.stage));
  const closed = apps.filter((a) => CLOSED_STAGES.includes(a.stage));
  const row = (a: App) => {
    const n = nextStep(a);
    return (
      <Link key={a.id} href={`/me/applications/${a.id}`} className="card tight">
        <div className="row-between">
          <div className="stack-sm">
            <span className="muted small">{a.company_name}</span>
            <span className="strong">{a.job_title}</span>
          </div>
          <StageBadge stage={a.stage} />
        </div>
        <div className="row-between small">
          <span style={{ color: n.mine ? 'var(--accent-ink)' : undefined, fontWeight: n.mine ? 600 : 400 }}>{n.text}</span>
          <span className="muted">
            {a.score_total !== null ? `คะแนนโจทย์ ${a.score_total}/100 · ` : ''}สมัคร {relative(a.created_at)}
          </span>
        </div>
      </Link>
    );
  };
  return (
    <>
      <div className="stack-sm">
        <h1>ใบสมัครของฉัน</h1>
        <p className="muted">ทุกใบสมัครต้องได้คำตอบจากบริษัทภายใน 7 วันในทุกขั้น</p>
      </div>
      {apps.length === 0 ? (
        <Empty>
          ยังไม่ได้สมัครงาน <Link href="/me">ดูงานที่ตรงกับคุณ</Link>
        </Empty>
      ) : null}
      {open.length ? (
        <section className="stack">
          <h2>กำลังดำเนินการ ({open.length})</h2>
          {open.map(row)}
        </section>
      ) : null}
      {closed.length ? (
        <section className="stack">
          <h2>ปิดแล้ว ({closed.length})</h2>
          {closed.map(row)}
        </section>
      ) : null}
    </>
  );
}
