'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// ข้อความยาวแบบ JobsDB: แสดงไม่กี่บรรทัดแล้วต่อด้วย ... และปุ่ม "แสดงเพิ่มเติม"
// ถ้าข้อความสั้นพอ จะไม่แสดงปุ่ม
export function ShowMore({
  children,
  lines = 3,
  className = ''
}: {
  children: React.ReactNode;
  lines?: 1 | 2 | 3 | 4 | 6;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 2);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className={`show-more ${className}`}>
      <div ref={ref} className={open ? '' : `clamp-${lines}`}>
        {children}
      </div>
      {overflow || open ? (
        <button type="button" className="more-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'แสดงน้อยลง' : 'แสดงเพิ่มเติม'}
        </button>
      ) : null}
    </div>
  );
}
