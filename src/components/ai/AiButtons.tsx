'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { screenApplicationAction, setPortfolioHiddenAction } from '@/lib/actions/ai';

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function run(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: res.message || 'เรียบร้อย' } : { ok: false, text: res.error });
      router.refresh();
    });
  }
  return { pending, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? (
    <span className={`small ${msg.ok ? 'ok-text' : 'error-text'}`} role="status">
      {msg.text}
    </span>
  ) : null;
}

// C. วิเคราะห์ผู้สมัครคนเดียว
export function AiScreenButton({ companyId, appId, again }: { companyId: string; appId: string; again: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="row">
      <button type="button" className={`btn small ${again ? 'ghost' : 'ai'}`} disabled={pending} onClick={() => run(() => screenApplicationAction(companyId, appId))}>
        {pending ? 'AI กำลังวิเคราะห์…' : again ? 'วิเคราะห์ใหม่' : 'ให้ AI วิเคราะห์ผู้สมัครคนนี้'}
      </button>
      <Msg msg={msg} />
    </div>
  );
}

// E. ซ่อน/แสดงรายการในแฟ้มผลงาน
export function PortfolioHideButton({ appId, hidden }: { appId: string; hidden: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <span className="row">
      <button type="button" className="btn small ghost" disabled={pending} onClick={() => run(() => setPortfolioHiddenAction(appId, !hidden))}>
        {hidden ? 'แสดงรายการนี้' : 'ซ่อนรายการนี้'}
      </button>
      <Msg msg={msg} />
    </span>
  );
}
