import type { Metadata } from 'next';
import { RoomView } from '../RoomView';

export const metadata: Metadata = { title: 'แชต' };

export default async function ChatRoomPage({ params }: { params: Promise<{ cid: string; roomId: string }> }) {
  const { cid, roomId } = await params;
  return <RoomView cid={cid} roomId={roomId} />;
}
