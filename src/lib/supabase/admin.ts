import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, serverSecretKey } from '@/lib/env';

// สิทธิ์ระดับระบบ ใช้เฉพาะงานเบื้องหลัง (cron, webhook, ลบบัญชี) ห้าม import ในคอมโพเนนต์ฝั่งเบราว์เซอร์
export function createAdminClient() {
  const key = serverSecretKey();
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
