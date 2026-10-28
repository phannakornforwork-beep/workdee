import Link from 'next/link';
import { can, requireCompany } from '@/lib/auth';
import { Alert, Badge, Progress, Stat } from '@/components/ui';
import { STAGE, dueText, relative } from '@/lib/format';

type Home = {
  company: { id: string; name: string; status: string; review_note: string | null; has_certificate: boolean };
  members: number; jobs_open: number; jobs_total: number; needs_response: number; due_soon: number; ungraded: number;
  interviews_week: number; approvals_for_me: number;
  my_pending_requests: { id: string; title: string; created_at: string; approver: string | null }[];
  urgent: { id: string; candidate_name: string; job_title: string; stage: string; sla_due_at: string }[];
  setup: { verified: boolean; team_invited: boolean; line_linked: boolean; job_posted: boolean; graded_once: boolean };
};
type Work = {
  tasks: { id: string; title: string; status: string; assignee_name: string; due_date: string | null; blocked_note: string | null }[];
  leave_today: { display_name: string; leave_type: string; status: string }[];
};

export default async function CompanyHome({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ joined?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase, access } = await requireCompany(cid);
  const [{ data: home }, { data: work }] = await Promise.all([supabase.rpc('company_home', { p_company: cid }), supabase.rpc('team_work', { p_company: cid })]);
  const h = home as Home;
  const w = (work || { tasks: [], leave_today: [] }) as Work;
  const base = `/c/${cid}`;
  const steps = [
    { done: h.setup.verified, title: 'ยืนยันบริษัท', href: `${base}/settings` },
    { done: h.setup.team_invited, title: 'เชิญหัวหน้าแผนกและตั้งตำแหน่ง', href: `${base}/team` },
    { done: h.setup.line_linked, title: 'เชื่อม LINE เพื่อรับแจ้งเตือน', href: `${base}/notifications` },
    { done: h.setup.job_posted, title: 'ลงประกาศแรก', href: `${base}/jobs/new` },
    { done: h.setup.graded_once, title: 'ให้คะแนนโจทย์ครั้งแรก', href: `${base}/pipeline` }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const blocked = w.tasks.filter((t) => t.status === 'blocked');
  const overdue = w.tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()));
  const screener = can(access, 'screen');
  return (
    <>
      {sp.joined ? <Alert tone="success">เข้าร่วมทีม {h.company.name} แล้ว ตำแหน่ง {access.position_title}</Alert> : null}
      <div className="row-between">
        <div className="stack-sm">
          <span className="muted small">
            {new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'full' }).format(new Date())} · ตำแหน่งของคุณ: {access.position_title}
          </span>
          <h1>ภาพรวมวันนี้</h1>
        </div>
        <span className="small muted" style={{ maxWidth: 420 }}>
          แสดงเฉพาะข้อมูลงาน การหางานและแผนอาชีพของพนักงานไม่แสดงที่นี่
        </span>
      </div>

      {doneCount < steps.length ? (
        <section className="card">
          <div className="row-between">
            <span className="strong">ตั้งค่าเสร็จแล้ว {doneCount} จาก {steps.length}</span>
            <Link href={`${base}/help`} className="small">
              ดูทุกขั้นและคู่มือ
            </Link>
          </div>
          <Progress value={(doneCount / steps.length) * 100} />
          {next ? (
            <div className="row-between">
              <span>ขั้นถัดไป: {next.title}</span>
              <Link href={next.href} className="btn small">
                ทำเลย
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid-sm">
        <Stat label="สมาชิก" value={`${h.members} คน`} href={`${base}/team`} />
        <Stat label="ประกาศที่เปิดรับ" value={h.jobs_open} href={`${base}/jobs`} />
        {screener ? <Stat label="รอบริษัทตอบ" value={h.needs_response} href={`${base}/pipeline`} /> : null}
        {screener ? <Stat label="ต้องตอบใน 2 วัน" value={h.due_soon} href={`${base}/pipeline`} tone={h.due_soon ? 'warn' : undefined} /> : null}
        {screener ? <Stat label="รอให้คะแนนโจทย์" value={h.ungraded} href={`${base}/pipeline`} /> : null}
        {screener ? <Stat label="สัมภาษณ์ 7 วันนี้" value={h.interviews_week} href={`${base}/interviews`} /> : null}
      </div>

      <div className="split">
        <div className="main">
          {screener ? (
            <section className="card warn">
              <h2>ต้องตอบด่วน</h2>
              {h.urgent.length === 0 ? <p className="small">ไม่มีผู้สมัครที่ใกล้ครบ 7 วัน</p> : null}
              {h.urgent.map((u) => (
                <Link key={u.id} href={`${base}/applications/${u.id}`} className="row-between" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span>
                    <span className="strong">{u.candidate_name}</span>
                    <span className="small"> · {u.job_title} · {STAGE[u.stage]}</span>
                  </span>
                  <span className="small strong" style={{ color: 'var(--danger)' }}>
                    ตอบ{dueText(u.sla_due_at)}
                  </span>
                </Link>
              ))}
            </section>
          ) : null}
          <section className="card">
            <div className="row-between">
              <h2>งานของทีม</h2>
              <Link href={`${base}/work`} className="small">
                ดูทั้งหมด
              </Link>
            </div>
            {blocked.length === 0 && overdue.length === 0 ? <p className="small muted">ไม่มีงานติดขัดหรือเลยกำหนด</p> : null}
            {[...blocked, ...overdue.filter((o) => !blocked.includes(o))].slice(0, 8).map((t) => (
              <div key={t.id} className="row-between small">
                <span>
                  <span className="strong">{t.title}</span> · {t.assignee_name}
                  {t.blocked_note ? ` · ติดขัด: ${t.blocked_note}` : ''}
                </span>
                <Badge tone={t.status === 'blocked' ? 'red' : 'orange'}>{t.status === 'blocked' ? 'ติดขัด' : 'เลยกำหนด'}</Badge>
              </div>
            ))}
          </section>
        </div>
        <aside className="side">
          <section className="card">
            <h2>การอนุมัติ</h2>
            <div className="row-between small">
              <span>รอคุณอนุมัติ</span>
              <Link href={`${base}/team?tab=approvals`} className="strong">
                {h.approvals_for_me} เรื่อง
              </Link>
            </div>
            {h.my_pending_requests.map((r) => (
              <div key={r.id} className="card soft tight">
                <span className="tiny muted">คุณส่งขออนุมัติ · {relative(r.created_at)}</span>
                <span className="small strong">{r.title}</span>
                <span className="tiny">รอ {r.approver || 'ผู้อนุมัติ'} · ถ้าไม่ตอบใน 24 ชั่วโมง ส่งต่อหัวหน้าถัดขึ้นไป</span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>ลาวันนี้</h2>
            {w.leave_today.length === 0 ? <p className="small muted">ไม่มีคนลา</p> : null}
            {w.leave_today.map((l, i) => (
              <div key={i} className="row-between small">
                <span>{l.display_name}</span>
                <Badge tone={l.status === 'approved' ? 'gray' : 'orange'}>{l.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</Badge>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
