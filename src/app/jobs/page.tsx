import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { JobFilters, JobList, refineJobs, type JobQuery } from '@/components/JobList';
import { PageTitle, SectionHead } from '@/components/ui';
import { PromiseBar } from '@/components/Brand';
import type { JobCard } from '@/lib/types';

export const metadata: Metadata = { title: 'ประกาศงาน' };

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobQuery> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc('job_feed', { p_q: sp.q || null, p_type: sp.type || null, p_province: sp.province || null, p_limit: 100 });
  const jobs = refineJobs((data || []) as JobCard[], sp);
  return (
    <>
      <PublicHeader />
      <main className="container page">
        <PageTitle
          title="หางาน"
          sub="ทุกประกาศบอกเงินเดือน และตอบผู้สมัครใน 7 วัน"
          search={<JobFilters action="/jobs" {...sp} />}
        />
        <SectionHead title={sp.q || sp.type || sp.province || sp.salary ? `ผลการค้นหา ${jobs.length} งาน` : `งานทั้งหมด ${jobs.length} งาน`} />
        <PromiseBar />
        <JobList jobs={jobs} />
      </main>
      <Footer />
    </>
  );
}
