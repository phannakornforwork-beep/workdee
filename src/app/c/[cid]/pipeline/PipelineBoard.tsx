'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  bulkInviteChallengeAction, bulkInviteInterviewAction, bulkMessageAction, bulkRejectAction, flushDeliveriesAction,
  saveTemplateAction, undoBatchAction
} from '@/lib/actions/hiring';
import type { PipelineItem, Template } from '@/lib/types';
import { mediaUrl } from '@/lib/env';

type Reason = { code: string; label: string; needs_note: boolean };
type Slot = { id: string; starts_at: string; mode: string; location: string; job_id: string | null };
type JobLite = { id: string; title: string; challenge_seats: number; seats_used: number; has_challenge: boolean };
type ActionKind = 'reject' | 'invite_challenge' | 'invite_interview' | 'message';

const VERIFY: Record<string, [string, string]> = {
  inst: ['ยืนยันโดยสถาบัน', 'teal'],
  doc: ['ตรวจเอกสารแล้ว', 'blue'],
  doc_pending: ['วุฒิยังไม่ยืนยัน', 'gray'],
  none: ['วุฒิยังไม่ยืนยัน', 'gray']
};

const TITLES: Record<ActionKind, string> = {
  reject: 'ปฏิเสธพร้อมเหตุผล',
  invite_challenge: 'เชิญเข้ารอบโจทย์',
  invite_interview: 'เชิญสัมภาษณ์ ให้ผู้สมัครเลือกเวลาเอง',
  message: 'ส่งข้อความ'
};

const TOUR = [
  'คอลัมน์คือขั้นของการสมัคร จากซ้ายไปขวา ผู้สมัครทุกคนต้องได้คำตอบในทุกขั้นภายใน 7 วัน',
  'ป้ายบนการ์ดบอกระดับการยืนยันวุฒิ สถานะโจทย์ และวันที่เหลือ ตัวเลขสีส้มคือใกล้ครบกำหนด',
  'กด "เลือกหลายคน" เพื่อปฏิเสธ เชิญเข้ารอบโจทย์ เชิญสัมภาษณ์ หรือส่งข้อความหลายคนพร้อมกันด้วยข้อความเดียว'
];

