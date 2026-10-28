import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient> | null = null;

// ใช้ในคอมโพเนนต์ฝั่งเบราว์เซอร์ (แชตเรียลไทม์ อัปโหลดไฟล์)
export function createClient() {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  return client;
}
