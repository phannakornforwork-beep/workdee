import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { Logo, Badge } from '@/components/ui';
import { signOutAction } from '@/lib/actions/auth';

export const metadata: Metadata = { title: 'เลือกพื้นที่ใช้งาน' };

const STATUS: Record<string, string> = { pending: 'รอยืนยัน', verified: 'ยืนยันแล้ว', rejected: 'ยืนยันไม่ผ่าน', suspended: 'ถูกระงับ' };

export default async function SpacesPage() {
  const { supabase, user } = await requireUser('/spaces');
  const [{ data: spaces }, { data: invites }, { data: profile }] = await Promise.all([
    supabase.rpc('my_spaces'),
    supabase.rpc('my_pending_invites'),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  ]);
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo href="/spaces" />
          <span className="right" />
          <form action={signOutAction}>
            <button type="submit" className="btn small ghost" style={{ color: '#fff', borderColor: '#4a5057' }}>
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>
      <main className="container page" style={{ maxWidth: 760 }}>
        <div className="stack-sm">
          <h1>สวัสดี {(profile?.display_name as string) || ''}</h1>
          <p className="muted">บัญชีเดียว แยกพื้นที่ส่วนตัวกับพื้นที่บริษัทออกจากกันเสมอ บริษัทมองไม่เห็นอะไรในพื้นที่ส่วนตัวของคุณ</p>
        </div>

        <Link href="/me" className="card">
          <div className="row-between">
            <div className="stack-sm">
              <span className="badge teal" style={{ alignSelf: 'flex-start' }}>
                พื้นที่ส่วนตัว
              </span>
              <h2>หางาน · โปรไฟล์ · แผนอาชีพ</h2>
              <p className="muted small">ใบสมัครและการหางานของคุณอยู่ที่นี่ บริษัทที่คุณทำงานอยู่มองไม่เห็น</p>
            </div>
            <span className="strong">เข้าใช้ →</span>
          </div>
        </Link>

        {(invites || []).length > 0 ? (
          <section className="card highlight">
            <h2>คำเชิญเข้าทีม</h2>
            {(invites as { code: string; company_name: string; position_title: string }[]).map((i) => (
              <div key={i.code} className="row-between">
                <span>
                  <span className="strong">{i.company_name}</span> · ตำแหน่ง {i.position_title}
                </span>
                <Link href={`/join/${i.code}`} className="btn small">
                  ดูคำเชิญ
                </Link>
              </div>
            ))}
          </section>
        ) : null}

        <section className="stack">
          <h2>พื้นที่บริษัท</h2>
          {(spaces || []).length === 0 ? (
            <p className="muted">ยังไม่ได้อยู่ในบริษัทใด ถ้าหัวหน้าส่งลิงก์เชิญมา เปิดลิงก์นั้นได้เลย</p>
          ) : (
            (spaces as { company_id: string; company_name: string; company_status: string; position_title: string; is_owner: boolean }[]).map((s) => (
              <Link key={s.company_id} href={`/c/${s.company_id}`} className="card">
                <div className="row-between">
                  <div className="stack-sm">
                    <h3>{s.company_name}</h3>
                    <span className="muted small">
                      ตำแหน่ง {s.position_title}
                      {s.is_owner ? ' · เจ้าของ' : ''}
                    </span>
                  </div>
                  <Badge tone={s.company_status === 'verified' ? 'teal' : s.company_status === 'pending' ? 'orange' : 'red'}>
                    {STATUS[s.company_status] || s.company_status}
                  </Badge>
                </div>
              </Link>
            ))
          )}
          <Link href="/companies/new" className="btn outline" style={{ alignSelf: 'flex-start' }}>
            + สร้างพื้นที่บริษัทใหม่
          </Link>
        </section>
      </main>
    </>
  );
}
