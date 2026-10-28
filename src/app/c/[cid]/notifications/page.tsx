import type { Metadata } from 'next';
import { requireCompany } from '@/lib/auth';
import { NotificationsView } from '@/components/NotificationsView';

export const metadata: Metadata = { title: 'การแจ้งเตือนของบริษัท' };

export default async function CompanyNotifications({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, user, access } = await requireCompany(cid);
  const { data: me } = await supabase.from('company_members').select('after_hours_consent').eq('company_id', cid).eq('user_id', user.id).maybeSingle();
  return (
    <NotificationsView
      userId={user.id}
      companyId={cid}
      quiet={{ start: access.company.quiet_start, end: access.company.quiet_end, consent: Boolean((me as { after_hours_consent?: boolean } | null)?.after_hours_consent) }}
    />
  );
}
