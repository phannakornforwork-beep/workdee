'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { takeNavDirection } from '@/lib/motion';

// ห่อเนื้อหาแต่ละหน้า: เข้าหน้าใหม่ด้วยการเลื่อนตามทิศ (ปัด/กดเมนู) หรือค่อยๆ ลอยขึ้น
export function PageMotion({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cls, setCls] = useState('page-anim');
  useLayoutEffect(() => {
    const d = takeNavDirection();
    setCls(`page-anim ${d === 'forward' ? 'enter-forward' : d === 'back' ? 'enter-back' : 'enter-fade'}`);
  }, []);
  return (
    <div ref={ref} className={cls} id="page-motion">
      {children}
    </div>
  );
}
