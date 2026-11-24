import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Logo, PageTitle } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createCompanyAction } from '@/lib/actions/company';
import { PROVINCES } from '@/lib/format';
import { ThemeToggle } from '@/components/ThemeToggle';

export const metadata: Metadata = { title: 'สร้างพื้นที่บริษัท' };

export default async function NewCompanyPage() {
  await requireUser('/companies/new');
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Logo href="/spaces" />
          <span className="right" />
          <ThemeToggle />
          <Link href="/spaces" className="tlink">
            กลับไปเลือกพื้นที่
          </Link>
        </div>
      </header>
      <main className="container page">
        <div className="split">
          <div className="main">
            <PageTitle plain title="สร้างพื้นที่บริษัท" sub="คุณจะเป็นเจ้าของพื้นที่นี้" />
            <ActionForm action={createCompanyAction} className="card">
              <div className="field">
                <label htmlFor="name">ชื่อบริษัท (ตามหนังสือรับรอง)</label>
                <input id="name" name="name" className="input" placeholder="บริษัท ... จำกัด" required maxLength={200} />
              </div>
              <div className="field">
                <label htmlFor="reg_no">เลขทะเบียนนิติบุคคล 13 หลัก</label>
                <input id="reg_no" name="reg_no" className="input" inputMode="numeric" pattern="[0-9\- ]{13,17}" required />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="size_range">ขนาดบริษัท</label>
                  <select id="size_range" name="size_range" className="select" defaultValue="20-49">
                    <option value="1-19">1–19 คน</option>
                    <option value="20-49">20–49 คน</option>
                    <option value="50-199">50–199 คน</option>
                    <option value="200+">200 คนขึ้นไป</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="industry">อุตสาหกรรม</label>
                  <select id="industry" name="industry" className="select">
                    <option>อาหารและเครื่องดื่ม</option>
                    <option>ค้าปลีกและอีคอมเมิร์ซ</option>
                    <option>อีเวนต์และการตลาด</option>
                    <option>เทคโนโลยี</option>
                    <option>บริการ</option>
                    <option>การผลิต</option>
                    <option>อื่นๆ</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="province">จังหวัด</label>
                  <select id="province" name="province" className="select">
                    {PROVINCES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="check">
                <input type="checkbox" name="template" defaultChecked />
                <span>เริ่มจากผังตัวอย่าง (แก้ได้ภายหลัง)</span>
              </label>
              <SubmitButton pendingText="กำลังสร้าง…">สร้างพื้นที่บริษัท</SubmitButton>
            </ActionForm>
          </div>
          <aside className="side">
            <section className="card">
              <h2>ทำไมต้องยืนยันบริษัท</h2>
              <p className="small muted">กันประกาศปลอม ขั้นต่อไปแนบหนังสือรับรอง (ไม่เกิน 6 เดือน)</p>
            </section>
            <section className="card">
              <h2>ลำดับชั้นในพื้นที่บริษัท</h2>
              <div className="stack-sm small">
                <span><strong>เจ้าของ</strong> · ทุกอย่าง</span>
                <span><strong>หัวหน้าแผนก</strong> · เรื่องในแผนก</span>
                <span><strong>HR</strong> · ประกาศและผู้สมัคร</span>
                <span><strong>พนักงาน</strong> · งานตัวเอง แชต ลา</span>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
