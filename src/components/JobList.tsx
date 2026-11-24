import Link from 'next/link';
import { Avatar, Badge } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { JOB_TYPE, PROVINCES, WORK_MODE, relative, salaryRange } from '@/lib/format';
import type { JobCard } from '@/lib/types';

// ช่องค้นหาแบบ JobsDB: แถวเดียว วางในแถบกรมท่าของหน้า
export function JobFilters({ action, q, type, province }: { action: string; q?: string; type?: string; province?: string }) {
  return (
    <form action={action} method="get" className="search-bar" role="search">
      <input name="q" className="input" defaultValue={q} placeholder="ตำแหน่ง บริษัท หรือสกิล" aria-label="ค้นหางาน" />
      <select name="type" className="select" defaultValue={type || ''} aria-label="ประเภทงาน">
        <option value="">ทุกประเภท</option>
        {Object.entries(JOB_TYPE).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select name="province" className="select" defaultValue={province || ''} aria-label="จังหวัด">
        <option value="">ทุกจังหวัด</option>
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button type="submit" className="btn">
        หางาน
      </button>
      {q || type || province ? (
        <Link href={action} className="clear-link">
          ล้างตัวกรอง
        </Link>
      ) : null}
    </form>
  );
}

// รายการงานแบบ JobsDB: การ์ดเรียงแถวเดียว ทุกใบเรียงข้อมูลลำดับเดียวกัน
// ชื่องาน → บริษัท → ป้าย → ประเภท/สถานที่ → เงินเดือน → เวลา  (โลโก้อยู่ขวาบน)
export function JobList({ jobs, base = '/jobs', showMatch = false }: { jobs: JobCard[]; base?: string; showMatch?: boolean }) {
  if (!jobs.length) return <div className="empty">ไม่พบประกาศ ลองเปลี่ยนคำค้น</div>;
  return (
    <div className="job-list">
      {jobs.map((j) => (
        <Link key={j.id} href={`${base}/${j.id}`} className="card job-card">
          <span className="job-title">{j.title}</span>
          <span className="job-logo">
            <Avatar src={mediaUrl(j.company_logo_path)} name={j.company_name} tone="orange" size={52} square />
          </span>
          <span className="job-company">{j.company_name}</span>
          <div className="job-body">
            {j.has_challenge || j.applied || (showMatch && j.match_score !== null) ? (
              <div className="chips">
                {showMatch && j.match_score !== null ? <Badge tone="teal">ตรงกับคุณ {j.match_score}%</Badge> : null}
                {j.has_challenge ? <Badge tone="blue">มีโจทย์{j.time_limit_minutes ? ` ${j.time_limit_minutes} นาที` : ''}</Badge> : null}
                {j.applied ? <Badge tone="gray">สมัครแล้ว</Badge> : null}
              </div>
            ) : null}
            <span>{JOB_TYPE[j.job_type] || j.job_type}</span>
            <span>{j.work_mode === 'remote' ? WORK_MODE.remote : j.province || WORK_MODE[j.work_mode]}</span>
            <span className="strong">{salaryRange(j.salary_min, j.salary_max, j.pay_unit)}</span>
          </div>
          <div className="job-foot">
            <span>{relative(j.published_at)}</span>
            {j.response_rate !== null ? <span>ตอบตรงเวลา {j.response_rate}%</span> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
