import Link from 'next/link';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { SectionHead } from '@/components/ui';

// หน้าแรกแบบ JobsDB: แถบกรมท่าที่มีช่องค้นหาเป็นจุดเด่นเดียว
// ด้านล่างเป็นการ์ดสั้นๆ หัวข้อ + ประโยคเดียว
export default function Home() {
  return (
    <>
      <PublicHeader />
      <section className="hero">
        <div className="container">
          <h1>ไม่มีประสบการณ์ ก็พิสูจน์ได้ว่าทำงานเป็น</h1>
          <p>ทำโจทย์สั้นๆ จากงานจริง ได้คำตอบทุกใบสมัครใน 7 วัน</p>
          <form action="/jobs" method="get" className="search-bar" role="search">
            <input name="q" className="input" placeholder="ตำแหน่ง บริษัท หรือสกิล" aria-label="ค้นหางาน" />
            <button type="submit" className="btn">
              หางาน
            </button>
          </form>
          <div className="row">
            <Link href="/signup" className="btn ghost">
              สร้างโปรไฟล์ฟรี
            </Link>
          </div>
        </div>
      </section>

      <main className="container page" style={{ paddingTop: 40 }}>
        <section className="stack">
          <SectionHead title="ทำงานอย่างไร" />
          <div className="grid">
            <div className="card">
              <span className="badge blue" style={{ alignSelf: 'flex-start' }}>1</span>
              <h3>สมัครด้วยโปรไฟล์</h3>
              <p className="muted">บริษัทเห็นข้อมูลเมื่อคุณกดสมัครเท่านั้น</p>
            </div>
            <div className="card">
              <span className="badge blue" style={{ alignSelf: 'flex-start' }}>2</span>
              <h3>ทำโจทย์สั้นๆ</h3>
              <p className="muted">เห็นเกณฑ์ให้คะแนนก่อนเริ่มทำ</p>
            </div>
            <div className="card">
              <span className="badge blue" style={{ alignSelf: 'flex-start' }}>3</span>
              <h3>ได้คำตอบใน 7 วัน</h3>
              <p className="muted">ไม่ผ่านก็ได้เหตุผลทุกครั้ง</p>
            </div>
          </div>
        </section>

        <section className="stack" id="companies">
          <SectionHead
            title="สำหรับบริษัท"
            sub="SME 20–200 คนที่ไม่มีฝ่าย HR"
            action={
              <Link href="/signup?as=company" className="btn small">
                เริ่มใช้งาน
              </Link>
            }
          />
          <div className="grid">
            <div className="card">
              <h3>คัดคนจากผลงาน</h3>
              <p className="muted">ให้คะแนนตามเกณฑ์ ตอบหลายคนพร้อมกัน</p>
            </div>
            <div className="card">
              <h3>สิทธิ์ตามตำแหน่ง</h3>
              <p className="muted">มอบสิทธิ์ต่อได้ไม่เกินที่ตัวเองมี</p>
            </div>
            <div className="card">
              <h3>ทีมในที่เดียว</h3>
              <p className="muted">งาน การลา แชต และแจ้งเตือนผ่าน LINE</p>
            </div>
          </div>
        </section>

        <p className="alert privacy">ข้อมูลเป็นของคุณ บริษัทที่คุณทำงานอยู่ไม่เห็นว่าคุณกำลังหางาน</p>
      </main>
      <Footer />
    </>
  );
}
