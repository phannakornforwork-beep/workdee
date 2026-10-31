import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCompany, can } from '@/lib/auth';
import { ChatRoom, type ChatMessage } from '@/components/ChatRoom';
import { ActionForm, SubmitButton } from '@/components/forms';
import { afterChatSendAction, remindAnnouncementAction } from '@/lib/actions/chat';
import { relative } from '@/lib/format';
import { RoomList, type Room } from './RoomList';

type RoomRow = { id: string; kind: string; title: string; department_id: string | null; application_id: string | null; archived: boolean };
type Status = { read: number; total: number; unread_names: string[] } | null;

// เนื้อหาห้องแชต ใช้ทั้งหน้า /chat/[roomId] และหน้า /chat (เปิดห้องแรกทันที ไม่ต้อง redirect อีกรอบ)
export async function RoomView({ cid, roomId, knownRooms }: { cid: string; roomId: string; knownRooms?: Room[] }) {
  const { supabase, user, access } = await requireCompany(cid);
  const [{ data: room }, { data: rooms }, { data: msgs }] = await Promise.all([
    supabase.from('chat_rooms').select('id, kind, title, department_id, application_id, archived').eq('id', roomId).eq('company_id', cid).maybeSingle(),
    knownRooms ? Promise.resolve({ data: knownRooms }) : supabase.rpc('chat_room_list', { p_company: cid }),
    supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, sender_name, sender_side, body, is_announcement, urgent, created_at')
      .eq('room_id', roomId)
      .order('id', { ascending: false })
      .limit(200)
  ]);
  const r = room as RoomRow | null;
  if (!r) notFound();
  const messages = ((msgs || []) as ChatMessage[]).reverse();
  const canAnnounce = r.kind === 'company' ? can(access, 'announce', 2) : r.kind === 'department' ? can(access, 'announce') : false;
  const canUrgent = r.kind !== 'candidate' && can(access, 'announce');

  // สถานะการอ่านของประกาศ (เห็นเฉพาะผู้ส่งและคนที่มีสิทธิ์ประกาศ)
  const announcements = messages.filter((m) => m.is_announcement).slice(-5).reverse();
  const statuses: { m: ChatMessage; s: NonNullable<Status> }[] = [];
  if (announcements.length && (can(access, 'announce') || announcements.some((m) => m.sender_id === user.id))) {
    // ขอสถานะทุกประกาศในคำขอเดียว
    const { data: batch } = await supabase.rpc('announcement_statuses', { p_messages: announcements.map((m) => m.id) });
    const byId = new Map(((batch || []) as { message_id: number; status: Status }[]).map((x) => [String(x.message_id), x.status]));
    announcements.forEach((m) => {
      const s = byId.get(String(m.id)) || null;
      if (s) statuses.push({ m, s });
    });
  }
  const { quiet_start, quiet_end } = access.company;

  return (
    <>
      <div className="row-between">
        <div className="stack-sm">
          <Link href={`/c/${cid}/chat?list=1`} className="small">
            ← ห้องทั้งหมด
          </Link>
          <h1>{r.title}</h1>
        </div>
        {r.kind === 'candidate' && r.application_id ? (
          <Link href={`/c/${cid}/applications/${r.application_id}`} className="btn outline small">
            ดูใบสมัคร
          </Link>
        ) : null}
      </div>
      <div className="split">
        <div className="main">
          {r.kind === 'candidate' ? (
            <p className="small muted">ผู้สมัครเห็นข้อความในหน้าใบสมัครของเขา ห้องนี้เห็นเฉพาะคนที่ดูแลประกาศนี้</p>
          ) : null}
          <ChatRoom
            roomId={r.id}
            meId={user.id}
            initial={messages}
            canAnnounce={canAnnounce}
            canUrgent={canUrgent}
            afterSend={afterChatSendAction}
            placeholder={r.kind === 'candidate' ? 'ข้อความถึงผู้สมัคร' : 'พิมพ์ข้อความถึงทีม'}
            quietNote={
              r.kind === 'candidate'
                ? undefined
                : `ส่งนอกเวลางาน (${quiet_start.slice(0, 5)}–${quiet_end.slice(0, 5)}) ข้อความเข้าแชตทันที แต่ LINE/อีเมลจะแจ้งตอนเริ่มงาน ยกเว้นติ๊ก "ด่วน" กับคนที่ยินยอมไว้`
            }
          />
          {statuses.length ? (
            <section className="card">
              <h2>ใครอ่านประกาศแล้ว</h2>
              {statuses.map(({ m, s }) => (
                <div key={m.id} className="stack-sm" style={{ borderTop: '1px solid var(--bg-2)', paddingTop: 8 }}>
                  <span className="small">
                    <strong>{m.body.slice(0, 80)}</strong>
                    {m.body.length > 80 ? '…' : ''} <span className="muted">· {relative(m.created_at)}</span>
                  </span>
                  <span className="small">
                    รับทราบแล้ว {s.read}/{s.total} คน
                    {s.unread_names.length ? <span className="muted"> · ยังไม่อ่าน: {s.unread_names.join(', ')}</span> : null}
                  </span>
                  {s.unread_names.length ? (
                    <ActionForm action={remindAnnouncementAction} className="row">
                      <input type="hidden" name="company_id" value={cid} />
                      <input type="hidden" name="room_id" value={r.id} />
                      <input type="hidden" name="message_id" value={m.id} />
                      <SubmitButton className="btn small outline" pendingText="กำลังส่ง…">
                        เตือนคนที่ยังไม่อ่าน
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </div>
        <aside className="side">
          <RoomList cid={cid} rooms={(rooms || []) as Room[]} current={r.id} />
        </aside>
      </div>
    </>
  );
}
