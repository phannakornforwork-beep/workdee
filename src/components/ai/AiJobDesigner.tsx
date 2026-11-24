'use client';

import { useRef, useState, useTransition } from 'react';
import { designJobAction } from '@/lib/actions/ai';
import { pickChallenges, type BankChallenge } from '@/lib/challenge-bank';

type Qual = { name: string; description: string; must_have: boolean; weight: number };

// B. HR พิมพ์ว่าอยากได้คนแบบไหน → AI เสนอคุณสมบัติ (ต้องมี/มีแล้วดี + น้ำหนัก) โจทย์ และ rubric
// แล้วเติมลงฟอร์มประกาศด้านล่าง HR แก้ได้ทุกช่องก่อนกดบันทึก
export function AiJobDesigner({
  companyId,
  initialObjective = '',
  initialQuals = [],
  locked = false
}: {
  companyId: string;
  initialObjective?: string;
  initialQuals?: Qual[];
  locked?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [objective, setObjective] = useState(initialObjective);
  const [quals, setQuals] = useState<Qual[]>(initialQuals);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [picks, setPicks] = useState<BankChallenge[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const sum = quals.reduce((a, q) => a + (Number(q.weight) || 0), 0);
  const touched = quals.length > 0 || initialQuals.length > 0;

  function setField(form: HTMLFormElement, name: string, value: string, onlyIfEmpty = false) {
    const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (!el) return;
    if (onlyIfEmpty && el.value.trim()) return;
    el.value = value;
  }

  function applyChallenge(c: BankChallenge, i: number) {
    const form = box.current?.closest('form');
    if (!form || locked) return;
    setField(form, 'ch_title', c.title);
    setField(form, 'ch_brief', c.brief);
    setField(form, 'ch_deliverable', c.deliverable);
    setField(form, 'ch_minutes', String(c.minutes));
    setField(form, 'ch_due_days', String(c.due_days));
    if (c.skill_key) setField(form, 'ch_skill_key', c.skill_key, true);
    const names = form.querySelectorAll<HTMLInputElement>('[name="crit_name"]');
    const weights = form.querySelectorAll<HTMLInputElement>('[name="crit_weight"]');
    const descs = form.querySelectorAll<HTMLInputElement>('[name="crit_desc"]');
    names.forEach((el, j) => {
      const cr = c.criteria[j];
      el.value = cr?.name || '';
      if (weights[j]) weights[j].value = cr ? String(cr.weight) : '';
      if (descs[j]) descs[j].value = cr?.description || '';
    });
    setChosen(i);
    setMsg({ ok: true, text: `ใส่โจทย์ "${c.title}" ลงฟอร์มแล้ว` });
    form.querySelector('[name="ch_title"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function run() {
    const form = box.current?.closest('form');
    if (!form) return;
    const title = (form.elements.namedItem('title') as HTMLInputElement | null)?.value || '';
    const jobType = (form.elements.namedItem('job_type') as HTMLSelectElement | null)?.value || 'full_time';
    setMsg(null);
    setPicks([]);
    setChosen(null);
    start(async () => {
      const [res] = await Promise.all([designJobAction(companyId, title, jobType, objective), new Promise((r) => setTimeout(r, 1400))]);
      if (res.ok && res.data) {
        setQuals(res.data.qualifications);
        setField(form, 'requirements', res.data.requirements, true);
        setField(form, 'skills', res.data.skills.join(', '), true);
      }
      setPicks(pickChallenges(`${title} ${objective}`));
      setMsg({ ok: true, text: locked ? 'AI เสนอคุณสมบัติแล้ว (เปลี่ยนโจทย์ไม่ได้)' : 'เลือกโจทย์ที่ชอบด้านล่าง' });
    });
  }

  function update(i: number, patch: Partial<Qual>) {
    setQuals((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  return (
    <section className="card ai-card" ref={box}>
      <div className="row-between">
        <h2>ให้ AI คิดโจทย์และคุณสมบัติ</h2>
        <span className="badge ai">AI</span>
      </div>
      <p className="muted">เล่างานแบบพูดปกติ AI ร่างให้</p>
      <div className="field">
        <label htmlFor="ai_objective">อยากได้คนแบบไหน</label>
        <textarea
          id="ai_objective"
          name="ai_objective"
          className="textarea"
          maxLength={3000}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="เช่น ดูแลเพจร้านกาแฟ ยิงแอดเป็น"
        />
      </div>
      <div className="row">
        <button type="button" className="btn ai" onClick={run} disabled={pending || !objective.trim()}>
          {pending ? 'AI กำลังคิดโจทย์…' : picks.length ? 'ให้ AI คิดใหม่' : 'ให้ AI คิดโจทย์'}
        </button>
        {msg ? <span className={msg.ok ? 'ok-text' : 'error-text'} role="status">{msg.text}</span> : null}
      </div>

      {quals.length ? (
        <div className="stack">
          <div className="row-between">
            <span className="strong">คุณสมบัติ (30% ของคะแนน)</span>
            <span className={`strong ${sum === 100 ? 'ok-text' : 'error-text'}`}>รวม {sum}/100</span>
          </div>
          {quals.map((q, i) => (
            <div key={i} className="ai-qual">
              <input className="input" aria-label={`คุณสมบัติข้อ ${i + 1}`} title={q.description || undefined} value={q.name} onChange={(e) => update(i, { name: e.target.value })} />
              <select className="select" aria-label={`ประเภทคุณสมบัติข้อ ${i + 1}`} value={q.must_have ? '1' : '0'} onChange={(e) => update(i, { must_have: e.target.value === '1' })}>
                <option value="1">ต้องมี</option>
                <option value="0">มีแล้วดี</option>
              </select>
              <input
                className="input"
                aria-label={`น้ำหนักคุณสมบัติข้อ ${i + 1}`}
                inputMode="numeric"
                value={q.weight}
                onChange={(e) => update(i, { weight: Math.max(0, Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0)) })}
              />
              <button type="button" className="btn small ghost" onClick={() => setQuals((qs) => qs.filter((_, j) => j !== i))} aria-label={`ลบคุณสมบัติข้อ ${i + 1}`}>
                ลบ
              </button>
            </div>
          ))}
          {quals.length < 8 ? (
            <button type="button" className="btn small ghost" onClick={() => setQuals((qs) => [...qs, { name: '', description: '', must_have: false, weight: 0 }])}>
              + เพิ่มคุณสมบัติ
            </button>
          ) : null}
          <details className="disclosure">
            <summary>ระบบใช้คุณสมบัติอย่างไร</summary>
            <div className="stack-sm">
              {quals.filter((q) => q.description).map((q, i) => (
                <p key={i} className="small"><span className="strong">{q.name}:</span> {q.description}</p>
              ))}
              <p className="small muted">ระบบเตือน แต่ไม่ตัดผู้สมัครทิ้ง</p>
            </div>
          </details>
        </div>
      ) : null}
      {picks.length && !locked ? (
        <div className="stack">
          <span className="strong">เลือกโจทย์ ({picks.length} แบบ)</span>
          <div className="challenge-picks">
            {picks.map((c, i) => (
              <div key={c.title} className={`card soft tight challenge-pick ${chosen === i ? 'on' : ''}`}>
                <span className="strong">{c.title}</span>
                <span className="prewrap">{c.brief.length > 120 ? `${c.brief.slice(0, 120)}…` : c.brief}</span>
                <span className="small muted">
                  {c.minutes} นาที · ส่งภายใน {c.due_days} วัน
                </span>
                <span className="chips">
                  {c.criteria.map((cr) => (
                    <span key={cr.name} className="badge gray">
                      {cr.name} {cr.weight}%
                    </span>
                  ))}
                </span>
                <button type="button" className={`btn small ${chosen === i ? '' : 'outline'}`} onClick={() => applyChallenge(c, i)} style={{ alignSelf: 'flex-start' }}>
                  {chosen === i ? 'ใช้โจทย์นี้แล้ว' : 'ใช้โจทย์นี้'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <input type="hidden" name="ai_quals" value={touched ? JSON.stringify(quals.filter((q) => q.name.trim())) : ''} />
    </section>
  );
}
