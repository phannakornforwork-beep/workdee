import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCompany, can } from '@/lib/auth';
import { Badge } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/lib/env';

export const metadata: Metadata = { title: 'ช่วยเหลือ' };

type Setup = { verified: boolean; team_invited: boolean; line_linked: boolean; job_posted: boolean; graded_once: boolean };

const FAQ: [string, string][] = [
  [
    'ทำไมต้องตอบผู้สมัครภายใน 7 วัน',
    'ผู้สมัครทุกคนต้องรู้ผล ไม่ว่าจะผ่านหรือไม่ผ่าน ระบบเตือนผู้ดูแลในวันที่ 5 ส่งต่อให้เจ้าของกิจการในวันที่ 6 และถ้าครบ 7 วันยังไม่มีใครตอบ ระบบจะปิดใบสมัครให้ พร้อมบอกผู้สมัครว่าบริษัทไม่ได้ตอบภายใน 7 วัน และผลนี้ไม่ใช่การประเมินตัวเขา ใบสมัครที่ระบบต้องปิดแทนจะนับในอัตราการตอบผู้สมัครที่แสดงในหน้าประกาศ'
  ],
  [
    'ทำไมตอนแจ้งผลไม่ผ่านต้องเลือกเหตุผล',
    'ผู้สมัครที่เป็นเด็กจบใหม่ต้องรู้ว่าควรพัฒนาอะไร เหตุผลเป็นตัวเลือกมาตรฐาน (เช่น ทักษะหลักยังไม่ตรง คะแนนโจทย์ยังไม่ถึงเกณฑ์) ไม่ต้องเขียนยาว และไม่มีช่องให้ระบุเรื่องส่วนตัว'
  ],
  [
    'บริษัทเห็นข้อมูลอะไรของผู้สมัคร',
    'เห็นโปรไฟล์เต็มเฉพาะคนที่สมัครเข้ามาหรือตอบรับคำเชิญเท่านั้น และเห็นเป็นสำเนา ณ วันที่สมัคร ไม่มีเบอร์โทร ที่อยู่ หรือวันเกิด ผู้สมัครถอนสิทธิ์การเข้าถึงได้เอง ส่วน "ชีวิตส่วนตัว" ในแผนอาชีพไม่ถูกส่งให้บริษัทและไม่ใช้คัดกรอง'
  ],
  [
    'เจ้าของกิจการเห็นอะไรของพนักงานได้บ้าง',
    'เห็นเฉพาะสิ่งที่อยู่ในพื้นที่บริษัท เช่น งานที่มอบหมาย การลา แชตของบริษัท ไม่มีทางเห็นพื้นที่ส่วนตัวของพนักงาน รวมถึงว่าพนักงานกำลังหางานหรือสมัครที่ไหนอยู่'
  ],
  [
    'มีรายชื่อพนักงานที่ไม่ควรจ้าง (บัญชีดำ) แชร์ระหว่างบริษัทไหม',
    'ไม่มี และจะไม่มี เพราะเสี่ยงหมิ่นประมาทและขัด PDPA ระบบให้ผู้สมัครพิสูจน์ฝีมือด้วยโจทย์แทน'
  ],
  [
    'ส่งข้อความหาผู้สมัครหลายคนแล้วกดผิด ยกเลิกได้ไหม',
    'ได้ภายใน 30 วินาที กด "ยกเลิก" บนแถบที่ขึ้นด้านล่าง ระหว่างนั้นผู้สมัครยังไม่เห็นอะไรเลย'
  ],
  [
    'ช่วงเวลาเงียบคืออะไร',
    'นอกเวลางานที่บริษัทตั้งไว้ ข้อความยังเข้าแชตตามปกติ แต่ระบบจะยังไม่ส่ง LINE หรืออีเมลไปรบกวน จนถึงเวลาเริ่มงาน ยกเว้นเรื่องที่ติดว่า "ด่วน" และพนักงานคนนั้นยินยอมรับเรื่องด่วนไว้เอง'
  ],
  [
    'โจทย์ทดสอบควรยาวแค่ไหน และใช้ AI ได้ไหม',
    'โจทย์ที่ดีทำเสร็จใน 1–2 ชั่วโมง ไม่ใช่งานจริงที่บริษัทจะเอาไปใช้ฟรี เลือกได้ว่าจะให้ใช้ AI หรือไม่ ผู้สมัครต้องบอกเองว่าใช้ส่วนไหน และอธิบายวิธีคิด'
  ],
  [
    'ผู้สมัครเคยทำโจทย์แบบเดียวกันกับบริษัทอื่นแล้ว',
    'ถ้าประกาศเปิดรับผลโจทย์เดิม (ทักษะเดียวกัน และคะแนนถึงเกณฑ์ที่ตั้งไว้) ผู้สมัครเลือกใช้ผลเดิมได้ ไม่ต้องทำซ้ำ ทีมเห็นว่าเป็นผลที่นำมาใช้ใหม่'
  ]
];

