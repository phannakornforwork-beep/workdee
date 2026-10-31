import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireCompany } from '@/lib/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { ChatRoom, type ChatMessage } from '@/components/ChatRoom';
import { afterChatSendAction } from '@/lib/actions/chat';
import { Alert, Avatar, Badge, StageBadge, VerifyBadge } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { GradeForm } from './GradeForm';
import {
  addNoteAction, completeInterviewAction, inviteChallengeOneAction, inviteInterviewOneAction, makeOfferAction, offerSlotsAction, rejectOneAction
} from '@/lib/actions/hiring';
import { AI_USE, CLOSED_STAGES, EVENT_LABEL, PAY_UNIT, dueText, money, salaryRange, shortDateTime, thaiDateTime } from '@/lib/format';
import type { Criterion } from '@/lib/types';

export const metadata: Metadata = { title: 'ใบสมัคร' };

type Snap = {
  full_name: string; photo_path?: string | null; headline: string; intro: string; province: string | null; age: number | null; skills: string[]; tools: string[];
  languages: { name: string; detail: string }[]; certificates: { name: string; detail: string }[]; projects: { title: string; detail: string }[];
  experiences: { title: string; detail: string }[];
  educations: { institution_name: string; level: string; faculty: string | null; major: string | null; status: string; year_label: string | null; gpa: number | null; verify_level: string }[];
  plan?: { goal_title: string; goal_detail: string; steps: { title: string }[] };
};

type Detail = {
  app: {
    id: string; job_id: string; company_id: string; candidate_id: string; candidate_name: string; stage: string; sla_due_at: string | null; candidate_due_at: string | null;
    profile_snapshot: Snap | null; verify_level: string; intro_message: string; expected_salary: number | null; match_score: number; created_at: string;
    reject_labels: string | null; reject_note: string | null; closed_by_system: boolean; access_revoked_at: string | null;
  };
  job: { id: string; title: string; job_type: string; salary_min: number | null; salary_max: number | null; pay_unit: string; challenge_seats: number; seats_used: number; status: string };
  challenge: { title: string; criteria: Criterion[]; ai_policy: string } | null;
  submission: { answer: string; links: string[]; file_paths: string[]; ai_use: string; ai_detail: string; reasoning: string; submitted_at: string | null; reused_from: string | null } | null;
  score: { scores: { name: string; weight: number; score: number }[]; total: number; feedback: string; reused: boolean; graded_by_name: string; graded_at: string } | null;
  notes: { id: number; author_name: string; body: string; created_at: string }[];
  events: { kind: string; actor_kind: string; actor_name: string; message: string; at: string; visible_to_candidate: boolean; data: Record<string, unknown> }[];
  interviews: { id: string; status: string; starts_at: string | null; candidate_note: string; mode: string | null; location: string | null }[];
  offer: { id: string; salary: number; pay_unit: string; status: string; expires_at: string | null } | null;
  room_id: string | null;
  can_offer: boolean;
};

const MODE: Record<string, string> = { online: 'ออนไลน์', onsite: 'ที่บริษัท', phone: 'โทรศัพท์' };

