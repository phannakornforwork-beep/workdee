'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// อัปโหลดไฟล์ตรงจากเบราว์เซอร์ไปยัง Supabase Storage (สิทธิ์ตาม policy ของ bucket)
// แล้วใส่ path ลงใน hidden input ชื่อ `name` ให้ฟอร์มส่งต่อ
export function FileUpload({
  bucket,
  prefix,
  name,
  label,
  accept = 'application/pdf,image/png,image/jpeg',
  multiple = false,
  maxMb = 10
}: {
  bucket: string;
  prefix: string;
  name: string;
  label: string;
  accept?: string;
  multiple?: boolean;
  maxMb?: number;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setError('');
    const supabase = createClient();
    const uploaded: string[] = [];
    for (const f of files) {
      if (f.size > maxMb * 1024 * 1024) {
        setError(`ไฟล์ ${f.name} ใหญ่เกิน ${maxMb} MB`);
        continue;
      }
      const ext = (f.name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
      const base = f.name.slice(0, f.name.length - ext.length).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
      const safe = `${base || 'file'}${ext}`;
      const path = `${prefix}/${Date.now()}-${safe}`;
      const { error: err } = await supabase.storage.from(bucket).upload(path, f, { upsert: false, contentType: f.type || undefined });
      if (err) {
        setError('อัปโหลดไม่สำเร็จ: ' + (err.message || 'ไม่มีสิทธิ์อัปโหลด'));
      } else {
        uploaded.push(path);
      }
    }
    setPaths((prev) => (multiple ? [...prev, ...uploaded] : uploaded.slice(-1)));
    setBusy(false);
    e.target.value = '';
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input type="file" accept={accept} multiple={multiple} onChange={onChange} disabled={busy} className="input" />
      {busy ? <span className="hint">กำลังอัปโหลด…</span> : null}
      {error ? <span className="hint" style={{ color: 'var(--danger)' }}>{error}</span> : null}
      {paths.map((p) => (
        <span key={p} className="hint">
          แนบแล้ว: {p.split('/').pop()}
          <input type="hidden" name={name} value={p} />
        </span>
      ))}
    </div>
  );
}
