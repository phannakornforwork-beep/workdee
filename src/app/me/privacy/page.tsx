import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { savePrivacyAction } from '@/lib/actions/candidate';
import { thaiDate } from '@/lib/format';
import { DeleteAccount } from './DeleteAccount';

export const metadata: Metadata = { title: 'ความเป็นส่วนตัว' };

export default async function PrivacyPage() {
  const { supabase, user } = await requireUser('/me/privacy');
  const [{ data: cp }, { data: consents }, { data: spaces }, { data: blockers }] = await Promise.all([
    supabase.from('candidate_profiles').select('show_age, discoverable, hidden_company_ids').eq('user_id', user.id).maybeSingle(),
    supabase.from('consents').select('id, purpose, company_id, application_id, detail, granted_at, revoked_at').order('granted_at', { ascending: false }),
    supabase.rpc('my_spaces'),
    supabase.rpc('account_deletion_blockers')
  ]);
  const hidden: string[] = cp?.hidden_company_ids || [];
  const myCompanies = (spaces || []) as { company_id: string; company_name: string }[];
  return (
    <>
      <div className="stack-sm">
        <h1>ความเป็นส่วนตัวและข้อมูลของฉัน</h1>
        <p className="muted">คุณเป็นเจ้าของข้อมูล ดู แก้ ถอนสิทธิ์ ดาวน์โหลด หรือลบได้ตลอด</p>
      </div>
      <div className="split">
        <div className="main">
          <section className="card">
            <h2>ใครเห็นโปรไฟล์ของฉัน</h2>
            <p className="small muted">บริษัทเห็นสำเนาโปรไฟล์เฉพาะใบสมัครที่คุณส่ง ถอนสิทธิ์ได้ในหน้าใบสมัครแต่ละใบ</p>
            {((consents || []) as { id: string; detail: { job_title?: string; share_plan?: boolean }; application_id: string | null; granted_at: string; revoked_at: string | null }[]).map((c) => (
              <div key={c.id} className="row-between small">
                <span>
                  {c.detail?.job_title || 'ใบสมัคร'} {c.detail?.share_plan ? '· รวมแผนอาชีพ' : ''}
                  <span className="muted"> · ให้สิทธิ์ {thaiDate(c.granted_at)}</span>
                </span>
                {c.revoked_at ? (
                  <span className="muted">ถอนแล้ว {thaiDate(c.revoked_at)}</span>
                ) : c.application_id ? (
                  <Link href={`/me/applications/${c.application_id}`}>จัดการ</Link>
                ) : null}
              </div>
            ))}
            {(consents || []).length === 0 ? <p className="muted small">ยังไม่มีบริษัทใดเห็นโปรไฟล์ของคุณ</p> : null}
          </section>
          <ActionForm action={savePrivacyAction} className="card">
            <h2>การตั้งค่า</h2>
            <label className="check">
              <input type="checkbox" name="show_age" defaultChecked={Boolean(cp?.show_age)} />
              <span>แสดงอายุให้บริษัทที่ฉันสมัครเห็น</span>
            </label>
            <label className="check">
              <input type="checkbox" name="discoverable" defaultChecked={Boolean(cp?.discoverable)} />
              <span>ให้บริษัทค้นเจอแบบไม่เห็นชื่อ เพื่อส่งคำเชิญสมัคร (บริษัทที่ฉันทำงานอยู่จะค้นไม่เจอเสมอ)</span>
            </label>
            {myCompanies.length ? (
              <fieldset>
                <legend>ซ่อนจากบริษัทเหล่านี้เพิ่มเติม</legend>
                {myCompanies.map((c) => (
                  <label key={c.company_id} className="check">
                    <input type="checkbox" name="hidden_company_ids" value={c.company_id} defaultChecked={hidden.includes(c.company_id)} />
                    <span>{c.company_name}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <SubmitButton className="btn small">บันทึก</SubmitButton>
          </ActionForm>
        </div>
        <aside className="side">
          <section className="card">
            <h2>ดาวน์โหลดข้อมูลของฉัน</h2>
            <p className="small muted">ไฟล์ JSON รวมโปรไฟล์ การศึกษา แผนอาชีพ ใบสมัคร คะแนน และการให้สิทธิ์ทั้งหมด</p>
            <a className="btn outline small" href="/api/me/export">
              ดาวน์โหลด
            </a>
          </section>
          <DeleteAccount blockers={(blockers || []) as string[]} />
        </aside>
      </div>
    </>
  );
}
