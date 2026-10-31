'use client';

import { useEffect, useState } from 'react';

type Mode = 'auto' | 'light' | 'dark';
const KEY = 'workdee-theme';

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

// ปุ่มสลับธีม: อัตโนมัติ (ตามเครื่อง) → สว่าง → มืด  จำค่าไว้ในเครื่องนี้
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('auto');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Mode | null;
      if (saved === 'light' || saved === 'dark') setMode(saved);
    } catch {
      /* โหมดส่วนตัวบางเบราว์เซอร์อ่าน localStorage ไม่ได้ ใช้ค่าอัตโนมัติ */
    }
  }, []);

  function next() {
    const order: Mode[] = ['auto', 'light', 'dark'];
    const m = order[(order.indexOf(mode) + 1) % order.length];
    setMode(m);
    apply(m);
    try {
      if (m === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      /* ไม่เป็นไร ใช้ได้เฉพาะหน้านี้ */
    }
  }

  const label = mode === 'auto' ? 'ธีม: อัตโนมัติตามเครื่อง' : mode === 'light' ? 'ธีม: สว่าง' : 'ธีม: มืด';
  return (
    <button type="button" className="icon-btn theme-btn" onClick={next} aria-label={`${label} (แตะเพื่อเปลี่ยน)`} title={label}>
      {mode === 'light' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : mode === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
