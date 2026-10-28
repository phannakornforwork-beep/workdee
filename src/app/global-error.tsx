'use client';

// ใช้เมื่อ layout หลักพัง (ต้องมี html/body เอง)
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1>เกิดข้อผิดพลาด</h1>
        <p>ระบบขัดข้องชั่วคราว ลองโหลดหน้าใหม่อีกครั้ง</p>
        <button type="button" onClick={() => reset()}>
          ลองอีกครั้ง
        </button>
      </body>
    </html>
  );
}
