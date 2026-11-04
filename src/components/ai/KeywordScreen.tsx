import Link from 'next/link';
import { Badge, StageBadge } from '@/components/ui';
import { highlight, matchKeywords, parseKeywords, type Snap } from '@/lib/keyword-match';

export type ScreenApp = { id: string; candidate_name: string; stage: string; intro_message: string; profile_snapshot: Snap | null; created_at: string };

// C. คัดกรองผู้สมัครด้วยคีย์เวิร์ด: HR ไม่ต้องอ่านทีละคน
export function KeywordScreen({ companyId, jobId, q, apps }: { companyId: string; jobId: string; q: string; apps: ScreenApp[] }) {
  const keywords = parseKeywords(q);
  const results = keywords.length
    ? apps
        .map((a) => ({ a, r: matchKeywords(keywords, a.intro_message, a.profile_snapshot) }))
        .sort((x, y) => y.r.score - x.r.score || y.r.hits.length - x.r.hits.length || x.a.created_at.localeCompare(y.a.created_at))
    : [];
  const matched = results.filter((x) => x.r.hits.length > 0).length;

  return (
    <section className="card ai-card">
      <div className="stack-sm">
        <h2>คัดกรองผู้สมัครด้วยคีย์เวิร์ด</h2>
        <span className="small muted">
          พิมพ์สิ่งที่ต้องการ คั่นด้วยจุลภาค ระบบค้นในข้อความแนะนำตัวของใบสมัคร โปรไฟล์ ประสบการณ์ และผลงานของผู้สมัครทุกคน รวมคำที่มีความหมายเดียวกัน (เช่น &ldquo;ยิงแอด&rdquo; = Meta Ads)
        </span>
      </div>
      <form method="get" className="row" role="search">
        <input type="hidden" name="job" value={jobId} />
        <label htmlFor="kw" className="sr-only">
          คีย์เวิร์ด
        </label>
        <input id="kw" name="kw" className="input" style={{ flex: '1 1 260px' }} defaultValue={q} placeholder="เช่น ยิงแอด, เขียนคอนเทนต์, Canva, TOEIC" maxLength={300} />
        <button type="submit" className="btn ai">
          คัดกรอง
        </button>
        {q ? (
          <Link href={`/c/${companyId}/pipeline?job=${jobId}`} className="btn ghost small">
            ล้าง
          </Link>
        ) : null}
      </form>

      {keywords.length ? (
        <>
          <p className="small">
            เจอ <strong>{matched}</strong> จาก {apps.length} คน · เรียงตามจำนวนคีย์เวิร์ดที่ตรง
          </p>
          <div className="stack-sm">
            {results.map(({ a, r }, i) => (
              <div key={a.id} className={`kw-result ${r.hits.length ? '' : 'dim'}`}>
                <div className="row-between">
                  <span className="row">
                    <span className="muted small">{i + 1}.</span>
                    <Link href={`/c/${companyId}/applications/${a.id}`} className="strong">
                      {a.candidate_name || 'ผู้สมัคร'}
                    </Link>
                    <StageBadge stage={a.stage} />
                  </span>
                  <span className="row">
                    <span className="kw-bar" aria-hidden="true">
                      <span style={{ width: `${r.score}%` }} />
                    </span>
                    <span className="score">
                      {r.hits.length}/{keywords.length}
                    </span>
                  </span>
                </div>
                {r.hits.map((h) => (
                  <div key={h.keyword} className="small kw-hit">
                    <Badge tone="teal">{h.keyword}</Badge> <span className="tiny muted">{h.source}:</span>{' '}
                    {highlight(h.snippet, h.term).map((p, j) => (p.mark ? <mark key={j} className="ai-quote">{p.text}</mark> : <span key={j}>{p.text}</span>))}
                  </div>
                ))}
                {r.missing.length ? <span className="tiny muted">ไม่พบ: {r.missing.join(', ')}</span> : null}
              </div>
            ))}
            {apps.length === 0 ? <p className="small muted">ยังไม่มีผู้สมัครในประกาศนี้</p> : null}
          </div>
        </>
      ) : (
        <p className="small muted">ยังไม่ได้ใส่คีย์เวิร์ด · ผู้สมัครทั้งหมด {apps.length} คน</p>
      )}
    </section>
  );
}
