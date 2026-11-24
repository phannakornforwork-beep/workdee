import Link from 'next/link';
import { STAGE, VERIFY } from '@/lib/format';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="WorkDee หน้าแรก">
      {/* โลโก้ = ใบผลงานย่อ: แถบคะแนน 3 เส้น (เขียว เงิน เงิน) บนพื้นดำ */}
      <span className="brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="3.2" rx="1.6" fill="#00A19B" />
          <rect x="3" y="10.4" width="13.5" height="3.2" rx="1.6" fill="#C8CCCE" />
          <rect x="3" y="15.8" width="9.5" height="3.2" rx="1.6" fill="#C8CCCE" />
        </svg>
      </span>
      WorkDee
    </Link>
  );
}

export function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function VerifyBadge({ level }: { level?: string | null }) {
  const v = VERIFY[level || 'none'] || VERIFY.none;
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

const STAGE_TONE: Record<string, string> = {
  applied: 'gray',
  challenge_invited: 'blue',
  challenge_submitted: 'orange',
  interview: 'teal',
  offer: 'teal',
  hired: 'dark',
  rejected: 'red',
  withdrawn: 'gray',
  declined: 'gray',
  expired: 'gray'
};

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={STAGE_TONE[stage] || 'gray'}>{STAGE[stage] || stage}</Badge>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success' | 'privacy'; children: React.ReactNode }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

// รูปโปรไฟล์หรือโลโก้ ถ้าไม่มีรูปจะแสดงตัวอักษรแรกของชื่อ
export function Avatar({
  name,
  tone,
  src,
  size,
  square = false
}: {
  name?: string | null;
  tone?: string;
  src?: string | null;
  size?: number;
  square?: boolean;
}) {
  const style = size ? { width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) } : undefined;
  const cls = `avatar ${tone || ''} ${square ? 'square' : ''}`;
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={`${cls} has-img`} style={style} loading="lazy" />
    );
  return (
    <span className={cls} style={style} aria-hidden="true">
      {(name || '?').trim().slice(0, 1) || '?'}
    </span>
  );
}

// หัวหน้าแบบ JobsDB: แถบกรมท่าเต็มความกว้าง มีชื่อหน้า ประโยคสั้นหนึ่งบรรทัด และปุ่มหลักด้านขวา
// plain = หัวหน้าแบบเรียบไม่มีพื้น (ใช้กับหน้าย่อย/หน้ารายละเอียด)
export function PageTitle({
  title,
  sub,
  children,
  back,
  search,
  plain = false
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
  back?: { href: string; label: string };
  search?: React.ReactNode;
  plain?: boolean;
}) {
  return (
    <header className={`page-head${plain ? ' plain' : ''}`}>
      <div className="stack-sm" style={{ minWidth: 0 }}>
        {back ? (
          <Link href={back.href} className="back-link">
            ‹ {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {children ? <div className="row">{children}</div> : null}
      {search ? <div className="page-search">{search}</div> : null}
    </header>
  );
}

// หัวข้อส่วน: ชื่อทางซ้าย ลิงก์ "ดูทั้งหมด" ทางขวา และคำอธิบายสั้นใต้ชื่อ (ไม่บังคับ)
export function SectionHead({ title, sub, action }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action}
      {sub ? <p className="sub">{sub}</p> : null}
    </div>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: React.ReactNode; href?: string; tone?: 'warn' }) {
  const body = (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
  if (href)
    return (
      <Link href={href} className={`card tight ${tone || ''}`}>
        {body}
      </Link>
    );
  return <div className={`card tight ${tone || ''}`}>{body}</div>;
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

// แสดงเมื่อเปิดหน้าที่ตำแหน่งยังไม่มีสิทธิ์ (เมนูซ่อนไว้แล้ว แต่อาจเปิดจากลิงก์ตรง)
export function NoAccess({ title, need, cid }: { title: string; need: string; cid: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="empty">
        ตำแหน่งของคุณยังไม่มีสิทธิ์ &ldquo;{need}&rdquo; ขอจากหัวหน้าหรือเจ้าของกิจการ ดูสิทธิ์ของแต่ละตำแหน่งได้ที่{' '}
        <Link href={`/c/${cid}/team?tab=positions`}>ทีมและตำแหน่ง</Link>
      </div>
    </>
  );
}
