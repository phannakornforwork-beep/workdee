import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCompany } from '@/lib/auth';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { Alert, Badge, Empty } from '@/components/ui';
import {
  applyTemplateAction, assignMemberAction, cancelApprovalAction, createInviteAction, createPositionAction, decideApprovalAction,
  deletePositionAction, importInvitesAction, leaveCompanyAction, removeMemberAction, revokeInviteAction, saveGrantsAction
} from '@/lib/actions/company';
import { LEVEL, PERMS, relative, thaiDate, thaiDateTime } from '@/lib/format';
import { SITE_URL } from '@/lib/env';
import type { Position } from '@/lib/types';

export const metadata: Metadata = { title: 'ทีมและตำแหน่ง' };

type Overview = {
  me: { position_id: string; is_owner: boolean; perms: Record<string, number> };
  positions: Position[];
  invites: { id: string; code: string; email: string | null; position_title: string; expires_at: string; uses: number; max_uses: number; revoked: boolean }[] | null;
  rules: Record<string, boolean>;
  approvals: {
    id: string; kind: string; title: string; status: string; requested_by_name: string; approver_title: string | null; created_at: string;
    decided_by_name: string | null; decided_at: string | null; decision_note: string | null; escalated: boolean; can_decide: boolean; mine: boolean;
  }[];
};

const TABS: [string, string][] = [
  ['members', 'สมาชิก'],
  ['positions', 'ตำแหน่งและสิทธิ์'],
  ['invite', 'เชิญเข้าทีม'],
  ['approvals', 'การอนุมัติ'],
  ['log', 'ประวัติการเปลี่ยนแปลง']
];

const KIND: Record<string, string> = { job_post: 'ประกาศงาน', offer: 'ข้อเสนองาน', leave: 'การลา', reject_after_interview: 'ปฏิเสธหลังสัมภาษณ์' };

