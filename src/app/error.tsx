'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="container page" style={{ maxWidth: 560 }}>
      <div className="card stack">
        <h1>เกิดข้อผิดพลาด</h1>
        <p className="muted">ระบบทำรายการนี้ไม่สำเร็จ ลองอีกครั้ง ถ้ายังไม่ได้ แจ้งทีมงานพร้อมรหัสนี้</p>
        {error.digest ? <code className="small">{error.digest}</code> : null}
        <div className="row">
          <button type="button" className="btn" onClick={() => reset()}>
            ลองอีกครั้ง
          </button>
          <Link href="/spaces" className="btn ghost">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </main>
  );
}
