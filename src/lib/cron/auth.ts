import crypto from 'node:crypto';

// ตรวจ header Authorization: Bearer <CRON_SECRET> (Vercel Cron ส่งให้อัตโนมัติเมื่อตั้งค่า CRON_SECRET)
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = req.headers.get('authorization') || '';
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// เวลาไทยปัจจุบันเป็นนาทีนับจากเที่ยงคืน
export function bangkokMinutes(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}
