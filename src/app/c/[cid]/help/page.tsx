import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCompany, can } from '@/lib/auth';
import { Badge, PageTitle } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/lib/env';

export const metadata: Metadata = { title: 'ช่วยเหลือ' };

type Setup = { verified: boolean; team_invited: boolean; line_linked: boolean; job_posted: boolean; graded_once: boolean };

const FAQ: [string, string][] = [
  ['ทำไมต้องตอบผู้สมัครใน 7 วัน', 'ทุกคนต้องรู้ผล ระบบเตือนวันที่ 5 แจ้งเจ้าของวันที่ 6 และปิดแทนวันที่ 7 ซึ่งนับในอัตราการตอบของบริษัท'],
  ['ทำไมต้องเลือกเหตุผลเมื่อไม่ผ่าน', 'ให้ผู้สมัครรู้ว่าควรพัฒนาอะไร เลือกจากตัวเลือกมาตรฐาน ไม่ต้องเขียนเอง'],
  ['บริษัทเห็นข้อมูลอะไรของผู้สมัคร', 'เห็นโปรไฟล์เฉพาะคนที่สมัครเข้ามา ไม่มีเบอร์โทร ที่อยู่ หรือวันเกิด'],
  ['เจ้าของเห็นอะไรของพนักงานบ้าง', 'เฉพาะในพื้นที่บริษัท ไม่เห็นว่าพนักงานกำลังหางาน'],
  ['มีบัญชีดำแชร์ระหว่างบริษัทไหม', 'ไม่มี และจะไม่มี'],
  ['ส่งข้อความผิด ยกเลิกได้ไหม', 'ได้ภายใน 30 วินาที กด "ยกเลิก" ที่แถบด้านล่าง'],
  ['ช่วงเวลาเงียบคืออะไร', 'นอกเวลางาน LINE/อีเมลจะรอส่งตอนเช้า ยกเว้นเรื่องด่วนกับคนที่ยินยอมไว้'],
  ['โจทย์ควรยาวแค่ไหน', 'ทำเสร็จใน 1–2 ชั่วโมง และไม่ใช่งานจริงที่บริษัทจะเอาไปใช้'],
  ['ผู้สมัครเคยทำโจทย์แบบเดียวกันแล้ว', 'ถ้าประกาศเปิดรับผลเดิม ผู้สมัครใช้ผลเดิมได้ ไม่ต้องทำซ้ำ']
];

export default async function HelpPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, access } = await requireCompany(cid);
  const { data } = await supabase.rpc('company_home', { p_company: cid });
  const setup = ((data as { setup?: Setup } | null)?.setup || {}) as Setup;
  const base = `/c/${cid}`;
  const steps: { done: boolean; title: string; href: string; who: string }[] = [
    { done: setup.verified, title: 'ยืนยันบริษัท', href: `${base}/settings#verify`, who: 'เจ้าของ' },
    { done: setup.team_invited, title: 'เชิญหัวหน้าแผนก', href: `${base}/team?tab=invite`, who: 'เจ้าของ' },
    { done: setup.line_linked, title: 'เชื่อม LINE', href: `${base}/notifications`, who: 'ทุกคน' },
    { done: setup.job_posted, title: 'ลงประกาศแรก', href: `${base}/jobs/new`, who: 'คนที่ลงประกาศได้' },
    { done: setup.graded_once, title: 'ให้คะแนนโจทย์ครั้งแรก', href: `${base}/pipeline`, who: 'คนที่ดูแลผู้สมัคร' }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const role = access.is_owner ? 'owner' : can(access, 'members') ? 'head' : can(access, 'screen') ? 'screen' : 'staff';

  return (
    <>
      <PageTitle title="ช่วยเหลือ" sub={`ตำแหน่งของคุณ: ${access.position_title}`} />
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
                <li>สร้างหัวหน้าแผนกที่ <Link href={`${base}/team?tab=positions`}>ตำแหน่งและสิทธิ์</Link></li>
                <li>ส่งลิงก์เชิญในกลุ่ม LINE ของบริษัท</li>
                <li>ให้หัวหน้าแผนกเชิญทีมต่อเอง</li>
                <li>เปิดกฎอนุมัติที่ <Link href={`${base}/settings`}>ตั้งค่า</Link></li>
              </ol>
            ) : role === 'head' ? (
              <ol className="stack-sm small">
                <li>ตั้งตำแหน่งในแผนกที่ <Link href={`${base}/team?tab=positions`}>ตำแหน่งและสิทธิ์</Link></li>
                <li>ดูงานที่ติดปัญหาที่ <Link href={`${base}/work`}>งานของทีม</Link></li>
                <li>อนุมัติคำขอที่ <Link href={`${base}/team?tab=approvals`}>การอนุมัติ</Link></li>
              </ol>
            ) : role === 'screen' ? (
              <ol className="stack-sm small">
                <li>ตอบคนที่ใกล้ครบ 7 วันก่อนที่ <Link href={`${base}/pipeline`}>ผู้สมัคร</Link></li>
                <li>กด &ldquo;เลือกหลายคน&rdquo; เพื่อตอบพร้อมกัน</li>
                <li>เปิดเวลาว่างที่ <Link href={`${base}/interviews`}>สัมภาษณ์</Link></li>
              </ol>
            ) : (
              <ol className="stack-sm small">
                <li>อัปเดตงานที่ <Link href={`${base}/work?tab=mine`}>งานของฉัน</Link></li>
                <li>ขอลาที่ <Link href={`${base}/work?tab=leave`}>การลา</Link></li>
                <li>อ่านประกาศที่ <Link href={`${base}/chat`}>แชต</Link></li>
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