export default async function HelpPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, access } = await requireCompany(cid);
  const { data } = await supabase.rpc('company_home', { p_company: cid });
  const setup = ((data as { setup?: Setup } | null)?.setup || {}) as Setup;
  const base = `/c/${cid}`;
  const steps: { done: boolean; title: string; href: string; who: string }[] = [
    { done: setup.verified, title: 'ยืนยันบริษัทด้วยหนังสือรับรอง', href: `${base}/settings#verify`, who: 'เจ้าของ' },
    { done: setup.team_invited, title: 'ตั้งตำแหน่งหัวหน้าแผนกแล้วเชิญเข้าทีม', href: `${base}/team?tab=invite`, who: 'เจ้าของ' },
    { done: setup.line_linked, title: 'เชื่อม LINE ของคุณเพื่อรับแจ้งเตือน', href: `${base}/notifications`, who: 'ทุกคน' },
    { done: setup.job_posted, title: 'ลงประกาศแรกพร้อมโจทย์ทดสอบ', href: `${base}/jobs/new`, who: 'คนที่ลงประกาศได้' },
    { done: setup.graded_once, title: 'ให้คะแนนโจทย์ครั้งแรก', href: `${base}/pipeline`, who: 'คนที่ดูแลผู้สมัคร' }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const role = access.is_owner ? 'owner' : can(access, 'members') ? 'head' : can(access, 'screen') ? 'screen' : 'staff';

  return (
    <>
      <div className="stack-sm">
        <h1>ช่วยเหลือ</h1>
        <p className="muted">ตำแหน่งของคุณ: {access.position_title}</p>
      </div>
      <div className="split">
        <div className="main">
          <section className="card">
            <div className="row-between">
              <h2>เริ่มต้นใช้งาน</h2>
              <span className="small muted">
                เสร็จ {doneCount}/{steps.length}
              </span>
            </div>
            <div className="list">
              {steps.map((s) => (
                <div key={s.title} className="item row-between">
                  <span>
                    {s.done ? '✓ ' : '○ '}
                    {s.done ? <span className="muted">{s.title}</span> : <Link href={s.href}>{s.title}</Link>}
                  </span>
                  <Badge tone={s.done ? 'teal' : 'gray'}>{s.done ? 'เสร็จแล้ว' : s.who}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>สำหรับคุณ</h2>
            {role === 'owner' ? (
              <ol className="stack-sm small">
                <li>สร้างตำแหน่งหัวหน้าแผนกใน <Link href={`${base}/team?tab=positions`}>ตำแหน่งและสิทธิ์</Link> แล้วให้สิทธิ์ &ldquo;แผนกตัวเอง&rdquo; ก่อน ค่อยเพิ่มเมื่อมั่นใจ</li>
                <li>ส่งลิงก์เชิญในกลุ่ม LINE ของบริษัท ทุกคนเข้าร่วมเองด้วยบัญชีของตัวเอง</li>
                <li>ให้หัวหน้าแผนกตั้งตำแหน่งย่อยและเชิญทีมต่อเอง เขาให้สิทธิ์ได้ไม่เกินที่คุณให้</li>
                <li>เปิดกฎการอนุมัติเฉพาะที่จำเป็นใน <Link href={`${base}/settings`}>ตั้งค่า</Link></li>
                <li>ทุกการเปลี่ยนสิทธิ์ถูกบันทึกใน <Link href={`${base}/team?tab=log`}>ประวัติ</Link> ลบหรือแก้ไม่ได้</li>
              </ol>
            ) : role === 'head' ? (
              <ol className="stack-sm small">
                <li>ตั้งตำแหน่งในแผนกของคุณที่ <Link href={`${base}/team?tab=positions`}>ตำแหน่งและสิทธิ์</Link></li>
                <li>เชิญทีมเข้าตำแหน่งที่อยู่ต่ำกว่าคุณ ให้สิทธิ์ได้ไม่เกินที่คุณมี</li>
                <li>ดูว่าใครทำอะไรอยู่และงานไหนติดปัญหาที่ <Link href={`${base}/work`}>งานของทีม</Link></li>
                <li>เรื่องที่รอคุณอนุมัติอยู่ที่ <Link href={`${base}/team?tab=approvals`}>การอนุมัติ</Link> ถ้าเปิดกฎส่งต่อ เรื่องที่ค้างเกิน 24 ชั่วโมงจะไปหาหัวหน้าถัดขึ้นไป</li>
              </ol>
            ) : role === 'screen' ? (
              <ol className="stack-sm small">
                <li>เปิด <Link href={`${base}/pipeline`}>ผู้สมัคร</Link> เรียงตามวันที่ต้องตอบ คนที่ใกล้ครบ 7 วันอยู่บนสุด</li>
                <li>กด &ldquo;เลือกหลายคน&rdquo; เพื่อตอบพร้อมกัน เลือกเหตุผล ดูตัวอย่างข้อความ แล้วส่ง ยกเลิกได้ใน 30 วินาที</li>
                <li>ให้คะแนนโจทย์ตามเกณฑ์ที่ประกาศไว้ ผู้สมัครเห็นคะแนนรายข้อและคำแนะนำ</li>
                <li>เปิดเวลาว่างที่ <Link href={`${base}/interviews`}>สัมภาษณ์</Link> แล้วให้ผู้สมัครเลือกเวลาเอง</li>
              </ol>
            ) : (
              <ol className="stack-sm small">
                <li>งานที่ได้รับมอบหมายอยู่ที่ <Link href={`${base}/work?tab=mine`}>งานของฉัน</Link> อัปเดตสถานะเมื่อเริ่ม ติด หรือเสร็จ</li>
                <li>ขอลาที่ <Link href={`${base}/work?tab=leave`}>การลา</Link></li>
                <li>ประกาศจากบริษัทอยู่ใน <Link href={`${base}/chat`}>แชต</Link> เปิดอ่านแล้วถือว่ารับทราบ</li>
                <li>พื้นที่ส่วนตัวของคุณ (การหางาน แผนอาชีพ) แยกจากที่นี่ บริษัทไม่เห็น</li>
              </ol>
            )}
          </section>

          <section className="card">
            <h2>คำถามที่พบบ่อย</h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="disclosure">
                <summary>{q}</summary>
                <p className="small">{a}</p>
              </details>
            ))}
          </section>
        </div>
        <aside className="side">
          <section className="card">
            <h2>ระดับสิทธิ์</h2>
            <dl className="kv small">
              <dt>ไม่มี</dt>
              <dd>ทำเรื่องนั้นไม่ได้</dd>
              <dt>แผนกตัวเอง</dt>
              <dd>เฉพาะในแผนกที่ตำแหน่งสังกัด</dd>
              <dt>ทั้งบริษัท</dt>
              <dd>ทุกแผนก</dd>
            </dl>
          </section>
          <section className="card">
            <h2>ติดต่อทีม WorkDee</h2>
            {SUPPORT_EMAIL ? (
              <p className="small">
                อีเมล <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ตอบในวันทำการ
              </p>
            ) : (
              <p className="small muted">ติดต่อผู้ดูแลระบบของคุณ</p>
            )}
            <p className="tiny muted">
              อ่าน <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link> และ <Link href="/terms">เงื่อนไขการใช้งาน</Link>
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
