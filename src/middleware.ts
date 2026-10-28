import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '@/lib/env';

const PROTECTED = ['/me', '/c/', '/spaces', '/admin', '/companies/new'];

// รีเฟรช session ทุกคำขอ และพาไปหน้าเข้าสู่ระบบถ้ายังไม่ล็อกอิน
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p.replace(/\/$/, '') || path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|api/cron|api/line|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
};
