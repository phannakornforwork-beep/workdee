import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getUser } from '@/lib/auth';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { Avatar, Badge } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { ShowMore } from '@/components/ShowMore';
import { ActionForm, SubmitButton } from '@/components/forms';
import { applyAction } from '@/lib/actions/candidate';
import { AI_POLICY, JOB_TYPE, WORK_MODE, hasResponseStat, salaryRange, thaiDate } from '@/lib/format';
import { SaveJobButton } from '@/components/SavedJobs';
import { PromiseBar, RubricPreview } from '@/components/Brand';
import type { Criterion } from '@/lib/types';

type Job = {
  id: string; company_id: string; company_name: string; company_logo_path: string | null; company_industry: string | null; title: string; job_type: string;
  description: string; responsibilities: string; requirements: string; skills: string[]; province: string | null; work_mode: string;
  salary_min: number | null; salary_max: number | null; pay_unit: string; gig_days: number | null; gig_start: string | null; gig_end: string | null;
  headcount: number; published_at: string; closes_at: string | null; has_challenge: boolean; challenge_title: string | null;
  time_limit_minutes: number | null; due_days: number | null; challenge_criteria: Criterion[] | null; ai_policy: string | null;
  accept_reuse: boolean | null; response_rate: number | null; response_sample: number;
};

