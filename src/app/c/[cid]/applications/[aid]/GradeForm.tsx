'use client';

import { useActionState, useState, useTransition } from 'react';
import { gradeAction } from '@/lib/actions/hiring';
import { suggestGradeAction } from '@/lib/actions/ai';
import { FormMessage, SubmitButton } from '@/components/forms';
import type { Criterion } from '@/lib/types';

type Suggestion = { scores: { name: string; weight: number; score: number; reason: string }[]; feedback: string };

export function GradeForm({
  companyId, appId, criteria, initial, suggestion, aiEnabled = true
}: {
  companyId: string; appId: string; criteria: Criterion[]; initial?: Record<string, number>; suggestion?: Suggestion | null; aiEnabled?: boolean;
}) {
  const [state, action] = useActionState(gradeAction, null);
  const [ai, setAi] = useState<Suggestion | null>(suggestion || null);
  const [aiError, setAiError] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [aiPending, startAi] = useTransition();
  const [feedback, setFeedback] = useState('');
  const reasonOf = (name: string) => ai?.scores.find((x) => x.name === name);

  function askAi() {
    setAiError('');
    startAi(async () => {
      const res = await suggestGradeAction(companyId, appId);
      if (!res.ok) return setAiError(res.error);
      const sug = res.data as Suggestion;
      setAiNote(res.message || '');
      setAi(sug);
      setScores(Object.fromEntries(criteria.map((c) => [c.name, sug.scores.find((x) => x.name === c.name)?.score ?? scores[c.name]])));
      if (!feedback.trim()) setFeedback(sug.feedback);
    });
  }
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    for (const c of criteria) s[c.name] = initial?.[c.name] ?? Math.round(c.weight / 2);
    return s;
  });
  const total = criteria.reduce((sum, c) => sum + (scores[c.name] || 0), 0);
  return (
    <form action={action} className="stack">
      {aiEnabled ? (
        <div className="card soft tight ai-card">
          <div className="row-between">
            <span className="strong">ให้ AI ร่างคะแนนตามเกณฑ์</span>
            <button type="button" className="btn small ai" onClick={askAi} disabled={aiPending}>
              {aiPending ? 'AI กำลังตรวจ…' : ai ? 'ให้ AI ตรวจใหม่' : 'ร่างคะแนนด้วย AI'}
            </button>
          </div>
          <span className="tiny muted">AI ให้คะแนนพร้อมเหตุผลทุกเกณฑ์ คุณปรับได้ คะแนนนับเมื่อคุณกด &ldquo;บันทึกคะแนน&rdquo; เท่านั้น</span>
          {aiError ? <span className="small error-text" role="alert">{aiError}</span> : null}
          {aiNote ? <span className="small ok-text" role="status">{aiNote}</span> : null}
        </div>
      ) : null}
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
          {reasonOf(c.name) ? (
            <span className="small ai-reason">
              <span className="badge ai">AI {reasonOf(c.name)!.score}/{c.weight}</span> {reasonOf(c.name)!.reason}
            </span>
          ) : null}
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
        <textarea
          id="feedback"
          name="feedback"
          className="textarea"
          maxLength={3000}
          placeholder="จุดที่ทำได้ดี และสิ่งที่ควรพัฒนา"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>
      <SubmitButton>บันทึกคะแนน</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
