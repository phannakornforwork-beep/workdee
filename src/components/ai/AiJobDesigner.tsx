'use client';

import { useRef, useState, useTransition } from 'react';
import { designJobAction } from '@/lib/actions/ai';

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
  const sum = quals.reduce((a, q) => a + (Number(q.weight) || 0), 0);
  const touched = quals.length > 0 || initialQuals.length > 0;

  function setField(form: HTMLFormElement, name: string, value: string, onlyIfEmpty = false) {
    const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (!el) return;
    if (onlyIfEmpty && el.value.trim()) return;
    el.value = value;
  }

  function run() {
    const form = box.current?.closest('form');
    if (!form) return;
    const title = (form.elements.namedItem('title') as HTMLInputElement | null)?.value || '';
    const jobType = (form.elements.namedItem('job_type') as HTMLSelectElement | null)?.value || 'full_time';
    setMsg(null);
    start(async () => {
      const res = await designJobAction(companyId, title, jobType, objective);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      const d = res.data!;
      setQuals(d.qualifications);
      setField(form, 'requirements', d.requirements);
      setField(form, 'skills', d.skills.join(', '));
      if (!locked) {
        setField(form, 'ch_title', d.challenge.title);
        setField(form, 'ch_brief', d.challenge.brief);
        setField(form, 'ch_deliverable', d.challenge.deliverable);
        setField(form, 'ch_minutes', String(d.challenge.minutes));
        setField(form, 'ch_due_days', String(d.challenge.due_days));
        if (d.challenge.skill_key) setField(form, 'ch_skill_key', d.challenge.skill_key, true);
        const names = form.querySelectorAll<HTMLInputElement>('[name="crit_name"]');
        const weights = form.querySelectorAll<HTMLInputElement>('[name="crit_weight"]');
        const descs = form.querySelectorAll<HTMLInputElement>('[name="crit_desc"]');
        names.forEach((el, i) => {
          const c = d.criteria[i];
          el.value = c?.name || '';
          if (weights[i]) weights[i].value = c ? String(c.weight) : '';
          if (descs[i]) descs[i].value = c?.description || '';
        });
      }
      const demoNote = res.demo ? 'โหมดสาธิต (จับคำจากข้อความของคุณ ยังไม่ได้เชื่อม AI จริง) · ' : '';
      setMsg({
        ok: true,
        text: demoNote + (locked
          ? 'AI เสนอคุณสมบัติแล้ว (มีผู้สมัครส่งโจทย์แล้ว จึงไม่เปลี่ยนโจทย์และเกณฑ์) ตรวจแล้วกดบันทึก'
          : 'AI เติมคุณสมบัติ โจทย์ และเกณฑ์ให้คะแนนลงฟอร์มแล้ว ตรวจและแก้ได้ทุกช่องก่อนกดบันทึก')
      });
    });
  }

  function update(i: number, patch: Partial<Qual>) {
    setQuals((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  return (
    <section className="card ai-card" ref={box}>
      <div className="row-between">
        <h2>ให้ AI ช่วยออกแบบการคัดเลือก</h2>
        <span className="badge ai">AI</span>
      </div>
      <p className="muted small">
        เล่าเป็นภาษาธรรมดาว่าอยากได้คนแบบไหน ทำงานอะไร AI จะเสนอคุณสมบัติ &ldquo;ต้องมี / มีแล้วดี&rdquo; พร้อมน้ำหนัก ใช้คัดกรองผู้สมัครทุกคนอัตโนมัติ
        และร่างโจทย์กับเกณฑ์ให้คะแนนให้ คุณแก้ได้ทุกช่อง
      </p>
      <div className="field">
        <label htmlFor="ai_objective">อยากได้คนแบบไหน</label>
        <textarea
          id="ai_objective"
          name="ai_objective"
          className="textarea"
          maxLength={3000}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="เช่น อยากได้คนดูแลเพจร้านกาแฟ 3 สาขา ยิงแอดเป็น เขียนโพสต์ได้ ดูตัวเลขแล้วปรับงบได้ งบแอดเดือนละ 30,000 บาท ถ้าตัดคลิปสั้นได้ด้วยจะดีมาก"
        />
      </div>
      <div className="row">
        <button type="button" className="btn ai" onClick={run} disabled={pending || objective.trim().length < 20}>
          {pending ? 'AI กำลังออกแบบ…' : quals.length ? 'ให้ AI ออกแบบใหม่' : 'ให้ AI ออกแบบ'}
        </button>
        {msg ? <span className={`small ${msg.ok ? 'ok-text' : 'error-text'}`} role="status">{msg.text}</span> : null}
      </div>

      {quals.length ? (
        <div className="stack-sm">
          <div className="row-between">
            <span className="strong">คุณสมบัติที่ใช้คัดกรอง (คิดเป็น 30% ของคะแนนรวม)</span>
            <span className={`small ${sum === 100 ? 'muted' : 'error-text'}`}>น้ำหนักรวม {sum}/100</span>
          </div>
          {quals.map((q, i) => (
            <div key={i} className="ai-qual">
              <input className="input" aria-label={`คุณสมบัติข้อ ${i + 1}`} value={q.name} onChange={(e) => update(i, { name: e.target.value })} />
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
              {q.description ? <span className="tiny muted ai-qual-desc">{q.description}</span> : null}
            </div>
          ))}
          {quals.length < 8 ? (
            <button type="button" className="btn small ghost" onClick={() => setQuals((qs) => [...qs, { name: '', description: '', must_have: false, weight: 0 }])}>
              + เพิ่มคุณสมบัติ
            </button>
          ) : null}
          <span className="tiny muted">ข้อ &ldquo;ต้องมี&rdquo; ที่ผู้สมัครไม่มี จะขึ้นธงเตือนให้ HR ดู ระบบไม่ตัดผู้สมัครทิ้งเอง</span>
        </div>
      ) : null}
      <input type="hidden" name="ai_quals" value={touched ? JSON.stringify(quals.filter((q) => q.name.trim())) : ''} />
    </section>
  );
}
