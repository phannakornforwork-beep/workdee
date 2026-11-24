import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { JobList } from '@/components/JobList';
import { ShowMore } from '@/components/ShowMore';
import { Avatar, Badge, PageTitle, SectionHead } from '@/components/ui';
import { mediaUrl } from '@/lib/env';
import { thaiDate } from '@/lib/format';
import type { JobCard } from '@/lib/types';

// หน้าบริษัทสาธารณะแบบ JobsDB: ข้อมูลบริษัทเป็นตาราง + เกี่ยวกับ (ตัดข้อความ) + งานที่เปิดรับ
// จุดต่างของ WorkDee: แสดงสถิติการตอบผู้สมัครจริงจากระบบ แทนรีวิวที่ใครก็เขียนได้
type Company = {
  id: string; name: string; industry: string | null; province: string | null; size_range: string | null; about: string | null;
  website: string | null; created_at: string; response_rate: number | null; response_sample: number; logo_path: string | null;
};

const load = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from('public_companies').select('*').eq('id', id).maybeSingle();
  return { supabase, company: data as Company | null };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { company } = await load(id);
  return company ? { title: company.name, description: (company.about || '').slice(0, 160) } : { title: 'ไม่พบบริษัท' };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, company: c } = await load(id);
  if (!c) notFound();
  const { data: jobs } = await supabase.from('job_board').select('*').eq('company_id', id).order('published_at', { ascending: false });
  const cards = ((jobs || []) as Omit<JobCard, 'match_score' | 'applied'>[]).map((j) => ({ ...j, match_score: null, applied: false })) as JobCard[];

  return (
    <>
      <PublicHeader />
      <main className="container page">
        <PageTitle
          title={
            <span className="card-head">
              <Avatar src={mediaUrl(c.logo_path)} name={c.name} tone="orange" size={56} square />
              {c.name}
            </span>
          }
          sub={[c.industry, c.province].filter(Boolean).join(' · ')}
        >
          <Badge tone="teal">ยืนยันบริษัทแล้ว</Badge>
        </PageTitle>

        <div className="split">
          <div className="main">
            <section className="card">
              <h2>ข้อมูลบริษัท</h2>
              <dl className="kv">
                <dt>ประเภทธุรกิจ</dt>
                <dd>{c.industry || '-'}</dd>
                <dt>ขนาดบริษัท</dt>
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
                <dt>อยู่บน WorkDee ตั้งแต่</dt>
                <dd>{thaiDate(c.created_at)}</dd>
              </dl>
              {c.about ? (
                <ShowMore>
                  <p className="prewrap">{c.about}</p>
                </ShowMore>
              ) : null}
            </section>

            <section className="stack">
              <SectionHead title={`งานที่ ${c.name} (${cards.length})`} />
              <JobList jobs={cards} />
            </section>
          </div>

          <aside className="side">
            <section className="card highlight">
              <h2>การตอบผู้สมัคร</h2>
              {c.response_rate !== null ? (
                <>
                  <div className="stat">
                    <span className="value">{c.response_rate}%</span>
                    <span className="label">ตอบภายใน 7 วัน (จาก {c.response_sample} ใบสมัครใน 90 วัน)</span>
                  </div>
                </>
              ) : (
                <p className="muted small">บริษัทใหม่ ยังมีใบสมัครไม่พอคำนวณ</p>
              )}
              <p className="small muted">นับจากระบบจริง บริษัทแก้ตัวเลขนี้เองไม่ได้</p>
            </section>
            <section className="card">
              <h2>สมัครที่นี่แล้วได้อะไร</h2>
              <ul className="stack-sm small">
                <li>ได้คำตอบทุกขั้นภายใน 7 วัน</li>
                <li>ไม่ผ่านก็ได้เหตุผล</li>
                <li>เห็นเกณฑ์ให้คะแนนโจทย์ก่อนทำ</li>
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
