'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { scanCvAction } from '@/lib/actions/ai';

type Pair = { name?: string; title?: string; detail: string };
type Extract = {
  headline: string; intro: string; skills: string[]; tools: string[];
  languages: Pair[]; certificates: Pair[]; projects: Pair[]; experiences: Pair[];
  educations: { institution_name: string; level: string; major: string; year_label: string; gpa: number | null }[];
  normalized: { as_written: string; skill: string }[]; low_confidence: string[]; confidence: number;
};

const LABEL: Record<string, string> = {
  headline: 'พาดหัว', intro: 'แนะนำตัว', skills: 'สกิล', tools: 'เครื่องมือ', languages: 'ภาษา', certificates: 'ใบรับรอง',
  projects: 'ผลงาน', experiences: 'ประสบการณ์', educations: 'การศึกษา'
};

const lines = (xs: Pair[]) => xs.map((x) => [x.name || x.title || '', x.detail].filter(Boolean).join(' | ')).join('\n');

// A. อัปโหลด CV → AI อ่าน (รวม OCR ถ้าเป็นรูปถ่ายหรือ PDF สแกน) → เติมฟอร์มโปรไฟล์ให้ตรวจก่อนกดบันทึก
// ไฟล์ CV ถูกลบทันทีหลังอ่านเสร็จ
export function CvScan({ userId }: { userId: string }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [data, setData] = useState<Extract | null>(null);
  const [replace, setReplace] = useState(false);
  const [applied, setApplied] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    setData(null);
    setApplied(false);
    if (f.size > 8 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกิน 8 MB');
      return;
    }
    if (!/^(application\/pdf|image\/(jpeg|png))$/.test(f.type)) {
      setError('รองรับ PDF, JPG และ PNG (ไฟล์ Word ให้บันทึกเป็น PDF ก่อน)');
      return;
    }
    setBusy(true);
    const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : 'jpg';
    const path = `${userId}/cv/${Date.now()}.${ext}`;
    const { error: upErr } = await createClient().storage.from('education-docs').upload(path, f, { contentType: f.type });
    setBusy(false);
    if (upErr) {
      setError('อัปโหลดไม่สำเร็จ: ' + upErr.message);
      return;
    }
    start(async () => {
      const res = await scanCvAction(path);
      if (!res.ok) setError(res.error);
      else setData(res.data as Extract);
    });
  }

  function fill() {
    if (!data) return;
    const set = (id: string, value: string, merge?: 'list') => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || !value) return;
      if (merge === 'list' && !replace) {
        const have = el.value.split(',').map((s) => s.trim()).filter(Boolean);
        const add = value.split(',').map((s) => s.trim()).filter((s) => s && !have.some((h) => h.toLowerCase() === s.toLowerCase()));
        el.value = [...have, ...add].join(', ');
        return;
      }
      if (!replace && el.value.trim()) {
        if (el.tagName === 'TEXTAREA' && id !== 'intro') el.value = `${el.value.trim()}\n${value}`;
        return;
      }
      el.value = value;
    };
    set('headline', data.headline.slice(0, 160));
    set('intro', data.intro.slice(0, 2000));
    set('skills', data.skills.join(', '), 'list');
    set('tools', data.tools.join(', '), 'list');
    set('languages', lines(data.languages));
    set('certificates', lines(data.certificates));
    set('projects', lines(data.projects));
    set('experiences', lines(data.experiences));
    const edu = data.educations[0];
    const addForm = document.getElementById('add-education') as HTMLFormElement | null;
    if (edu && addForm) {
      const put = (name: string, v: string) => {
        const el = addForm.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
        if (el && v) el.value = v;
      };
      put('institution_name', edu.institution_name);
      put('level', edu.level);
      put('major', edu.major);
      put('year_label', edu.year_label);
      put('gpa', edu.gpa ? String(edu.gpa) : '');
      const details = addForm.closest('details');
      if (details) details.open = true;
    }
    setApplied(true);
    document.getElementById('headline')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const working = busy || pending;
  return (
    <section className="card ai-card">
      <div className="row-between">
        <h2>สแกน CV ให้ AI กรอกโปรไฟล์</h2>
        <span className="badge ai">AI</span>
      </div>
      <p className="muted small">อัปโหลด CV (PDF หรือรูปถ่าย) AI จะอ่านแล้วแยกลงช่องโปรไฟล์ คุณตรวจและแก้ได้ก่อนกดบันทึก ระบบลบไฟล์ CV ทันทีหลังอ่านเสร็จ</p>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>ยินยอมให้ AI (Claude โดย Anthropic) อ่าน CV นี้เพื่อกรอกโปรไฟล์ ข้อมูลไม่ถูกนำไปฝึกโมเดล</span>
      </label>
      <div className="field">
        <label htmlFor="cv_file">ไฟล์ CV</label>
        <input id="cv_file" type="file" className="input" accept="application/pdf,image/jpeg,image/png" onChange={onFile} disabled={!consent || working} />
      </div>
      {working ? <p className="small" role="status">{busy ? 'กำลังอัปโหลด…' : 'AI กำลังอ่าน CV (ประมาณ 10–30 วินาที)…'}</p> : null}
      {error ? <p className="small error-text" role="alert">{error}</p> : null}
      {data ? (
        <div className="stack-sm">
          <div className="row-between">
            <span className="strong">AI อ่านได้ ความมั่นใจ {Math.round((data.confidence || 0) * 100)}%</span>
            {data.low_confidence.length ? <span className="badge orange">ตรวจเป็นพิเศษ: {data.low_confidence.map((k) => LABEL[k] || k).join(', ')}</span> : null}
          </div>
          <dl className="kv small">
            {data.headline ? (<><dt>พาดหัว</dt><dd>{data.headline}</dd></>) : null}
            <dt>สกิล</dt>
            <dd>{data.skills.join(', ') || '-'}</dd>
            <dt>เครื่องมือ</dt>
            <dd>{data.tools.join(', ') || '-'}</dd>
            <dt>ประสบการณ์</dt>
            <dd className="stack-sm">{data.experiences.length ? data.experiences.map((x, i) => <span key={i}>{x.title} · {x.detail}</span>) : '-'}</dd>
            <dt>ผลงาน</dt>
            <dd className="stack-sm">{data.projects.length ? data.projects.map((x, i) => <span key={i}>{x.title} · {x.detail}</span>) : '-'}</dd>
            <dt>การศึกษา</dt>
            <dd className="stack-sm">{data.educations.length ? data.educations.map((x, i) => <span key={i}>{x.institution_name} {x.major} {x.year_label}</span>) : '-'}</dd>
            {data.languages.length ? (<><dt>ภาษา</dt><dd>{lines(data.languages).replace(/\n/g, ' · ')}</dd></>) : null}
          </dl>
          {data.normalized.length ? (
            <p className="tiny muted">
              AI แปลงคำใน CV เป็นทักษะมาตรฐาน: {data.normalized.slice(0, 6).map((n) => `"${n.as_written}" → ${n.skill}`).join(' · ')}
            </p>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>แทนที่ข้อมูลเดิมในฟอร์ม (ไม่เลือก = เติมเฉพาะช่องว่างและเพิ่มสกิลใหม่ต่อท้าย)</span>
          </label>
          <div className="row">
            <button type="button" className="btn ai" onClick={fill}>
              เติมลงฟอร์มโปรไฟล์
            </button>
            {applied ? <span className="small ok-text" role="status">เติมแล้ว ตรวจแล้วกด &ldquo;บันทึกโปรไฟล์&rdquo; (การศึกษา กด &ldquo;เพิ่ม&rdquo; ทางขวา)</span> : null}
          </div>
          <span className="tiny muted">ข้อมูลที่พิมพ์หรือสแกนจาก CV แสดงเป็น &ldquo;ระบุเอง&rdquo; ส่วนที่ยืนยันได้ (วุฒิ ใบรับรองภาษา ผลโจทย์) มีป้ายของตัวเอง</span>
        </div>
      ) : null}
    </section>
  );
}
