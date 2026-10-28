import Link from 'next/link';
import type { Metadata } from 'next';
import { can, requireCompany } from '@/lib/auth';
import { NoAccess } from '@/components/ui';
import { JobForm } from '@/components/JobForm';
import { JOB_TEMPLATES } from '@/lib/templates';

export const metadata: Metadata = { title: 'ลงประกาศใหม่' };

export default async function NewJob({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ template?: string }> }) {
  const { cid } = await params;
  const sp = await searchParams;
  const { supabase, access } = await requireCompany(cid);
  if (!can(access, 'post')) return <NoAccess title="ลงประกาศใหม่" need="ลงประกาศงาน" cid={cid} />;
  const { data: positions } = await supabase.from('positions').select('id, title, is_department, parent_id').eq('company_id', cid).order('created_at');
  const departments = ((positions || []) as { id: string; title: string; is_department: boolean; parent_id: string | null }[])
    .filter((p) => p.is_department || !p.parent_id)
    .map((p) => ({ id: p.id, title: p.parent_id ? p.title : `${p.title} (ทั้งบริษัท)` }));
  const t = JOB_TEMPLATES.find((x) => x.key === sp.template);
  return (
    <>
      <Link href={`/c/${cid}/jobs`} className="small">
        ← ประกาศทั้งหมด
      </Link>
      <h1>ลงประกาศใหม่</h1>
      <div className="card soft tight">
        <span className="strong">เริ่มจากเทมเพลต</span>
        <div className="chips">
          {JOB_TEMPLATES.map((x) => (
            <Link key={x.key} href={`/c/${cid}/jobs/new?template=${x.key}`} className={`chip ${sp.template === x.key ? 'on' : ''}`}>
              {x.label}
            </Link>
          ))}
          <Link href={`/c/${cid}/jobs/new`} className={`chip ${!t ? 'on' : ''}`}>
            เริ่มจากว่าง
          </Link>
        </div>
      </div>
      <JobForm
        key={sp.template || 'blank'}
        companyId={cid}
        departments={departments}
        job={t ? { ...t.job, department_id: departments[0]?.id } : { department_id: departments[0]?.id }}
        challenge={
          t
            ? {
                title: t.challenge.title,
                brief: t.challenge.brief,
                deliverable: t.challenge.deliverable,
                time_limit_minutes: t.challenge.minutes,
                due_days: t.challenge.due_days,
                criteria: t.challenge.criteria,
                ai_policy: 'allowed_declare',
                skill_key: t.challenge.skill_key,
                accept_reuse: true
              }
            : null
        }
      />
    </>
  );
}
