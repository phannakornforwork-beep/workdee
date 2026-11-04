import Link from 'next/link';
import { Badge, StageBadge } from '@/components/ui';
import { AiScreenJobButton } from '@/components/ai/AiButtons';

export type RankRow = {
  id: string; candidate_name: string; stage: string; match_score: number | null; missing_must: string[] | null;
  verified_score: number | null; screened_at: string | null; summary: string | null; task_score: number | null; total: number | null;
};

// C+D. ผู้สมัครทุกคนของประกาศเรียงตามคะแนน กดเข้าไปดูที่มาของคะแนนได้ทุกคน
export function AiRanking({ companyId, jobId, rows, enabled }: { companyId: string; jobId: string; rows: RankRow[]; enabled: boolean }) {
  const pendingCount = rows.filter((r) => !r.screened_at && !['rejected', 'declined'].includes(r.stage)).length;
  return (
    <section className="card ai-card">
      <div className="row-between">
        <div className="stack-sm">
          <h2>อันดับผู้สมัครโดย AI</h2>
          <span className="small muted">คะแนนรวม = ตรงคุณสมบัติ 30% + ผลโจทย์ 60% + หลักฐานยืนยันแล้ว 10% · กดชื่อเพื่อดูเหตุผลทุกข้อ</span>
        </div>
        {enabled ? <AiScreenJobButton companyId={companyId} jobId={jobId} pendingCount={pendingCount} /> : <span className="small muted">ยังไม่ได้เปิดใช้ AI</span>}
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table ai-rank">
            <thead>
              <tr>
                <th>#</th>
                <th>ผู้สมัคร</th>
                <th className="num">ตรงคุณสมบัติ</th>
                <th className="num">ผลโจทย์</th>
                <th className="num">หลักฐาน</th>
                <th className="num">รวม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    <div className="stack-sm">
                      <Link href={`/c/${companyId}/applications/${r.id}`} className="strong">
                        {r.candidate_name || 'ผู้สมัคร'}
                      </Link>
                      <span className="chips">
                        <StageBadge stage={r.stage} />
                        {r.missing_must?.length ? <Badge tone="red">ขาดข้อต้องมี {r.missing_must.length}</Badge> : null}
                        {!r.screened_at ? <Badge tone="gray">ยังไม่วิเคราะห์</Badge> : null}
                      </span>
                      {r.summary ? <span className="tiny muted">{r.summary}</span> : null}
                    </div>
                  </td>
                  <td className="num">{r.match_score ?? '–'}</td>
                  <td className="num">{r.task_score ?? '–'}</td>
                  <td className="num">{r.screened_at ? r.verified_score ?? 0 : '–'}</td>
                  <td className="num">
                    <span className="score">{r.total ?? '–'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small muted">ยังไม่มีผู้สมัคร</p>
      )}
      <span className="tiny muted">ก่อนให้คะแนนโจทย์ ระบบเรียงตามความตรงคุณสมบัติ เพื่อช่วยเลือกว่าจะเชิญใครเข้ารอบโจทย์ · ไม่ใช้ชื่อ อายุ เพศ รูป หรือชื่อสถาบันในการคิดคะแนน</span>
    </section>
  );
}
