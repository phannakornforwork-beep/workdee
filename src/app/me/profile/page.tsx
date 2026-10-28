import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { FileUpload } from '@/components/FileUpload';
import { VerifyBadge } from '@/components/ui';
import { deleteEducationAction, requestVerifyAction, saveEducationAction, saveProfileAction } from '@/lib/actions/candidate';
import { JOB_TYPE, PROVINCES } from '@/lib/format';

export const metadata: Metadata = { title: 'โปรไฟล์' };

type Pair = { name?: string; title?: string; detail?: string };
type Edu = {
  id: string; institution_id: string | null; institution_name: string; level: string; faculty: string | null; major: string | null;
  status: string; year_label: string | null; gpa: number | null; verify_level: string; verify_note: string | null; doc_path: string | null;
};

const LEVELS: Record<string, string> = {
  vocational: 'ปวช.', high_vocational: 'ปวส.', bachelor: 'ปริญญาตรี', master: 'ปริญญาโท', doctorate: 'ปริญญาเอก', other: 'อื่นๆ'
};

function lines(items: Pair[] | null | undefined, key: 'name' | 'title') {
  return (items || []).map((x) => [x[key] || '', x.detail || ''].filter(Boolean).join(' | ')).join('\n');
}

function EducationFields({ e, institutions }: { e?: Edu; institutions: { id: string; name: string }[] }) {
  return (
    <>
      <div className="form-row">
        <div className="field">
          <label>สถาบัน (ถ้าอยู่ในรายชื่อพาร์ตเนอร์)</label>
          <select name="institution_id" className="select" defaultValue={e?.institution_id || ''}>
            <option value="">ไม่อยู่ในรายชื่อ</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ชื่อสถาบัน</label>
          <input name="institution_name" className="input" defaultValue={e?.institution_name || ''} required />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>ระดับ</label>
          <select name="level" className="select" defaultValue={e?.level || 'bachelor'}>
            {Object.entries(LEVELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>คณะ</label>
          <input name="faculty" className="input" defaultValue={e?.faculty || ''} />
        </div>
        <div className="field">
          <label>สาขา</label>
          <input name="major" className="input" defaultValue={e?.major || ''} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>สถานะ</label>
          <select name="status" className="select" defaultValue={e?.status || 'studying'}>
            <option value="studying">กำลังศึกษา</option>
            <option value="graduated">จบแล้ว</option>
          </select>
        </div>
        <div className="field">
          <label>ปี (เช่น ปี 4 หรือ จบ 2569)</label>
          <input name="year_label" className="input" defaultValue={e?.year_label || ''} />
        </div>
        <div className="field">
          <label>เกรดเฉลี่ย</label>
          <input name="gpa" className="input" inputMode="decimal" defaultValue={e?.gpa ?? ''} />
        </div>
      </div>
    </>
  );
}

export default async function ProfilePage() {
  const { supabase, user } = await requireUser('/me/profile');
  const [{ data: cp }, { data: prof }, { data: edus }, { data: insts }] = await Promise.all([
    supabase.from('candidate_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('display_name, phone').eq('id', user.id).maybeSingle(),
    supabase.from('educations').select('*').order('created_at'),
    supabase.from('institutions').select('id, name').order('is_partner', { ascending: false }).order('name')
  ]);
  const institutions = (insts || []) as { id: string; name: string }[];
  const prefTypes: string[] = cp?.pref_job_types || [];
  const prefProvinces: string[] = cp?.pref_provinces || [];
  return (
    <>
      <div className="stack-sm">
        <h1>โปรไฟล์</h1>
        <p className="muted">บริษัทเห็นสำเนาโปรไฟล์นี้เฉพาะตอนที่คุณกดสมัครหรือรับคำเชิญ ไม่เห็นอีเมล เบอร์โทร ที่อยู่ หรือวันเกิด</p>
      </div>
      <div className="split">
        <div className="main">
          <ActionForm action={saveProfileAction} className="card">
            <h2>ข้อมูลหลัก</h2>
            <div className="form-row">
              <div className="field">
                <label htmlFor="full_name">ชื่อ-นามสกุล</label>
                <input id="full_name" name="full_name" className="input" defaultValue={cp?.full_name || prof?.display_name || ''} required />
              </div>
              <div className="field">
                <label htmlFor="phone">เบอร์โทร (ไม่แสดงให้บริษัท ใช้รับ SMS เรื่องด่วน)</label>
                <input id="phone" name="phone" className="input" inputMode="tel" defaultValue={prof?.phone || ''} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="headline">พาดหัวสั้นๆ</label>
              <input id="headline" name="headline" className="input" maxLength={160} defaultValue={cp?.headline || ''} placeholder="เช่น นักศึกษาการตลาดปี 4 ชอบเขียนคอนเทนต์ที่ขายของได้จริง" />
            </div>
            <div className="field">
              <label htmlFor="intro">แนะนำตัว</label>
              <textarea id="intro" name="intro" className="textarea" maxLength={2000} defaultValue={cp?.intro || ''} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="province">จังหวัดที่อยู่ตอนนี้</label>
                <select id="province" name="province" className="select" defaultValue={cp?.province || ''}>
                  <option value="">ไม่ระบุ</option>
                  {PROVINCES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="birth_year">ปีเกิด (ค.ศ.)</label>
                <input id="birth_year" name="birth_year" className="input" inputMode="numeric" defaultValue={cp?.birth_year || ''} />
              </div>
            </div>
            <label className="check">
              <input type="checkbox" name="show_age" defaultChecked={Boolean(cp?.show_age)} />
              <span>แสดงอายุให้บริษัทเห็น (ปิดไว้เป็นค่าเริ่มต้น บริษัทไม่เห็นวันเกิดเสมอ)</span>
            </label>
            <div className="field">
              <label htmlFor="skills">สกิล (คั่นด้วยจุลภาค)</label>
              <input id="skills" name="skills" className="input" defaultValue={(cp?.skills || []).join(', ')} placeholder="Content Writing, การวิจัยตลาด, Facebook Ads" />
            </div>
            <div className="field">
              <label htmlFor="tools">เครื่องมือที่ใช้เป็น</label>
              <input id="tools" name="tools" className="input" defaultValue={(cp?.tools || []).join(', ')} placeholder="Canva, CapCut, Google Analytics" />
            </div>
            <div className="field">
              <label htmlFor="languages">ภาษาและคะแนนสอบ (บรรทัดละ 1 รายการ: ชื่อ | รายละเอียด)</label>
              <textarea id="languages" name="languages" className="textarea" defaultValue={lines(cp?.languages, 'name')} placeholder="TOEIC | 785 คะแนน" />
            </div>
            <div className="field">
              <label htmlFor="certificates">ใบรับรอง</label>
              <textarea id="certificates" name="certificates" className="textarea" defaultValue={lines(cp?.certificates, 'name')} placeholder="Google Digital Garage | 2569" />
            </div>
            <div className="field">
              <label htmlFor="projects">ผลงานและโปรเจกต์</label>
              <textarea id="projects" name="projects" className="textarea" defaultValue={lines(cp?.projects, 'title')} placeholder="แคมเปญ TikTok ให้ร้านค้าชุมชน | ยอดเข้าถึง 50,000 ครั้ง (ยืนยันโดยอาจารย์)" />
            </div>
            <div className="field">
              <label htmlFor="experiences">ประสบการณ์ ฝึกงาน กิจกรรม</label>
              <textarea id="experiences" name="experiences" className="textarea" defaultValue={lines(cp?.experiences, 'title')} placeholder="ฝึกงานการตลาดออนไลน์ 2 เดือน | บริษัท ..." />
            </div>
            <fieldset>
              <legend>งานที่สนใจ</legend>
              <div className="chips">
                {Object.entries(JOB_TYPE).map(([k, v]) => (
                  <label key={k} className="chip">
                    <input type="checkbox" name="pref_job_types" value={k} defaultChecked={prefTypes.includes(k)} /> {v}
                  </label>
                ))}
              </div>
              <span className="label">จังหวัดที่สะดวกทำงาน</span>
              <div className="chips">
                {PROVINCES.slice(0, 10).map((p) => (
                  <label key={p} className="chip">
                    <input type="checkbox" name="pref_provinces" value={p} defaultChecked={prefProvinces.includes(p)} /> {p}
                  </label>
                ))}
              </div>
              <div className="field">
                <label htmlFor="expected_salary">ค่าตอบแทนที่คาดหวังต่อเดือน (บาท)</label>
                <input id="expected_salary" name="expected_salary" className="input" inputMode="numeric" defaultValue={cp?.expected_salary || ''} />
              </div>
            </fieldset>
            <SubmitButton>บันทึกโปรไฟล์</SubmitButton>
          </ActionForm>
        </div>

        <aside className="side">
          <section className="card">
            <h2>การศึกษา</h2>
            <p className="muted small">ป้ายวุฒิ 3 ระดับ: ยืนยันโดยสถาบัน (สถาบันพาร์ตเนอร์ยืนยันตรง) · ตรวจเอกสารแล้ว (ทีมงานตรวจใบรับรองผล) · ยังไม่ยืนยัน</p>
            {((edus || []) as Edu[]).map((e) => (
              <div key={e.id} className="card soft tight">
                <div className="row-between">
                  <span className="strong">{e.institution_name}</span>
                  <VerifyBadge level={e.verify_level} />
                </div>
                <span className="small muted">
                  {LEVELS[e.level]} {e.major || ''} {e.year_label ? `· ${e.year_label}` : ''} {e.gpa ? `· GPA ${e.gpa}` : ''}
                </span>
                {e.verify_note ? <span className="small">หมายเหตุ: {e.verify_note}</span> : null}
                {e.verify_level === 'none' ? (
                  <ActionForm action={requestVerifyAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <FileUpload bucket="education-docs" prefix={`${user.id}/${e.id}`} name="doc_path" label="แนบใบรับรองผลการศึกษา (PDF/รูป ไม่เกิน 10 MB)" />
                    <SubmitButton className="btn small outline">ส่งให้ทีมงานตรวจ</SubmitButton>
                  </ActionForm>
                ) : null}
                <details className="disclosure">
                  <summary>แก้ไข</summary>
                  <ActionForm action={saveEducationAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <EducationFields e={e} institutions={institutions} />
                    {e.verify_level === 'doc' || e.verify_level === 'inst' ? (
                      <span className="hint">แก้ข้อมูลหลักหลังยืนยันแล้ว ป้ายจะกลับเป็น &ldquo;ยังไม่ยืนยัน&rdquo; และต้องยืนยันใหม่</span>
                    ) : null}
                    <SubmitButton className="btn small">บันทึก</SubmitButton>
                  </ActionForm>
                  <form action={deleteEducationAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmit className="btn small ghost">ลบรายการนี้</ConfirmSubmit>
                  </form>
                </details>
              </div>
            ))}
            <details className="disclosure" open={!(edus || []).length}>
              <summary>+ เพิ่มการศึกษา</summary>
              <ActionForm action={saveEducationAction} resetOnSuccess>
                <EducationFields institutions={institutions} />
                <SubmitButton className="btn small">เพิ่ม</SubmitButton>
              </ActionForm>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
