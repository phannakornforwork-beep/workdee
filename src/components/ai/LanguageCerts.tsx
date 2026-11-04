'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { deleteLanguageCertAction, submitLanguageCertAction } from '@/lib/actions/ai';
import { CERT_CHECK as CHECK, LANG_TRUST as TRUST } from '@/lib/ai/labels';

export type LangCert = {
  id: string; exam: string; score_text: string; exam_date: string | null; expires_on: string | null; trust: string;
  checks: Record<string, boolean>; review_note: string | null; verify_url: string | null;
};

// F. ใบรับรองภาษา 3 ระดับ: ระบุเอง → AI อ่านไฟล์ + ทีมงานตรวจ → ยืนยันกับผู้จัดสอบ
export function LanguageCerts({ userId, certs }: { userId: string; certs: LangCert[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMsg(null);
    if (f.size > 8 * 1024 * 1024) return setMsg({ ok: false, text: 'ไฟล์ใหญ่เกิน 8 MB' });
    if (!/^(application\/pdf|image\/(jpeg|png))$/.test(f.type)) return setMsg({ ok: false, text: 'รองรับ PDF, JPG และ PNG' });
    setBusy(true);
    const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : 'jpg';
    const path = `${userId}/lang/${Date.now()}.${ext}`;
    const { error } = await createClient().storage.from('education-docs').upload(path, f, { contentType: f.type });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: 'อัปโหลดไม่สำเร็จ: ' + error.message });
    start(async () => {
      const res = await submitLanguageCertAction(path);
      setMsg(res.ok ? { ok: true, text: res.message || 'บันทึกแล้ว' } : { ok: false, text: res.error });
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteLanguageCertAction(id);
      setMsg(res.ok ? { ok: true, text: res.message || 'ลบแล้ว' } : { ok: false, text: res.error });
      router.refresh();
    });
  }

  return (
    <section className="card">
      <div className="row-between">
        <h2>ใบรับรองภาษาที่ตรวจสอบได้</h2>
        <span className="badge ai">AI</span>
      </div>
      <p className="muted small">
        คะแนนที่พิมพ์เองในช่อง &ldquo;ภาษา&rdquo; ไม่นับในคะแนนคัดกรอง แนบผลสอบ (IELTS, TOEIC, CU-TEP, JLPT ฯลฯ) ให้ AI อ่านและตรวจชื่อ วันหมดอายุ เลขที่ผลสอบ แล้วทีมงานยืนยัน
      </p>
      <div className="field">
        <label htmlFor="lang_file">แนบผลสอบ (PDF/รูป ไม่เกิน 8 MB)</label>
        <input id="lang_file" type="file" className="input" accept="application/pdf,image/jpeg,image/png" onChange={onFile} disabled={busy || pending} />
      </div>
      {busy || pending ? <p className="small" role="status">{busy ? 'กำลังอัปโหลด…' : 'AI กำลังอ่านผลสอบ…'}</p> : null}
      {msg ? <p className={`small ${msg.ok ? 'ok-text' : 'error-text'}`} role="status">{msg.text}</p> : null}
      {certs.map((c) => {
        const t = TRUST[c.trust] || TRUST.self;
        const failed = Object.entries(c.checks || {}).filter(([k, v]) => !v && CHECK[k]);
        return (
          <div key={c.id} className="card soft tight">
            <div className="row-between">
              <span className="strong">
                {c.exam} {c.score_text}
              </span>
              <span className={`badge ${t.tone}`}>{t.label}</span>
            </div>
            <span className="small muted">
              {c.exam_date ? `สอบ ${c.exam_date}` : 'ไม่พบวันสอบ'}
              {c.expires_on ? ` · ใช้ได้ถึง ${c.expires_on}` : ''} · {t.note}
            </span>
            {failed.length ? <span className="small error-text">ตรวจไม่ผ่าน: {failed.map(([k]) => CHECK[k]).join(', ')}</span> : null}
            {c.review_note ? <span className="small">หมายเหตุทีมงาน: {c.review_note}</span> : null}
            {c.verify_url ? (
              <a href={c.verify_url} target="_blank" rel="noreferrer noopener" className="small">
                ลิงก์ตรวจผลของผู้จัดสอบ
              </a>
            ) : null}
            <button type="button" className="btn small ghost" onClick={() => remove(c.id)} disabled={pending} style={{ alignSelf: 'flex-start' }}>
              ลบรายการนี้
            </button>
          </div>
        );
      })}
    </section>
  );
}
