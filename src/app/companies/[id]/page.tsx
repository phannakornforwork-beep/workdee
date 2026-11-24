import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { JobList } from '@/components/JobList';
import { ShowMore } from '@/components/ShowMore';
import { Avatar, Badge, SectionHead } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { responseText } from '@/lib/format';
import type { JobCard } from '@/lib/types';

type Company = {
  id: string; name: string; industry: string | null; province: string | null; size_range: string | null; about: string | null;
  website: string | null; created_at: string; response_rate: number | null; response_sample: number; logo_path: string | null;
};

// อ่านจาก view สาธารณะ (เฉพาะบริษัทที่ยืนยันแล้ว) ใช้ร่วมกันระหว่าง metadata กับหน้า
const load = cache(async (id: string) => {
  const supabase = await createClient();
  const [{ data: company }, { data: jobs }] = await Promise.all([
    supabase.from('public_companies').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('job_board')
      .select('id, title, company_id, company_name, company_logo_path, job_type, province, work_mode, salary_min, salary_max, pay_unit, skills, published_at, closes_at, has_challenge, time_limit_minutes, response_rate, response_sample, gig_days')
      .eq('company_id', id)
      .order('published_at', { ascending: false })
  ]);
  return { company: company as Company | null, jobs: ((jobs || []) as Omit<JobCard, 'match_score' | 'applied'>[]).map((j) => ({ ...j, match_score: null, applied: false })) };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { company } = await load(id);
  return company ? { title: company.name, description: (company.about || '').slice(0, 160) } : { title: 'ไม่พบบริษัท' };
}

// หน้าบริษัทแบบ JobsDB: หัวบริษัท → ข้อมูลบริษัท (ตารางหัวข้อ–ค่า) → เกี่ยวกับ (แสดงเพิ่มเติม) → งานที่เปิดรับ
export default async function CompanyPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { company: c, jobs } = await load(id);
  if (!c) notFound();
  return (
    <>
      <PublicHeader />
      <main className="container page">
        <header className="page-head plain">
          <div className="card-head">
            <Avatar src={mediaUrl(c.logo_path)} name={c.name} tone="orange" size={72} square />
            <div className="stack-sm">
              <h1>{c.name}</h1>
              <div className="chips">
                <Badge tone="teal">บริษัทยืนยันแล้ว</Badge>
                <Badge>{responseText(c.response_rate, c.response_sample)}</Badge>
              </div>
            </div>
          </div>
        </header>

        <div className="split">
          <div className="main">
            <section className="card">
              <h2>ข้อมูลบริษัท</h2>
              <dl className="kv">
                <dt>ประเภทธุรกิจ</dt>
                <dd>{c.industry || '-'}</dd>
                <dt>ขนาด</dt>
                <dd>{c.size_range ? `${c.size_range} คน` : '-'}</dd>
                <dt>ที่ตั้ง</dt>
                <dd>{c.province || '-'}</dd>
                {c.website ? (
                  <>
                    <dt>เว็บไซต์</dt>
                    <dd>
                      <a href={c.website} target="_blank" rel="noreferrer noopener">
                        {c.website.replace(/^https?:\/\//, '')}
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
              {c.about ? (
                <ShowMore>
                  <p className="prewrap">{c.about}</p>
                </ShowMore>
              ) : null}
            </section>

            <section className="stack">
              <SectionHead title={`งานที่ ${c.name} (${jobs.length})`} />
              {jobs.length ? <JobList jobs={jobs as JobCard[]} /> : <div className="empty">ตอนนี้ยังไม่มีประกาศที่เปิดรับ</div>}
            </section>
          </div>

          <aside className="side">
            <section className="card">
              <h2>สัญญากับผู้สมัคร</h2>
              <ul className="stack-sm small">
                <li>ตอบทุกใบสมัครภายใน 7 วัน</li>
                <li>ไม่ผ่านต้องบอกเหตุผล</li>
                <li>บอกช่วงเงินเดือนทุกประกาศ</li>
                <li>โจทย์ไม่เกิน 2 ชั่วโมง ผลงานเป็นของคุณ</li>
              </ul>
              <Link href="/jobs" className="small">
                ดูงานจากบริษัทอื่น
              </Link>
            </section>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
