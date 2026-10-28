'use client';

import { useState } from 'react';

export function DeleteAccount({ blockers }: { blockers: string[] }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onDelete() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/me/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: text }) });
    if (res.ok) {
      window.location.href = '/?deleted=1';
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error || 'ลบบัญชีไม่สำเร็จ');
    setBusy(false);
  }

  return (
    <section className="card">
      <h2>ลบบัญชี</h2>
      <p className="small muted">ลบโปรไฟล์ การศึกษา แผนอาชีพ ใบสมัคร และไฟล์ทั้งหมดอย่างถาวร บริษัทจะไม่เห็นข้อมูลของคุณอีก กู้คืนไม่ได้</p>
      {blockers.length ? (
        <div className="alert warn small">คุณเป็นเจ้าของคนเดียวของ {blockers.join(', ')} แต่งตั้งเจ้าของคนใหม่ในหน้าทีมและตำแหน่งก่อน</div>
      ) : (
        <>
          <label className="field">
            <span className="label">พิมพ์ &ldquo;ลบบัญชี&rdquo; เพื่อยืนยัน</span>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="button" className="btn danger small" disabled={text !== 'ลบบัญชี' || busy} onClick={onDelete}>
            {busy ? 'กำลังลบ…' : 'ลบบัญชีถาวร'}
          </button>
          {error ? <div className="alert error small">{error}</div> : null}
        </>
      )}
    </section>
  );
}
