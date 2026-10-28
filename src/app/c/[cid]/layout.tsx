import Link from 'next/link';
import { can, requireCompany } from '@/lib/auth';
import { BellIcon, Logo } from '@/components/ui';
import { NavLinks } from '@/components/NavLinks';

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { supabase, access } = await requireCompany(cid);
  const { data: unread } = await supabase.rpc('unread_count', { p_company: cid });
  const base = `/c/${cid}`;
  const items = [
    { href: base, label: 'หน้าแรก', exact: true },
    { href: `${base}/work`, label: 'งานของทีม' },
    ...(can(access, 'post') || can(access, 'screen') ? [{ href: `${base}/jobs`, label: 'ประกาศงาน' }] : []),
    ...(can(access, 'screen') ? [{ href: `${base}/pipeline`, label: 'ผู้สมัคร' }, { href: `${base}/interviews`, label: 'สัมภาษณ์' }] : []),
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
          <Link href={`${base}/help`} className="tlink">
            ช่วยเหลือ
          </Link>
          <Link href={`${base}/notifications`} className="icon-btn" aria-label={`การแจ้งเตือน ${unread || 0} รายการใหม่`}>
            <BellIcon />
            {unread ? <span className="count-dot">{unread > 99 ? '99+' : unread}</span> : null}
          </Link>
          <Link href="/spaces" className="switch-btn">
            <span className="avatar orange">{access.company.name.slice(0, 1)}</span>สลับพื้นที่
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
