import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { JobFilters, JobList } from '@/components/JobList';
import type { JobCard } from '@/lib/types';

export const metadata: Metadata = { title: 'งานที่ตรงกับฉัน' };

export default async function MyFeed({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; province?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser('/me');
  const [{ data: jobs }, { data: profile }, { data: apps }] = await Promise.all([
    supabase.rpc('job_feed', { p_q: sp.q || null, p_type: sp.type || null, p_province: sp.province || null, p_limit: 60 }),
    supabase.from('candidate_profiles').select('full_name, skills').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('my_applications')
  ]);
  const active = ((apps || []) as { stage: string; candidate_due_at: string | null; id: string; job_title: string }[]).filter((a) =>
    ['challenge_invited', 'interview', 'offer'].includes(a.stage)
  );
  return (
    <>
      <div className="stack-sm">
        <h1>งานที่ตรงกับฉัน</h1>
        <p className="muted">เรียงตามความตรงกับสกิล ประเภทงาน พื้นที่ และค่าตอบแทนที่คุณตั้งไว้</p>
      </div>
      {!profile?.full_name ? (
        <div className="alert warn">
          ยังไม่มีโปรไฟล์ สร้างครั้งเดียวใช้สมัครได้ทุกงาน และทำให้คะแนนความตรงแม่นขึ้น <Link href="/me/profile">สร้างโปรไฟล์</Link>
        </div>
      ) : null}
      {active.length ? (
        <section className="card highlight">
          <h2>เรื่องที่รอคุณทำ</h2>
          {active.map((a) => (
            <div key={a.id} className="row-between">
              <span>
                <span className="strong">{a.job_title}</span>
                <span className="muted small">
                  {' '}
                  · {a.stage === 'challenge_invited' ? 'ทำโจทย์' : a.stage === 'interview' ? 'นัดสัมภาษณ์' : 'ตอบข้อเสนองาน'}
                </span>
              </span>
              <Link href={`/me/applications/${a.id}`} className="btn small">
                เปิด
              </Link>
            </div>
          ))}
        </section>
      ) : null}
      <JobFilters action="/me" q={sp.q} type={sp.type} province={sp.province} />
      <JobList jobs={(jobs || []) as JobCard[]} showMatch />
    </>
  );
}
