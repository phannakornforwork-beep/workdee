import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverSecretKey } from '@/lib/env';
import { sendEmail } from '@/lib/notify/email';
import { pushLine } from '@/lib/notify/line';

type Delivery = {
  delivery_id: number;
  channel: 'email' | 'line' | 'sms';
  user_id: string;
  email: string | null;
  line_user_id: string | null;
  phone: string | null;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  urgent: boolean;
};

// ส่งการแจ้งเตือนภายนอก (อีเมล/LINE) ที่ถึงเวลาแล้ว
export async function dispatchPending(limit = 50): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!serverSecretKey()) return result;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('claim_deliveries', { p_limit: limit });
  if (error || !Array.isArray(data)) return result;
  for (const d of data as Delivery[]) {
    try {
      let outcome: 'sent' | 'skipped' = 'skipped';
      if (d.channel === 'email') outcome = await sendEmail(d.email, d.title, d.body, d.link);
      else if (d.channel === 'line') outcome = await pushLine(d.line_user_id, d.title, d.body, d.link);
      // SMS: ยังไม่ได้เชื่อมผู้ให้บริการ (ใส่ได้ในอนาคต เช่น ผู้ให้บริการ SMS ในไทย)
      await admin.rpc('complete_delivery', { p_id: d.delivery_id, p_ok: outcome === 'sent', p_error: null, p_skip: outcome === 'skipped' });
      result[outcome] += 1;
    } catch (e) {
      await admin.rpc('complete_delivery', { p_id: d.delivery_id, p_ok: false, p_error: String(e), p_skip: false });
      result.failed += 1;
    }
  }
  return result;
}

// เรียกหลังส่งคำตอบให้ผู้ใช้แล้ว (ไม่ทำให้หน้าเว็บช้า)
export function dispatchSoon(): void {
  try {
    after(async () => {
      await dispatchPending(30);
    });
  } catch {
    // อยู่นอก request (เช่น ตอน build) ไม่ต้องทำอะไร
  }
}
