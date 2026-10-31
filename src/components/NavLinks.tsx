'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setNavDirection } from '@/lib/motion';

type Item = { href: string; label: string; exact?: boolean };

// เมนูหลักแบบ segmented control:
// - เม็ดไฮไลต์เลื่อนตามเมนูที่เลือกแบบมีสปริง
// - ปัดซ้าย/ขวาที่ไหนก็ได้บนหน้าเพื่อไปเมนูถัดไป/ก่อนหน้า (เนื้อหาขยับตามนิ้วระหว่างปัด)
export function NavLinks({ items, label }: { items: Item[]; label: string }) {
  const path = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  const isActive = useCallback((it: Item) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + '/')), [path]);
  // เลือกเมนูที่ตรงที่สุด (path ยาวที่สุด) เผื่อเมนูหนึ่งเป็น prefix ของอีกเมนู
  const activeIndex = items.reduce((best, it, i) => (isActive(it) && (best < 0 || it.href.length > items[best].href.length) ? i : best), -1);

  // วางเม็ดไฮไลต์ใต้เมนูที่เลือก และเลื่อนแถบเมนูให้เห็นเมนูนั้น
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const place = () => {
      const el = nav.querySelectorAll('a')[activeIndex] as HTMLElement | undefined;
      if (!el) return setPill(null);
      setPill({ x: el.offsetLeft, w: el.offsetWidth });
      const left = el.offsetLeft - nav.clientWidth / 2 + el.offsetWidth / 2;
      nav.scrollTo({ left, behavior: 'smooth' });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [activeIndex, path]);

  // ปัดเปลี่ยนเมนู
  useEffect(() => {
    if (activeIndex < 0) return;
    let sx = 0;
    let sy = 0;
    let st = 0;
    let tracking = false;
    let decided: 'h' | 'v' | null = null;
    const page = () => document.getElementById('page-motion');

    const blocked = (target: EventTarget | null) => {
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el.matches?.('input, textarea, select, [contenteditable="true"], [data-no-swipe], .chat, dialog')) return true;
        const cs = getComputedStyle(el);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) return true;
        el = el.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // ขอบจอ 24px เป็นท่าย้อนกลับของ Safari อย่าแย่ง
      if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
      if (blocked(e.target)) return;
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
      tracking = true;
      decided = null;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (!decided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) decided = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
      if (decided !== 'h') return;
      const atEdge = (dx > 0 && activeIndex === 0) || (dx < 0 && activeIndex === items.length - 1);
      const p = page();
      if (p) {
        p.style.transition = 'none';
        p.style.transform = `translateX(${dx * (atEdge ? 0.12 : 0.35)}px)`;
        p.style.opacity = String(1 - Math.min(Math.abs(dx) / 900, 0.25));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const fast = Date.now() - st < 350 && Math.abs(dx) > 40;
      const far = Math.abs(dx) > Math.min(110, window.innerWidth * 0.18);
      const p = page();
      const reset = () => {
        if (!p) return;
        p.style.transition = 'transform 0.35s cubic-bezier(.2,.9,.3,1.2), opacity 0.25s ease';
        p.style.transform = '';
        p.style.opacity = '';
      };
      if (decided === 'h' && Math.abs(dx) > Math.abs(dy) * 1.3 && (fast || far)) {
        const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1;
        const target = items[nextIndex];
        if (target) {
          setNavDirection(dx < 0 ? 'forward' : 'back');
          if (p) {
            p.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
            p.style.transform = `translateX(${dx < 0 ? -60 : 60}px)`;
            p.style.opacity = '0';
          }
          router.push(target.href);
          return;
        }
      }
      reset();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [activeIndex, items, router]);

  // โหลดหน้าข้างเคียงล่วงหน้า ให้ปัดแล้วเปลี่ยนทันที
  useEffect(() => {
    for (const i of [activeIndex - 1, activeIndex + 1]) if (items[i]) router.prefetch(items[i].href);
  }, [activeIndex, items, router]);

  return (
    <div className={`navbar${pill ? ' has-pill' : ''}`}>
      <nav aria-label={label} ref={navRef}>
        {pill ? <span className="nav-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} /> : null}
        {items.map((it, i) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={i === activeIndex ? 'page' : undefined}
            onClick={() => setNavDirection(i > activeIndex ? 'forward' : i < activeIndex ? 'back' : 'none')}
          >
            {it.label}
          </Link>
        ))}
      </nav>
      {activeIndex >= 0 ? (
        <div className="swipe-dots" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.href} className={i === activeIndex ? 'on' : ''} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
