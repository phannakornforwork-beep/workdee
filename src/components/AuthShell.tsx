import Link from 'next/link';
import { Logo } from '@/components/ui';

export function AuthShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo />
          <span className="right" />
          <Link href="/jobs" className="tlink">
            ดูประกาศงาน
          </Link>
        </div>
      </header>
      <main className="container page" style={{ maxWidth: 520 }}>
        <div className="stack-sm">
          <h1>{title}</h1>
          {sub ? <p className="muted">{sub}</p> : null}
        </div>
        <div className="card">{children}</div>
      </main>
    </>
  );
}
