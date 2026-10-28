import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '@/lib/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// ใช้ใน Server Components, Server Actions และ Route Handlers (สิทธิ์ตามผู้ใช้ที่ล็อกอิน + RLS)
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // เรียกจาก Server Component ที่เขียน cookie ไม่ได้ — middleware จะรีเฟรช session ให้แทน
        }
      }
    }
  });
}
