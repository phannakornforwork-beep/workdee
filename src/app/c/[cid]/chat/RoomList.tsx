import Link from 'next/link';
import { relative } from '@/lib/format';

export type Room = { room_id: string; kind: string; title: string; last_message_at: string | null; last_body: string | null; last_sender: string | null; unread: number };

const KIND: Record<string, string> = { company: 'ทั้งบริษัท', department: 'แผนก', candidate: 'ผู้สมัคร' };

export function RoomList({ cid, rooms, current }: { cid: string; rooms: Room[]; current?: string }) {
  const groups: [string, Room[]][] = [
    ['ทีม', rooms.filter((r) => r.kind !== 'candidate')],
    ['คุยกับผู้สมัคร', rooms.filter((r) => r.kind === 'candidate')]
  ];
  return (
    <nav className="stack" aria-label="ห้องแชต">
      {groups.map(([label, list]) =>
        list.length ? (
          <section key={label} className="card tight">
            <h2 className="small muted">{label}</h2>
            <div className="list">
              {list.map((r) => (
                <Link
                  key={r.room_id}
                  href={`/c/${cid}/chat/${r.room_id}`}
                  className="item"
                  aria-current={current === r.room_id ? 'page' : undefined}
                  style={{ display: 'block', color: 'inherit', textDecoration: 'none', background: current === r.room_id ? 'var(--bg-2)' : undefined, borderRadius: 8, padding: 8 }}
                >
                  <span className="row-between">
                    <span className={r.unread ? 'strong' : ''}>
                      {r.title}
                      <span className="tiny muted"> · {KIND[r.kind]}</span>
                    </span>
                    {r.unread ? <span className="count-dot" style={{ position: 'static' }}>{r.unread > 99 ? '99+' : r.unread}</span> : null}
                  </span>
                  <span className="tiny muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.last_body ? `${r.last_sender ? r.last_sender + ': ' : ''}${r.last_body}` : 'ยังไม่มีข้อความ'}
                    {r.last_message_at ? ` · ${relative(r.last_message_at)}` : ''}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null
      )}
    </nav>
  );
}
