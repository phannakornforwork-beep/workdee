import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Alert, Badge, Empty, Logo } from '@/components/ui';
import { reviewCompanyAction, reviewEducationAction, setCompanyStatusAction } from '@/lib/actions/admin';
import { relative, thaiDateTime } from '@/lib/format';
import { ThemeToggle } from '@/components/ThemeToggle';

export const metadata: Metadata = { title: 'ผู้ดูแลระบบ', robots: { index: false } };

type Queue = {
  companies: { id: string; name: string; reg_no: string; size_range: string | null; industry: string | null; province: string | null; cert_path: string | null; status: string; review_note: string | null; created_at: string; owner_email: string | null }[];
  educations: { id: string; user_id: string; full_name: string | null; institution_name: string; level: string; major: string | null; status: string; year_label: string | null; gpa: number | null; doc_path: string | null; updated_at: string }[];
  stats: { users: number; companies_verified: number; jobs_open: number; applications_30d: number; auto_closed_30d: number };
};

const CO_STATUS: Record<string, string> = { verified: 'ยืนยันแล้ว', suspended: 'ถูกระงับ', rejected: 'ไม่ผ่าน ต้องส่งใหม่', pending: 'รอตรวจ' };
const LEVEL: Record<string, string> = { vocational: 'ปวช.', high_vocational: 'ปวส.', bachelor: 'ปริญญาตรี', master: 'ปริญญาโท', doctorate: 'ปริญญาเอก', other: 'อื่น ๆ' };

