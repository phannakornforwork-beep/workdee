import { Badge } from '@/components/ui';
import { AiScreenButton } from '@/components/ai/AiButtons';
import { EVIDENCE_TONE, LANG_TRUST, SCORE_WEIGHTS } from '@/lib/ai/labels';
import { thaiDateTime } from '@/lib/format';

export type AppAi = {
  match_score: number | null;
  matches: { name: string; must_have: boolean; weight: number; level: number; evidence: string; note: string }[];
  missing_must: string[];
  verified_score: number;
  verified_items: { label: string; trust: string; points: number }[];
  summary: string;
  screened_at: string | null;
  model?: string;
  grade_suggestion: { scores: { name: string; weight: number; score: number; reason: string }[]; feedback: string } | null;
} | null;

type Cert = { exam: string; score: string; exam_date: string | null; trust: string; verify_url: string | null };

const LEVEL: Record<string, [string, string]> = { '1': ['เจอชัด', 'teal'], '0.5': ['บางส่วน', 'orange'], '0': ['ไม่เจอ', 'gray'] };

// D. คะแนนอธิบายได้: 30% ตรงคุณสมบัติ (AI) + 60% ผลโจทย์ (HR ให้) + 10% หลักฐานที่ยืนยันแล้ว
export function AiScorePanel({
  companyId, appId, ai, taskScore, certs, enabled
}: {
  companyId: string; appId: string; ai: AppAi; taskScore: number | null; certs: Cert[]; enabled: boolean;
}) {
  const match = ai?.match_score ?? null;
  const verified = ai?.verified_score ?? 0;
  const total = match !== null && taskScore !== null ? Math.round(0.3 * match + 0.6 * taskScore + 0.1 * verified) : null;
  return (
    <section className="card ai-card">
      <div className="row-between">
        <h2>
          คะแนน WorkDee และที่มา {ai?.model === 'demo' ? <span className="badge orange">โหมดสาธิต</span> : null}
        </h2>
        <span className="ai-total">
          {total ?? '–'}
          <span className="small muted">/100</span>
        </span>
      </div>
      <div className="ai-parts">
        <div className="ai-part">
          <span className="small strong">ตรงคุณสมบัติ {SCORE_WEIGHTS.match}%</span>
          <span className="score">{match ?? '–'}</span>
          <span className="small muted">{match === null ? 'ยังไม่วิเคราะห์' : `= ${(match * 0.3).toFixed(1)} แต้ม`}</span>
        </div>
        <div className="ai-part">
          <span className="small strong">ผลโจทย์ {SCORE_WEIGHTS.task}%</span>
          <span className="score">{taskScore ?? '–'}</span>
          <span className="small muted">{taskScore === null ? 'ยังไม่ให้คะแนน' : `= ${(taskScore * 0.6).toFixed(1)} แต้ม`}</span>
        </div>
        <div className="ai-part">
          <span className="small strong">หลักฐานยืนยันแล้ว {SCORE_WEIGHTS.verified}%</span>
          <span className="score">{ai ? verified : '–'}</span>
          <span className="small muted">{ai ? `= ${(verified * 0.1).toFixed(1)} แต้ม` : '-'}</span>
        </div>
      </div>

      {ai?.missing_must?.length ? (
        <p className="error-text strong">ไม่พบข้อ &ldquo;ต้องมี&rdquo;: {ai.missing_must.join(', ')}</p>
      ) : null}
      {ai?.summary ? <p>{ai.summary}</p> : null}

      {ai?.matches?.length ? (
        <details className="disclosure">
          <summary>ดูว่าเจอคุณสมบัติตรงไหนใน CV</summary>
          <div className="stack-sm">
            {ai.matches.map((m) => {
              const [label, tone] = LEVEL[String(m.level)] || LEVEL['0'];
              return (
                <div key={m.name} className="ai-evidence">
                  <div className="row-between">
                    <span>
                      {m.must_have ? <Badge tone="red">ต้องมี</Badge> : null} {m.name} <span className="small muted">น้ำหนัก {m.weight}</span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  {m.evidence ? <mark className="ai-quote">&ldquo;{m.evidence}&rdquo;</mark> : null}
                  {m.note ? <span className="small muted">{m.note}</span> : null}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {ai ? (
        <details className="disclosure">
          <summary>หลักฐานที่ยืนยันแล้ว ({ai.verified_items.length} รายการ)</summary>
          <div className="stack-sm">
            {ai.verified_items.map((v, i) => (
              <span key={i} className="small">
                <Badge tone={EVIDENCE_TONE[v.trust] || 'gray'}>{v.trust === 'green' ? 'ยืนยันโดยระบบ' : 'ตรวจเอกสารแล้ว'}</Badge> {v.label} · {v.points} แต้ม
              </span>
            ))}
            {!ai.verified_items.length ? <span className="small muted">ยังไม่มีหลักฐานที่ยืนยันได้ (ข้อมูลที่ผู้สมัครพิมพ์เองไม่นับ)</span> : null}
            <span className="small muted">วุฒิยืนยันโดยสถาบัน 40 · ตรวจเอกสาร 28 · ผลโจทย์บน WorkDee งานละ 20 (สูงสุด 2 งาน) · ใบรับรองภาษายืนยันกับผู้จัดสอบ 20 · ตรวจเอกสาร 14</span>
          </div>
        </details>
      ) : null}

      {certs.length ? (
        <details className="disclosure">
          <summary>ใบรับรองภาษาที่ตรวจแล้ว ({certs.length})</summary>
          <div className="stack-sm">
          {certs.map((c, i) => (
            <span key={i} className="small">
              <Badge tone={LANG_TRUST[c.trust]?.tone || 'gray'}>{LANG_TRUST[c.trust]?.label || c.trust}</Badge> {c.exam} {c.score}
              {c.exam_date ? ` · สอบ ${c.exam_date}` : ''}
              {c.verify_url ? (
                <>
                  {' · '}
                  <a href={c.verify_url} target="_blank" rel="noreferrer noopener">
                    ตรวจกับผู้จัดสอบ
                  </a>
                </>
              ) : null}
            </span>
          ))}
          </div>
        </details>
      ) : null}

      {enabled ? (
        <AiScreenButton companyId={companyId} appId={appId} again={Boolean(ai?.screened_at)} />
      ) : (
        <span className="small muted">ยังไม่ได้เปิดใช้ AI (ผู้ดูแลต้องใส่ ANTHROPIC_API_KEY)</span>
      )}
      <span className="small muted">
        AI แนะนำ คนตัดสิน · ไม่ใช้ชื่อ อายุ เพศ รูป หรือสถาบันคิดคะแนน
        {ai?.screened_at ? ` · ${ai.model === 'demo' ? 'โหมดสาธิต' : 'วิเคราะห์'} ${thaiDateTime(ai.screened_at)}` : ''}
      </span>
    </section>
  );
}
