import { PageMotion } from '@/components/PageMotion';

// สร้างใหม่ทุกครั้งที่เปลี่ยนหน้าในส่วนนี้ เพื่อเล่นแอนิเมชันเข้าหน้า
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageMotion>{children}</PageMotion>;
}
