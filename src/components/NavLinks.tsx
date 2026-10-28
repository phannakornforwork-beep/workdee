'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ items, label }: { items: { href: string; label: string; exact?: boolean }[]; label: string }) {
  const path = usePathname();
  return (
    <div className="navbar">
      <nav aria-label={label}>
        {items.map((it) => {
          const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
