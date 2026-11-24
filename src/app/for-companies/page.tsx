import Link from 'next/link';
import type { Metadata } from 'next';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { SectionHead } from '@/components/ui';
import { FairAi, PipelineMock, SampleResult } from '@/components/Brand';

export const metadata: Metadata = {
  title: 'สำหรับบริษัท',
  description: 'รับคนจากผลงานจริง และดูแลทีมในที่เดียว สำหรับ SME 20–200 คนที่ไม่มีฝ่าย HR'
};

// หน้าสำหรับบริษัท: อีกครึ่งหนึ่งของผลิตภัณฑ์ที่เดิมไม่มีใครเห็น
// ลำดับเรื่อง: ปัญหาของ SME → รับคนจากผลงาน (ภาพกระดาน) → ใบผลงาน → AI → ดูแลทีม → ข้อตกลงที่บริษัทต้องทำ → เริ่มใช้
export default function ForCompanies() {
  return (
    <>
      <PublicHeader />
      <section className="hero">
        <div className="container">
          <span className="eyebrow">สำหรับ SME 20–200 คน</span>
          <h1>รับคนและดูแลทีมในที่เดียว ไม่ต้องมีฝ่าย HR</h1>
          <p>คัดคนจากผลงานจริง ไม่ต้องอ่านเรซูเม่ทีละฉบับ ใช้ฟรีในช่วงนำร่อง</p>
          <div className="row">
            <Link href="/signup?as=company" className="btn">
              เริ่มใช้งานฟรี
            </Link>
            <Link href="/jobs" className="btn ghost">
              ดูประกาศตัวอย่าง
            </Link>
          </div>
        </div>
      </section>

      <main className="container page" style={{ paddingTop: 40 }}>
        <section className="feature-split">
          <div className="stack">
            <span className="eyebrow">1 · รับคน</span>
            <h2>เห็นทุกคนในกระดานเดียว เรียงตามวันที่ต้องตอบ</h2>
            <ul className="check-list">
              <li>เชิญทำโจทย์เฉพาะคนที่ตรงกับงาน</li>
              <li>ตอบหลายคนพร้อมกันด้วยเหตุผลมาตรฐาน</li>
              <li>ให้ผู้สมัครเลือกเวลาสัมภาษณ์เอง ไม่ต้องโทรนัด</li>
            </ul>
          </div>
          <PipelineMock />
        </section>

        <section className="feature-split section-gap">
          <SampleResult />
          <div className="stack">
            <span className="eyebrow">2 · คัดจากผลงาน</span>
            <h2>โจทย์สั้นจากงานจริง ให้คะแนนตามเกณฑ์ที่ประกาศไว้</h2>
            <ul className="check-list">
              <li>เลือกโจทย์จากคลังพร้อมเกณฑ์ หรือให้ AI ร่างให้</li>
              <li>ผู้สมัครที่เคยทำโจทย์สกิลเดียวกันแล้ว ใช้ผลเดิมได้</li>
              <li>ใช้แบรนด์สมมติ ผลงานเป็นของผู้สมัคร</li>
            </ul>
          </div>
        </section>

        <section className="stack section-gap">
          <SectionHead
            title={
              <>
                AI ช่วย แต่คนตัดสิน <span className="badge ai">AI</span>
              </>
            }
          />
          <FairAi />
        </section>

        <section className="stack section-gap">
          <SectionHead title="3 · ดูแลทีม" sub="ใช้ต่อได้หลังรับคนเข้ามาแล้ว" />
          <div className="grid">
            <div className="card">
              <h3>สิทธิ์ตามตำแหน่ง</h3>
              <p className="muted">มอบสิทธิ์ต่อได้ไม่เกินที่ตัวเองมี มีประวัติทุกครั้ง</p>
            </div>
            <div className="card">
              <h3>งานของทีม</h3>
              <p className="muted">เห็นว่าใครทำอะไรอยู่ และงานไหนติดปัญหา</p>
            </div>
            <div className="card">
              <h3>ลาและอนุมัติ</h3>
              <p className="muted">ยื่นลาในระบบ หัวหน้าอนุมัติได้ทันที</p>
            </div>
            <div className="card">
              <h3>แชตและ LINE</h3>
              <p className="muted">นอกเวลางาน แจ้งเตือนจะรอส่งตอนเช้า</p>
            </div>
          </div>
        </section>

        <section className="stack section-gap">
          <SectionHead title="ข้อตกลงที่ทุกบริษัททำ" sub="ทำให้ผู้สมัครเชื่อใจประกาศของคุณ" />
          <ul className="check-list">
            <li>ตอบผู้สมัครทุกคนภายใน 7 วัน ไม่อย่างนั้นระบบปิดแทนและนับในอัตราการตอบที่แสดงต่อสาธารณะ</li>
            <li>บอกช่วงเงินเดือนทุกประกาศ</li>
            <li>โจทย์ใช้เวลาไม่เกิน 2 ชั่วโมง</li>
            <li>ยืนยันบริษัทด้วยหนังสือรับรองก่อนเผยแพร่ประกาศ</li>
          </ul>
        </section>

        <section className="cta-band section-gap">
          <div className="stack-sm">
            <h2>เริ่มลงประกาศแรกได้ในวันนี้</h2>
            <p>มีเทมเพลตประกาศและโจทย์ให้ ไม่ต้องเขียนเองตั้งแต่ศูนย์</p>
          </div>
          <Link href="/signup?as=company" className="btn">
            เริ่มใช้งานฟรี
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
