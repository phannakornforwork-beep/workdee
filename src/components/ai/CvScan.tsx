'use client';

import { useState } from 'react';
import { parseCv, type CvParsed } from '@/lib/cv-parse';

// A. สแกน CV โดยไม่ใช้ AI: อ่านไฟล์ในเบราว์เซอร์ทั้งหมด ไฟล์ไม่ถูกส่งออกจากเครื่อง
//    PDF → pdf.js ดึงข้อความ · Word (.docx) → mammoth · รูปถ่าย/PDF สแกน → Tesseract OCR (ไทย+อังกฤษ)
//    แล้วแยกลงช่องด้วยกฎ (lib/cv-parse.ts)

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    pdfjsLib?: any;
    mammoth?: any;
    Tesseract?: any;
  }
}

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      delete loaded[src];
      reject(new Error('โหลดตัวอ่านไฟล์ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'));
    };
    document.head.appendChild(s);
  });
  return loaded[src];
}

async function pdfDoc(file: File) {
  await loadScript(PDFJS);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

async function pdfText(doc: any): Promise<string> {
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = '';
    for (const it of content.items as { str: string; hasEOL?: boolean }[]) {
      line += it.str;
      if (it.hasEOL) {
        out.push(line);
        line = '';
      } else if (it.str && !it.str.endsWith(' ')) line += ' ';
    }
    if (line.trim()) out.push(line);
  }
  return out.join('\n');
}

async function ocr(images: (File | HTMLCanvasElement)[], onProgress: (p: number) => void): Promise<string> {
  await loadScript(TESSERACT);
  const worker = await window.Tesseract.createWorker('tha+eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    }
  });
  try {
    const parts: string[] = [];
    for (const img of images) parts.push((await worker.recognize(img)).data.text as string);
    return parts.join('\n');
  } finally {
    await worker.terminate();
  }
}

async function pdfPagesAsImages(doc: any): Promise<HTMLCanvasElement[]> {
  const out: HTMLCanvasElement[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    out.push(canvas);
  }
  return out;
}

const lines = (xs: { name?: string; title?: string; detail: string }[]) => xs.map((x) => [x.name || x.title || '', x.detail].filter(Boolean).join(' | ')).join('\n');

