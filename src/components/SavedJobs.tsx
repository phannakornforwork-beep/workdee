'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { JobList } from '@/components/JobList';
import type { JobCard } from '@/lib/types';

// งานที่บันทึกไว้: เก็บในเครื่องนี้ (localStorage) ไม่ต้องล็อกอิน และไม่ส่งข้อมูลให้บริษัท
const KEY = 'workdee-saved-jobs';

export function readSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 100) : [];
  } catch {
    return [];
  }
}

function writeSaved(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 100)));
  } catch {
    /* โหมดส่วนตัวบางเบราว์เซอร์บันทึกไม่ได้ */
  }
}

// ปุ่มบันทึกงาน (ไอคอนบุ๊กมาร์กแบบ JobsDB)
export function SaveJobButton({ jobId }: { jobId: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(readSaved().includes(jobId)), [jobId]);
  function toggle() {
    const ids = readSaved();
    const next = ids.includes(jobId) ? ids.filter((x) => x !== jobId) : [jobId, ...ids];
    writeSaved(next);
    setSaved(next.includes(jobId));
  }
  return (
    <button type="button" className="btn ghost small" aria-pressed={saved} onClick={toggle}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h12v18l-6-4-6 4z" />
      </svg>
      {saved ? 'บันทึกแล้ว' : 'บันทึกงาน'}
    </button>
  );
}

// รายการงานที่บันทึก (อ่านจากประกาศที่ยังเปิดรับ งานที่ปิดแล้วจะหายไปเอง)
export function SavedJobList() {
  const [jobs, setJobs] = useState<JobCard[] | null>(null);
  useEffect(() => {
    const ids = readSaved();
    if (!ids.length) return setJobs([]);
    createClient()
      .from('job_board')
      .select('id, title, company_id, company_name, company_logo_path, job_type, province, work_mode, salary_min, salary_max, pay_unit, skills, published_at, closes_at, has_challenge, time_limit_minutes, response_rate, response_sample, gig_days')
      .in('id', ids)
      .then(({ data }: { data: Omit<JobCard, 'match_score' | 'applied'>[] | null }) => {
        const map = new Map((data || []).map((j) => [j.id, { ...j, match_score: null, applied: false } as JobCard]));
        setJobs(ids.map((id) => map.get(id)).filter((j): j is JobCard => Boolean(j)));
      });
  }, []);
  if (jobs === null) return <div className="skeleton" style={{ height: 160 }} />;
  if (!jobs.length)
    return (
      <div className="empty">
        ยังไม่ได้บันทึกงาน กด &ldquo;บันทึกงาน&rdquo; ในหน้าประกาศ <Link href="/jobs">หางาน</Link>
      </div>
    );
  return <JobList jobs={jobs} />;
}
