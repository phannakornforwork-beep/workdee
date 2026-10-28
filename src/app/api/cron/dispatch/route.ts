import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchPending } from '@/lib/notify/dispatch';
import { bangkokMinutes, cronAuthorized } from '@/lib/cron/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// เรียกถี่ ๆ (ทุก 5–10 นาที) จาก Supabase pg_cron หรือบริการ cron ภายนอก
// ส่งแจ้งเตือนที่ถึงเวลา ตรวจกฎ 7 วัน และสร้างสรุปประจำวันช่วง 08:30–10:00 (ทำซ้ำได้ ไม่ส่งซ้ำ)
async function run(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  const sweep = await admin.rpc('sla_sweep', { p_now: now.toISOString() });
  const minutes = bangkokMinutes(now);
  const digests = minutes >= 8 * 60 + 30 && minutes < 10 * 60 ? await admin.rpc('build_digests', { p_now: now.toISOString() }) : null;
  const deliveries = await dispatchPending(100);
  return NextResponse.json({ ok: !sweep.error, sweep: sweep.data ?? sweep.error?.message, digests: digests?.data ?? null, deliveries });
}

export const GET = run;
export const POST = run;
