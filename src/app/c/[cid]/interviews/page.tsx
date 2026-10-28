import Link from 'next/link';
import type { Metadata } from 'next';
import { can, requireCompany } from '@/lib/auth';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { Badge, Empty, NoAccess } from '@/components/ui';
import { createSlotsAction, deleteSlotAction } from '@/lib/actions/hiring';
import { shortDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'สัมภาษณ์' };

const MODE: Record<string, string> = { online: 'ออนไลน์', onsite: 'ที่บริษัท', phone: 'โทรศัพท์' };

export default async function InterviewsPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, access } = await requireCompany(cid);
  if (!can(access, 'screen')) return <NoAccess title="สัมภาษณ์" need="ดูแลผู้สมัคร" cid={cid} />;
  const now = new Date().toISOString();
  const [{ data: slots }, { data: interviews }, { data: jobs }] = await Promise.all([
    supabase.from('interview_slots').select('*').eq('company_id', cid).gt('ends_at', now).order('starts_at').limit(100),
    supabase
      .from('interviews')
      .select('id, status, starts_at, ends_at, mode, location, slot_id, candidate_note, application_id, applications!inner(candidate_name, job_id, company_id)')
      .eq('applications.company_id', cid)
      .in('status', ['confirmed', 'awaiting_candidate', 'reschedule_requested'])
      .order('starts_at', { ascending: true })
      .limit(200),
    supabase.from('jobs').select('id, title').eq('company_id', cid).in('status', ['open', 'closed'])
  ]);
  const jobTitle = new Map(((jobs || []) as { id: string; title: string }[]).map((j) => [j.id, j.title]));
  type Iv = { id: string; status: string; starts_at: string | null; mode: string | null; location: string | null; slot_id: string | null; candidate_note: string; application_id: string; applications: { candidate_name: string; job_id: string } | null };
  const ivs = ((interviews || []) as unknown as Iv[]).filter((i) => i.applications);
  const bySlot = new Map<string, Iv[]>();
  for (const i of ivs) if (i.slot_id && i.status === 'confirmed') bySlot.set(i.slot_id, [...(bySlot.get(i.slot_id) || []), i]);
  const confirmed = ivs.filter((i) => i.status === 'confirmed' && i.starts_at && i.starts_at > now);
  const waiting = ivs.filter((i) => i.status !== 'confirmed');
  return (
    <>
      <div className="stack-sm">
        <h1>สัมภาษณ์</h1>
        <p className="muted">เพิ่มเวลาว่างไว้ แล้วเชิญผู้สมัครให้เลือกเวลาเอง ไม่ต้องโทรนัดทีละคน</p>
      </div>
      <div className="split">
        <div className="main">
          <section className="card">
            <h2>นัดที่ยืนยันแล้ว ({confirmed.length})</h2>
            {confirmed.length === 0 ? <p className="muted small">ยังไม่มีนัด</p> : null}
            {confirmed.map((i) => (
              <div key={i.id} className="row-between">
                <span>
                  <span className="strong">{shortDateTime(i.starts_at)}</span> ·{' '}
                  <Link href={`/c/${cid}/applications/${i.application_id}`}>{i.applications?.candidate_name}</Link>
                  <span className="small muted"> · {jobTitle.get(i.applications?.job_id || '') || ''}</span>
                </span>
                <Badge tone="teal">{MODE[i.mode || 'online']}</Badge>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>รอผู้สมัครเลือกเวลา หรือขอเลื่อน ({waiting.length})</h2>
            {waiting.map((i) => (
              <div key={i.id} className="row-between small">
                <Link href={`/c/${cid}/applications/${i.application_id}`}>{i.applications?.candidate_name}</Link>
                <span className="muted">{i.status === 'reschedule_requested' ? `ขอเลื่อน: ${i.candidate_note}` : 'รอเลือกเวลา'}</span>
              </div>
            ))}
            {waiting.length === 0 ? <p className="muted small">ไม่มี</p> : null}
          </section>
          <section className="card">
            <h2>เวลาว่างที่เปิดไว้</h2>
            {(slots || []).length === 0 ? <Empty>ยังไม่มีเวลาว่าง เพิ่มด้านขวา</Empty> : null}
            {((slots || []) as { id: string; starts_at: string; mode: string; location: string; capacity: number; job_id: string | null }[]).map((s) => {
              const booked = bySlot.get(s.id) || [];
              return (
                <div key={s.id} className="row-between">
                  <span>
                    <span className="strong">{shortDateTime(s.starts_at)}</span> · {MODE[s.mode]}
                    {s.location ? ` · ${s.location}` : ''}
                    <span className="small muted"> · {s.job_id ? jobTitle.get(s.job_id) : 'ทุกประกาศ'}</span>
                    <span className="small"> · จองแล้ว {booked.length}/{s.capacity}</span>
                  </span>
                  {booked.length === 0 ? (
                    <form action={deleteSlotAction}>
                      <input type="hidden" name="company_id" value={cid} />
                      <input type="hidden" name="slot_id" value={s.id} />
                      <ConfirmSubmit className="btn small ghost">ลบ</ConfirmSubmit>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </section>
        </div>
        <aside className="side">
          <ActionForm action={createSlotsAction} className="card" resetOnSuccess>
            <h2>เพิ่มเวลาว่าง</h2>
            <input type="hidden" name="company_id" value={cid} />
            <div className="field">
              <label htmlFor="job_id">สำหรับประกาศ</label>
              <select id="job_id" name="job_id" className="select">
                <option value="">ทุกประกาศ</option>
                {((jobs || []) as { id: string; title: string }[]).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="date">วันที่</label>
                <input id="date" name="date" type="date" className="input" required />
              </div>
              <div className="field">
                <label htmlFor="time">เริ่ม</label>
                <input id="time" name="time" type="time" className="input" defaultValue="10:00" required />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="minutes">นาทีต่อคน</label>
                <input id="minutes" name="minutes" className="input" inputMode="numeric" defaultValue="45" />
              </div>
              <div className="field">
                <label htmlFor="count">จำนวนช่วงต่อกัน</label>
                <input id="count" name="count" className="input" inputMode="numeric" defaultValue="4" />
              </div>
              <div className="field">
                <label htmlFor="gap">พักระหว่างช่วง (นาที)</label>
                <input id="gap" name="gap" className="input" inputMode="numeric" defaultValue="15" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="mode">รูปแบบ</label>
              <select id="mode" name="mode" className="select">
                <option value="online">ออนไลน์</option>
                <option value="onsite">ที่บริษัท</option>
                <option value="phone">โทรศัพท์</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="location">สถานที่ (ถ้าที่บริษัท)</label>
              <input id="location" name="location" className="input" />
            </div>
            <div className="field">
              <label htmlFor="meeting_url">ลิงก์ประชุม (ถ้าออนไลน์ ผู้สมัครเห็นหลังยืนยันเวลา)</label>
              <input id="meeting_url" name="meeting_url" className="input" type="url" placeholder="https://" />
            </div>
            <SubmitButton>เพิ่มเวลา</SubmitButton>
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
