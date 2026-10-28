import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Footer, PublicHeader } from '@/components/PublicHeader';
import { JobFilters, JobList } from '@/components/JobList';
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
        <div className="stack-sm">
          <h1>ประกาศงานจากบริษัทที่ยืนยันแล้ว</h1>
          <p className="muted">ทุกประกาศบอกช่วงค่าตอบแทน และบริษัทต้องตอบผู้สมัครทุกคนภายใน 7 วัน</p>
        </div>
        <JobFilters action="/jobs" q={sp.q} type={sp.type} province={sp.province} />
        <JobList jobs={(data || []) as JobCard[]} />
      </main>
      <Footer />
    </>
  );
}
