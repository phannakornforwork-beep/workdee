import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { FileUpload } from '@/components/FileUpload';
import { ChatRoom, type ChatMessage } from '@/components/ChatRoom';
import { afterChatSendAction } from '@/lib/actions/chat';
import { Alert, Badge, StageBadge } from '@/components/ui';
import {
  bookInterviewAction, rescheduleAction, respondOfferAction, reuseChallengeAction, revokeAccessAction, startChallengeAction,
  submitChallengeAction, withdrawAction
} from '@/lib/actions/candidate';
import { AI_POLICY, AI_USE, CLOSED_STAGES, EVENT_LABEL, JOB_TYPE, PAY_UNIT, dueText, money, salaryRange, shortDateTime, thaiDate, thaiDateTime } from '@/lib/format';
import type { Criterion } from '@/lib/types';

export const metadata: Metadata = { title: 'ใบสมัคร' };

type Detail = {
  app: {
    id: string; stage: string; created_at: string; sla_due_at: string | null; candidate_due_at: string | null; intro_message: string;
    reject_labels: string | null; reject_note: string | null; closed_by_system: boolean; access_revoked_at: string | null;
    profile_snapshot: Record<string, unknown> | null; share_plan: boolean;
  };
  job: { id: string; title: string; job_type: string; company_name: string; salary_min: number | null; salary_max: number | null; pay_unit: string; status: string };
  challenge: {
    title: string; brief?: string; deliverable?: string; time_limit_minutes: number; due_days?: number; criteria: Criterion[];
    ai_policy?: string; accept_reuse?: boolean; preview?: boolean;
  } | null;
  submission: { answer: string; links: string[]; file_paths: string[]; ai_use: string; ai_detail: string; reasoning: string; started_at: string | null; submitted_at: string | null; reused_from: string | null } | null;
  score: { scores: { name: string; weight: number; score: number }[]; total: number; feedback: string; reused: boolean } | null;
  events: { kind: string; actor_kind: string; actor_name: string; message: string; data: Record<string, unknown>; at: string }[];
  interview: {
    id: string; status: string; starts_at: string | null; ends_at: string | null; mode: string | null; location: string | null; meeting_url: string | null;
    options: { slot_id: string; starts_at: string; ends_at: string; mode: string; location: string; seats_left: number }[];
  } | null;
  offer: { id: string; salary: number; pay_unit: string; start_date: string | null; note: string; expires_at: string | null; status: string } | null;
  reusable: { source_app: string; job_title: string; company_name: string; total: number }[] | null;
  room_id: string | null;
};



