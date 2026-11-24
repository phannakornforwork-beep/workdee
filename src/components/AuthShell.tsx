import Link from 'next/link';
import { Logo } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SampleResult } from '@/components/Brand';

// หน้าเข้าสู่ระบบ สมัคร ลืมรหัส และรับคำเชิญ: ฟอร์มซ้าย แผงตัวตนของ WorkDee ขวา (ซ่อนบนมือถือ)
// ทุกคนที่เข้าระบบเห็นสัญญาเดียวกันก่อนเสมอ: ผลงานพูดแทนประสบการณ์ + ได้คำตอบใน 7 วัน
export function AuthShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo />
          <span className="right" />
          <ThemeToggle />
          <Link href="/jobs" className="tlink">
            ดูประกาศงาน
          </Link>
        </div>
      </header>
      <main className="container page auth-grid">
        <div className="stack auth-form">
          <div className="stack-sm">
            <span className="eyebrow">WorkDee</span>
            <h1>{title}</h1>
            {sub ? <p className="muted">{sub}</p> : null}
          </div>
          <div className="card">{children}</div>
        </div>
        <aside className="auth-brand" aria-hidden="true">
          <span className="eyebrow">ผลงานพูดแทนประสบการณ์</span>
          <h2>ทุกใบสมัครได้คำตอบใน 7 วัน และทุกโจทย์ได้ใบผลงาน</h2>
          <SampleResult />
        </aside>
      </main>
    </>
  );
}
