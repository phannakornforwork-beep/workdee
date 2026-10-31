import type { Metadata } from 'next';
import { requireCompany } from '@/lib/auth';
import { Empty } from '@/components/ui';
import { RoomList, type Room } from './RoomList';
import { RoomView } from './RoomView';

export const metadata: Metadata = { title: 'แชต' };

export default async function ChatIndex({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ list?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase } = await requireCompany(cid);
  const { data } = await supabase.rpc('chat_room_list', { p_company: cid });
  const rooms = (data || []) as Room[];
  // จอใหญ่: เปิดห้องที่มีข้อความยังไม่อ่านก่อน (มือถือกด "ห้องทั้งหมด" เพื่อดูรายการ)
  if (!sp.list && rooms.length) {
    const first = rooms.find((r) => r.unread > 0) || rooms[0];
    return <RoomView cid={cid} roomId={first.room_id} knownRooms={rooms} />;
  }
  return (
    <>
      <h1>แชต</h1>
      <p className="muted">แชตของบริษัทแยกจากแชตส่วนตัว ข้อความที่ส่งนอกเวลางาน ระบบจะแจ้งเตือนตอนเช้า ยกเว้นเรื่องด่วนที่พนักงานยินยอมไว้</p>
      {rooms.length === 0 ? <Empty>ยังไม่มีห้องแชต</Empty> : <RoomList cid={cid} rooms={rooms} />}
    </>
  );
}
