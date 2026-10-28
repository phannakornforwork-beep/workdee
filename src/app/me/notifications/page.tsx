import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { NotificationsView } from '@/components/NotificationsView';

export const metadata: Metadata = { title: 'การแจ้งเตือน' };

export default async function MyNotifications() {
  const { user } = await requireUser('/me/notifications');
  return <NotificationsView userId={user.id} companyId={null} />;
}