const MODE: Record<string, string> = { online: 'ออนไลน์', onsite: 'ที่บริษัท', phone: 'โทรศัพท์' };

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ applied?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser(`/me/applications/${id}`);
  const { data } = await supabase.rpc('my_application', { p_app: id });
  if (!data) notFound();
  const d = data as Detail;
  const a = d.app;
  const closed = CLOSED_STAGES.includes(a.stage);

  let roomId = d.room_id;
  if (!roomId && !closed) {
    const { data: rid } = await supabase.rpc('ensure_candidate_room', { p_app: id });
    roomId = (rid as string) || null;
  }
  let messages: ChatMessage[] = [];
  if (roomId) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, sender_name, sender_side, body, is_announcement, urgent, created_at')
      .eq('room_id', roomId)
      .order('id', { ascending: true })
      .limit(200);
    messages = (msgs || []) as ChatMessage[];
  }

  const ch = d.challenge;
  const inChallenge = a.stage === 'challenge_invited';
  return (
    <>
      <Link href="/me/applications" className="small">
        ← ใบสมัครทั้งหมด
      </Link>
      <div className="row-between">
        <div className="stack-sm">
          <span className="muted">{d.job.company_name}</span>
          <h1>{d.job.title}</h1>
          <div className="chips">
            <StageBadge stage={a.stage} />
            <Badge>{JOB_TYPE[d.job.job_type]}</Badge>
            <Badge>{salaryRange(d.job.salary_min, d.job.salary_max, d.job.pay_unit)}</Badge>
          </div>
        </div>
        <Link href={`/jobs/${d.job.id}`} className="btn ghost small">
          ดูประกาศ
        </Link>
      </div>

      {sp.applied ? (
        <Alert tone="success">ส่งใบสมัครแล้ว บริษัทต้องตอบภายใน 7 วัน ({thaiDate(a.sla_due_at)}) เราจะแจ้งทางอีเมลหรือ LINE ทันทีที่มีความคืบหน้า</Alert>
      ) : null}
      {a.stage === 'rejected' ? (
        <Alert tone={a.closed_by_system ? 'warn' : 'info'}>
          <strong>{a.closed_by_system ? 'ระบบปิดใบสมัครนี้ให้' : 'ผลการพิจารณา: ยังไม่ผ่านรอบนี้'}</strong>
          <br />
          เหตุผล: {a.reject_labels || '-'}
          {a.reject_note ? ` · ${a.reject_note}` : ''}
          {a.closed_by_system ? <><br />ผลนี้ไม่ใช่การประเมินตัวคุณ และไม่กระทบโปรไฟล์ บริษัทถูกนับในอัตราการตอบผู้สมัคร</> : null}
        </Alert>
      ) : null}
      {a.stage === 'hired' ? <Alert tone="success">ยินดีด้วย! คุณตอบรับข้อเสนองานแล้ว บริษัทจะติดต่อเรื่องวันเริ่มงานในแชตด้านล่าง</Alert> : null}

      <div className="split">
        <div className="main">
          {ch && !ch.preview ? (
            <section className="card">
              <div className="row-between">
                <h2>โจทย์: {ch.title}</h2>
                {inChallenge ? <Badge tone="orange">ส่ง{dueText(a.candidate_due_at)} · {thaiDateTime(a.candidate_due_at)}</Badge> : null}
              </div>
              <p className="prewrap">{ch.brief}</p>
              {ch.deliverable ? (
                <p>
                  <span className="strong">สิ่งที่ต้องส่ง:</span> {ch.deliverable}
                </p>
              ) : null}
              <div className="stack-sm">
                <span className="label">เกณฑ์ให้คะแนน</span>
                {ch.criteria.map((c) => (
                  <div key={c.name} className="row-between small">
                    <span>{c.name}</span>
                    <span className="strong">{c.weight}%</span>
                  </div>
                ))}
              </div>
              <p className="small muted">
                เวลาที่แนะนำ {ch.time_limit_minutes} นาที · {AI_POLICY[ch.ai_policy || 'allowed_declare']} · ผลงานเป็นของคุณ บริษัทนำไปใช้เชิงพาณิชย์ไม่ได้
              </p>

              {inChallenge && !d.submission?.started_at ? (
                <form action={startChallengeAction}>
                  <input type="hidden" name="app_id" value={a.id} />
                  <SubmitButton className="btn">เริ่มทำโจทย์</SubmitButton>
                </form>
              ) : null}

              {inChallenge && d.reusable && d.reusable.length ? (
                <div className="card soft tight">
                  <span className="strong">ใช้ผลโจทย์เดิมของสกิลเดียวกันได้</span>
                  {d.reusable.map((r) => (
                    <form key={r.source_app} action={reuseChallengeAction} className="row-between">
                      <input type="hidden" name="app_id" value={a.id} />
                      <input type="hidden" name="source_app" value={r.source_app} />
                      <span className="small">
                        {r.job_title} · {r.company_name} · {r.total}/100
                      </span>
                      <ConfirmSubmit className="btn small outline" confirmText="ยืนยันใช้ผลนี้">
                        ใช้ผลนี้แทนการทำใหม่
                      </ConfirmSubmit>
                    </form>
                  ))}
                  <span className="hint">บริษัทนี้จะเห็นคำตอบและคะแนนเดิมของโจทย์นั้น</span>
                </div>
              ) : null}

              {inChallenge && d.submission?.started_at ? (
                <ActionForm action={submitChallengeAction}>
                  <input type="hidden" name="app_id" value={a.id} />
                  <span className="hint">เริ่มทำเมื่อ {thaiDateTime(d.submission.started_at)}</span>
                  <div className="field">
                    <label htmlFor="answer">คำตอบ</label>
                    <textarea id="answer" name="answer" className="textarea" style={{ minHeight: 220 }} maxLength={20000} />
                  </div>
                  <div className="field">
                    <label htmlFor="links">ลิงก์ผลงาน (บรรทัดละ 1 ลิงก์ ถ้ามี)</label>
                    <textarea id="links" name="links" className="textarea" style={{ minHeight: 60 }} />
                  </div>
                  <FileUpload bucket="submissions" prefix={a.id} name="files" label="แนบไฟล์ (ไม่เกิน 25 MB ต่อไฟล์)" multiple maxMb={25} accept="" />
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor="ai_use">การใช้ AI</label>
                      <select id="ai_use" name="ai_use" className="select" defaultValue="none">
                        {Object.entries(AI_USE).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="ai_detail">ใช้ช่วยส่วนไหน (ถ้าใช้)</label>
                      <input id="ai_detail" name="ai_detail" className="input" maxLength={1000} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="reasoning">ทำไมเลือกทำแบบนี้</label>
                    <textarea id="reasoning" name="reasoning" className="textarea" maxLength={4000} placeholder="บริษัทใช้ส่วนนี้ประกอบการให้คะแนน และถามต่อใน 10 นาทีแรกของการสัมภาษณ์" required />
                  </div>
                  <SubmitButton pendingText="กำลังส่ง…">ส่งโจทย์</SubmitButton>
                </ActionForm>
              ) : null}

              {d.submission?.submitted_at ? (
                <div className="card soft tight">
                  <div className="row-between">
                    <span className="strong">{d.submission.reused_from ? 'ใช้ผลโจทย์เดิม' : 'คำตอบที่ส่ง'}</span>
                    <span className="small muted">{thaiDateTime(d.submission.submitted_at)}</span>
                  </div>
                  <p className="prewrap small">{d.submission.answer || '(ส่งเป็นไฟล์หรือลิงก์)'}</p>
                  <span className="small muted">
                    {AI_USE[d.submission.ai_use]}
                    {d.submission.ai_detail ? ` · ${d.submission.ai_detail}` : ''}
                  </span>
                </div>
              ) : null}

              {d.score ? (
                <div className="card tight">
                  <div className="row-between">
                    <span className="strong">คะแนนโจทย์</span>
                    <span className="score" style={{ fontSize: 20 }}>
                      {d.score.total}/100
                    </span>
                  </div>
                  {d.score.scores.map((s) => (
                    <div key={s.name} className="row-between small">
                      <span>{s.name}</span>
                      <span>
                        {s.score}/{s.weight}
                      </span>
                    </div>
                  ))}
                  {d.score.feedback ? <p className="small">ความเห็นจากบริษัท: {d.score.feedback}</p> : null}
                </div>
              ) : null}
            </section>
          ) : ch?.preview ? (
            <section className="card soft">
              <h2>โจทย์ของตำแหน่งนี้: {ch.title}</h2>
              <p className="muted small">ถ้าบริษัทเชิญเข้ารอบโจทย์ ตัวโจทย์จะเปิดที่นี่ ใช้เวลาประมาณ {ch.time_limit_minutes} นาที</p>
            </section>
          ) : null}

          {d.interview && d.interview.status !== 'cancelled' ? (
            <section className="card">
              <h2>สัมภาษณ์</h2>
              {d.interview.status === 'confirmed' ? (
                <div className="kv">
                  <dt>เวลา</dt>
                  <dd className="strong">{shortDateTime(d.interview.starts_at)}</dd>
                  <dt>รูปแบบ</dt>
                  <dd>{MODE[d.interview.mode || 'online']}</dd>
                  {d.interview.location ? (
                    <>
                      <dt>สถานที่</dt>
                      <dd>{d.interview.location}</dd>
                    </>
                  ) : null}
                  {d.interview.meeting_url ? (
                    <>
                      <dt>ลิงก์</dt>
                      <dd>
                        <a href={d.interview.meeting_url} target="_blank" rel="noreferrer">
                          เข้าห้องสัมภาษณ์
                        </a>
                      </dd>
                    </>
                  ) : null}
                </div>
              ) : null}
              {d.interview.status === 'awaiting_candidate' ? (
                <ActionForm action={bookInterviewAction}>
                  <input type="hidden" name="interview_id" value={d.interview.id} />
                  <input type="hidden" name="app_id" value={a.id} />
                  <span className="muted small">เลือกเวลาที่สะดวก {dueText(a.candidate_due_at)}</span>
                  {d.interview.options.map((o) => (
                    <label key={o.slot_id} className="check">
                      <input type="radio" name="slot_id" value={o.slot_id} disabled={o.seats_left <= 0} required />
                      <span>
                        {shortDateTime(o.starts_at)} · {MODE[o.mode]}
                        {o.location ? ` · ${o.location}` : ''}
                        {o.seats_left <= 0 ? ' · เต็มแล้ว' : ''}
                      </span>
                    </label>
                  ))}
                  <SubmitButton>ยืนยันเวลานี้</SubmitButton>
                </ActionForm>
              ) : null}
              {d.interview.status === 'reschedule_requested' ? <p className="muted">ส่งคำขอเลื่อนแล้ว รอบริษัทเสนอเวลาใหม่</p> : null}
              {d.interview.status === 'completed' ? <p className="muted">สัมภาษณ์เสร็จแล้ว บริษัทต้องแจ้งผล{dueText(a.sla_due_at)}</p> : null}
              {['awaiting_candidate', 'confirmed'].includes(d.interview.status) ? (
                <details className="disclosure">
                  <summary>ขอเลื่อนนัด</summary>
                  <ActionForm action={rescheduleAction}>
                    <input type="hidden" name="interview_id" value={d.interview.id} />
                    <input type="hidden" name="app_id" value={a.id} />
                    <div className="field">
                      <label htmlFor="note">ช่วงเวลาที่สะดวก</label>
                      <input id="note" name="note" className="input" required placeholder="เช่น วันพฤหัสหรือศุกร์ หลัง 13:00" />
                    </div>
                    <SubmitButton className="btn small outline">ส่งคำขอเลื่อน</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
            </section>
          ) : null}

          {d.offer ? (
            <section className="card highlight">
              <h2>ข้อเสนองาน</h2>
              <div className="kv">
                <dt>ค่าตอบแทน</dt>
                <dd className="strong">
                  {money(d.offer.salary)} {PAY_UNIT[d.offer.pay_unit]}
                </dd>
                <dt>เริ่มงาน</dt>
                <dd>{d.offer.start_date ? thaiDate(d.offer.start_date) : 'ตกลงกันในแชต'}</dd>
                <dt>ตอบได้ถึง</dt>
                <dd>{thaiDateTime(d.offer.expires_at)}</dd>
              </div>
              {d.offer.note ? <p className="prewrap">{d.offer.note}</p> : null}
              {d.offer.status === 'sent' ? (
                <ActionForm action={respondOfferAction}>
                  <input type="hidden" name="offer_id" value={d.offer.id} />
                  <div className="field">
                    <label htmlFor="reason">ข้อความถึงบริษัท (ถ้าปฏิเสธ บอกเหตุผลสั้นๆ ได้)</label>
                    <input id="reason" name="reason" className="input" maxLength={500} />
                  </div>
                  <div className="row">
                    <SubmitButton name="decision" value="accept">
                      ตอบรับข้อเสนอ
                    </SubmitButton>
                    <SubmitButton name="decision" value="decline" className="btn ghost">
                      ปฏิเสธข้อเสนอ
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : (
                <Badge tone="gray">{d.offer.status === 'accepted' ? 'ตอบรับแล้ว' : d.offer.status === 'declined' ? 'ปฏิเสธแล้ว' : 'หมดอายุ'}</Badge>
              )}
            </section>
          ) : null}

          {roomId ? (
            <section className="card">
              <h2>คุยกับบริษัท</h2>
              <p className="muted small">ข้อความอยู่ในใบสมัครนี้เท่านั้น ไม่ต้องแลกเบอร์ส่วนตัว</p>
              <ChatRoom roomId={roomId} meId={user.id} initial={messages} afterSend={afterChatSendAction} placeholder="พิมพ์ถึงบริษัท" />
            </section>
          ) : null}
        </div>

        <aside className="side">
          <section className="card">
            <h2>ความคืบหน้า</h2>
            <ol className="timeline">
              {d.events.map((e, i) => (
                <li key={i} className={e.actor_kind}>
                  <div className="strong small">{EVENT_LABEL[e.kind] || e.kind}</div>
                  <div className="tiny muted">
                    {thaiDateTime(e.at)} · {e.actor_kind === 'candidate' ? 'คุณ' : e.actor_name}
                  </div>
                  {e.message ? <p className="small prewrap">{e.message}</p> : null}
                  {typeof e.data?.reason_labels === 'string' ? <p className="small">เหตุผล: {e.data.reason_labels as string}</p> : null}
                </li>
              ))}
            </ol>
          </section>
          <section className="card">
            <h2>ข้อมูลที่บริษัทเห็น</h2>
            {a.profile_snapshot ? (
              <p className="small muted">
                สำเนาโปรไฟล์ ณ วันที่สมัคร{a.share_plan ? ' พร้อมแผนอาชีพ' : ''} ไม่มีอีเมล เบอร์โทร ที่อยู่ หรือวันเกิด
              </p>
            ) : (
              <p className="small muted">ถอนสิทธิ์แล้ว บริษัทไม่เห็นโปรไฟล์ของคุณอีก</p>
            )}
            {!closed ? (
              <details className="disclosure">
                <summary>ถอนใบสมัคร</summary>
                <ActionForm action={withdrawAction}>
                  <input type="hidden" name="app_id" value={a.id} />
                  <div className="field">
                    <label htmlFor="reason-w">เหตุผล (ไม่บังคับ)</label>
                    <input id="reason-w" name="reason" className="input" maxLength={500} />
                  </div>
                  <span className="hint">บริษัทจะไม่เห็นโปรไฟล์ของคุณอีก และยกเลิกนัดหรือข้อเสนอที่ค้างอยู่</span>
                  <SubmitButton className="btn small danger">ยืนยันถอนใบสมัคร</SubmitButton>
                </ActionForm>
              </details>
            ) : a.profile_snapshot ? (
              <form action={revokeAccessAction}>
                <input type="hidden" name="app_id" value={a.id} />
                <ConfirmSubmit className="btn small ghost">ถอนสิทธิ์ที่บริษัทเห็นโปรไฟล์</ConfirmSubmit>
              </form>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