function regNo(r: string) {
  return r.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, '$1-$2-$3-$4-$5');
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser('/admin');
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (!isAdmin) {
    return (
      <main className="container page">
        <Logo href="/spaces" />
        <Alert tone="error">หน้านี้สำหรับผู้ดูแลระบบ WorkDee เท่านั้น</Alert>
        <Link href="/spaces">กลับไปเลือกพื้นที่</Link>
      </main>
    );
  }
  const { data } = await supabase.rpc('admin_queue');
  const q = data as Queue;
  // ลิงก์ดูเอกสารแบบหมดอายุใน 10 นาที (สิทธิ์อ่านตาม policy ของ storage)
  const certUrls = await Promise.all(
    q.companies.map(async (c) => (c.cert_path ? (await supabase.storage.from('company-docs').createSignedUrl(c.cert_path, 600)).data?.signedUrl || null : null))
  );
  const docUrls = await Promise.all(
    q.educations.map(async (e) => (e.doc_path ? (await supabase.storage.from('education-docs').createSignedUrl(e.doc_path, 600)).data?.signedUrl || null : null))
  );
  let search = supabase.from('companies').select('id, name, reg_no, status, review_note, created_at').neq('status', 'pending').order('created_at', { ascending: false }).limit(30);
  if (sp.q) search = search.or(`name.ilike.%${sp.q.replace(/[%,()]/g, ' ')}%,reg_no.eq.${sp.q.replace(/\D/g, '') || '0'}`);
  const { data: companies } = await search;

  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo href="/spaces" />
          <span className="space-pill">ผู้ดูแลระบบ</span>
          <span className="right" />
          <ThemeToggle />
          <Link href="/spaces" className="tlink">
            ออกจากหน้าผู้ดูแล
          </Link>
        </div>
      </header>
      <main className="container page">
        <h1>ผู้ดูแลระบบ</h1>
        <div className="grid-sm">
          {[
            ['ผู้ใช้ทั้งหมด', q.stats.users],
            ['บริษัทที่ยืนยันแล้ว', q.stats.companies_verified],
            ['ประกาศที่เปิดอยู่', q.stats.jobs_open],
            ['ใบสมัคร 30 วัน', q.stats.applications_30d],
            ['ระบบปิดแทนบริษัท 30 วัน', q.stats.auto_closed_30d]
          ].map(([l, v]) => (
            <div key={l as string} className="card tight">
              <div className="stat">
                <span className="label">{l}</span>
                <span className="value">{v as number}</span>
              </div>
            </div>
          ))}
        </div>

        <section className="stack">
          <h2>บริษัทรอยืนยัน ({q.companies.length})</h2>
          {q.companies.length === 0 ? <Empty>ไม่มีบริษัทรอตรวจ</Empty> : null}
          {q.companies.map((c, i) => (
            <div key={c.id} className="card">
              <div className="row-between">
                <div className="stack-sm">
                  <span className="strong">{c.name}</span>
                  <span className="small muted">
                    เลขทะเบียน {regNo(c.reg_no)} · {c.industry || '-'} · {c.province || '-'} · {c.size_range || '-'} คน · สมัคร {relative(c.created_at)}
                  </span>
                  <span className="small muted">เจ้าของ: {c.owner_email || '-'}</span>
                </div>
                {certUrls[i] ? (
                  <a href={certUrls[i] as string} target="_blank" rel="noreferrer" className="btn small outline">
                    เปิดหนังสือรับรอง
                  </a>
                ) : (
                  <Badge tone="gray">ยังไม่แนบเอกสาร</Badge>
                )}
              </div>
              <p className="tiny muted">
                ตรวจ: ชื่อและเลขทะเบียนตรงกับหนังสือรับรอง · ออกไม่เกิน 6 เดือน · สถานะนิติบุคคลยังดำเนินกิจการ (ตรวจซ้ำที่ระบบของกรมพัฒนาธุรกิจการค้าได้)
              </p>
              {c.cert_path ? (
                <ActionForm action={reviewCompanyAction}>
                  <input type="hidden" name="company_id" value={c.id} />
                  <input name="note" className="input" placeholder="หมายเหตุถึงบริษัท (ต้องระบุถ้าไม่ผ่าน)" aria-label="หมายเหตุ" />
                  <div className="row">
                    <SubmitButton name="decision" value="approve" className="btn small">
                      ยืนยันบริษัท
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" className="btn small ghost">
                      ไม่ผ่าน
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </div>
          ))}
        </section>

        <section className="stack">
          <h2>เอกสารวุฒิรอตรวจ ({q.educations.length})</h2>
          {q.educations.length === 0 ? <Empty>ไม่มีเอกสารรอตรวจ</Empty> : null}
          {q.educations.map((e, i) => (
            <div key={e.id} className="card">
              <div className="row-between">
                <div className="stack-sm">
                  <span className="strong">{e.full_name || 'ผู้ใช้'}</span>
                  <span className="small muted">
                    {LEVEL[e.level] || e.level} · {e.institution_name} · {e.major || '-'} · {e.status === 'graduated' ? 'จบแล้ว' : 'กำลังศึกษา'} {e.year_label || ''}
                    {e.gpa !== null ? ` · GPA ${e.gpa}` : ''}
                  </span>
                  <span className="tiny muted">ส่งเมื่อ {thaiDateTime(e.updated_at)}</span>
                </div>
                {docUrls[i] ? (
                  <a href={docUrls[i] as string} target="_blank" rel="noreferrer" className="btn small outline">
                    เปิดเอกสาร
                  </a>
                ) : null}
              </div>
              <ActionForm action={reviewEducationAction}>
                <input type="hidden" name="education_id" value={e.id} />
                <input name="note" className="input" placeholder="หมายเหตุถึงผู้ใช้ (ถ้าไม่ผ่าน บอกว่าต้องแก้อะไร)" aria-label="หมายเหตุ" />
                <div className="row">
                  <SubmitButton name="decision" value="approve" className="btn small">
                    ข้อมูลตรงกับเอกสาร
                  </SubmitButton>
                  <SubmitButton name="decision" value="reject" className="btn small ghost">
                    ไม่ผ่าน
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          ))}
        </section>

        <section className="stack">
          <div className="row-between">
            <h2>บริษัททั้งหมด</h2>
            <form className="row" action="/admin">
              <input name="q" className="input" defaultValue={sp.q || ''} placeholder="ชื่อหรือเลขทะเบียน" aria-label="ค้นหาบริษัท" style={{ width: 'auto', flex: '1 1 200px' }} />
              <button type="submit" className="btn small outline">
                ค้นหา
              </button>
            </form>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>บริษัท</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {((companies || []) as { id: string; name: string; reg_no: string; status: string; review_note: string | null }[]).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="small strong">{c.name}</div>
                      <div className="tiny muted">{regNo(c.reg_no)}</div>
                    </td>
                    <td>
                      <Badge tone={c.status === 'verified' ? 'teal' : 'red'}>{CO_STATUS[c.status] || c.status}</Badge>
                      {c.review_note ? <div className="tiny muted">{c.review_note}</div> : null}
                    </td>
                    <td>
                      <ActionForm action={setCompanyStatusAction} className="row">
                        <input type="hidden" name="company_id" value={c.id} />
                        {c.status === 'verified' ? (
                          <>
                            <input type="hidden" name="status" value="suspended" />
                            <input name="note" className="input" placeholder="เหตุผลที่ระงับ" aria-label="เหตุผล" style={{ minHeight: 36 }} />
                            <SubmitButton className="btn small ghost">ระงับ</SubmitButton>
                          </>
                        ) : c.status === 'suspended' ? (
                          <>
                            <input type="hidden" name="status" value="verified" />
                            <SubmitButton className="btn small ghost">คืนสถานะยืนยัน</SubmitButton>
                          </>
                        ) : (
                          <span className="tiny muted">รอบริษัทส่งเอกสารใหม่</span>
                        )}
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
