import { aiDemo } from '@/lib/ai/client';

// ป้ายเตือนเมื่อยังไม่ได้เชื่อม AI จริง (ไม่มี ANTHROPIC_API_KEY)
// วางไว้เหนือทุกส่วนที่ใช้ AI เพื่อไม่ให้ใครเข้าใจผิดว่าผลตัวอย่างอ่านมาจากไฟล์ของตัวเอง
export function AiDemoNotice() {
  if (!aiDemo()) return null;
  return (
    <div className="alert warn" role="note">
      <strong>โหมดสาธิต</strong> ยังไม่ได้เชื่อม AI จริง ผลจาก AI ในหน้านี้เป็นตัวอย่าง
    </div>
  );
}
