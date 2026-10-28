import { ActionForm, SubmitButton } from '@/components/forms';
import { saveJobAction } from '@/lib/actions/hiring';
import { AI_POLICY, JOB_TYPE, PROVINCES, WORK_MODE } from '@/lib/format';
import type { Criterion } from '@/lib/types';

type JobRow = Record<string, unknown> & { id?: string; skills?: string[] };
type ChallengeRow = {
  title?: string; brief?: string; deliverable?: string; time_limit_minutes?: number; due_days?: number; criteria?: Criterion[];
  ai_policy?: string; skill_key?: string | null; accept_reuse?: boolean;
} | null;

function v(x: unknown): string {
  return x === null || x === undefined ? '' : String(x);
}

export function JobForm({
  companyId,
  departments,
  job,
  challenge,
  locked = false,
  status = 'draft'
}: {
  companyId: string;
  departments: { id: string; title: string }[];
  job?: JobRow | null;
  challenge?: ChallengeRow;
  locked?: boolean;
  status?: string;
}) {
  const criteria = [...(challenge?.criteria || [])];
  while (criteria.length < 5) criteria.push({ name: '', weight: 0 });
  return (
    <ActionForm action={saveJobAction} className="stack-lg">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="job_id" value={v(job?.id)} />
      <section className="card">
        <h2>ข้อมูลประกาศ</h2>
        <div className="form-row">
          <div className="field" style={{ flex: '3 1 300px' }}>
            <label htmlFor="title">ชื่อตำแหน่ง</label>
            <input id="title" name="title" className="input" defaultValue={v(job?.title)} required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="department_id">แผนก</label>
            <select id="department_id" name="department_id" className="select" defaultValue={v(job?.department_id)} disabled={status !== 'draft' && Boolean(job?.id)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            {status !== 'draft' && job?.id ? <input type="hidden" name="department_id" value={v(job?.department_id)} /> : null}
            <span className="hint">หัวหน้าแผนกนี้จะเห็นและอนุมัติประกาศ (ถ้าเปิดกฎ)</span>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="job_type">ประเภทงาน</label>
            <select id="job_type" name="job_type" className="select" defaultValue={v(job?.job_type) || 'full_time'}>
              {Object.entries(JOB_TYPE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="work_mode">รูปแบบการทำงาน</label>
            <select id="work_mode" name="work_mode" className="select" defaultValue={v(job?.work_mode) || 'onsite'}>
              {Object.entries(WORK_MODE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="province">จังหวัด</label>
            <select id="province" name="province" className="select" defaultValue={v(job?.province) || 'กรุงเทพมหานคร'}>
              {PROVINCES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="salary_min">ค่าตอบแทนต่ำสุด</label>
            <input id="salary_min" name="salary_min" className="input" inputMode="numeric" defaultValue={v(job?.salary_min)} />
          </div>
          <div className="field">
            <label htmlFor="salary_max">ค่าตอบแทนสูงสุด</label>
            <input id="salary_max" name="salary_max" className="input" inputMode="numeric" defaultValue={v(job?.salary_max)} required />
          </div>
          <div className="field">
            <label htmlFor="pay_unit">หน่วย</label>
            <select id="pay_unit" name="pay_unit" className="select" defaultValue={v(job?.pay_unit) || 'month'}>
              <option value="month">ต่อเดือน</option>
              <option value="day">ต่อวัน</option>
              <option value="hour">ต่อชั่วโมง</option>
              <option value="project">ต่อโปรเจกต์</option>
            </select>
          </div>
        </div>
        <span className="hint">ผู้สมัครเห็นช่วงค่าตอบแทนตั้งแต่แรก ถ้าเสนอเกินช่วงนี้ต้องให้เจ้าของอนุมัติ (ถ้าเปิดกฎ)</span>
        <div className="form-row">
          <div className="field">
            <label htmlFor="gig_days">จ็อบระยะสั้น: จำนวนวัน</label>
            <input id="gig_days" name="gig_days" className="input" inputMode="numeric" defaultValue={v(job?.gig_days)} />
          </div>
          <div className="field">
            <label htmlFor="gig_start">เริ่ม</label>
            <input id="gig_start" name="gig_start" type="date" className="input" defaultValue={v(job?.gig_start)} />
          </div>
          <div className="field">
            <label htmlFor="gig_end">สิ้นสุด</label>
            <input id="gig_end" name="gig_end" type="date" className="input" defaultValue={v(job?.gig_end)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">รายละเอียดงาน</label>
          <textarea id="description" name="description" className="textarea" defaultValue={v(job?.description)} maxLength={8000} />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="responsibilities">หน้าที่</label>
            <textarea id="responsibilities" name="responsibilities" className="textarea" defaultValue={v(job?.responsibilities)} maxLength={4000} />
          </div>
          <div className="field">
            <label htmlFor="requirements">คุณสมบัติ</label>
            <textarea id="requirements" name="requirements" className="textarea" defaultValue={v(job?.requirements)} maxLength={4000} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="skills">สกิลที่ใช้ (คั่นด้วยจุลภาค ใช้คำนวณความตรงกับผู้สมัคร)</label>
          <input id="skills" name="skills" className="input" defaultValue={Array.isArray(job?.skills) ? job?.skills?.join(', ') : v(job?.skills)} />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="headcount">จำนวนที่รับ</label>
            <input id="headcount" name="headcount" className="input" inputMode="numeric" defaultValue={v(job?.headcount) || '1'} />
          </div>
          <div className="field">
            <label htmlFor="challenge_seats">ที่นั่งรอบโจทย์</label>
            <input id="challenge_seats" name="challenge_seats" className="input" inputMode="numeric" defaultValue={v(job?.challenge_seats) || '10'} />
            <span className="hint">จำนวนคนสูงสุดที่เชิญทำโจทย์ได้ ตั้งให้ตรวจทันใน 7 วัน</span>
          </div>
          <div className="field">
            <label htmlFor="closes_at">ปิดรับวันที่ (ไม่บังคับ)</label>
            <input id="closes_at" name="closes_at" type="date" className="input" defaultValue={v(job?.closes_at).slice(0, 10)} />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>โจทย์พิสูจน์สกิล</h2>
        <p className="muted small">
          ใช้แบรนด์สมมติเสมอ ห้ามใช้งานจริงของบริษัท ผลงานเป็นของผู้สมัคร บริษัทนำไปใช้เชิงพาณิชย์ไม่ได้ งานประจำ สัญญาจ้าง และฝึกงานต้องมีโจทย์
          {locked ? ' · มีผู้สมัครส่งโจทย์แล้ว เปลี่ยนเกณฑ์ไม่ได้' : ''}
        </p>
        <div className="field">
          <label htmlFor="ch_title">ชื่อโจทย์</label>
          <input id="ch_title" name="ch_title" className="input" defaultValue={v(challenge?.title)} maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="ch_brief">สถานการณ์ (เปิดให้ผู้สมัครเห็นเมื่อได้รับเชิญ)</label>
          <textarea id="ch_brief" name="ch_brief" className="textarea" defaultValue={v(challenge?.brief)} maxLength={6000} />
        </div>
        <div className="field">
          <label htmlFor="ch_deliverable">สิ่งที่ต้องส่ง</label>
          <input id="ch_deliverable" name="ch_deliverable" className="input" defaultValue={v(challenge?.deliverable)} />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ch_minutes">เวลาที่แนะนำ (นาที)</label>
            <input id="ch_minutes" name="ch_minutes" className="input" inputMode="numeric" defaultValue={v(challenge?.time_limit_minutes) || '60'} />
          </div>
          <div className="field">
            <label htmlFor="ch_due_days">ส่งภายใน (วัน)</label>
            <input id="ch_due_days" name="ch_due_days" className="input" inputMode="numeric" defaultValue={v(challenge?.due_days) || '3'} />
          </div>
          <div className="field">
            <label htmlFor="ch_ai_policy">การใช้ AI</label>
            <select id="ch_ai_policy" name="ch_ai_policy" className="select" defaultValue={v(challenge?.ai_policy) || 'allowed_declare'}>
              {Object.entries(AI_POLICY).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset>
          <legend>เกณฑ์ให้คะแนน (น้ำหนักรวม 100%)</legend>
          {criteria.map((c, i) => (
            <div key={i} className="form-row">
              <input name="crit_name" className="input" aria-label={`ชื่อเกณฑ์ข้อ ${i + 1}`} placeholder={`เกณฑ์ข้อ ${i + 1}`} defaultValue={c.name} style={{ flex: '3 1 220px' }} />
              <input name="crit_weight" className="input" aria-label={`น้ำหนักเกณฑ์ข้อ ${i + 1} (%)`} inputMode="numeric" placeholder="%" defaultValue={c.weight || ''} style={{ flex: '1 1 80px' }} />
            </div>
          ))}
        </fieldset>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ch_skill_key">รหัสสกิล (ใช้ผลโจทย์ซ้ำข้ามบริษัท เช่น content-marketing)</label>
            <input id="ch_skill_key" name="ch_skill_key" className="input" defaultValue={v(challenge?.skill_key)} pattern="[a-z0-9\-]{2,40}" />
          </div>
          <label className="check" style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" name="ch_accept_reuse" defaultChecked={challenge ? Boolean(challenge.accept_reuse) : true} />
            <span>รับผลโจทย์เดิมของสกิลเดียวกัน (คะแนน 75 ขึ้นไป ภายใน 12 เดือน)</span>
          </label>
        </div>
      </section>

      <div className="row">
        {status === 'draft' ? (
          <>
            <SubmitButton name="intent" value="publish" pendingText="กำลังส่ง…">
              บันทึกและเผยแพร่
            </SubmitButton>
            <SubmitButton name="intent" value="save" className="btn outline">
              บันทึกร่าง
            </SubmitButton>
          </>
        ) : (
          <SubmitButton name="intent" value="save">
            บันทึกการแก้ไข
          </SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}
