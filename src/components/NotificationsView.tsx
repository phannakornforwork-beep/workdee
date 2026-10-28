import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Badge, Empty } from '@/components/ui';
import { createLineCodeAction, markAllReadAction, savePrefsAction, setQuietConsentAction, unlinkLineAction } from '@/lib/actions/notify';
import { LINE_ADD_FRIEND_URL } from '@/lib/env';
import { relative } from '@/lib/format';
import type { NotificationRow } from '@/lib/types';

type Kind = { kind: string; audience: string; label: string; description: string; default_email: boolean; default_line: boolean; default_sms: boolean; digest: boolean };

// หน้าการแจ้งเตือน ใช้ร่วมกันทั้งพื้นที่ส่วนตัว (companyId = null) และพื้นที่บริษัท
export async function NotificationsView({ userId, companyId, quiet }: { userId: string; companyId: string | null; quiet?: { start: string; end: string; consent: boolean } }) {
  const supabase = await createClient();
  let q = supabase.from('notifications').select('id, kind, title, body, link, urgent, read_at, created_at').order('created_at', { ascending: false }).limit(80);
  q = companyId ? q.eq('company_id', companyId) : q.eq('space', 'personal');
  const [{ data: items }, { data: kinds }, { data: prefs }, { data: line }, { data: settings }] = await Promise.all([
    q,
    supabase.from('notification_kinds').select('*').eq('audience', companyId ? 'company' : 'candidate').order('sort'),
    supabase.from('notification_prefs').select('kind, email, line, sms').eq('user_id', userId),
    supabase.from('line_links').select('line_user_id, linked_at').eq('user_id', userId).maybeSingle(),
    supabase.from('user_settings').select('digest_enabled').eq('user_id', userId).maybeSingle()
  ]);
  const list = (items || []) as NotificationRow[];
  const prefMap = new Map(((prefs || []) as { kind: string; email: boolean; line: boolean; sms: boolean }[]).map((p) => [p.kind, p]));
  const linked = Boolean(line?.line_user_id);
  const kindList = (kinds || []) as Kind[];
  return (
    <div className="split">
      <div className="main">
        <div className="row-between">
          <h1>การแจ้งเตือน</h1>
          <form action={markAllReadAction}>
            <input type="hidden" name="company_id" value={companyId || ''} />
            <button type="submit" className="btn ghost small">
              อ่านทั้งหมดแล้ว
            </button>
          </form>
        </div>
        {list.length === 0 ? <Empty>ยังไม่มีการแจ้งเตือน</Empty> : null}
        <div className="stack">
          {list.map((n) => {
            const body = (
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="stack-sm" style={{ flex: 1 }}>
                  <span className={n.read_at ? '' : 'strong'}>
                    {n.urgent ? <Badge tone="orange">ด่วน</Badge> : null} {n.title}
                  </span>
                  {n.body ? <span className="small muted prewrap">{n.body}</span> : null}
                </div>
                <span className="tiny muted">{relative(n.created_at)}</span>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="card tight" style={{ background: n.read_at ? '#fafaf8' : '#fff' }}>
                {body}
              </Link>
            ) : (
              <div key={n.id} className="card tight" style={{ background: n.read_at ? '#fafaf8' : '#fff' }}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
      <aside className="side">
        <section className="card">
          <h2>LINE</h2>
          {linked ? (
            <>
              <p className="small">เชื่อมแล้ว ระบบจะส่งเรื่องสำคัญเข้า LINE ของคุณ</p>
              <form action={unlinkLineAction}>
                <button type="submit" className="btn small ghost">
                  ยกเลิกการเชื่อม
                </button>
              </form>
            </>
          ) : (
            <ActionForm action={createLineCodeAction}>
              <p className="small muted">
                1) เพิ่มเพื่อนบัญชี LINE ของ WorkDee {LINE_ADD_FRIEND_URL ? <a href={LINE_ADD_FRIEND_URL} target="_blank" rel="noreferrer">เปิดใน LINE</a> : null}
                <br />2) กดสร้างรหัส แล้วพิมพ์รหัส 6 หลักในแชตกับ WorkDee
              </p>
              <SubmitButton className="btn small">สร้างรหัสเชื่อม LINE</SubmitButton>
            </ActionForm>
          )}
        </section>
        {companyId && quiet ? (
          <section className="card">
            <h2>ช่วงเวลาเงียบ</h2>
            <p className="small muted">
              ข้อความหลัง {quiet.start.slice(0, 5)} ถึง {quiet.end.slice(0, 5)} จะส่งเข้า LINE หรืออีเมลตอนเช้า ตามแนวทางสิทธิปฏิเสธการติดต่อนอกเวลางาน
            </p>
            <form action={setQuietConsentAction} className="stack-sm">
              <input type="hidden" name="company_id" value={companyId} />
              <label className="check">
                <input type="checkbox" name="consent" defaultChecked={quiet.consent} />
                <span>ยินยอมรับเรื่องด่วนนอกเวลางาน (เปลี่ยนใจได้ทุกเมื่อ ไม่มีผลต่อการประเมิน)</span>
              </label>
              <button type="submit" className="btn small ghost">
                บันทึก
              </button>
            </form>
          </section>
        ) : null}
        <ActionForm action={savePrefsAction} className="card">
          <h2>ตั้งค่าช่องทาง</h2>
          <p className="small muted">ในแอปเปิดเสมอ · SMS ใช้กับเรื่องด่วนเท่านั้น · LINE ใช้ได้หลังเชื่อม</p>
          <input type="hidden" name="kinds" value={kindList.map((k) => k.kind).join(',')} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>เรื่อง</th>
                  <th>อีเมล</th>
                  <th>LINE</th>
                  <th>SMS</th>
                </tr>
              </thead>
              <tbody>
                {kindList.map((k) => {
                  const p = prefMap.get(k.kind);
                  const def = (v: boolean) => (p ? undefined : v && !k.digest);
                  return (
                    <tr key={k.kind}>
                      <td>
                        <div className="small strong">{k.label}</div>
                        {k.description ? <div className="tiny muted">{k.description}</div> : null}
                      </td>
                      <td>
                        <input type="checkbox" name={`${k.kind}:email`} aria-label={`${k.label} ทางอีเมล`} defaultChecked={p ? p.email : def(k.default_email)} />
                      </td>
                      <td>
                        <input type="checkbox" name={`${k.kind}:line`} aria-label={`${k.label} ทาง LINE`} defaultChecked={p ? p.line : def(k.default_line)} disabled={!linked} />
                      </td>
                      <td>
                        <input type="checkbox" name={`${k.kind}:sms`} aria-label={`${k.label} ทาง SMS`} defaultChecked={p ? p.sms : def(k.default_sms)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {companyId ? (
            <>
              <input type="hidden" name="digest_present" value="1" />
              <label className="check">
                <input type="checkbox" name="digest_enabled" defaultChecked={settings ? Boolean(settings.digest_enabled) : true} />
                <span>รับสรุปประจำวันตอนเช้า (เรื่องที่ต้องตอบ โจทย์รอให้คะแนน นัดสัมภาษณ์ และเรื่องรออนุมัติ)</span>
              </label>
            </>
          ) : null}
          <SubmitButton className="btn small">บันทึก</SubmitButton>
        </ActionForm>
      </aside>
    </div>
  );
}
