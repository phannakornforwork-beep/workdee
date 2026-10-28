import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { CompanyAccess } from '@/lib/types';

export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function requireUser(next?: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''));
  return { supabase, user };
}

// ต้องเป็นสมาชิกบริษัทนี้ คืนสิทธิ์ของผู้ใช้ในบริษัท
export async function requireCompany(cid: string) {
  const { supabase, user } = await requireUser(`/c/${cid}`);
  const { data } = await supabase.rpc('my_company_access', { p_company: cid });
  if (!data) redirect('/spaces');
  return { supabase, user, access: data as CompanyAccess };
}

export function can(access: CompanyAccess, perm: string, level = 1): boolean {
  return access.is_owner || (access.perms?.[perm] ?? 0) >= level;
}