// cache ต่อคำขอ: generateMetadata กับหน้าใช้ผลเดียวกัน (เดิมยิง query ซ้ำ 2 ครั้ง)
const load = cache(async (id: string) => {
  const { supabase, user } = await getUser();
  const { data } = await supabase.from('job_board').select('*').eq('id', id).maybeSingle();
  return { supabase, user, job: data as Job | null };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { job } = await load(id);
  return job ? { title: `${job.title} · ${job.company_name}`, description: job.description.slice(0, 160) } : { title: 'ไม่พบประกาศ' };
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, job } = await load(id);
  if (!job) notFound();
  let applied: string | null = null;
  let hasProfile = false;
  let planShared = false;
  if (user) {
    const [{ data: app }, { data: cp }, { data: plan }] = await Promise.all([
      supabase.from('applications').select('id').eq('job_id', id).eq('candidate_id', user.id).maybeSingle(),
      supabase.from('candidate_profiles').select('full_name, expected_salary').eq('user_id', user.id).maybeSingle(),
      supabase.from('career_plans').select('share_with_companies').eq('user_id', user.id).maybeSingle()
    ]);
    applied = (app?.id as string) || null;
    hasProfile = Boolean(cp?.full_name);
    planShared = Boolean(plan?.share_with_companies);
  }
  return (
    <>
      <PublicHeader />
      <main className="container page">
        <div className="split">
          <div className="main">
            <div className="stack-sm">
              <span className="card-head">
                <Avatar src={mediaUrl(job.company_logo_path)} name={job.company_name} tone="orange" size={48} square />
                <span className="muted">
                  <Link href={`/companies/${job.company_id}`}>{job.company_name}</Link>
                  {job.company_industry ? ` · ${job.company_industry}` : ''}
                </span>
              </span>
              <h1>{job.title}</h1>
              <div className="row">
                <SaveJobButton jobId={job.id} />
              </div>
              <div className="chips">
                <Badge tone="teal">บริษัทยืนยันแล้ว</Badge>
                <Badge>{JOB_TYPE[job.job_type]}</Badge>
                <Badge>{job.work_mode === 'remote' ? WORK_MODE.remote : `${job.province || ''} · ${WORK_MODE[job.work_mode]}`}</Badge>
                {job.headcount > 1 ? <Badge>รับ {job.headcount} คน</Badge> : null}
              </div>
            </div>
            <div className="card">
              <div className="kv">
                <dt>ค่าตอบแทน</dt>
                <dd className="strong">{salaryRange(job.salary_min, job.salary_max, job.pay_unit)}</dd>
                {job.job_type === 'gig' ? (
                  <>
                    <dt>ช่วงงาน</dt>
                    <dd>
                      {job.gig_start ? thaiDate(job.gig_start) : '-'} ถึง {job.gig_end ? thaiDate(job.gig_end) : '-'}
                      {job.gig_days ? ` · ${job.gig_days} วัน` : ''}
                    </dd>
                  </>
                ) : null}
                <dt>ปิดรับ</dt>
                <dd>{job.closes_at ? thaiDate(job.closes_at) : 'จนกว่าจะได้คน'}</dd>
                <dt>การตอบผู้สมัคร</dt>
                <dd>{hasResponseStat(job.response_rate, job.response_sample) ? `ตอบตรงเวลา ${job.response_rate}%` : 'บริษัทใหม่ · ตอบทุกคนใน 7 วัน'}</dd>
              </div>
            </div>
            <section className="card">
              <h2>รายละเอียดงาน</h2>
              <ShowMore lines={4}>
                <p className="prewrap">{job.description || '-'}</p>
              </ShowMore>
              {job.responsibilities ? (
                <>
                  <h3>หน้าที่</h3>
                  <ShowMore lines={4}>
                    <p className="prewrap">{job.responsibilities}</p>
                  </ShowMore>
                </>
              ) : null}
              {job.requirements ? (
                <>
                  <h3>คุณสมบัติ</h3>
                  <ShowMore lines={4}>
                    <p className="prewrap">{job.requirements}</p>
                  </ShowMore>
                </>
              ) : null}
              {job.skills?.length ? (
                <div className="chips">
                  {job.skills.map((s) => (
                    <Badge key={s} tone="blue">
                      {s}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </section>
            {job.has_challenge ? (
              <section className="card proof-section">
                <span className="eyebrow">พิสูจน์ฝีมือ · ไม่ต้องมีประสบการณ์</span>
                <h2>{job.challenge_title}</h2>
                <div className="chips">
                  <span className="badge gray">ประมาณ {job.time_limit_minutes} นาที</span>
                  <span className="badge gray">ส่งภายใน {job.due_days} วันหลังได้รับเชิญ</span>
                  {job.accept_reuse ? <span className="badge teal">ใช้ผลโจทย์เดิมได้</span> : null}
                </div>
                <div className="stack-sm">
                  <span className="label">บริษัทจะให้คะแนนตามเกณฑ์นี้</span>
                  <RubricPreview criteria={job.challenge_criteria || []} />
                </div>
                <p className="small muted">
                  {AI_POLICY[job.ai_policy || 'allowed_declare']} · ทำเสร็จได้ใบผลงานพร้อมคำแนะนำ · ผลงานเป็นของคุณ
                </p>
              </section>
            ) : null}
            <PromiseBar />
          </div>
          <aside className="side">
            <section className="card highlight">
              {applied ? (
                <>
                  <h2>คุณสมัครงานนี้แล้ว</h2>
                  <Link href={`/me/applications/${applied}`} className="btn">
                    ดูสถานะใบสมัคร
                  </Link>
                </>
              ) : !user ? (
                <>
                  <h2>สมัครงานนี้</h2>
                  <Link href={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`} className="btn">
                    เข้าสู่ระบบเพื่อสมัคร
                  </Link>
                  <Link href={`/signup?next=${encodeURIComponent(`/jobs/${job.id}`)}`} className="btn outline">
                    สมัครบัญชีใหม่
                  </Link>
                </>
              ) : !hasProfile ? (
                <>
                  <h2>สร้างโปรไฟล์ก่อนสมัคร</h2>
                  <Link href="/me/profile" className="btn">
                    สร้างโปรไฟล์
                  </Link>
                </>
              ) : (
                <ActionForm action={applyAction}>
                  <h2>สมัครงานนี้</h2>
                  <input type="hidden" name="job_id" value={job.id} />
                  <div className="field">
                    <label htmlFor="intro">แนะนำตัวสั้นๆ ถึงบริษัทนี้</label>
                    <textarea id="intro" name="intro" className="textarea" maxLength={2000} placeholder="ทำไมสนใจงานนี้" />
                  </div>
                  <div className="field">
                    <label htmlFor="expected_salary">ค่าตอบแทนที่คาดหวัง (บาท)</label>
                    <input id="expected_salary" name="expected_salary" className="input" inputMode="numeric" />
                  </div>
                  <label className="check">
                    <input type="checkbox" name="share_plan" disabled={!planShared} />
                    <span>
                      แชร์แผนอาชีพกับบริษัทนี้
                      {!planShared ? (
                        <span className="hint">
                          {' '}
                          (ปิดอยู่ เปิดได้ที่ <Link href="/me/plan">แผนอาชีพ</Link>)
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <div className="alert privacy small">
                    บริษัทจะเห็นโปรไฟล์และผลงาน ไม่เห็นเบอร์โทร อีเมล หรือที่อยู่
                  </div>
                  <SubmitButton className="btn block" pendingText="กำลังส่งใบสมัคร…">
                    ยืนยันสมัครงาน
                  </SubmitButton>
                </ActionForm>
              )}
            </section>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
