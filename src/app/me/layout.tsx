import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { BellIcon, Logo } from '@/components/ui';
import { NavLinks } from '@/components/NavLinks';
import { signOutAction } from '@/lib/actions/auth';

// พื้นที่ส่วนตัว: ไม่มีบริษัทใดเห็นข้อมูลในส่วนนี้ รวมถึงบริษัทที่คุณทำงานอยู่
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser('/me');
  const [{ data: unread }, { data: profile }] = await Promise.all([
    supabase.rpc('unread_count', { p_company: null }),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  ]);
  const name = (profile?.display_name as string) || user.email || '';
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo href="/me" />
          <span className="space-pill personal">พื้นที่ส่วนตัว</span>
          <span className="right" />
          <Link href="/me/notifications" className="icon-btn" aria-label={`การแจ้งเตือน ${unread || 0} รายการใหม่`}>
            <BellIcon />
            {unread ? <span className="count-dot">{unread > 99 ? '99+' : unread}</span> : null}
          </Link>
          <Link href="/spaces" className="switch-btn">
            <span className="avatar">{name.slice(0, 1)}</span>สลับพื้นที่
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="btn small ghost" style={{ color: '#fff', borderColor: '#4a5057' }}>
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>
      <NavLinks
        label="เมนูพื้นที่ส่วนตัว"
        items={[
          { href: '/me', label: 'งานที่ตรงกับฉัน', exact: true },
          { href: '/me/applications', label: 'ใบสมัครของฉัน' },
          { href: '/me/profile', label: 'โปรไฟล์' },
          { href: '/me/plan', label: 'แผนอาชีพ' },
          { href: '/me/privacy', label: 'ความเป็นส่วนตัว' }
        ]}
      />
      <main className="container page">{children}</main>
    </>
  );
}
