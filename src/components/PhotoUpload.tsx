'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui';

// อัปโหลดรูปโปรไฟล์หรือโลโก้ไปยัง bucket สาธารณะ "media" แล้วเก็บ path ใน hidden input ชื่อ `name`
// ส่ง `clearName` มาเพื่อให้มีปุ่ม "ลบรูป" (ส่งค่า 1 ไปกับฟอร์ม)
export function PhotoUpload({
  prefix,
  name,
  current,
  label,
  displayName,
  square = false,
  clearName
}: {
  prefix: string;
  name: string;
  current?: string | null;
  label: string;
  displayName?: string;
  square?: boolean;
  clearName?: string;
}) {
  const [preview, setPreview] = useState<string | null>(current || null);
  const [path, setPath] = useState('');
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) {
      setError('ใช้ไฟล์รูป PNG, JPG, WEBP หรือ SVG');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError('รูปใหญ่เกิน 2 MB ลองย่อรูปก่อน');
      return;
    }
    setBusy(true);
    setError('');
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[f.type] || '';
    const p = `${prefix}/${Date.now()}${ext}`;
    const supabase = createClient();
    const { error: err } = await supabase.storage.from('media').upload(p, f, { upsert: false, contentType: f.type });
    setBusy(false);
    if (err) {
      setError('อัปโหลดไม่สำเร็จ: ' + (err.message || 'ไม่มีสิทธิ์อัปโหลด'));
      return;
    }
    setPath(p);
    setCleared(false);
    setPreview(URL.createObjectURL(f));
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="photo-field">
        <Avatar src={preview} name={displayName} size={72} square={square} />
        <div className="actions">
          <label className="btn ghost small" style={{ alignSelf: 'flex-start' }}>
            {busy ? 'กำลังอัปโหลด…' : preview ? 'เปลี่ยนรูป' : 'เลือกรูป'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange} disabled={busy} hidden />
          </label>
          {clearName && preview ? (
            <button
              type="button"
              className="btn link small"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setPreview(null);
                setPath('');
                setCleared(true);
              }}
            >
              ลบรูป
            </button>
          ) : null}
          <span className="hint">PNG, JPG, WEBP หรือ SVG ไม่เกิน 2 MB · กดบันทึกด้านล่างเพื่อใช้รูปนี้</span>
          {error ? (
            <span className="hint" style={{ color: 'var(--danger)' }}>
              {error}
            </span>
          ) : null}
        </div>
      </div>
      {path ? <input type="hidden" name={name} value={path} /> : null}
      {clearName && cleared ? <input type="hidden" name={clearName} value="1" /> : null}
    </div>
  );
}
