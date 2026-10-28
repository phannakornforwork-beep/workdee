import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCompany, can } from '@/lib/auth';
import { ActionForm, ConfirmSubmit, SubmitButton } from '@/components/forms';
import { Alert, Avatar, Badge, Empty, Progress } from '@/components/ui';
import { cancelLeaveAction, deleteTaskAction, requestLeaveAction, saveProjectAction, saveTaskAction, toggleFollowAction } from '@/lib/actions/work';
import { thaiDate } from '@/lib/format';

export const metadata: Metadata = { title: 'งานของทีม' };

type Task = {
  id: string; title: string; detail: string; status: string; blocked_note: string | null; due_date: string | null;
  project_id: string | null; project_name: string | null; assignee_id: string | null; assignee_name: string | null;
  position_title: string | null; department_title: string | null; followed: boolean; mine: boolean;
};
type Project = { id: string; name: string; due_date: string | null; status: string; total: number; done: number; blocked: number };
type Member = { user_id: string; display_name: string; position_title: string };
type Work = {
  projects: Project[];
  tasks: Task[];
  leave_today: { user_id: string; display_name: string; leave_type: string; start_date: string; end_date: string; status: string }[];
  members: Member[];
};
type Leave = { id: string; user_id: string; leave_type: string; start_date: string; end_date: string; half_day: boolean; reason: string; status: string; created_at: string };

const STATUS: Record<string, { label: string; tone: string }> = {
  todo: { label: 'ยังไม่เริ่ม', tone: 'gray' },
  doing: { label: 'กำลังทำ', tone: 'blue' },
  review: { label: 'รอตรวจ', tone: 'orange' },
  blocked: { label: 'ติดปัญหา', tone: 'red' },
  done: { label: 'เสร็จแล้ว', tone: 'teal' }
};
const LEAVE: Record<string, string> = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักร้อน', other: 'ลาอื่น ๆ' };
const LEAVE_STATUS: Record<string, string> = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };

function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function overdue(due: string | null): boolean {
  return !!due && due < todayBangkok();
}

