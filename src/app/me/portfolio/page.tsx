import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { Badge, Empty, PageTitle, Stat } from '@/components/ui';
import { ResultCard } from '@/components/Brand';
import { PortfolioHideButton } from '@/components/ai/AiButtons';
import { JOB_TYPE, thaiDate } from '@/lib/format';

export const metadata: Metadata = { title: 'แฟ้มผลงาน' };

type Item = {
  application_id: string; job_title: string; company_name: string; job_type: string; stage: string; skill_key: string | null;
  scores: { name: string; weight: number; score: number }[] | null; total: number | null; feedback: string | null; reused: boolean | null;
  graded_at: string | null; submitted_at: string | null; hidden: boolean;
};
type Portfolio = { items: Item[]; stats: { done: number; avg: number | null; interviews: number; hired: number; repeat_companies: number } };

// เส้นคะแนนโจทย์ตามเวลา (เก่า → ใหม่)
function Trend({ points }: { points: { at: string; total: number }[] }) {
  if (points.length < 2) return null;
  const W = 600, H = 180, L = 36, R = 16, T = 12, B = 28;
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="คะแนนโจทย์ตามลำดับเวลา" className="trend">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="trend-label">
              {v}
            </text>
          </g>
        ))}
        <path d={d} className="trend-line" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.total)} r={i === points.length - 1 ? 5 : 3} className="trend-dot" />
        ))}
        <text x={x(0)} y={H - 6} className="trend-label">
          {thaiDate(points[0].at)}
        </text>
        <text x={x(points.length - 1)} y={H - 6} textAnchor="end" className="trend-label">
          {thaiDate(last.at)}
        </text>
      </svg>
    </div>
  );
}

export default async function PortfolioPage() {
  const { supabase } = await requireUser('/me/portfolio');
  const { data } = await supabase.rpc('my_portfolio');
  const p = (data || { items: [], stats: { done: 0, avg: null, interviews: 0, hired: 0, repeat_companies: 0 } }) as Portfolio;
  const graded = p.items.filter((i) => i.total !== null && !i.reused && !i.hidden && i.graded_at);
  const trend = [...graded].reverse().map((i) => ({ at: i.graded_at as string, total: i.total as number }));

  return (
    <>
      <PageTitle title="แฟ้มผลงาน" sub="ใบผลงานทุกใบที่คุณได้ บันทึกอัตโนมัติ ซ่อนได้ แต่แก้คะแนนไม่ได้" />
      <div className="grid-sm">
        <Stat label="ใบผลงาน" value={p.stats.done} />
        <Stat label="คะแนนเฉลี่ย" value={p.stats.avg ?? '–'} />
        <Stat label="ผ่านเข้าสัมภาษณ์" value={p.stats.interviews} />
        <Stat label="ได้งาน" value={p.stats.hired} />
      </div>

      {trend.length >= 2 ? (
        <section className="card">
          <h2>พัฒนาการคะแนน</h2>
          <Trend points={trend} />
        </section>
      ) : null}

      <section className="stack">
        <h2>ใบผลงานของฉัน</h2>
        {p.items.length === 0 ? (
          <Empty>
            ยังไม่มีใบผลงาน สมัครงานที่มีโจทย์เพื่อเริ่มสะสม <Link href="/me">หางาน</Link>
          </Empty>
        ) : (
          <div className="result-grid">
            {p.items.map((i) =>
              (i.scores || []).length && i.total !== null ? (
                <div key={i.application_id} className={i.hidden ? 'dim' : ''}>
                  <ResultCard
                    inline
                    tag={i.reused ? 'ใบผลงาน · ใช้ผลเดิม' : 'ใบผลงาน · ยืนยันโดยระบบ'}
                    title={`${i.job_title} · ${i.company_name}`}
                    scores={i.scores || []}
                    total={i.total}
                    note={i.feedback}
                    noteLabel="คำแนะนำ:"
                    foot={[
                      `${JOB_TYPE[i.job_type] || i.job_type}${i.graded_at ? ` · ${thaiDate(i.graded_at)}` : ''}`,
                      ...(i.stage === 'hired' ? ['ได้งานนี้'] : []),
                      ...(i.hidden ? ['ซ่อนอยู่'] : [])
                    ]}
                  >
                    <PortfolioHideButton appId={i.application_id} hidden={i.hidden} />
                  </ResultCard>
                </div>
              ) : (
                <div key={i.application_id} className={`card ${i.hidden ? 'dim' : ''}`}>
                  <span className="strong">
                    {i.job_title} · {i.company_name}
                  </span>
                  <div className="chips">
                    <Badge tone="teal">ยืนยันโดยระบบ</Badge>
                    {i.stage === 'hired' ? <Badge tone="blue">ได้งาน</Badge> : null}
                    {i.hidden ? <Badge tone="gray">ซ่อนอยู่</Badge> : null}
                  </div>
                  <PortfolioHideButton appId={i.application_id} hidden={i.hidden} />
                </div>
              )
            )}
          </div>
        )}
      </section>
    </>
  );
}
