import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { CompanyAccess } from '@/lib/types';

export type SessionUser = { id: string; email: string };

// ผู้ใช้ปัจจุบัน: ตรวจลายเซ็น JWT (getClaims) แทนการถาม Auth server ทุกครั้ง
// และ cache ไว้ตลอดคำขอเดียว (layout กับ page ใช้ผลเดียวกัน ไม่ยิงซ้ำ)
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  const user: SessionUser | null = c?.sub ? { id: String(c.sub), email: typeof c.email === 'string' ? c.email : '' } : null;
  return { supabase, user };
});

export async function requireUser(next?: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''));
  return { supabase, user };
}

// สิทธิ์ของผู้ใช้ในบริษัท (cache ต่อคำขอ: layout และ page ของบริษัทเดียวกันใช้ผลเดียวกัน)
const companyAccess = cache(async (cid: string) => {
  const { supabase, user } = await requireUser(`/c/${cid}`);
  const { data } = await supabase.rpc('my_company_access', { p_company: cid });
  return { supabase, user, access: data as CompanyAccess | null };
});

// ต้องเป็นสมาชิกบริษัทนี้ คืนสิทธิ์ของผู้ใช้ในบริษัท
export async function requireCompany(cid: string) {
  const { supabase, user, access } = await companyAccess(cid);
  if (!access) redirect('/spaces');
  return { supabase, user, access };
}

export function can(access: CompanyAccess, perm: string, level = 1): boolean {
  return access.is_owner || (access.perms?.[perm] ?? 0) >= level;
}
