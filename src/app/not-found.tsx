import Link from 'next/link';
import { Logo } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="container page" style={{ maxWidth: 560 }}>
      <Logo />
      <div className="card stack">
        <span className="eyebrow">404</span>
        <h1>ไม่พบหน้านี้</h1>
        <p className="muted">ลิงก์อาจหมดอายุ หรือประกาศนี้ปิดรับแล้ว ลองดูงานที่ยังเปิดรับอยู่</p>
        <div className="row">
          <Link href="/spaces" className="btn">
            ไปที่พื้นที่ของฉัน
          </Link>
          <Link href="/jobs" className="btn ghost">
            ดูประกาศงาน
          </Link>
        </div>
      </div>
    </main>
  );
}
