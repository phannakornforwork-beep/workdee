import Link from 'next/link';
import { Footer, PublicHeader } from '@/components/PublicHeader';

export default function Home() {
  return (
    <>
      <PublicHeader />
      <section className="hero">
        <div className="container">
          <span className="badge teal" style={{ alignSelf: 'flex-start' }}>
            สำหรับเด็กจบใหม่และ SME ไทย
          </span>
          <h1>ไม่มีประสบการณ์ ก็พิสูจน์ได้ว่าทำงานเป็น</h1>
          <p>
            สมัครด้วยโปรไฟล์ที่ยืนยันวุฒิแล้ว บริษัทเชิญทำโจทย์สั้นๆ จากงานจริง ได้คะแนนรายเกณฑ์ทุกครั้ง และได้คำตอบทุกใบสมัครภายใน 7 วัน
          </p>
          <div className="row">
            <Link href="/signup" className="btn">
              เริ่มสร้างโปรไฟล์ฟรี
            </Link>
            <Link href="/jobs" className="btn ghost" style={{ color: '#fff', borderColor: '#4a5057' }}>
              ดูประกาศงาน
            </Link>
          </div>
        </div>
      </section>

      <main className="container page">
        <section className="stack">
          <h2>ทำงานอย่างไร</h2>
          <div className="grid">
            <div className="card">
              <span className="badge blue" style={{ alignSelf: 'flex-start' }}>1</span>
              <h3>สมัครด้วยโปรไฟล์</h3>
              <p className="muted">บริษัทเห็นโปรไฟล์เต็มเฉพาะตอนคุณกดสมัครหรือรับคำเชิญ ข้อมูลเป็นของคุณ ถอนสิทธิ์ได้ทุกเมื่อ</p>
            </div>
            <div className="card">
              <span className="badge blue" style={{ alignSelf: 'flex-start' }}>2</span>
              <h3>ทำโจทย์สั้นๆ</h3>
              <p className="muted">โจทย์จากงานจริงด้วยแบรนด์สมมติ เห็นเกณฑ์ก่อนทำ บอกได้ว่าใช้ AI ช่วยส่วนไหน ผลงานยังเป็นของคุณ</p>
            </div>
            <div className="card">
              <span className="badge blue" style={{ alignSelf: 'flex-start' }}>3</span>
              <h3>ได้คำตอบใน 7 วัน</h3>
              <p className="muted">บริษัทต้องตอบทุกขั้นภายใน 7 วัน ถ้าไม่ผ่านต้องบอกเหตุผล ถ้าบริษัทเงียบ ระบบปิดให้และนับในอัตราการตอบของบริษัท</p>
            </div>
          </div>
        </section>

        <section className="stack" id="companies">
          <h2>สำหรับบริษัท 20–200 คนที่ไม่มีทีม HR เต็มรูปแบบ</h2>
          <div className="grid">
            <div className="card">
              <h3>คัดคนจากผลงาน</h3>
              <p className="muted">เชิญเฉพาะคนที่ตรงเข้ารอบโจทย์ ให้คะแนนตามเกณฑ์ ตอบหลายคนพร้อมกันได้ ยกเลิกได้ใน 30 วินาที</p>
            </div>
            <div className="card">
              <h3>ลำดับชั้นและสิทธิ์</h3>
              <p className="muted">เจ้าของมอบสิทธิ์ให้หัวหน้าแผนก หัวหน้ามอบต่อให้ทีมได้ไม่เกินที่ตัวเองมี มีประวัติการเปลี่ยนแปลงทุกครั้ง</p>
            </div>
            <div className="card">
              <h3>บริหารทีมในที่เดียว</h3>
              <p className="muted">ดูว่าใครทำอะไรอยู่ แชตแผนก ประกาศที่เห็นว่าใครยังไม่อ่าน อนุมัติการลา แจ้งเตือนผ่าน LINE</p>
            </div>
          </div>
          <div className="row">
            <Link href="/signup?as=company" className="btn">
              สมัครใช้งานสำหรับบริษัท
            </Link>
          </div>
        </section>

        <section className="card soft">
          <h2>ข้อมูลส่วนตัวของคุณเป็นของคุณ</h2>
          <p className="muted">
            บัญชีเดียวใช้ได้ทั้งพื้นที่ส่วนตัวและพื้นที่บริษัท แต่แยกกันเด็ดขาด บริษัทที่คุณทำงานอยู่มองไม่เห็นว่าคุณกำลังหางานใหม่
            กล่อง &ldquo;ชีวิตส่วนตัว&rdquo; ในแผนอาชีพไม่ถูกแชร์และไม่ถูกใช้คัดกรอง
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
