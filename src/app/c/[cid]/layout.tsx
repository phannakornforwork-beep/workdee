import Link from 'next/link';
import { can, requireCompany } from '@/lib/auth';
import { Avatar, BellIcon, Logo } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { NavLinks } from '@/components/NavLinks';
import { ThemeToggle } from '@/components/ThemeToggle';

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, access } = await requireCompany(cid);
  const [{ data: unread }, { data: logo }] = await Promise.all([
    supabase.rpc('unread_count', { p_company: cid }),
    supabase.from('companies').select('logo_path').eq('id', cid).maybeSingle()
  ]);
  const base = `/c/${cid}`;
  const items = [
    { href: base, label: 'หน้าแรก', exact: true },
    { href: `${base}/work`, label: 'งานของทีม' },
    ...(can(access, 'post') || can(access, 'screen') ? [{ href: `${base}/jobs`, label: 'ประกาศงาน' }] : []),
    ...(can(access, 'screen') ? [
          { href: `${base}/pipeline`, label: 'ผู้สมัคร' },
          { href: `${base}/interviews`, label: 'สัมภาษณ์' },
          { href: `${base}/talent`, label: 'ค้นหาผู้หางาน' }
        ] : []),
    { href: `${base}/team`, label: 'ทีมและตำแหน่ง' },
    { href: `${base}/chat`, label: 'แชต' },
    { href: `${base}/settings`, label: 'ตั้งค่า' }
  ];
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo href={base} />
          <span className="space-pill">พื้นที่บริษัท · {access.company.name}</span>
          <span className="right" />
          <ThemeToggle />
          <Link href={`${base}/help`} className="tlink">
            ช่วยเหลือ
          </Link>
          <Link href={`${base}/notifications`} className="icon-btn" aria-label={`การแจ้งเตือน ${unread || 0} รายการใหม่`}>
            <BellIcon />
            {unread ? <span className="count-dot">{unread > 99 ? '99+' : unread}</span> : null}
          </Link>
          <Link href="/spaces" className="switch-btn">
            <Avatar src={mediaUrl(logo?.logo_path as string | null)} name={access.company.name} tone="orange" size={28} square />
            สลับพื้นที่
          </Link>
        </div>
      </header>
      <NavLinks label="เมนูพื้นที่บริษัท" items={items} />
      {access.company.status !== 'verified' ? (
        <div className="container" style={{ paddingTop: 14 }}>
          <div className={`alert ${access.company.status === 'rejected' ? 'error' : 'warn'}`}>
            {access.company.status === 'pending' && 'บริษัทกำลังรอการยืนยัน ร่างประกาศและชวนทีมเข้ามาได้เลย เผยแพร่ประกาศได้หลังยืนยันเสร็จ'}
            {access.company.status === 'rejected' && (
              <>
                ยืนยันบริษัทไม่ผ่าน <Link href={`${base}/settings`}>ดูเหตุผลและส่งเอกสารใหม่</Link>
              </>
            )}
            {access.company.status === 'suspended' && 'บัญชีบริษัทถูกระงับชั่วคราว ติดต่อทีม WorkDee'}
          </div>
        </div>
      ) : null}
      <main className="container page">{children}</main>
    </>
  );
}