function TaskRow({ t, cid, members, projects, canEdit }: { t: Task; cid: string; members: Member[]; projects: Project[]; canEdit: boolean }) {
  return (
    <div className="item">
      <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
        <div className="row-between">
          <div className="stack-sm" style={{ gap: 2 }}>
            <span className="strong">{t.title}</span>
            <span className="tiny muted">
              {t.assignee_name || 'ยังไม่มีผู้รับผิดชอบ'}
              {t.position_title ? ` · ${t.position_title}` : ''}
              {t.project_name ? ` · ${t.project_name}` : ''}
              {t.due_date ? ` · กำหนด ${thaiDate(t.due_date)}` : ''}
            </span>
          </div>
          <div className="row">
            {overdue(t.due_date) ? <Badge tone="red">เลยกำหนด</Badge> : null}
            <Badge tone={STATUS[t.status]?.tone}>{STATUS[t.status]?.label || t.status}</Badge>
          </div>
        </div>
        {t.status === 'blocked' && t.blocked_note ? <div className="alert warn small">ติดอยู่ที่: {t.blocked_note}</div> : null}
        {t.detail ? <p className="small prewrap">{t.detail}</p> : null}
        <ActionForm action={saveTaskAction} className="row">
          <input type="hidden" name="company_id" value={cid} />
          <input type="hidden" name="task_id" value={t.id} />
          <select name="status" className="select" defaultValue={t.status} aria-label="สถานะ" style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <input name="blocked_note" className="input" defaultValue={t.blocked_note || ''} placeholder="ถ้าติดปัญหา บอกว่าติดอะไร" aria-label="ติดปัญหาเรื่อง" style={{ minHeight: 36, flex: '1 1 160px', width: 'auto' }} />
          <SubmitButton className="btn small">อัปเดต</SubmitButton>
        </ActionForm>
        <form action={toggleFollowAction}>
          <input type="hidden" name="company_id" value={cid} />
          <input type="hidden" name="task_id" value={t.id} />
          <input type="hidden" name="follow" value={t.followed ? '0' : '1'} />
          <button type="submit" className="btn small link" aria-pressed={t.followed}>
            {t.followed ? '★ ติดตามอยู่ (กดเพื่อเลิกติดตาม)' : '☆ ติดตาม แจ้งเมื่อติดปัญหาหรือเสร็จ'}
          </button>
        </form>
        {canEdit ? (
          <details className="disclosure">
            <summary>แก้รายละเอียดงาน</summary>
            <ActionForm action={saveTaskAction}>
              <input type="hidden" name="company_id" value={cid} />
              <input type="hidden" name="task_id" value={t.id} />
              <div className="field">
                <label>ชื่องาน</label>
                <input name="title" className="input" defaultValue={t.title} required />
              </div>
              <div className="form-row">
                <div className="field">
                  <label>ผู้รับผิดชอบ</label>
                  <select name="assignee_id" className="select" defaultValue={t.assignee_id || ''}>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name} · {m.position_title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>กำหนดเสร็จ</label>
                  <input name="due_date" type="date" className="input" defaultValue={t.due_date || ''} />
                </div>
              </div>
              <div className="field">
                <label>โปรเจกต์</label>
                <select name="project_id" className="select" defaultValue={t.project_id || ''}>
                  <option value="">ไม่อยู่ในโปรเจกต์</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>รายละเอียด</label>
                <textarea name="detail" className="textarea" defaultValue={t.detail} rows={3} />
              </div>
              <SubmitButton className="btn small">บันทึก</SubmitButton>
            </ActionForm>
            <form action={deleteTaskAction}>
              <input type="hidden" name="company_id" value={cid} />
              <input type="hidden" name="task_id" value={t.id} />
              <ConfirmSubmit className="btn small ghost">ลบงานนี้</ConfirmSubmit>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default async function WorkPage({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase, user, access } = await requireCompany(cid);
  const seesTeam = can(access, 'team');
  const tabs: [string, string][] = [['mine', 'งานของฉัน'], ...(seesTeam ? ([['team', 'ใครทำอะไรอยู่']] as [string, string][]) : []), ['projects', 'โปรเจกต์'], ['leave', 'การลา']];
  const tab = tabs.some(([k]) => k === sp.tab) ? (sp.tab as string) : seesTeam ? 'team' : 'mine';
  const [{ data }, { data: leaves }, { data: recentDone }] = await Promise.all([
    supabase.rpc('team_work', { p_company: cid }),
    supabase.from('leave_requests').select('*').eq('company_id', cid).gte('end_date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).order('start_date').limit(200),
    supabase.from('tasks').select('id, title, assignee_id, done_at').eq('company_id', cid).eq('status', 'done').gte('done_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('done_at', { ascending: false }).limit(20)
  ]);
  const w = (data || { projects: [], tasks: [], leave_today: [], members: [] }) as Work;
  const name = new Map(w.members.map((m) => [m.user_id, m.display_name]));
  const mine = w.tasks.filter((t) => t.mine);
  const followed = w.tasks.filter((t) => t.followed && !t.mine);
  const blocked = w.tasks.filter((t) => t.status === 'blocked');
  const late = w.tasks.filter((t) => overdue(t.due_date));
  const canEdit = (t: Task) => t.mine || seesTeam;
  const myLeaves = ((leaves || []) as Leave[]).filter((l) => l.user_id === user.id);
  const teamLeaves = ((leaves || []) as Leave[]).filter((l) => l.user_id !== user.id && l.status !== 'cancelled');

  const byPerson = new Map<string, Task[]>();
  for (const t of w.tasks) {
    const k = t.assignee_id || 'none';
    byPerson.set(k, [...(byPerson.get(k) || []), t]);
  }

  return (
    <>
      <div className="stack-sm">
        <h1>งานของทีม</h1>
        <p className="muted">
          {seesTeam
            ? access.perms.team === 2 || access.is_owner
              ? 'คุณเห็นงานของทุกคนในบริษัท'
              : 'คุณเห็นงานของคนในแผนกของคุณ'
            : 'คุณเห็นงานของตัวเองและงานที่คุณมอบหมาย'}
        </p>
      </div>
      <div className="grid-sm">
        <div className="card tight">
          <div className="stat">
            <span className="label">งานที่ยังไม่เสร็จ</span>
            <span className="value">{w.tasks.length}</span>
          </div>
        </div>
        <div className={`card tight ${blocked.length ? 'warn' : ''}`}>
          <div className="stat">
            <span className="label">ติดปัญหา</span>
            <span className="value">{blocked.length}</span>
          </div>
        </div>
        <div className={`card tight ${late.length ? 'warn' : ''}`}>
          <div className="stat">
            <span className="label">เลยกำหนด</span>
            <span className="value">{late.length}</span>
          </div>
        </div>
        <div className="card tight">
          <div className="stat">
            <span className="label">ลาวันนี้</span>
            <span className="value">{w.leave_today.length}</span>
          </div>
        </div>
      </div>
      <nav className="tabs" aria-label="หัวข้อ">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/c/${cid}/work?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>
            {l}
          </Link>
        ))}
      </nav>

      {tab === 'mine' || tab === 'team' ? (
        <div className="split">
          <div className="main">
            {tab === 'mine' ? (
              <>
                <section className="card">
                  <h2>งานของฉัน ({mine.length})</h2>
                  {mine.length === 0 ? <p className="small muted">ไม่มีงานค้าง</p> : null}
                  <div className="list">
                    {mine.map((t) => (
                      <TaskRow key={t.id} t={t} cid={cid} members={w.members} projects={w.projects} canEdit={canEdit(t)} />
                    ))}
                  </div>
                </section>
                {followed.length ? (
                  <section className="card">
                    <h2>งานที่ติดตาม ({followed.length})</h2>
                    <div className="list">
                      {followed.map((t) => (
                        <TaskRow key={t.id} t={t} cid={cid} members={w.members} projects={w.projects} canEdit={canEdit(t)} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <>
                {blocked.length ? (
                  <Alert tone="warn">
                    มี {blocked.length} งานที่ติดปัญหา: {blocked.map((t) => `${t.title} (${t.assignee_name || '-'})`).join(', ')}
                  </Alert>
                ) : null}
                {[...byPerson.entries()].map(([uid, tasks]) => (
                  <section key={uid} className="card">
                    <div className="row">
                      <Avatar name={tasks[0].assignee_name} />
                      <div className="stack-sm" style={{ gap: 0 }}>
                        <span className="strong">{tasks[0].assignee_name || 'ยังไม่มีผู้รับผิดชอบ'}</span>
                        <span className="tiny muted">
                          {tasks[0].position_title || ''}
                          {tasks[0].department_title && tasks[0].department_title !== tasks[0].position_title ? ` · ${tasks[0].department_title}` : ''}
                        </span>
                      </div>
                      <span className="small muted right">{tasks.length} งาน</span>
                    </div>
                    <div className="list">
                      {tasks.map((t) => (
                        <TaskRow key={t.id} t={t} cid={cid} members={w.members} projects={w.projects} canEdit={canEdit(t)} />
                      ))}
                    </div>
                  </section>
                ))}
                {w.tasks.length === 0 ? <Empty>ยังไม่มีงานในขอบเขตที่คุณดูแล เพิ่มงานแรกด้านขวา</Empty> : null}
              </>
            )}
          </div>
          <aside className="side">
            <ActionForm action={saveTaskAction} className="card" resetOnSuccess>
              <h2>เพิ่มงาน</h2>
              <input type="hidden" name="company_id" value={cid} />
              <div className="field">
                <label htmlFor="title">ชื่องาน</label>
                <input id="title" name="title" className="input" placeholder="เช่น ทำโพสต์โปรโมชันเดือนหน้า 3 ชิ้น" required />
              </div>
              <div className="field">
                <label htmlFor="assignee_id">ผู้รับผิดชอบ</label>
                <select id="assignee_id" name="assignee_id" className="select" defaultValue={user.id}>
                  {w.members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === user.id ? 'ตัวเอง' : m.display_name} · {m.position_title}
                    </option>
                  ))}
                </select>
                {!seesTeam ? <span className="hint">มอบหมายให้คนอื่นได้เมื่อตำแหน่งมีสิทธิ์ดูงานของทีม</span> : null}
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="due_date">กำหนดเสร็จ</label>
                  <input id="due_date" name="due_date" type="date" className="input" />
                </div>
                <div className="field">
                  <label htmlFor="project_id">โปรเจกต์</label>
                  <select id="project_id" name="project_id" className="select">
                    <option value="">ไม่มี</option>
                    {w.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="detail">รายละเอียด (ไม่บังคับ)</label>
                <textarea id="detail" name="detail" className="textarea" rows={3} />
              </div>
              <SubmitButton>เพิ่มงาน</SubmitButton>
            </ActionForm>
            <section className="card">
              <h2>ลาวันนี้</h2>
              {w.leave_today.length === 0 ? <p className="small muted">ทุกคนอยู่ครบ</p> : null}
              {w.leave_today.map((l) => (
                <div key={l.user_id + l.start_date} className="row-between small">
                  <span>{l.display_name}</span>
                  <span className="muted">
                    {LEAVE[l.leave_type]}
                    {l.status === 'pending' ? ' · รออนุมัติ' : ''}
                  </span>
                </div>
              ))}
            </section>
            {(recentDone || []).length ? (
              <section className="card">
                <h2>เสร็จใน 7 วันที่ผ่านมา</h2>
                {((recentDone || []) as { id: string; title: string; assignee_id: string | null; done_at: string }[]).map((t) => (
                  <div key={t.id} className="small">
                    ✓ {t.title} <span className="muted">· {name.get(t.assignee_id || '') || ''}</span>
                  </div>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}

      {tab === 'projects' ? (
        <div className="split">
          <div className="main">
            {w.projects.length === 0 ? <Empty>ยังไม่มีโปรเจกต์ ใช้โปรเจกต์รวมงานหลายชิ้นที่มีกำหนดเดียวกัน เช่น งานเปิดตัวสินค้า</Empty> : null}
            {w.projects.map((p) => (
              <section key={p.id} className="card">
                <div className="row-between">
                  <span className="strong">{p.name}</span>
                  <span className="small muted">{p.due_date ? `กำหนด ${thaiDate(p.due_date)}` : 'ไม่มีกำหนด'}</span>
                </div>
                <Progress value={p.total ? (p.done / p.total) * 100 : 0} />
                <span className="small muted">
                  เสร็จ {p.done}/{p.total} งาน{p.blocked ? ` · ติดปัญหา ${p.blocked}` : ''}
                </span>
                {seesTeam ? (
                  <details className="disclosure">
                    <summary>แก้โปรเจกต์</summary>
                    <ActionForm action={saveProjectAction}>
                      <input type="hidden" name="company_id" value={cid} />
                      <input type="hidden" name="project_id" value={p.id} />
                      <div className="form-row">
                        <div className="field">
                          <label>ชื่อ</label>
                          <input name="name" className="input" defaultValue={p.name} required />
                        </div>
                        <div className="field">
                          <label>กำหนด</label>
                          <input name="due_date" type="date" className="input" defaultValue={p.due_date || ''} />
                        </div>
                        <div className="field">
                          <label>สถานะ</label>
                          <select name="status" className="select" defaultValue={p.status}>
                            <option value="active">กำลังทำ</option>
                            <option value="done">เสร็จแล้ว</option>
                            <option value="archived">เก็บเข้าคลัง</option>
                          </select>
                        </div>
                      </div>
                      <SubmitButton className="btn small">บันทึก</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </section>
            ))}
          </div>
          <aside className="side">
            {seesTeam ? (
              <ActionForm action={saveProjectAction} className="card" resetOnSuccess>
                <h2>สร้างโปรเจกต์</h2>
                <input type="hidden" name="company_id" value={cid} />
                <div className="field">
                  <label htmlFor="p_name">ชื่อโปรเจกต์</label>
                  <input id="p_name" name="name" className="input" required />
                </div>
                <div className="field">
                  <label htmlFor="p_due">กำหนดเสร็จ</label>
                  <input id="p_due" name="due_date" type="date" className="input" />
                </div>
                <div className="field">
                  <label htmlFor="p_desc">รายละเอียด</label>
                  <textarea id="p_desc" name="description" className="textarea" rows={3} />
                </div>
                <SubmitButton>สร้าง</SubmitButton>
              </ActionForm>
            ) : (
              <p className="small muted">สร้างโปรเจกต์ได้เมื่อตำแหน่งมีสิทธิ์ดูงานของทีม</p>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'leave' ? (
        <div className="split">
          <div className="main">
            <section className="card">
              <h2>การลาของฉัน</h2>
              {myLeaves.length === 0 ? <p className="small muted">ยังไม่มี</p> : null}
              {myLeaves.map((l) => (
                <div key={l.id} className="row-between small">
                  <span>
                    {LEAVE[l.leave_type]} · {thaiDate(l.start_date)}
                    {l.end_date !== l.start_date ? ` – ${thaiDate(l.end_date)}` : ''}
                    {l.half_day ? ' (ครึ่งวัน)' : ''}
                  </span>
                  <span className="row">
                    <Badge tone={l.status === 'approved' ? 'teal' : l.status === 'pending' ? 'orange' : 'gray'}>{LEAVE_STATUS[l.status]}</Badge>
                    {(l.status === 'pending' || l.status === 'approved') && l.end_date >= todayBangkok() ? (
                      <form action={cancelLeaveAction}>
                        <input type="hidden" name="company_id" value={cid} />
                        <input type="hidden" name="leave_id" value={l.id} />
                        <ConfirmSubmit className="btn small link">ยกเลิก</ConfirmSubmit>
                      </form>
                    ) : null}
                  </span>
                </div>
              ))}
            </section>
            {teamLeaves.length ? (
              <section className="card">
                <h2>การลาของทีม</h2>
                {teamLeaves.map((l) => (
                  <div key={l.id} className="row-between small">
                    <span>
                      <strong>{name.get(l.user_id) || 'เพื่อนร่วมทีม'}</strong> · {LEAVE[l.leave_type]} · {thaiDate(l.start_date)}
                      {l.end_date !== l.start_date ? ` – ${thaiDate(l.end_date)}` : ''}
                    </span>
                    <Badge tone={l.status === 'approved' ? 'teal' : l.status === 'pending' ? 'orange' : 'gray'}>{LEAVE_STATUS[l.status]}</Badge>
                  </div>
                ))}
                {can(access, 'leave') ? (
                  <p className="small">
                    คำขอที่รออนุมัติอยู่ที่ <Link href={`/c/${cid}/team?tab=approvals`}>การอนุมัติ</Link>
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
          <aside className="side">
            <ActionForm action={requestLeaveAction} className="card" resetOnSuccess>
              <h2>ขอลา</h2>
              <input type="hidden" name="company_id" value={cid} />
              <div className="field">
                <label htmlFor="leave_type">ประเภท</label>
                <select id="leave_type" name="leave_type" className="select">
                  {Object.entries(LEAVE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="start_date">ตั้งแต่</label>
                  <input id="start_date" name="start_date" type="date" className="input" required />
                </div>
                <div className="field">
                  <label htmlFor="end_date">ถึง</label>
                  <input id="end_date" name="end_date" type="date" className="input" />
                </div>
              </div>
              <label className="check">
                <input type="checkbox" name="half_day" /> <span>ครึ่งวัน</span>
              </label>
              <div className="field">
                <label htmlFor="reason">เหตุผล (ไม่บังคับ)</label>
                <input id="reason" name="reason" className="input" />
                <span className="hint">ลาป่วยไม่ต้องบอกอาการ เหตุผลเห็นเฉพาะคุณและหัวหน้าที่ดูแลคุณ</span>
              </div>
              <SubmitButton>ส่งคำขอ</SubmitButton>
            </ActionForm>
          </aside>
        </div>
      ) : null}
    </>
  );
}