function daysLeft(iso: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function when(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function status(it: PipelineItem): { text: string; tone: string } {
  switch (it.stage) {
    case 'applied':
      return { text: 'ยังไม่เชิญเข้ารอบโจทย์', tone: 'gray' };
    case 'challenge_invited':
      return { text: 'เชิญแล้ว · รอผู้สมัครส่ง', tone: 'blue' };
    case 'challenge_submitted':
      return it.score_total === null ? { text: 'ส่งแล้ว · รอให้คะแนน', tone: 'orange' } : { text: `โจทย์ ${it.score_total}/100${it.reused ? ' (ผลเดิม)' : ''} · รอตัดสินใจ`, tone: 'teal' };
    case 'interview':
      if (it.interview?.status === 'confirmed' && it.interview.starts_at) return { text: `นัดแล้ว ${when(it.interview.starts_at)}`, tone: 'teal' };
      if (it.interview?.status === 'reschedule_requested') return { text: 'ขอเลื่อนนัด · เสนอเวลาใหม่', tone: 'orange' };
      if (it.interview?.status === 'completed') return { text: 'สัมภาษณ์แล้ว · รอตัดสินใจ', tone: 'orange' };
      return { text: 'รอผู้สมัครเลือกเวลา', tone: 'blue' };
    case 'offer':
      return { text: it.offer_status === 'pending_approval' ? 'ข้อเสนอรออนุมัติ' : 'รอผู้สมัครตอบข้อเสนอ', tone: 'gray' };
    default:
      return { text: it.reject_labels || '', tone: 'gray' };
  }
}

export function PipelineBoard({
  companyId, companyName, items, jobs, templates, reasons, slots
}: {
  companyId: string; companyName: string; items: PipelineItem[]; jobs: JobLite[]; templates: Template[]; reasons: Reason[]; slots: Slot[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tour, setTour] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [msg, setMsg] = useState('');
  const [tplId, setTplId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; batchId: string | null; until: number } | null>(null);
  const [savedTpl, setSavedTpl] = useState('');
  const [extraTemplates, setExtraTemplates] = useState<Template[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem('wd-pipeline-tour')) setTour(1);
    } catch {
      setTour(1);
    }
  }, []);

  useEffect(() => () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
  }, []);

  const [, force] = useState(0);
  useEffect(() => {
    if (!toast?.batchId) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [toast]);

  function endTour() {
    setTour(0);
    try {
      localStorage.setItem('wd-pipeline-tour', 'done');
    } catch {
      /* ignore */
    }
  }

  const live = items.filter((i) => !['hired', 'rejected', 'withdrawn', 'declined', 'expired'].includes(i.stage));
  const closed = items.filter((i) => !live.includes(i));
  const columns: { key: string; label: string; stages: string[] }[] = [
    { key: 'applied', label: 'สมัคร · รอคัด', stages: ['applied'] },
    { key: 'challenge', label: 'รอบโจทย์', stages: ['challenge_invited', 'challenge_submitted'] },
    { key: 'interview', label: 'สัมภาษณ์', stages: ['interview'] },
    { key: 'offer', label: 'เสนองาน', stages: ['offer'] }
  ];
  const urgent = live.filter((i) => {
    const d = daysLeft(i.sla_due_at);
    return d !== null && d <= 2;
  }).length;

  const selItems = live.filter((i) => selected.includes(i.id));
  const eligible = useMemo(() => {
    if (!action) return { targets: [] as PipelineItem[], skipped: [] as PipelineItem[], blocked: [] as PipelineItem[] };
    const ok: PipelineItem[] = [];
    const skipped: PipelineItem[] = [];
    const blocked: PipelineItem[] = [];
    for (const it of selItems) {
      const ungraded = it.stage === 'challenge_submitted' && it.score_total === null;
      if (action === 'invite_challenge') (it.stage === 'applied' ? ok : skipped).push(it);
      else if (action === 'invite_interview') {
        if (ungraded) blocked.push(it);
        else (['applied', 'challenge_submitted'].includes(it.stage) ? ok : skipped).push(it);
      } else if (action === 'reject') {
        if (ungraded) blocked.push(it);
        else (it.stage === 'offer' || it.access_revoked ? skipped : ok).push(it);
      } else (it.access_revoked ? skipped : ok).push(it);
    }
    return { targets: ok, skipped, blocked };
  }, [action, selItems]);

  const seatProblems = useMemo(() => {
    if (action !== 'invite_challenge') return [] as string[];
    const out: string[] = [];
    for (const j of jobs) {
      const n = eligible.targets.filter((t) => t.job_id === j.id).length;
      const left = j.challenge_seats - j.seats_used;
      if (n > left) out.push(`${j.title} เหลือที่นั่ง ${Math.max(left, 0)} แต่เลือก ${n} คน`);
      if (n > 0 && !j.has_challenge) out.push(`${j.title} ยังไม่มีโจทย์`);
    }
    return out;
  }, [action, eligible.targets, jobs]);

  const allTemplates = [...templates, ...extraTemplates];
  const tplKind = action === 'reject' ? 'reject' : action === 'invite_challenge' ? 'invite_challenge' : action === 'invite_interview' ? 'invite_interview' : 'message';
  const kindTemplates = allTemplates.filter((t) => t.kind === tplKind);

  function openAction(a: ActionKind) {
    setAction(a);
    setError('');
    setSavedTpl('');
    setPicked([]);
    setNote('');
    setSlotIds([]);
    const kind = a === 'reject' ? 'reject' : a;
    const first = allTemplates.find((t) => t.kind === kind);
    setTplId(first?.id || null);
    setMsg(first?.body || '');
  }

  function fill(text: string, it: PipelineItem | undefined) {
    if (!it) return text;
    const first = it.candidate_name.trim().split(/\s+/)[0] || 'ผู้สมัคร';
    return text.split('{ชื่อ}').join(first).split('{ตำแหน่ง}').join(it.job_title).split('{บริษัท}').join(companyName);
  }

  const needNote = picked.some((p) => reasons.find((r) => r.code === p)?.needs_note);
  const ready =
    !!action &&
    eligible.targets.length > 0 &&
    eligible.blocked.length === 0 &&
    seatProblems.length === 0 &&
    (action !== 'message' || msg.trim().length > 1) &&
    (action !== 'reject' || (picked.length > 0 && (!needNote || note.trim().length >= 5))) &&
    (action !== 'invite_interview' || slotIds.length > 0);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function send() {
    if (!ready || !action) return;
    const ids = eligible.targets.map((t) => t.id);
    setError('');
    startTransition(async () => {
      let r;
      if (action === 'reject') r = await bulkRejectAction(companyId, ids, picked, note, msg);
      else if (action === 'invite_challenge') r = await bulkInviteChallengeAction(companyId, ids, msg);
      else if (action === 'invite_interview') r = await bulkInviteInterviewAction(companyId, ids, slotIds, msg);
      else r = await bulkMessageAction(companyId, ids, msg);
      if (!r.ok) {
        setError(r.error || 'ทำรายการไม่สำเร็จ');
        return;
      }
      setToast({ text: `${r.info} · ส่งจริงใน 30 วินาที`, batchId: r.batchId || null, until: Date.now() + 30000 });
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        flushDeliveriesAction();
        setToast((t) => (t ? { ...t, batchId: null, text: t.text.replace(' · ส่งจริงใน 30 วินาที', ' · ส่งถึงผู้สมัครแล้ว') } : t));
      }, 31000);
      setAction(null);
      setSelected([]);
      setSelectMode(false);
      router.refresh();
    });
  }

  function undo() {
    if (!toast?.batchId) return;
    const id = toast.batchId;
    startTransition(async () => {
      const r = await undoBatchAction(companyId, id);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      setToast({ text: r.ok ? r.info || 'ยกเลิกแล้ว' : r.error || 'ยกเลิกไม่สำเร็จ', batchId: null, until: 0 });
      router.refresh();
    });
  }

  function saveTemplate() {
    if (!action || msg.trim().length < 2) return;
    const label = `ข้อความของทีม ${allTemplates.filter((t) => t.kind === tplKind).length + 1}`;
    startTransition(async () => {
      const r = await saveTemplateAction(companyId, tplKind, label, msg);
      if (r.ok && r.batchId) {
        setExtraTemplates((x) => [...x, { id: r.batchId as string, kind: tplKind, label, body: msg, is_default: false }]);
        setTplId(r.batchId);
        setSavedTpl(r.info || '');
      } else setError(r.error || 'บันทึกไม่สำเร็จ');
    });
  }

  const secondsLeft = toast?.batchId ? Math.max(0, Math.ceil((toast.until - Date.now()) / 1000)) : 0;
  const preview = eligible.targets[0] || selItems[0];

  return (
    <div className="stack">
      {tour > 0 ? (
        <section className="alert info row-between" aria-live="polite">
          <span style={{ flex: '1 1 420px' }}>
            <strong>ทัวร์สั้น · ขั้น {tour} จาก 3</strong>
            <br />
            {TOUR[tour - 1]}
          </span>
          <span className="row">
            <button type="button" className="btn small ghost" onClick={endTour}>
              ข้าม
            </button>
            <button type="button" className="btn small" onClick={() => (tour >= 3 ? endTour() : setTour(tour + 1))}>
              {tour >= 3 ? 'เข้าใจแล้ว' : 'ถัดไป'}
            </button>
          </span>
        </section>
      ) : null}

      <div className="row-between">
        <div className="row small">
          {urgent ? <span className="badge red">{urgent} คนต้องได้คำตอบภายใน 2 วัน</span> : null}
          {jobs
            .filter((j) => j.has_challenge)
            .map((j) => (
              <span key={j.id} className="muted">
                {j.title}: ที่นั่งรอบโจทย์ {j.seats_used}/{j.challenge_seats}
              </span>
            ))}
        </div>
        <div className="row">
          {tour === 0 ? (
            <button type="button" className="btn link small" onClick={() => setTour(1)}>
              ดูทัวร์อีกครั้ง
            </button>
          ) : null}
          <button
            type="button"
            className={`btn small ${selectMode ? '' : 'outline'}`}
            aria-pressed={selectMode}
            onClick={() => {
              setSelectMode(!selectMode);
              setSelected([]);
              setAction(null);
            }}
          >
            {selectMode ? 'เลิกเลือกหลายคน' : 'เลือกหลายคน'}
          </button>
        </div>
      </div>

      {toast ? (
        <div role="status" className="bulkbar">
          <span style={{ flex: 1 }}>
            {toast.text}
            {toast.batchId ? ` (${secondsLeft} วินาที)` : ''}
          </span>
          {toast.batchId && secondsLeft > 0 ? (
            <button type="button" className="btn small ghost" onClick={undo} disabled={pending}>
              ยกเลิกการส่ง
            </button>
          ) : null}
          <button type="button" className="btn small link" style={{ color: '#fff' }} onClick={() => setToast(null)} aria-label="ปิดข้อความ">
            ปิด
          </button>
        </div>
      ) : null}

      {selectMode ? (
        <div className="bulkbar">
          <span className="strong" style={{ flex: '1 1 140px' }}>
            เลือกแล้ว {selected.length} คน
          </span>
          {selected.length === 0 ? <span className="small" style={{ color: '#d7dade' }}>แตะการ์ดเพื่อเลือก หรือกด &ldquo;เลือกทั้งคอลัมน์&rdquo;</span> : null}
          <button type="button" className="btn small ghost" disabled={!selected.length} onClick={() => openAction('invite_challenge')}>
            เชิญเข้ารอบโจทย์
          </button>
          <button type="button" className="btn small ghost" disabled={!selected.length} onClick={() => openAction('invite_interview')}>
            เชิญสัมภาษณ์
          </button>
          <button type="button" className="btn small ghost" disabled={!selected.length} onClick={() => openAction('message')}>
            ส่งข้อความ
          </button>
          <button type="button" className="btn small soft-danger" disabled={!selected.length} onClick={() => openAction('reject')}>
            ปฏิเสธพร้อมเหตุผล
          </button>
        </div>
      ) : null}

      {action && selected.length ? (
        <section className="card highlight">
          <h2>{TITLES[action]}</h2>
          <p className="small">
            {eligible.targets.length ? `จะส่งถึง ${eligible.targets.length} คน: ${eligible.targets.map((t) => t.candidate_name).join(', ')}` : 'ยังไม่มีผู้สมัครที่ทำขั้นนี้ได้ในรายการที่เลือก'}
          </p>
          {eligible.skipped.length ? (
            <p className="small muted">
              ข้าม {eligible.skipped.map((t) => t.candidate_name).join(', ')}{' '}
              {action === 'invite_challenge' ? 'เพราะไม่ได้อยู่ขั้นรอคัด' : action === 'reject' ? 'เพราะอยู่ขั้นเสนองานแล้วหรือถอนสิทธิ์แล้ว' : action === 'invite_interview' ? 'เพราะไม่ได้อยู่ขั้นรอคัดหรือส่งโจทย์แล้ว' : 'เพราะถอนสิทธิ์แล้ว'}
            </p>
          ) : null}
          {eligible.blocked.length ? (
            <div className="alert warn row-between">
              <span>ส่งโจทย์แล้วแต่ยังไม่ได้ให้คะแนน: {eligible.blocked.map((t) => t.candidate_name).join(', ')} · ต้องให้คะแนนก่อน เพื่อให้ผู้สมัครได้คะแนนรายเกณฑ์ตามที่สัญญาไว้</span>
              <button type="button" className="btn small ghost" onClick={() => setSelected((s) => s.filter((id) => !eligible.blocked.some((b) => b.id === id)))}>
                เอาออกจากรายการ
              </button>
            </div>
          ) : null}
          {seatProblems.map((p) => (
            <div key={p} className="alert warn">
              {p} · เลือกให้ไม่เกินที่นั่ง หรือเพิ่มที่นั่งในหน้าแก้ไขประกาศ
            </div>
          ))}
          {action === 'reject' ? (
            <div className="stack-sm">
              <span className="label">เหตุผล (เลือกอย่างน้อย 1 ข้อ ทุกคนในรายการได้เหตุผลเดียวกัน)</span>
              <div className="chips" role="group" aria-label="เหตุผล">
                {reasons.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="chip"
                    aria-pressed={picked.includes(r.code)}
                    onClick={() => setPicked((p) => (p.includes(r.code) ? p.filter((x) => x !== r.code) : [...p, r.code]))}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {needNote ? (
                <input className="input" placeholder="ระบุเหตุผลเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} aria-label="เหตุผลเพิ่มเติม" />
              ) : null}
            </div>
          ) : null}
          {action === 'invite_interview' ? (
            <div className="stack-sm">
              <span className="label">ช่วงเวลาที่เสนอ (ผู้สมัครเลือกเอง)</span>
              {slots.length === 0 ? (
                <span className="small">
                  ยังไม่มีเวลาว่าง <Link href={`/c/${companyId}/interviews`}>เพิ่มเวลาสัมภาษณ์</Link>
                </span>
              ) : (
                <div className="chips">
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="chip"
                      aria-pressed={slotIds.includes(s.id)}
                      onClick={() => setSlotIds((x) => (x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id]))}
                    >
                      {when(s.starts_at)} · {s.mode === 'online' ? 'ออนไลน์' : s.mode === 'onsite' ? 'ที่บริษัท' : 'โทร'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <div className="stack-sm">
            <span className="label">ข้อความสำเร็จรูป</span>
            <div className="chips">
              {kindTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  aria-pressed={tplId === t.id}
                  onClick={() => {
                    setTplId(t.id);
                    setMsg(t.body);
                    setSavedTpl('');
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="bulk-msg">ข้อความ (ส่งข้อความเดียวกันถึงทุกคน แก้ได้)</label>
            <textarea
              id="bulk-msg"
              className="textarea"
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value);
                setTplId(null);
                setSavedTpl('');
              }}
            />
            <span className="hint">พิมพ์ {'{ชื่อ}'} {'{ตำแหน่ง}'} {'{บริษัท}'} แล้วระบบแทนด้วยข้อมูลของแต่ละคนให้เอง</span>
          </div>
          {preview ? (
            <div className="card soft tight">
              <span className="tiny muted">ตัวอย่างที่ {preview.candidate_name} จะเห็น</span>
              <span className="prewrap">{fill(msg, preview)}</span>
              {action === 'reject' && picked.length ? (
                <span className="small">เหตุผลจากบริษัท: {reasons.filter((r) => picked.includes(r.code)).map((r) => r.label).join(' · ')}</span>
              ) : null}
            </div>
          ) : null}
          {error ? <div className="alert error">{error}</div> : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {savedTpl ? <span className="small" style={{ color: 'var(--brand-ink)' }}>{savedTpl}</span> : null}
            <button type="button" className="btn ghost" onClick={() => setAction(null)}>
              ยกเลิก
            </button>
            <button type="button" className="btn outline" onClick={saveTemplate} disabled={pending || msg.trim().length < 2}>
              บันทึกเป็นข้อความสำเร็จรูป
            </button>
            <button type="button" className={`btn ${action === 'reject' ? 'danger' : ''}`} onClick={send} disabled={!ready || pending}>
              {pending ? 'กำลังส่ง…' : `ส่งถึง ${eligible.targets.length} คน`}
            </button>
          </div>
        </section>
      ) : null}

      <div className="board">
        {columns.map((col) => {
          const cards = live.filter((i) => col.stages.includes(i.stage)).sort((a, b) => b.match_score - a.match_score);
          return (
            <section key={col.key} className="column" aria-label={col.label}>
              <h3>
                <span>{col.label}</span>
                <span className="muted small">{cards.length} คน</span>
              </h3>
              {selectMode && cards.length ? (
                <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start', background: '#fff' }} onClick={() => setSelected((s) => Array.from(new Set([...s, ...cards.map((c) => c.id)])))}>
                  เลือกทั้งคอลัมน์
                </button>
              ) : null}
              {cards.map((it) => {
                const st = status(it);
                const v = VERIFY[it.verify_level] || VERIFY.none;
                const d = daysLeft(it.sla_due_at);
                const isSel = selected.includes(it.id);
                const inner = (
                  <>
                    <span className="row-between">
                      <span className="card-head">
                        {it.photo_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(it.photo_path) || ''} alt="" className="avatar has-img" style={{ width: 32, height: 32 }} loading="lazy" />
                        ) : null}
                        <span className="name">{it.candidate_name}</span>
                      </span>
                      <span className="score">{it.match_score}%</span>
                    </span>
                    <span className="tiny muted">
                      {it.job_title}
                      {it.institution_name ? ` · ${it.institution_name}` : ''}
                    </span>
                    <span className="chips">
                      <span className={`badge ${v[1]}`}>{v[0]}</span>
                      <span className={`badge ${st.tone}`}>{st.text}</span>
                    </span>
                    {d !== null ? (
                      <span className="tiny strong" style={{ color: d <= 2 ? 'var(--danger)' : 'var(--muted)' }}>
                        ต้องตอบภายใน {Math.max(d, 0)} วัน
                      </span>
                    ) : null}
                  </>
                );
                return selectMode ? (
                  <button key={it.id} type="button" className={`app-card ${isSel ? 'selected' : ''}`} aria-pressed={isSel} onClick={() => toggle(it.id)}>
                    {inner}
                  </button>
                ) : (
                  <Link key={it.id} href={`/c/${companyId}/applications/${it.id}`} className="app-card">
                    {inner}
                    <span className="tiny strong" style={{ color: 'var(--brand-ink)' }}>
                      ดูใบสมัครเต็ม →
                    </span>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>

      {closed.length ? (
        <section className="card">
          <h2>ปิดใบสมัครแล้ว 14 วันล่าสุด ({closed.length})</h2>
          {closed.map((c) => (
            <div key={c.id} className="row-between small">
              <Link href={`/c/${companyId}/applications/${c.id}`}>{c.candidate_name}</Link>
              <span className="muted">
                {c.job_title} · {c.stage === 'hired' ? 'รับเข้าทำงาน' : c.stage === 'rejected' ? `ไม่ผ่าน: ${c.reject_labels || ''}${c.closed_by_system ? ' (ระบบปิดเพราะเลย 7 วัน)' : ''}` : c.stage === 'withdrawn' ? 'ผู้สมัครถอน' : c.stage === 'declined' ? 'ปฏิเสธข้อเสนอ' : 'หมดเวลา'}
              </span>
            </div>
          ))}
        </section>
      ) : null}
      {items.length === 0 ? <div className="empty">ยังไม่มีผู้สมัคร แชร์ลิงก์ประกาศลงเพจหรือกลุ่ม LINE เพื่อให้คนเห็นมากขึ้น</div> : null}
    </div>
  );
}
