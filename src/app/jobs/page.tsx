import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { JobFilters, JobList } from '@/components/JobList';
import { PageTitle, SectionHead } from '@/components/ui';
import type { JobCard } from '@/lib/types';

export const metadata: Metadata = { title: 'ประกาศงาน' };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; province?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc('job_feed', { p_q: sp.q || null, p_type: sp.type || null, p_province: sp.province || null, p_limit: 60 });
  return (
    <>
      <PublicHeader />
      <main className="container page">
        <PageTitle
          title="หางาน"
          sub="ทุกประกาศบอกเงินเดือน และตอบผู้สมัครใน 7 วัน"
          search={<JobFilters action="/jobs" q={sp.q} type={sp.type} province={sp.province} />}
        />
        <SectionHead title={sp.q || sp.type || sp.province ? `ผลการค้นหา ${(data || []).length} งาน` : 'งานล่าสุด'} />
        <JobList jobs={(data || []) as JobCard[]} />
      </main>
      <Footer />
    </>
  );
}
