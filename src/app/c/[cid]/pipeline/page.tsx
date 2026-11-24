import Link from 'next/link';
import type { Metadata } from 'next';
import { can, requireCompany } from '@/lib/auth';
import { NoAccess, PageTitle } from '@/components/ui';
import { PipelineBoard } from './PipelineBoard';
import type { PipelineItem, Template } from '@/lib/types';
import { KeywordScreen, type ScreenApp } from '@/components/ai/KeywordScreen';
import { AiDemoNotice } from '@/components/ai/AiDemoNotice';

export const metadata: Metadata = { title: 'กระดานผู้สมัคร' };

export default async function PipelinePage({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ job?: string; kw?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase, access } = await requireCompany(cid);
  if (!can(access, 'screen')) return <NoAccess title="กระดานผู้สมัคร" need="ดูแลผู้สมัคร" cid={cid} />;
  const [{ data: items }, { data: jobs }, { data: templates }, { data: reasons }, { data: slots }, { data: company }] = await Promise.all([
    supabase.rpc('company_pipeline', { p_company: cid, p_job: sp.job || null }),
    supabase.rpc('company_jobs_overview', { p_company: cid }),
    supabase.from('message_templates').select('id, kind, label, body, is_default').eq('company_id', cid).order('created_at'),
    supabase.from('reject_reasons').select('code, label, needs_note').eq('system_only', false).order('sort'),
    supabase.from('interview_slots').select('id, starts_at, ends_at, mode, location, job_id, capacity').eq('company_id', cid).gt('starts_at', new Date().toISOString()).order('starts_at').limit(60),
    supabase.from('companies').select('name').eq('id', cid).maybeSingle()
  ]);
  // ผู้สมัครของประกาศที่เลือก (สิทธิ์อ่านตาม RLS: ผู้ดูแลผู้สมัครของแผนกนั้น) ใช้คัดกรองด้วยคีย์เวิร์ด
  const { data: screenApps } = sp.job
    ? await supabase
        .from('applications')
        .select('id, candidate_name, stage, intro_message, profile_snapshot, created_at')
        .eq('job_id', sp.job)
        .not('profile_snapshot', 'is', null)
        .not('stage', 'in', '(withdrawn,expired)')
        .order('created_at')
        .limit(300)
    : { data: null };
  const jobList = ((jobs || []) as { id: string; title: string; status: string; challenge_seats: number; seats_used: number; total: number; can_screen: boolean; has_challenge: boolean }[]).filter(
    (j) => j.can_screen && j.status !== 'draft'
  );
  return (
    <>
      <PageTitle title="ผู้สมัคร" sub="คัดจากผลงาน ตอบทุกคนให้ครบใน 7 วัน">
        <Link href={`/c/${cid}/interviews`} className="btn ghost small">
          จัดเวลาสัมภาษณ์
        </Link>
      </PageTitle>
      <nav className="tabs" aria-label="กรองตามประกาศ">
        <Link href={`/c/${cid}/pipeline`} aria-current={!sp.job ? 'page' : undefined}>
          ทุกประกาศ
        </Link>
        {jobList.map((j) => (
          <Link key={j.id} href={`/c/${cid}/pipeline?job=${j.id}`} aria-current={sp.job === j.id ? 'page' : undefined}>
            {j.title} ({j.total})
          </Link>
        ))}
      </nav>
      {sp.job && screenApps ? <AiDemoNotice /> : null}
      {sp.job && screenApps ? <KeywordScreen companyId={cid} jobId={sp.job} q={sp.kw || ''} apps={screenApps as ScreenApp[]} /> : null}
      <PipelineBoard
        companyId={cid}
        companyName={(company?.name as string) || ''}
        items={(items || []) as PipelineItem[]}
        jobs={jobList}
        templates={(templates || []) as Template[]}
        reasons={(reasons || []) as { code: string; label: string; needs_note: boolean }[]}
        slots={(slots || []) as { id: string; starts_at: string; mode: string; location: string; job_id: string | null }[]}
      />
    </>
  );
}
