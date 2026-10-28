import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCompany, can } from '@/lib/auth';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { FileUpload } from '@/components/FileUpload';
import { Alert, Badge } from '@/components/ui';
import { setCertificateAction, setRuleAction, updateCompanyAction } from '@/lib/actions/company';
import { deleteTemplateAction, saveTemplateFormAction } from '@/lib/actions/hiring';
import { PROVINCES, RULES, thaiDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'ตั้งค่าบริษัท' };

type Company = {
  id: string; name: string; reg_no: string; size_range: string | null; industry: string | null; province: string | null; about: string;
  website: string | null; status: string; cert_path: string | null; review_note: string | null; reviewed_at: string | null;
  quiet_start: string; quiet_end: string; plan: string; created_by: string | null;
};
type Tpl = { id: string; kind: string; label: string; body: string; is_default: boolean; created_by: string | null };

const TPL_KIND: Record<string, string> = { reject: 'แจ้งผลไม่ผ่าน', invite_challenge: 'เชิญทำโจทย์', invite_interview: 'เชิญสัมภาษณ์', message: 'ข้อความทั่วไป' };
const INDUSTRIES = ['อาหารและเครื่องดื่ม', 'ค้าปลีกและอีคอมเมิร์ซ', 'อีเวนต์และการตลาด', 'เทคโนโลยี', 'บริการ', 'การผลิต', 'อื่นๆ'];

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ new?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase, user, access } = await requireCompany(cid);
  const [{ data: company }, { data: rules }, { data: templates }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', cid).single(),
    supabase.from('approval_rules').select('rule, enabled').eq('company_id', cid),
    supabase.from('message_templates').select('id, kind, label, body, is_default, created_by').eq('company_id', cid).order('kind').order('created_at')
  ]);
  const c = company as Company;
  const ruleMap = new Map(((rules || []) as { rule: string; enabled: boolean }[]).map((r) => [r.rule, r.enabled]));
  const canEditCompany = access.is_owner || (access.perms.members || 0) === 2;
  const canTemplates = can(access, 'screen');
  const tpls = (templates || []) as Tpl[];

  return (
    <>
      <div className="stack-sm">
        <h1>ตั้งค่าบริษัท</h1>
        <p className="muted">{c.name}</p>
      </div>

      {sp.new ? (
        <Alert tone="success">
          สร้างพื้นที่บริษัทแล้ว ขั้นต่อไป: แนบหนังสือรับรองบริษัทเพื่อยืนยันตัวตน ระหว่างรอตรวจ ร่างประกาศงานและชวนทีมเข้ามาได้เลย{' '}
          <Link href={`/c/${cid}/team?tab=invite`}>ชวนทีม</Link>
        </Alert>
      ) : null}

      <div className="split">
        <div className="main">
          <section className="card" id="verify">
            <div className="row-between">
              <h2>ยืนยันบริษัท</h2>
              {c.status === 'verified' ? (
                <Badge tone="teal">ยืนยันแล้ว</Badge>
              ) : c.status === 'rejected' ? (
                <Badge tone="red">ไม่ผ่าน ต้องส่งใหม่</Badge>
              ) : c.status === 'suspended' ? (
                <Badge tone="red">ถูกระงับ</Badge>
              ) : c.cert_path ? (
                <Badge tone="orange">รอตรวจเอกสาร</Badge>
              ) : (
                <Badge tone="gray">ยังไม่ส่งเอกสาร</Badge>
              )}
            </div>
            <p className="small muted">
              ผู้สมัครจะเห็นป้าย &ldquo;ยืนยันบริษัทแล้ว&rdquo; และประกาศงานเผยแพร่ได้หลังยืนยัน เราตรวจชื่อและเลขทะเบียน {c.reg_no.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, '$1-$2-$3-$4-$5')} กับหนังสือรับรองที่ออกไม่เกิน 6 เดือน
            </p>
            {c.review_note && c.status !== 'verified' ? <Alert tone="warn">หมายเหตุจากทีมตรวจ: {c.review_note}</Alert> : null}
            {c.status === 'suspended' ? <Alert tone="error">บัญชีบริษัทถูกระงับชั่วคราว ประกาศถูกซ่อนจากผู้สมัคร ติดต่อทีมงาน WorkDee</Alert> : null}
            {c.status !== 'verified' && c.status !== 'suspended' && access.is_owner ? (
              <ActionForm action={setCertificateAction}>
                <input type="hidden" name="company_id" value={cid} />
                <FileUpload bucket="company-docs" prefix={cid} name="cert_path" label={c.cert_path ? 'ส่งไฟล์ใหม่ (ถ้าต้องการแก้)' : 'หนังสือรับรองบริษัท (PDF หรือรูปถ่าย)'} />
                <SubmitButton>{c.cert_path ? 'ส่งเอกสารใหม่' : 'ส่งตรวจ'}</SubmitButton>
              </ActionForm>
            ) : null}
            {c.status !== 'verified' && !access.is_owner ? <p className="small">เจ้าของกิจการเป็นคนส่งเอกสารยืนยัน</p> : null}
            {c.reviewed_at ? <span className="tiny muted">ตรวจล่าสุด {thaiDateTime(c.reviewed_at)}</span> : null}
          </section>

          {canEditCompany ? (
            <ActionForm action={updateCompanyAction} className="card">
              <h2>ข้อมูลที่ผู้สมัครเห็น</h2>
              <input type="hidden" name="company_id" value={cid} />
              <div className="field">
                <label htmlFor="about">เกี่ยวกับบริษัท</label>
                <textarea id="about" name="about" className="textarea" rows={5} defaultValue={c.about} maxLength={3000} placeholder="ทำอะไร ลูกค้าเป็นใคร ทีมทำงานแบบไหน เด็กจบใหม่จะได้เรียนรู้อะไร" />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="website">เว็บไซต์หรือเพจ</label>
                  <input id="website" name="website" className="input" defaultValue={c.website || ''} placeholder="https://" />
                </div>
                <div className="field">
                  <label htmlFor="province">จังหวัด</label>
                  <select id="province" name="province" className="select" defaultValue={c.province || ''}>
                    <option value="">ไม่ระบุ</option>
                    {PROVINCES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="industry">อุตสาหกรรม</label>
                  <select id="industry" name="industry" className="select" defaultValue={c.industry || ''}>
                    <option value="">ไม่ระบุ</option>
                    {INDUSTRIES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="size_range">ขนาด</label>
                  <select id="size_range" name="size_range" className="select" defaultValue={c.size_range || ''}>
                    <option value="1-19">1–19 คน</option>
                    <option value="20-49">20–49 คน</option>
                    <option value="50-199">50–199 คน</option>
                    <option value="200+">200 คนขึ้นไป</option>
                  </select>
                </div>
              </div>
              <SubmitButton>บันทึก</SubmitButton>
            </ActionForm>
          ) : null}

          {canEditCompany ? (
            <ActionForm action={updateCompanyAction} className="card">
              <h2>เวลางานและช่วงเวลาเงียบ</h2>
              <p className="small muted">
                นอกช่วงนี้ แชตและงานยังเข้าระบบตามปกติ แต่ LINE/อีเมลจะรอส่งตอนเริ่มงาน ยกเว้นเรื่องด่วนกับคนที่ยินยอมไว้เอง
                (ตามแนวทางสิทธิปฏิเสธการติดต่อนอกเวลางาน) ผู้สมัครไม่ได้รับผลกระทบจากช่วงนี้
              </p>
              <input type="hidden" name="company_id" value={cid} />
              <div className="form-row">
                <div className="field">
                  <label htmlFor="quiet_end">เริ่มงาน</label>
                  <input id="quiet_end" name="quiet_end" type="time" className="input" defaultValue={c.quiet_end.slice(0, 5)} required />
                </div>
                <div className="field">
                  <label htmlFor="quiet_start">เลิกงาน</label>
                  <input id="quiet_start" name="quiet_start" type="time" className="input" defaultValue={c.quiet_start.slice(0, 5)} required />
                </div>
              </div>
              <SubmitButton className="btn outline">บันทึกเวลา</SubmitButton>
            </ActionForm>
          ) : null}

          {access.is_owner ? (
            <section className="card">
              <h2>กฎการอนุมัติ</h2>
              <p className="small muted">เปิดเฉพาะที่จำเป็น ยิ่งน้อยยิ่งเร็ว ทุกการเปลี่ยนถูกบันทึกในประวัติ</p>
              <div className="list">
                {RULES.map((r) => {
                  const on = ruleMap.get(r.key) ?? false;
                  return (
                    <form key={r.key} action={setRuleAction} className="item row-between">
                      <input type="hidden" name="company_id" value={cid} />
                      <input type="hidden" name="rule" value={r.key} />
                      <input type="hidden" name="enabled" value={on ? 'false' : 'true'} />
                      <span className="small" style={{ flex: 1 }}>
                        {r.label}
                      </span>
                      <span className="row">
                        <Badge tone={on ? 'teal' : 'gray'}>{on ? 'เปิด' : 'ปิด'}</Badge>
                        <SubmitButton className="btn small ghost" pendingText="…">
                          {on ? 'ปิด' : 'เปิด'}
                        </SubmitButton>
                      </span>
                    </form>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="card" id="templates">
            <h2>ข้อความสำเร็จรูป</h2>
            <p className="small muted">ใช้ตอนตอบผู้สมัครหลายคนพร้อมกัน ใส่ {'{ชื่อ}'} {'{ตำแหน่ง}'} {'{บริษัท}'} แล้วระบบเติมให้แต่ละคน</p>
            {Object.entries(TPL_KIND).map(([kind, label]) => {
              const list = tpls.filter((t) => t.kind === kind);
              if (!list.length) return null;
              return (
                <div key={kind} className="stack-sm">
                  <h3 className="small">{label}</h3>
                  {list.map((t) => (
                    <div key={t.id} className="card soft tight">
                      <div className="row-between">
                        <span className="small strong">
                          {t.label} {t.is_default ? <Badge tone="gray">ค่าเริ่มต้น</Badge> : null}
                        </span>
                        {(t.created_by === user.id || access.is_owner) && !t.is_default ? (
                          <form action={deleteTemplateAction}>
                            <input type="hidden" name="company_id" value={cid} />
                            <input type="hidden" name="template_id" value={t.id} />
                            <ConfirmSubmit className="btn small link">ลบ</ConfirmSubmit>
                          </form>
                        ) : null}
                      </div>
                      <span className="small prewrap">{t.body}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {canTemplates ? (
              <details className="disclosure">
                <summary>+ เพิ่มข้อความ</summary>
                <ActionForm action={saveTemplateFormAction} resetOnSuccess>
                  <input type="hidden" name="company_id" value={cid} />
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor="t_kind">ใช้กับ</label>
                      <select id="t_kind" name="kind" className="select">
                        {Object.entries(TPL_KIND).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="t_label">ชื่อเรียก</label>
                      <input id="t_label" name="label" className="input" maxLength={80} required />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="t_body">ข้อความ</label>
                    <textarea id="t_body" name="body" className="textarea" rows={4} maxLength={3000} required />
                  </div>
                  <SubmitButton className="btn small">บันทึก</SubmitButton>
                </ActionForm>
              </details>
            ) : null}
          </section>
        </div>

        <aside className="side">
          <section className="card">
            <h2>แพ็กเกจ</h2>
            {access.is_owner ? (
              <>
                <p className="small">ช่วงนำร่อง: ใช้ได้ทุกฟีเจอร์โดยไม่มีค่าใช้จ่าย</p>
                <p className="tiny muted">ระบบชำระเงินจะเปิดหลังจบช่วงนำร่อง และจะแจ้งล่วงหน้าอย่างน้อย 30 วัน</p>
              </>
            ) : (
              <p className="small muted">เรื่องแพ็กเกจและการชำระเงินเป็นของเจ้าของกิจการ</p>
            )}
          </section>
          <section className="card">
            <h2>ลัด</h2>
            <div className="stack-sm small">
              <Link href={`/c/${cid}/team?tab=positions`}>ตำแหน่งและสิทธิ์</Link>
              <Link href={`/c/${cid}/team?tab=invite`}>เชิญคนเข้าทีม</Link>
              <Link href={`/c/${cid}/notifications`}>การแจ้งเตือนของฉัน</Link>
              <Link href={`/c/${cid}/team?tab=log`}>ประวัติการเปลี่ยนแปลง</Link>
              <Link href={`/c/${cid}/help`}>คู่มือและคำถามที่พบบ่อย</Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
