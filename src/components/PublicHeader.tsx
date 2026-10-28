import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { Logo } from '@/components/ui';

export async function PublicHeader() {
  const { user } = await getUser();
  return (
    <header className="topbar">
      <div className="inner">
        <Logo />
        <span className="right" />
        <Link href="/jobs" className="tlink">
          หางาน
        </Link>
        <Link href="/#companies" className="tlink">
          สำหรับบริษัท
        </Link>
        {user ? (
          <Link href="/spaces" className="btn small">
            ไปที่พื้นที่ของฉัน
          </Link>
        ) : (
          <>
            <Link href="/login" className="tlink">
              เข้าสู่ระบบ
            </Link>
            <Link href="/signup" className="btn small">
              สมัครฟรี
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <span>© {new Date().getFullYear()} WorkDee</span>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
        <Link href="/terms">ข้อตกลงการใช้งาน</Link>
        <Link href="/jobs">ประกาศงานทั้งหมด</Link>
      </div>
    </footer>
  );
}