function ordered(positions: Position[]): Position[] {
  const kids = new Map<string | null, Position[]>();
  for (const p of positions) kids.set(p.parent_id, [...(kids.get(p.parent_id) || []), p]);
  const out: Position[] = [];
  const walk = (parent: string | null) => {
    for (const p of kids.get(parent) || []) {
      out.push(p);
      walk(p.id);
    }
  };
  walk(null);
  return out;
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : 'members';
  const { supabase } = await requireCompany(cid);
  const { data } = await supabase.rpc('team_overview', { p_company: cid });
  const o = data as Overview;
  const positions = ordered(o.positions);
  const manageable = positions.filter((p) => p.can_manage);
  const canInviteTo = positions.filter((p) => p.can_manage || (o.me.is_owner && p.is_owner));
  const myLevel = (perm: string) => (o.me.is_owner ? 2 : o.me.perms[perm] || 0);
  const pendingForMe = o.approvals.filter((a) => a.status === 'pending' && a.can_decide).length;
  const { data: logs } =
    tab === 'log'
      ? await supabase.from('audit_log').select('id, actor_name, action, detail, created_at').eq('company_id', cid).order('created_at', { ascending: false }).limit(100)
      : { data: null };
  const canSeeLog = o.me.is_owner || (o.me.perms.members || 0) > 0;

  return (
    <>
      <div className="stack-sm">
        <h1>ทีมและตำแหน่ง</h1>
        <p className="muted">เจ้าของมอบสิทธิ์ให้หัวหน้าแผนก หัวหน้ามอบต่อให้ทีมได้ไม่เกินที่ตัวเองมี จัดการได้เฉพาะตำแหน่งที่อยู่ต่ำกว่า</p>
      </div>
      <Alert tone="privacy">ไม่มีใครในบริษัท รวมถึงเจ้าของ เห็นพื้นที่ส่วนตัวของพนักงาน เช่น การหางาน ใบสมัคร หรือแผนอาชีพ</Alert>
      <nav className="tabs" aria-label="หัวข้อ">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/c/${cid}/team?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>
            {l}
            {k === 'approvals' && pendingForMe ? ` (${pendingForMe})` : ''}
          </Link>
        ))}
      </nav>

      {tab === 'members' ? (
        <div className="stack">
          {positions.map((p) => (
            <section key={p.id} className="card tight" style={{ marginLeft: Math.min(p.depth, 3) * 14 }}>
              <div className="row-between">
                <div className="row">
                  <span className="strong">{p.title}</span>
                  {p.is_owner ? <Badge tone="dark">เจ้าของ</Badge> : null}
                  {p.is_department && !p.is_owner ? <Badge tone="blue">แผนก</Badge> : null}
                </div>
                <span className="small muted">{p.members.length} คน</span>
              </div>
              {p.members.map((m) => (
                <div key={m.user_id} className="row-between small">
                  <span>
                    {m.display_name || 'สมาชิก'} {m.is_me ? <Badge tone="teal">คุณ</Badge> : null}
                    <span className="muted"> · เข้าร่วม {thaiDate(m.joined_at)}</span>
                  </span>
                  {(p.can_manage || (o.me.is_owner && !m.is_me)) && !m.is_me ? (
                    <span className="row">
                      <ActionForm action={assignMemberAction} className="row">
                        <input type="hidden" name="company_id" value={cid} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <select name="position_id" className="select" style={{ minHeight: 36, padding: '4px 8px' }} defaultValue={p.id} aria-label={`ย้ายตำแหน่ง ${m.display_name}`}>
                          {canInviteTo.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.title}
                            </option>
                          ))}
                        </select>
                        <SubmitButton className="btn small ghost">ย้าย</SubmitButton>
                      </ActionForm>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="company_id" value={cid} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <ConfirmSubmit className="btn small ghost" confirmText="ยืนยันนำออก">
                          นำออก
                        </ConfirmSubmit>
                      </form>
                    </span>
                  ) : null}
                </div>
              ))}
            </section>
          ))}
          <p className="small muted">
            นำคนออกแล้ว สิทธิ์ในพื้นที่บริษัทหมดทันที งานที่มอบหมายไว้ยังอยู่ให้ส่งต่อ พื้นที่ส่วนตัวของเขาไม่ได้รับผลกระทบ
          </p>
          <ActionForm action={leaveCompanyAction} className="row">
            <input type="hidden" name="company_id" value={cid} />
            <ConfirmSubmit className="btn small ghost" confirmText="ยืนยันออกจากบริษัท">
              ออกจากบริษัทนี้
            </ConfirmSubmit>
          </ActionForm>
        </div>
      ) : null}

      {tab === 'positions' ? (
        <div className="stack">
          {o.me.is_owner && positions.length === 1 ? (
            <form action={applyTemplateAction} className="card soft tight row-between">
              <input type="hidden" name="company_id" value={cid} />
              <span className="small">ยังมีแค่ตำแหน่งเจ้าของ ใช้ผังตัวอย่างของ SME เป็นจุดเริ่มต้นได้</span>
              <SubmitButton className="btn small">ใช้ผังตัวอย่าง</SubmitButton>
            </form>
          ) : null}
          <div className="card soft tight">
            <p className="small">
              ระดับสิทธิ์: <strong>ไม่มี</strong> · <strong>แผนกตัวเอง</strong> (เฉพาะแผนกที่ตำแหน่งนั้นสังกัด) · <strong>ทั้งบริษัท</strong>
              <br />
              ลดสิทธิ์ของตำแหน่งใด ตำแหน่งที่อยู่ใต้ลงไปจะถูกลดตามอัตโนมัติ · การชำระเงินเป็นของเจ้าของเท่านั้น
            </p>
          </div>
          {positions.map((p) => (
            <section key={p.id} className="card tight" style={{ marginLeft: Math.min(p.depth, 3) * 14 }}>
              <div className="row-between">
                <div className="row">
                  <span className="strong">{p.title}</span>
                  {p.is_owner ? <Badge tone="dark">เจ้าของ</Badge> : null}
                  {p.is_department && !p.is_owner ? <Badge tone="blue">หัวหน้าแผนก</Badge> : null}
                </div>
                <span className="tiny muted">{p.members.map((m) => m.display_name).join(', ') || 'ยังไม่มีคน'}</span>
              </div>
              {p.is_owner ? (
                <span className="small muted">ทุกสิทธิ์ ทั้งบริษัท รวมการชำระเงิน</span>
              ) : (
                <div className="chips">
                  {PERMS.filter((x) => (p.grants[x.key] || 0) > 0).map((x) => (
                    <Badge key={x.key} tone={p.grants[x.key] === 2 ? 'teal' : 'gray'}>
                      {x.label}: {LEVEL[p.grants[x.key]]}
                    </Badge>
                  ))}
                  {PERMS.every((x) => !(p.grants[x.key] > 0)) ? <span className="small muted">ยังไม่มีสิทธิ์จัดการเรื่องใด เห็นงานของตัวเอง</span> : null}
                </div>
              )}
              {!p.is_owner && p.can_manage ? (
                <details className="disclosure">
                  <summary>แก้ชื่อและสิทธิ์</summary>
                  <ActionForm action={saveGrantsAction}>
                    <input type="hidden" name="company_id" value={cid} />
                    <input type="hidden" name="position_id" value={p.id} />
                    <input type="hidden" name="old_title" value={p.title} />
                    <input type="hidden" name="old_is_department" value={p.is_department ? 'on' : ''} />
                    <div className="field">
                      <label>ชื่อตำแหน่ง</label>
                      <input name="title" className="input" defaultValue={p.title} />
                    </div>
                    <label className="check">
                      <input type="checkbox" name="is_department" defaultChecked={p.is_department} />
                      <span>เป็นหัวหน้าแผนก (ตำแหน่งใต้ลงไปนับเป็นแผนกนี้)</span>
                    </label>
                    <div className="grid-sm">
                      {PERMS.filter((x) => x.key !== 'billing').map((perm) => {
                        const cur = p.grants[perm.key] || 0;
                        return (
                          <div key={perm.key} className="field">
                            <label title={perm.hint}>{perm.label}</label>
                            <input type="hidden" name={`old:${perm.key}`} value={cur} />
                            <select name={`grant:${perm.key}`} className="select" defaultValue={String(cur)}>
                              {[0, 1, 2].map((lv) => (
                                <option key={lv} value={lv} disabled={lv > myLevel(perm.key) && lv !== cur}>
                                  {LEVEL[lv]}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                    <SubmitButton className="btn small">บันทึกตำแหน่งนี้</SubmitButton>
                  </ActionForm>
                </details>
              ) : !p.is_owner ? (
                <span className="tiny muted">อยู่ระดับเดียวกันหรือสูงกว่าคุณ แก้ไม่ได้</span>
              ) : null}
              <div className="row">
                {p.can_add_child && myLevel('members') > 0 ? (
                  <details className="disclosure" style={{ flex: 1 }}>
                    <summary>+ ตำแหน่งย่อยใต้ {p.title}</summary>
                    <ActionForm action={createPositionAction} resetOnSuccess>
                      <input type="hidden" name="company_id" value={cid} />
                      <input type="hidden" name="parent_id" value={p.id} />
                      <div className="form-row">
                        <input name="title" className="input" placeholder="ชื่อตำแหน่ง เช่น หัวหน้าการตลาด" aria-label="ชื่อตำแหน่ง" required />
                        <label className="check">
                          <input type="checkbox" name="is_department" /> <span>เป็นหัวหน้าแผนก</span>
                        </label>
                      </div>
                      <div className="grid-sm">
                        {PERMS.filter((x) => x.key !== 'billing').map((perm) => (
                          <div key={perm.key} className="field">
                            <label>{perm.label}</label>
                            <select name={`grant:${perm.key}`} className="select" defaultValue={perm.key === 'team' ? '1' : '0'}>
                              {[0, 1, 2].map((lv) => (
                                <option key={lv} value={lv} disabled={lv > myLevel(perm.key)}>
                                  {LEVEL[lv]}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <SubmitButton className="btn small">สร้างตำแหน่ง</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
                {p.can_manage && p.members.length === 0 ? (
                  <form action={deletePositionAction}>
                    <input type="hidden" name="company_id" value={cid} />
                    <input type="hidden" name="position_id" value={p.id} />
                    <ConfirmSubmit className="btn small ghost">ลบตำแหน่ง</ConfirmSubmit>
                  </form>
                ) : null}
              </div>
            </section>
          ))}
          {manageable.length === 0 && !o.me.is_owner ? <p className="small muted">ตำแหน่งของคุณยังไม่มีสิทธิ์จัดการทีม</p> : null}
        </div>
      ) : null}

      {tab === 'invite' ? (
        canInviteTo.length === 0 ? (
          <Empty>ตำแหน่งของคุณยังเชิญคนเข้าทีมไม่ได้ ขอสิทธิ์ &ldquo;จัดการทีม&rdquo; จากหัวหน้า</Empty>
        ) : (
          <div className="split">
            <div className="main">
              <ActionForm action={createInviteAction} className="card">
                <h2>ส่งลิงก์ในกลุ่ม LINE ของบริษัท</h2>
                <p className="small muted">ลิงก์เดียวใช้ได้หลายคน ทุกคนกดเข้าร่วมเองด้วยบัญชีของตัวเอง</p>
                <input type="hidden" name="company_id" value={cid} />
                <div className="form-row">
                  <div className="field">
                    <label>เข้าตำแหน่ง</label>
                    <select name="position_id" className="select">
                      {canInviteTo.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>ใช้ได้ (วัน)</label>
                    <input name="days" className="input" inputMode="numeric" defaultValue="7" />
                  </div>
                  <div className="field">
                    <label>ใช้ได้กี่คน</label>
                    <input name="max_uses" className="input" inputMode="numeric" defaultValue="30" />
                  </div>
                </div>
                <SubmitButton>สร้างลิงก์เชิญ</SubmitButton>
              </ActionForm>
              <ActionForm action={createInviteAction} className="card" resetOnSuccess>
                <h2>เชิญทีละคนด้วยอีเมล</h2>
                <input type="hidden" name="company_id" value={cid} />
                <div className="form-row">
                  <div className="field">
                    <label>อีเมล</label>
                    <input name="email" type="email" className="input" required />
                  </div>
                  <div className="field">
                    <label>เข้าตำแหน่ง</label>
                    <select name="position_id" className="select">
                      {canInviteTo.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <SubmitButton className="btn outline">สร้างคำเชิญ</SubmitButton>
              </ActionForm>
              <ActionForm action={importInvitesAction} className="card">
                <h2>นำเข้าจาก Excel</h2>
                <p className="small muted">ใน Excel ให้คอลัมน์ A เป็นอีเมล คอลัมน์ B เป็นชื่อตำแหน่ง (ตรงกับในระบบ) แล้วบันทึกเป็น CSV UTF-8</p>
                <input type="hidden" name="company_id" value={cid} />
                <div className="field">
                  <label>ตำแหน่งเริ่มต้น (ถ้าแถวไหนไม่ระบุหรือไม่ตรง)</label>
                  <select name="position_id" className="select">
                    {canInviteTo.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <input name="csv" type="file" accept=".csv,text/csv" className="input" required aria-label="ไฟล์ CSV" />
                <SubmitButton className="btn outline">นำเข้า</SubmitButton>
              </ActionForm>
            </div>
            <aside className="side">
              <section className="card">
                <h2>คำเชิญล่าสุด</h2>
                {(o.invites || []).length === 0 ? <p className="small muted">ยังไม่มี</p> : null}
                {(o.invites || []).map((i) => (
                  <div key={i.id} className="stack-sm" style={{ borderTop: '1px solid var(--bg-2)', paddingTop: 8 }}>
                    <span className="small">
                      <strong>{i.email || 'ลิงก์กลุ่ม'}</strong> → {i.position_title}
                    </span>
                    <span className="tiny muted" style={{ wordBreak: 'break-all' }}>
                      {SITE_URL}/join/{i.code} · ใช้แล้ว {i.uses}/{i.max_uses} · {i.revoked ? 'ยกเลิกแล้ว' : `หมดอายุ ${thaiDate(i.expires_at)}`}
                    </span>
                    {!i.revoked && new Date(i.expires_at) > new Date() ? (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="company_id" value={cid} />
                        <input type="hidden" name="invite_id" value={i.id} />
                        <button type="submit" className="btn small link">
                          ยกเลิกลิงก์
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </section>
            </aside>
          </div>
        )
      ) : null}

      {tab === 'approvals' ? (
        <div className="stack">
          {o.approvals.length === 0 ? <Empty>ยังไม่มีเรื่องอนุมัติ</Empty> : null}
          {o.approvals.map((a) => (
            <section key={a.id} className={`card ${a.status === 'pending' && a.can_decide ? 'highlight' : ''}`}>
              <div className="row-between">
                <div className="stack-sm">
                  <span className="tiny muted">
                    {KIND[a.kind]} · ส่งโดย {a.requested_by_name} · {relative(a.created_at)} · ผู้อนุมัติ: {a.approver_title || '-'}
                    {a.escalated ? ' · ส่งต่อแล้วเพราะเกิน 24 ชั่วโมง' : ''}
                  </span>
                  <span className="strong">{a.title}</span>
                </div>
                <Badge tone={a.status === 'pending' ? 'orange' : a.status === 'approved' ? 'teal' : 'gray'}>
                  {a.status === 'pending' ? 'รออนุมัติ' : a.status === 'approved' ? 'อนุมัติแล้ว' : a.status === 'rejected' ? 'ไม่อนุมัติ' : 'ยกเลิก'}
                </Badge>
              </div>
              {a.decided_at ? (
                <span className="small muted">
                  โดย {a.decided_by_name} · {thaiDateTime(a.decided_at)}
                  {a.decision_note ? ` · ${a.decision_note}` : ''}
                </span>
              ) : null}
              {a.status === 'pending' && a.can_decide ? (
                <ActionForm action={decideApprovalAction}>
                  <input type="hidden" name="company_id" value={cid} />
                  <input type="hidden" name="request_id" value={a.id} />
                  <input name="note" className="input" placeholder="หมายเหตุถึงผู้ขอ (ไม่บังคับ ถ้าไม่อนุมัติควรบอกเหตุผล)" aria-label="หมายเหตุ" />
                  <div className="row">
                    <SubmitButton name="decision" value="approve" className="btn small">
                      อนุมัติ
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" className="btn small ghost">
                      ไม่อนุมัติ
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
              {a.status === 'pending' && a.mine ? (
                <form action={cancelApprovalAction}>
                  <input type="hidden" name="company_id" value={cid} />
                  <input type="hidden" name="request_id" value={a.id} />
                  <button type="submit" className="btn small link">
                    ยกเลิกคำขอ
                  </button>
                </form>
              ) : null}
            </section>
          ))}
          {o.me.is_owner ? (
            <p className="small muted">
              เปิดหรือปิดกฎการอนุมัติได้ที่ <Link href={`/c/${cid}/settings`}>ตั้งค่า</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'log' ? (
        !canSeeLog ? (
          <Empty>ประวัติการเปลี่ยนแปลงดูได้เฉพาะคนที่มีสิทธิ์จัดการทีม</Empty>
        ) : (
          <section className="card">
            <p className="small muted">บันทึกทุกการเปลี่ยนแปลงสิทธิ์ ตำแหน่ง สมาชิก และการอนุมัติ ลบหรือแก้ไม่ได้</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>โดย</th>
                    <th>รายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {((logs || []) as { id: number; actor_name: string; action: string; detail: Record<string, unknown>; created_at: string }[]).map((l) => (
                    <tr key={l.id}>
                      <td className="small">{thaiDateTime(l.created_at)}</td>
                      <td className="small">{l.actor_name || 'ระบบ'}</td>
                      <td className="small">
                        {l.action}
                        {l.detail && Object.keys(l.detail).length ? (
                          <span className="muted"> · {Object.entries(l.detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ')}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : null}
    </>
  );
}
