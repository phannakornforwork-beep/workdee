import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { savePlanAction } from '@/lib/actions/candidate';

export const metadata: Metadata = { title: 'แผนอาชีพ' };

export default async function PlanPage() {
  const { supabase, user } = await requireUser('/me/plan');
  const [{ data: plan }, { data: notes }] = await Promise.all([
    supabase.from('career_plans').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('career_private_notes').select('life_notes').eq('user_id', user.id).maybeSingle()
  ]);
  const steps = ((plan?.steps || []) as { title: string }[]).map((s) => s.title).join('\n');
  return (
    <>
      <div className="stack-sm">
        <h1>แผนอาชีพ</h1>
        <p className="muted">พื้นที่ลองคิด ไม่มีถูกผิด แชร์กับบริษัทเฉพาะเมื่อคุณเปิด และเลือกได้ทีละใบสมัคร</p>
      </div>
      <ActionForm action={savePlanAction} className="split">
        <div className="main">
          <section className="card">
            <h2>เป้าหมาย</h2>
            <div className="field">
              <label htmlFor="goal_title">อยากเป็นอะไรในอีก 3–5 ปี</label>
              <input id="goal_title" name="goal_title" className="input" maxLength={160} defaultValue={plan?.goal_title || ''} placeholder="เช่น Content Lead ของแบรนด์อาหาร" />
            </div>
            <div className="field">
              <label htmlFor="goal_detail">ทำไมถึงอยากเป็น</label>
              <textarea id="goal_detail" name="goal_detail" className="textarea" maxLength={2000} defaultValue={plan?.goal_detail || ''} />
            </div>
            <div className="field">
              <label htmlFor="steps">ขั้นที่วางไว้ (บรรทัดละ 1 ขั้น)</label>
              <textarea id="steps" name="steps" className="textarea" defaultValue={steps} placeholder={'ฝึกเขียนคอนเทนต์ขายของทุกสัปดาห์\nเรียน Google Analytics\nหางานตำแหน่ง Content Executive'} />
            </div>
            <label className="check">
              <input type="checkbox" name="share" defaultChecked={Boolean(plan?.share_with_companies)} />
              <span>อนุญาตให้เลือกแชร์แผนนี้ตอนสมัครงาน (ปิดไว้เป็นค่าเริ่มต้น เปิดแล้วยังต้องติ๊กเลือกทีละใบสมัคร)</span>
            </label>
          </section>
        </div>
        <aside className="side">
          <section className="card">
            <h2>ชีวิตส่วนตัว</h2>
            <p className="small muted">ช่องนี้ไม่แชร์ให้บริษัทใดเลย และไม่ใช้คัดกรองหรือคำนวณความตรงกับงาน ใช้จดสิ่งที่ต้องคิดประกอบ เช่น ดูแลครอบครัว การเดินทาง</p>
            <label className="sr-only" htmlFor="life_notes">
              ชีวิตส่วนตัว
            </label>
            <textarea id="life_notes" name="life_notes" className="textarea" maxLength={4000} defaultValue={(notes?.life_notes as string) || ''} />
          </section>
          <SubmitButton>บันทึกแผนอาชีพ</SubmitButton>
        </aside>
      </ActionForm>
    </>
  );
}
