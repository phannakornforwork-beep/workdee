'use client';

import { useActionState, useState } from 'react';
import { gradeAction } from '@/lib/actions/hiring';
import { FormMessage, SubmitButton } from '@/components/forms';
import type { Criterion } from '@/lib/types';

export function GradeForm({ companyId, appId, criteria, initial }: { companyId: string; appId: string; criteria: Criterion[]; initial?: Record<string, number> }) {
  const [state, action] = useActionState(gradeAction, null);
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    for (const c of criteria) s[c.name] = initial?.[c.name] ?? Math.round(c.weight / 2);
    return s;
  });
  const total = criteria.reduce((sum, c) => sum + (scores[c.name] || 0), 0);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="app_id" value={appId} />
      {criteria.map((c) => (
        <div key={c.name} className="field">
          <label htmlFor={`score-${c.name}`}>
            {c.name} <span className="muted">(เต็ม {c.weight})</span>
          </label>
          <input type="hidden" name="crit_name" value={c.name} />
          <div className="row">
            <input
              id={`score-${c.name}`}
              type="range"
              min={0}
              max={c.weight}
              value={scores[c.name]}
              onChange={(e) => setScores({ ...scores, [c.name]: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <input
              name={`score:${c.name}`}
              className="input"
              style={{ width: 80 }}
              inputMode="numeric"
              value={scores[c.name]}
              aria-label={`คะแนน ${c.name}`}
              onChange={(e) => setScores({ ...scores, [c.name]: Math.min(c.weight, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </div>
        </div>
      ))}
      <div className="row-between">
        <span className="strong">รวม</span>
        <span className="score" style={{ fontSize: 22 }}>
          {total}/100
        </span>
      </div>
      <div className="field">
        <label htmlFor="feedback">ความเห็นถึงผู้สมัคร (ผู้สมัครเห็น)</label>
        <textarea id="feedback" name="feedback" className="textarea" maxLength={3000} placeholder="จุดที่ทำได้ดี และสิ่งที่ควรพัฒนา" />
      </div>
      <SubmitButton>บันทึกคะแนน</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
