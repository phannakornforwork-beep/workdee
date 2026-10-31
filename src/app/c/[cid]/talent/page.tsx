import Link from 'next/link';
import type { Metadata } from 'next';
import { can, requireCompany } from '@/lib/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Alert, Badge, Empty, NoAccess } from '@/components/ui';
import { inviteTalentAction } from '@/lib/actions/talent';
import { JOB_TYPE, PROVINCES } from '@/lib/format';

export const metadata: Metadata = { title: 'ค้นหาผู้หางาน' };

const LEVEL: Record<string, string> = {
  vocational: 'ปวช.', high_vocational: 'ปวส.', bachelor: 'ปริญญาตรี', master: 'ปริญญาโท', doctorate: 'ปริญญาเอก', other: 'อื่นๆ'
};

type Talent = {
  handle: string;
  headline: string;
  province: string | null;
  skills: string[];
  tools: string[];
  pref_job_types: string[];
  education: { level: string; major: string | null; status: string; verified: boolean } | null;
  results: { skill: string; title: string; total: number }[];
  applied: boolean;
  invited_jobs: string[];
};

export default async function TalentPage({
  params,
  searchParams
}: {
  params: Promise<{ cid: string }>;
  searchParams: Promise<{ q?: string; province?: string }>;
}) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase, access } = await requireCompany(cid);
  if (!can(access, 'screen')) return <NoAccess title="ค้นหาผู้หางาน" need="ดูแลผู้สมัคร" cid={cid} />;
  if (access.company.status !== 'verified')
    return (
      <>
        <h1>ค้นหาผู้หางาน</h1>
        <Empty>ค้นหาผู้หางานได้หลังบริษัทได้รับการยืนยัน</Empty>
      </>
    );

  const q = (sp.q || '').trim();
  const province = (sp.province || '').trim();
  const [{ data, error }, { data: jobs }] = await Promise.all([
    supabase.rpc('search_talent', { p_company: cid, p_query: q || null, p_province: province || null }),
    supabase.from('jobs').select('id, title').eq('company_id', cid).eq('status', 'open').order('created_at', { ascending: false })
  ]);
  const rows = (data || []) as Talent[];
  const openJobs = (jobs || []) as { id: string; title: string }[];
  const jobTitle = new Map(openJobs.map((j) => [j.id, j.title]));

  return (
    <>
      <div className="stack-sm">
        <h1>ค้นหาผู้หางาน</h1>
        <p className="muted">
          เห็นเฉพาะคนที่เปิดให้บริษัทค้นหาได้ ไม่เห็นชื่อหรือช่องทางติดต่อ ถ้าสนใจ เชิญให้สมัครประกาศของคุณ แล้วจะเห็นโปรไฟล์เต็มเมื่อเขากดสมัคร
        </p>
      </div>

      <form className="card talent-filters" method="get">
        <div className="field">
          <label htmlFor="q">ทักษะหรือคำค้น</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="เช่น Content Writing, Excel, TikTok" />
        </div>
        <div className="field">
          <label htmlFor="province">จังหวัด</label>
          <select id="province" name="province" className="select" defaultValue={province}>
            <option value="">ทุกจังหวัด</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">
          ค้นหา
        </button>
      </form>

      {error ? <Alert tone="error">{error.message}</Alert> : null}
      {openJobs.length === 0 ? (
        <Alert tone="warn">
          ยังไม่มีประกาศที่เปิดรับ เชิญผู้หางานได้หลัง <Link href={`/c/${cid}/jobs/new`}>ลงประกาศ</Link>
        </Alert>
      ) : null}

      <p className="small muted">
        พบ {rows.length} คน{q || province ? ' ตามตัวกรอง' : ''} · เรียงจากผลโจทย์ที่ผ่านเกณฑ์มากที่สุด
      </p>
      {rows.length === 0 ? <Empty>ยังไม่มีผู้หางานที่ตรงกับตัวกรอง ลองเปลี่ยนคำค้น</Empty> : null}

      <div className="talent-grid">
        {rows.map((t) => {
          const invitable = openJobs.filter((j) => !t.invited_jobs.includes(j.id));
          return (
            <article key={t.handle} className="card stack-sm">
              <div className="row-between">
                <span className="small muted">ผู้หางาน #{t.handle.slice(0, 6).toUpperCase()}</span>
                {t.applied ? <Badge tone="teal">สมัครกับบริษัทคุณแล้ว</Badge> : null}
              </div>
              <h2 className="talent-headline">{t.headline || 'ยังไม่ได้เขียนแนะนำตัว'}</h2>
              <p className="small muted">
                {[t.province, t.education ? `${LEVEL[t.education.level] || ''}${t.education.major ? ` ${t.education.major}` : ''}${t.education.status === 'studying' ? ' (กำลังศึกษา)' : ''}` : null]
                  .filter(Boolean)
                  .join(' · ')}
                {t.education?.verified ? (
                  <>
                    {' '}
                    <Badge tone="blue">ยืนยันวุฒิแล้ว</Badge>
                  </>
                ) : null}
              </p>
              {t.results.length ? (
                <div className="chips">
                  {t.results.map((r) => (
                    <Badge key={r.skill} tone="dark">
                      ผลโจทย์ {r.title} · {r.total}/100
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="chips">
                {[...t.skills, ...t.tools].slice(0, 10).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              {t.pref_job_types.length ? (
                <p className="tiny muted">สนใจ: {t.pref_job_types.map((x) => JOB_TYPE[x] || x).join(', ')}</p>
              ) : null}
              {t.invited_jobs.length ? (
                <p className="tiny muted">เชิญแล้ว: {t.invited_jobs.map((id) => jobTitle.get(id) || 'ประกาศที่ปิดแล้ว').join(', ')}</p>
              ) : null}
              {invitable.length && !t.applied ? (
                <details className="disclosure">
                  <summary>เชิญให้สมัคร</summary>
                  <ActionForm action={inviteTalentAction} className="stack-sm" resetOnSuccess>
                    <input type="hidden" name="company_id" value={cid} />
                    <input type="hidden" name="handle" value={t.handle} />
                    <div className="field">
                      <label htmlFor={`job-${t.handle}`}>ประกาศ</label>
                      <select id={`job-${t.handle}`} name="job_id" className="select" required defaultValue={invitable[0].id}>
                        {invitable.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`msg-${t.handle}`}>ข้อความถึงผู้หางาน (ไม่บังคับ)</label>
                      <textarea id={`msg-${t.handle}`} name="message" className="textarea" rows={2} maxLength={500} placeholder="เช่น เห็นผลโจทย์ด้านคอนเทนต์ของคุณแล้วสนใจมาก" />
                    </div>
                    <SubmitButton className="btn" pendingText="กำลังส่งคำเชิญ…">
                      ส่งคำเชิญ
                    </SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
