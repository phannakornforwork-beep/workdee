import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { SectionHead } from '@/components/ui';
import { DiffTable, FairAi, PipelineMock, ProofBand, SampleResult } from '@/components/Brand';

// หน้าแรก: ตัวตนของ WorkDee = "ผลงานพูดแทนประสบการณ์"
// ลำดับเรื่อง: สัญญา (hero + ใบผลงาน) → หลักฐาน (ตัวเลขจริง) → ต่างอย่างไร → ทำงานอย่างไร → AI ที่ยุติธรรม → สำหรับบริษัท
async function counts() {
  try {
    const supabase = await createClient();
    const [jobs, companies] = await Promise.all([
      supabase.from('job_board').select('id', { count: 'exact', head: true }),
      supabase.from('public_companies').select('id', { count: 'exact', head: true })
    ]);
    return { jobs: jobs.count || 0, companies: companies.count || 0 };
  } catch {
    return { jobs: 0, companies: 0 };
  }
}

export default async function Home() {
  const n = await counts();
  return (
    <>
      <PublicHeader />
      <section className="hero">
        <div className="container hero-grid">
          <div className="stack">
            <span className="eyebrow">ผลงานพูดแทนประสบการณ์</span>
            <h1>ไม่มีประสบการณ์ ก็พิสูจน์ได้ว่าทำงานเป็น</h1>
            <p>ทำโจทย์สั้นๆ จากงานจริง ได้ใบผลงานพร้อมคะแนนทุกครั้ง และได้คำตอบทุกใบสมัครใน 7 วัน</p>
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
              <Link href="/for-companies" className="small" style={{ color: 'var(--on-navy-2)' }}>
                สำหรับบริษัท →
              </Link>
            </div>
          </div>
          <SampleResult />
        </div>
      </section>

      <main className="container page" style={{ paddingTop: 32 }}>
        <ProofBand jobs={n.jobs} companies={n.companies} />

        <section className="stack section-gap">
          <SectionHead title="ต่างจากเว็บหางานทั่วไปอย่างไร" />
          <DiffTable />
        </section>

        <section className="stack section-gap" id="how">
          <SectionHead title="ทำงานอย่างไร" />
          <div className="how">
            <div>
              <h3>สมัครด้วยโปรไฟล์</h3>
              <p className="muted">บริษัทเห็นข้อมูลเมื่อคุณกดสมัครเท่านั้น</p>
            </div>
            <div>
              <h3>ทำโจทย์ไม่เกิน 2 ชั่วโมง</h3>
              <p className="muted">เห็นเกณฑ์ให้คะแนนก่อนเริ่มทำ</p>
            </div>
            <div>
              <h3>ได้ใบผลงาน + คำตอบใน 7 วัน</h3>
              <p className="muted">ไม่ผ่านก็ได้เหตุผลและคำแนะนำ</p>
            </div>
          </div>
        </section>

        <section className="stack section-gap">
          <SectionHead
            title={
              <>
                AI ช่วย แต่คนตัดสิน <span className="badge ai">AI</span>
              </>
            }
            sub="ความยุติธรรมมาก่อนความเร็ว"
          />
          <FairAi />
        </section>

        <section className="feature-split section-gap" id="companies">
          <div className="stack">
            <span className="eyebrow">สำหรับบริษัท 20–200 คน</span>
            <h2>รับคนและดูแลทีมในที่เดียว ไม่ต้องมีฝ่าย HR</h2>
            <ul className="check-list">
              <li>คัดจากผลงาน ไม่ต้องอ่านเรซูเม่ทีละฉบับ</li>
              <li>ตอบผู้สมัครหลายคนพร้อมกัน ยกเลิกได้ใน 30 วินาที</li>
              <li>งานของทีม การลา แชต และแจ้งเตือนผ่าน LINE</li>
            </ul>
            <div className="row">
              <Link href="/for-companies" className="btn">
                ดูรายละเอียดสำหรับบริษัท
              </Link>
            </div>
          </div>
          <PipelineMock />
        </section>

        <p className="alert privacy section-gap">ข้อมูลเป็นของคุณ บริษัทที่คุณทำงานอยู่มองไม่เห็นว่าคุณกำลังหางาน</p>
      </main>
      <Footer />
    </>
  );
}
