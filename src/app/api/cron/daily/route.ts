import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchPending } from '@/lib/notify/dispatch';
import { cronAuthorized } from '@/lib/cron/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// งานประจำวันช่วง 09:00–10:00 น. เวลาไทย (Vercel Cron แผนฟรีคลาดได้ภายในชั่วโมง): กฎ 7 วัน สรุปประจำวัน แล้วส่งแจ้งเตือนที่ค้าง
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const sweep = await admin.rpc('sla_sweep', { p_now: now });
  const digests = await admin.rpc('build_digests', { p_now: now });
  let sent = { sent: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < 5; i++) {
    const r = await dispatchPending(100);
    sent = { sent: sent.sent + r.sent, failed: sent.failed + r.failed, skipped: sent.skipped + r.skipped };
    if (r.sent + r.failed + r.skipped < 100) break;
  }
  return NextResponse.json({
    ok: !sweep.error && !digests.error,
    sweep: sweep.data ?? sweep.error?.message,
    digests: digests.data ?? digests.error?.message,
    deliveries: sent
  });
}