export default async function ApplicantPage({ params }: { params: Promise<{ cid: string; aid: string }> }) {
  const { cid, aid } = await params;
  const { supabase, user, access } = await requireCompany(cid);
  const { data } = await supabase.rpc('application_detail', { p_app: aid });
  if (!data) notFound();
  const d = data as Detail;
  const a = d.app;
  const snap = a.profile_snapshot;
  const closed = CLOSED_STAGES.includes(a.stage);

  const [{ data: templates }, { data: reasons }, { data: slots }] = await Promise.all([
    supabase.from('message_templates').select('kind, label, body').eq('company_id', cid),
    supabase.from('reject_reasons').select('code, label, needs_note').eq('system_only', false).order('sort'),
    supabase.from('interview_slots').select('id, starts_at, mode').eq('company_id', cid).gt('starts_at', new Date().toISOString()).order('starts_at').limit(30)
  ]);
  const tpl = (kind: string) => ((templates || []) as { kind: string; body: string }[]).find((t) => t.kind === kind)?.body || '';

  const files: { name: string; url: string }[] = [];
  for (const p of d.submission?.file_paths || []) {
    const { data: signed } = await supabase.storage.from('submissions').createSignedUrl(p, 600);
    if (signed?.signedUrl) files.push({ name: p.split('/').pop() || p, url: signed.signedUrl });
  }

  let roomId = d.room_id;
  if (!roomId && !closed && snap) {
    const { data: rid } = await supabase.rpc('ensure_candidate_room', { p_app: aid });
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
  const latestInterview = d.interviews[0];
  const ungraded = a.stage === 'challenge_submitted' && !d.score;
  const slotOptions = (slots || []) as { id: string; starts_at: string; mode: string }[];

  return (
    <>
      <Link href={`/c/${cid}/pipeline?job=${d.job.id}`} className="small">
        ← กลับไปกระดานผู้สมัคร
      </Link>
      <div className="row-between">
        <div className="stack-sm">
          <Avatar src={mediaUrl(snap?.photo_path)} name={a.candidate_name} size={72} />
          <span className="muted">{d.job.title} · สมัครเมื่อ {thaiDateTime(a.created_at)}</span>
          <h1>{a.candidate_name}</h1>
          <div className="chips">
            <StageBadge stage={a.stage} />
            <VerifyBadge level={a.verify_level} />
            <Badge tone="teal">ตรงกับงาน {a.match_score}%</Badge>
            {a.sla_due_at ? <Badge tone={(new Date(a.sla_due_at).getTime() - Date.now()) / 86400000 <= 2 ? 'red' : 'gray'}>ต้องตอบ{dueText(a.sla_due_at)}</Badge> : null}
          </div>
        </div>
      </div>
      {!snap ? <Alert tone="warn">ผู้สมัครถอนสิทธิ์การเข้าถึงโปรไฟล์แล้ว เหลือเฉพาะประวัติการดำเนินการ</Alert> : null}
      {a.stage === 'rejected' ? (
        <Alert tone="info">
          ปิดแล้ว · เหตุผล: {a.reject_labels}
          {a.reject_note ? ` · ${a.reject_note}` : ''}
          {a.closed_by_system ? ' · ระบบปิดเพราะไม่ได้ตอบใน 7 วัน (นับในอัตราการตอบของบริษัท)' : ''}
        </Alert>
      ) : null}

      <div className="split">
        <div className="main">
          {snap ? (
            <section className="card">
              <h2>โปรไฟล์ (สำเนา ณ วันที่สมัคร)</h2>
              {snap.headline ? <p className="strong">{snap.headline}</p> : null}
              {snap.intro ? <p className="prewrap">{snap.intro}</p> : null}
              {a.intro_message ? (
                <div className="card soft tight">
                  <span className="tiny muted">ข้อความถึงบริษัทนี้</span>
                  <span className="prewrap">{a.intro_message}</span>
                </div>
              ) : null}
              <dl className="kv">
                <dt>การศึกษา</dt>
                <dd className="stack-sm">
                  {snap.educations.map((e, i) => (
                    <span key={i}>
                      {e.institution_name} · {e.major || e.faculty || ''} {e.year_label ? `· ${e.year_label}` : ''} {e.gpa ? `· GPA ${e.gpa}` : ''} <VerifyBadge level={e.verify_level} />
                    </span>
                  ))}
                  {snap.educations.length === 0 ? '-' : null}
                </dd>
                <dt>สกิล</dt>
                <dd>{[...(snap.skills || []), ...(snap.tools || [])].join(', ') || '-'}</dd>
                {snap.languages?.length ? (
                  <>
                    <dt>ภาษา</dt>
                    <dd>{snap.languages.map((l) => `${l.name} ${l.detail}`).join(' · ')}</dd>
                  </>
                ) : null}
                {snap.certificates?.length ? (
                  <>
                    <dt>ใบรับรอง</dt>
                    <dd>{snap.certificates.map((l) => `${l.name} ${l.detail}`).join(' · ')}</dd>
                  </>
                ) : null}
                {snap.projects?.length ? (
                  <>
                    <dt>ผลงาน</dt>
                    <dd className="stack-sm">
                      {snap.projects.map((p, i) => (
                        <span key={i}>
                          {p.title} {p.detail ? `· ${p.detail}` : ''}
                        </span>
                      ))}
                    </dd>
                  </>
                ) : null}
                {snap.experiences?.length ? (
                  <>
                    <dt>ประสบการณ์</dt>
                    <dd className="stack-sm">
                      {snap.experiences.map((p, i) => (
                        <span key={i}>
                          {p.title} {p.detail ? `· ${p.detail}` : ''}
                        </span>
                      ))}
                    </dd>
                  </>
                ) : null}
                <dt>ค่าตอบแทนที่คาดหวัง</dt>
                <dd>{a.expected_salary ? `${money(a.expected_salary)} บาท` : 'ไม่ระบุ'} (ช่วงในประกาศ {salaryRange(d.job.salary_min, d.job.salary_max, d.job.pay_unit)})</dd>
                <dt>จังหวัด / อายุ</dt>
                <dd>
                  {snap.province || '-'} · {snap.age ? `${snap.age} ปี` : 'ไม่แสดงอายุ'}
                </dd>
                <dt>แผนอาชีพ</dt>
                <dd>{snap.plan ? `${snap.plan.goal_title}${snap.plan.goal_detail ? ` · ${snap.plan.goal_detail}` : ''}` : 'ผู้สมัครเลือกไม่แชร์แผนอาชีพ'}</dd>
              </dl>
              <p className="tiny muted">ไม่มีอีเมล เบอร์โทร ที่อยู่ หรือวันเกิด ติดต่อผู้สมัครผ่านแชตด้านล่าง</p>
            </section>
          ) : null}

          {d.submission?.submitted_at ? (
            <section className="card">
              <div className="row-between">
                <h2>คำตอบโจทย์ {d.challenge ? `· ${d.challenge.title}` : ''}</h2>
                <span className="small muted">ส่ง {thaiDateTime(d.submission.submitted_at)}</span>
              </div>
              {d.submission.reused_from ? <Alert tone="info">ผู้สมัครใช้ผลโจทย์เดิมของสกิลเดียวกันจากอีกใบสมัคร</Alert> : null}
              <p className="prewrap">{d.submission.answer || '(ส่งเป็นไฟล์หรือลิงก์)'}</p>
              {d.submission.links?.length ? (
                <div className="stack-sm">
                  {d.submission.links.map((l) => (
                    <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="small">
                      {l}
                    </a>
                  ))}
                </div>
              ) : null}
              {files.length ? (
                <div className="row">
                  {files.map((f) => (
                    <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="btn small ghost">
                      เปิดไฟล์ {f.name}
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="card soft tight">
                <span className="small">
                  <strong>การใช้ AI:</strong> {AI_USE[d.submission.ai_use]}
                  {d.submission.ai_detail ? ` · ${d.submission.ai_detail}` : ''}
                </span>
                <span className="small">
                  <strong>เหตุผลที่เลือกทำแบบนี้:</strong> {d.submission.reasoning}
                </span>
                <span className="tiny muted">แนะนำ: ใช้ 10 นาทีแรกของการสัมภาษณ์ให้ผู้สมัครอธิบายคำตอบนี้</span>
              </div>
              {d.score ? (
                <div className="card tight">
                  <div className="row-between">
                    <span className="strong">คะแนน {d.score.reused ? '(ผลเดิม)' : `โดย ${d.score.graded_by_name}`}</span>
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
                </div>
              ) : null}
              {a.stage === 'challenge_submitted' && d.challenge && !d.score?.reused ? (
                <details className="disclosure" open={!d.score}>
                  <summary>{d.score ? 'แก้คะแนน' : 'ให้คะแนนตามเกณฑ์'}</summary>
                  <GradeForm
                    companyId={cid}
                    appId={a.id}
                    criteria={d.challenge.criteria}
                    initial={d.score ? Object.fromEntries(d.score.scores.map((s) => [s.name, s.score])) : undefined}
                  />
                </details>
              ) : null}
            </section>
          ) : a.stage === 'challenge_invited' ? (
            <section className="card soft">
              <h2>รอผู้สมัครส่งโจทย์</h2>
              <p className="small muted">ส่ง{dueText(a.candidate_due_at)} ({thaiDateTime(a.candidate_due_at)})</p>
            </section>
          ) : null}

          {latestInterview ? (
            <section className="card">
              <h2>สัมภาษณ์</h2>
              <p>
                {latestInterview.status === 'confirmed' && latestInterview.starts_at
                  ? `นัดแล้ว ${shortDateTime(latestInterview.starts_at)} · ${MODE[latestInterview.mode || 'online']}${latestInterview.location ? ` · ${latestInterview.location}` : ''}`
                  : latestInterview.status === 'awaiting_candidate'
                    ? `รอผู้สมัครเลือกเวลา${dueText(a.candidate_due_at)}`
                    : latestInterview.status === 'reschedule_requested'
                      ? `ผู้สมัครขอเลื่อน: ${latestInterview.candidate_note}`
                      : latestInterview.status === 'completed'
                        ? 'สัมภาษณ์แล้ว ตัดสินใจขั้นต่อไปภายใน 7 วัน'
                        : latestInterview.status === 'no_show'
                          ? 'ผู้สมัครไม่มาตามนัด'
                          : 'ยกเลิกแล้ว'}
              </p>
              {latestInterview.status === 'confirmed' && latestInterview.starts_at && new Date(latestInterview.starts_at) < new Date() ? (
                <form action={completeInterviewAction} className="row">
                  <input type="hidden" name="company_id" value={cid} />
                  <input type="hidden" name="interview_id" value={latestInterview.id} />
                  <SubmitButton name="outcome" value="completed" className="btn small">
                    บันทึกว่าสัมภาษณ์แล้ว
                  </SubmitButton>
                  <SubmitButton name="outcome" value="no_show" className="btn small ghost">
                    ผู้สมัครไม่มา
                  </SubmitButton>
                </form>
              ) : null}
              {latestInterview.status === 'reschedule_requested' ? (
                <ActionForm action={offerSlotsAction}>
                  <input type="hidden" name="company_id" value={cid} />
                  <input type="hidden" name="interview_id" value={latestInterview.id} />
                  <span className="label">เลือกเวลาใหม่ที่จะเสนอ</span>
                  <div className="chips">
                    {slotOptions.map((s) => (
                      <label key={s.id} className="chip">
                        <input type="checkbox" name="slot_ids" value={s.id} /> {shortDateTime(s.starts_at)} · {MODE[s.mode]}
                      </label>
                    ))}
                  </div>
                  {slotOptions.length === 0 ? (
                    <span className="small">
                      ยังไม่มีเวลาว่าง <Link href={`/c/${cid}/interviews`}>เพิ่มเวลา</Link>
                    </span>
                  ) : null}
                  <SubmitButton className="btn small">ส่งเวลาใหม่</SubmitButton>
                </ActionForm>
              ) : null}
            </section>
          ) : null}

          {d.offer && d.offer.status !== 'draft' ? (
            <section className="card">
              <h2>ข้อเสนองาน</h2>
              <p>
                {money(d.offer.salary)} {PAY_UNIT[d.offer.pay_unit]} ·{' '}
                {d.offer.status === 'pending_approval' ? 'รอเจ้าของกิจการอนุมัติ' : d.offer.status === 'sent' ? `รอผู้สมัครตอบถึง ${thaiDateTime(d.offer.expires_at)}` : d.offer.status === 'accepted' ? 'ตอบรับแล้ว' : d.offer.status === 'declined' ? 'ปฏิเสธแล้ว' : d.offer.status}
              </p>
            </section>
          ) : null}

          {roomId ? (
            <section className="card">
              <h2>คุยกับผู้สมัคร</h2>
              <ChatRoom roomId={roomId} meId={user.id} initial={messages} afterSend={afterChatSendAction} placeholder="ข้อความถึงผู้สมัคร (ผู้สมัครเห็นทันที)" />
            </section>
          ) : null}
        </div>

        <aside className="side">
          {!closed && a.stage !== 'offer' ? (
            <section className="card highlight">
              <h2>ขั้นต่อไป</h2>
              {ungraded ? <p className="small">ให้คะแนนโจทย์ก่อน แล้วจึงเชิญสัมภาษณ์หรือปฏิเสธได้</p> : null}
              {a.stage === 'applied' && d.challenge ? (
                <ActionForm action={inviteChallengeOneAction}>
                  <input type="hidden" name="company_id" value={cid} />
                  <input type="hidden" name="app_id" value={a.id} />
                  <span className="small muted">ที่นั่งรอบโจทย์เหลือ {Math.max(0, d.job.challenge_seats - d.job.seats_used)} จาก {d.job.challenge_seats}</span>
                  <textarea name="message" className="textarea" aria-label="ข้อความเชิญทำโจทย์" defaultValue={tpl('invite_challenge')} />
                  <SubmitButton className="btn small">เชิญเข้ารอบโจทย์</SubmitButton>
                </ActionForm>
              ) : null}
              {(a.stage === 'applied' || (a.stage === 'challenge_submitted' && !ungraded)) ? (
                <details className="disclosure">
                  <summary>เชิญสัมภาษณ์</summary>
                  <ActionForm action={inviteInterviewOneAction}>
                    <input type="hidden" name="company_id" value={cid} />
                    <input type="hidden" name="app_id" value={a.id} />
                    <div className="chips">
                      {slotOptions.map((s) => (
                        <label key={s.id} className="chip">
                          <input type="checkbox" name="slot_ids" value={s.id} /> {shortDateTime(s.starts_at)}
                        </label>
                      ))}
                    </div>
                    {slotOptions.length === 0 ? (
                      <span className="small">
                        ยังไม่มีเวลาว่าง <Link href={`/c/${cid}/interviews`}>เพิ่มเวลาสัมภาษณ์</Link>
                      </span>
                    ) : null}
                    <textarea name="message" className="textarea" aria-label="ข้อความเชิญสัมภาษณ์" defaultValue={tpl('invite_interview')} />
                    <SubmitButton className="btn small">ส่งคำเชิญ</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              {d.can_offer && ['applied', 'challenge_submitted', 'interview'].includes(a.stage) && !ungraded ? (
                <details className="disclosure">
                  <summary>เสนองาน</summary>
                  <ActionForm action={makeOfferAction}>
                    <input type="hidden" name="company_id" value={cid} />
                    <input type="hidden" name="app_id" value={a.id} />
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor="salary">ค่าตอบแทน</label>
                        <input id="salary" name="salary" className="input" inputMode="numeric" defaultValue={a.expected_salary || d.job.salary_max || ''} required />
                      </div>
                      <div className="field">
                        <label htmlFor="pay_unit">หน่วย</label>
                        <select id="pay_unit" name="pay_unit" className="select" defaultValue={d.job.pay_unit}>
                          <option value="month">ต่อเดือน</option>
                          <option value="day">ต่อวัน</option>
                          <option value="hour">ต่อชั่วโมง</option>
                          <option value="project">ต่อโปรเจกต์</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor="start_date">วันเริ่มงาน</label>
                        <input id="start_date" name="start_date" type="date" className="input" />
                      </div>
                      <div className="field">
                        <label htmlFor="expires_days">ให้ตอบภายใน (วัน)</label>
                        <input id="expires_days" name="expires_days" className="input" inputMode="numeric" defaultValue="5" />
                      </div>
                    </div>
                    <textarea name="note" className="textarea" aria-label="รายละเอียดข้อเสนอ" placeholder="สวัสดิการ ระยะสัญญา เงื่อนไขทดลองงาน" />
                    <span className="hint">เกิน {money(d.job.salary_max)} ต้องให้เจ้าของอนุมัติก่อนส่ง (ถ้าเปิดกฎ)</span>
                    <SubmitButton className="btn small">ส่งข้อเสนอ</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              {!ungraded ? (
                <details className="disclosure">
                  <summary>ปฏิเสธพร้อมเหตุผล</summary>
                  <ActionForm action={rejectOneAction}>
                    <input type="hidden" name="company_id" value={cid} />
                    <input type="hidden" name="app_id" value={a.id} />
                    <div className="chips">
                      {((reasons || []) as { code: string; label: string }[]).map((r) => (
                        <label key={r.code} className="chip">
                          <input type="checkbox" name="reasons" value={r.code} /> {r.label}
                        </label>
                      ))}
                    </div>
                    <input name="note" className="input" placeholder="รายละเอียดเพิ่ม (จำเป็นถ้าเลือก อื่นๆ)" aria-label="รายละเอียดเพิ่ม" />
                    <textarea name="message" className="textarea" aria-label="ข้อความถึงผู้สมัคร" defaultValue={tpl('reject')} />
                    <SubmitButton className="btn small danger">แจ้งผลพร้อมเหตุผล</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
            </section>
          ) : null}

          <section className="card">
            <h2>บันทึกภายในทีม</h2>
            <p className="tiny muted">ผู้สมัครไม่เห็นส่วนนี้</p>
            {d.notes.map((n) => (
              <div key={n.id} className="card soft tight">
                <span className="tiny muted">
                  {n.author_name} · {thaiDateTime(n.created_at)}
                </span>
                <span className="small prewrap">{n.body}</span>
              </div>
            ))}
            <ActionForm action={addNoteAction} resetOnSuccess>
              <input type="hidden" name="company_id" value={cid} />
              <input type="hidden" name="app_id" value={a.id} />
              <textarea name="body" className="textarea" style={{ minHeight: 70 }} aria-label="บันทึก" required />
              <SubmitButton className="btn small ghost">บันทึก</SubmitButton>
            </ActionForm>
          </section>

          <section className="card">
            <h2>ประวัติ</h2>
            <ol className="timeline">
              {d.events.map((e, i) => (
                <li key={i} className={e.actor_kind}>
                  <div className="small strong">
                    {EVENT_LABEL[e.kind] || e.kind} {!e.visible_to_candidate ? <span className="tiny muted">(ภายใน)</span> : null}
                  </div>
                  <div className="tiny muted">
                    {thaiDateTime(e.at)} · {e.actor_name || (e.actor_kind === 'candidate' ? a.candidate_name : '')}
                  </div>
                  {e.message ? <p className="small prewrap">{e.message}</p> : null}
                </li>
              ))}
            </ol>
          </section>
          <p className="tiny muted">ตำแหน่งของคุณ: {access.position_title}</p>
        </aside>
      </div>
    </>
  );
}
