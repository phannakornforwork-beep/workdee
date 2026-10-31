import Link from 'next/link';
import { Avatar, Badge } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { JOB_TYPE, PROVINCES, WORK_MODE, relative, salaryRange } from '@/lib/format';
import type { JobCard } from '@/lib/types';

export function JobFilters({ action, q, type, province }: { action: string; q?: string; type?: string; province?: string }) {
  return (
    <form action={action} method="get" className="card tight">
      <div className="form-row">
        <div className="field" style={{ flex: '3 1 260px' }}>
          <label htmlFor="q">ค้นหา</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="ตำแหน่ง บริษัท หรือสกิล เช่น Content, Canva" />
        </div>
        <div className="field">
          <label htmlFor="type">ประเภทงาน</label>
          <select id="type" name="type" className="select" defaultValue={type || ''}>
            <option value="">ทุกประเภท</option>
            {Object.entries(JOB_TYPE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="province">จังหวัด</label>
          <select id="province" name="province" className="select" defaultValue={province || ''}>
            <option value="">ทุกจังหวัด</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <button type="submit" className="btn">
          ค้นหา
        </button>
        <Link href={action} className="btn ghost">
          ล้างตัวกรอง
        </Link>
      </div>
    </form>
  );
}

export function JobList({ jobs, base = '/jobs', showMatch = false }: { jobs: JobCard[]; base?: string; showMatch?: boolean }) {
  if (!jobs.length) return <div className="empty">ยังไม่มีประกาศที่ตรงกับตัวกรอง ลองเปลี่ยนคำค้นหรือประเภทงาน</div>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      {jobs.map((j) => (
        <Link key={j.id} href={`${base}/${j.id}`} className="card">
          <div className="row-between">
            <span className="card-head">
              <Avatar src={mediaUrl(j.company_logo_path)} name={j.company_name} tone="orange" size={36} square />
              <span className="muted small">{j.company_name}</span>
            </span>
            {showMatch && j.match_score !== null ? <span className="score">ตรง {j.match_score}%</span> : null}
          </div>
          <h3>{j.title}</h3>
          <div className="chips">
            <Badge tone="gray">{JOB_TYPE[j.job_type] || j.job_type}</Badge>
            <Badge tone="gray">{j.work_mode === 'remote' ? WORK_MODE.remote : j.province || WORK_MODE[j.work_mode]}</Badge>
            {j.has_challenge ? <Badge tone="blue">มีโจทย์ {j.time_limit_minutes ? `${j.time_limit_minutes} นาที` : ''}</Badge> : null}
            {j.applied ? <Badge tone="teal">สมัครแล้ว</Badge> : null}
          </div>
          <span className="strong">{salaryRange(j.salary_min, j.salary_max, j.pay_unit)}</span>
          <div className="row-between tiny muted">
            <span>{j.response_rate !== null ? `ตอบผู้สมัครตรงเวลา ${j.response_rate}%` : 'ยังไม่มีสถิติการตอบ'}</span>
            <span>{relative(j.published_at)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