export function CvScan() {
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<CvParsed | null>(null);
  const [method, setMethod] = useState('');
  const [replace, setReplace] = useState(false);
  const [applied, setApplied] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    setData(null);
    setApplied(false);
    if (f.size > 10 * 1024 * 1024) return setError('ไฟล์ใหญ่เกิน 10 MB');
    try {
      let text = '';
      const name = f.name.toLowerCase();
      if (f.type === 'application/pdf' || name.endsWith('.pdf')) {
        setStage('กำลังอ่านข้อความจาก PDF…');
        const doc = await pdfDoc(f);
        text = await pdfText(doc);
        setMethod('อ่านข้อความจาก PDF');
        if (text.replace(/\s/g, '').length < 80) {
          setStage('PDF นี้เป็นภาพสแกน กำลังอ่านด้วย OCR (ครั้งแรกอาจใช้ 20–40 วินาที)…');
          text = await ocr(await pdfPagesAsImages(doc), (p) => setStage(`กำลังอ่านด้วย OCR ${Math.round(p * 100)}%`));
          setMethod('OCR จากภาพสแกน (ไทย+อังกฤษ)');
        }
      } else if (name.endsWith('.docx')) {
        setStage('กำลังอ่านไฟล์ Word…');
        await loadScript(MAMMOTH);
        text = (await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
        setMethod('อ่านข้อความจาก Word');
      } else if (f.type.startsWith('image/')) {
        setStage('กำลังอ่านรูปด้วย OCR (ครั้งแรกอาจใช้ 20–40 วินาที)…');
        text = await ocr([f], (p) => setStage(`กำลังอ่านด้วย OCR ${Math.round(p * 100)}%`));
        setMethod('OCR จากรูปถ่าย (ไทย+อังกฤษ)');
      } else if (f.type === 'text/plain' || name.endsWith('.txt')) {
        text = await f.text();
        setMethod('อ่านไฟล์ข้อความ');
      } else {
        throw new Error('รองรับ PDF, Word (.docx), JPG, PNG และ .txt');
      }
      setStage('กำลังแยกข้อมูลลงช่อง…');
      if (text.replace(/\s/g, '').length < 30) throw new Error('อ่านข้อความจากไฟล์ได้น้อยเกินไป ลองไฟล์ที่ชัดขึ้น หรือบันทึก CV เป็น PDF');
      setData(parseCv(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ');
    } finally {
      setStage('');
    }
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
    set('headline', data.headline);
    set('intro', data.intro);
    set('skills', data.skills.join(', '), 'list');
    set('tools', data.tools.join(', '), 'list');
    set('languages', lines(data.languages));
    set('certificates', lines(data.certificates));
    set('projects', lines(data.projects));
    set('experiences', lines(data.experiences));
    const edu = data.educations[0];
    const addForm = document.getElementById('add-education') as HTMLFormElement | null;
    if (edu && addForm) {
      const put = (n: string, v: string) => {
        const el = addForm.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`);
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

  return (
    <section className="card ai-card">
      <div className="row-between">
        <h2>สแกน CV กรอกโปรไฟล์อัตโนมัติ</h2>
        <span className="badge ai">สแกน</span>
      </div>
      <p className="muted small">
        แนบ CV (PDF, Word, หรือรูปถ่าย) ระบบอ่านไฟล์ในเครื่องของคุณ แยกการศึกษา ทักษะ ประสบการณ์ และผลงานลงช่องให้ตรวจก่อนบันทึก ไฟล์ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์
      </p>
      <div className="field">
        <label htmlFor="cv_file">ไฟล์ CV</label>
        <input id="cv_file" type="file" className="input" accept="application/pdf,.docx,image/jpeg,image/png,.txt" onChange={onFile} disabled={Boolean(stage)} />
      </div>
      {stage ? <p className="small" role="status">{stage}</p> : null}
      {error ? <p className="small error-text" role="alert">{error}</p> : null}
      {data ? (
        <div className="stack-sm">
          <div className="row-between">
            <span className="strong">อ่านได้ {data.found.length} จาก 6 ส่วน · {method}</span>
            {data.missing.length ? <span className="badge orange">ไม่พบ: {data.missing.join(', ')}</span> : null}
          </div>
          <dl className="kv small">
            {data.headline ? (<><dt>พาดหัว</dt><dd>{data.headline}</dd></>) : null}
            <dt>ทักษะ</dt>
            <dd>{data.skills.join(', ') || '-'}</dd>
            <dt>เครื่องมือ</dt>
            <dd>{data.tools.join(', ') || '-'}</dd>
            <dt>ประสบการณ์</dt>
            <dd className="stack-sm">{data.experiences.length ? data.experiences.map((x, i) => <span key={i}>{x.title}{x.detail ? ` · ${x.detail}` : ''}</span>) : '-'}</dd>
            <dt>ผลงาน</dt>
            <dd className="stack-sm">{data.projects.length ? data.projects.map((x, i) => <span key={i}>{x.title}{x.detail ? ` · ${x.detail}` : ''}</span>) : '-'}</dd>
            <dt>การศึกษา</dt>
            <dd className="stack-sm">
              {data.educations.length ? data.educations.map((x, i) => <span key={i}>{[x.institution_name, x.major, x.year_label, x.gpa ? `GPA ${x.gpa}` : ''].filter(Boolean).join(' · ')}</span>) : '-'}
            </dd>
            {data.languages.length ? (<><dt>ภาษา</dt><dd>{lines(data.languages).replace(/\n/g, ' · ')}</dd></>) : null}
          </dl>
          {data.normalized.length ? (
            <p className="tiny muted">แปลงคำใน CV เป็นทักษะมาตรฐาน: {data.normalized.slice(0, 6).map((n) => `"${n.as_written}" → ${n.skill}`).join(' · ')}</p>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>แทนที่ข้อมูลเดิมในฟอร์ม (ไม่เลือก = เติมเฉพาะช่องว่างและเพิ่มทักษะใหม่ต่อท้าย)</span>
          </label>
          <div className="row">
            <button type="button" className="btn ai" onClick={fill}>
              เติมลงฟอร์มโปรไฟล์
            </button>
            {applied ? <span className="small ok-text" role="status">เติมแล้ว ตรวจแล้วกด &ldquo;บันทึกโปรไฟล์&rdquo; (การศึกษา กด &ldquo;เพิ่ม&rdquo; ทางขวา)</span> : null}
          </div>
          <span className="tiny muted">ข้อมูลจาก CV แสดงเป็น &ldquo;ระบุเอง&rdquo; ส่วนที่ยืนยันได้ (วุฒิ ใบรับรองภาษา ผลโจทย์) มีป้ายของตัวเอง</span>
        </div>
      ) : null}
    </section>
  );
}
