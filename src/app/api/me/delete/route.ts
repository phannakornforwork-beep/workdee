import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function removeFolder(admin: ReturnType<typeof createAdminClient>, bucket: string, folder: string) {
  const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (!data?.length) return;
  // รายการที่ไม่มี id คือโฟลเดอร์ย่อย
  const entries = data as { id: string | null; name: string }[];
  const files = entries.filter((f) => f.id).map((f) => `${folder}/${f.name}`);
  const dirs = entries.filter((f) => !f.id).map((f) => `${folder}/${f.name}`);
  if (files.length) await admin.storage.from(bucket).remove(files);
  for (const d of dirs) await removeFolder(admin, bucket, d);
}

// ลบบัญชีถาวร: ไฟล์ทั้งหมด แล้วลบผู้ใช้ (ข้อมูลในฐานข้อมูลถูกลบตามโดย foreign key)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== 'ลบบัญชี') return NextResponse.json({ error: 'พิมพ์คำยืนยันให้ถูกต้อง' }, { status: 400 });
  const { data: blockers } = await supabase.rpc('account_deletion_blockers');
  if (Array.isArray(blockers) && blockers.length) {
    return NextResponse.json({ error: `แต่งตั้งเจ้าของคนใหม่ของ ${blockers.join(', ')} ก่อน` }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: apps } = await admin.from('applications').select('id').eq('candidate_id', user.id);
  await removeFolder(admin, 'education-docs', user.id);
  for (const a of (apps || []) as { id: string }[]) await removeFolder(admin, 'submissions', a.id);
  await supabase.auth.signOut();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: 'ลบบัญชีไม่สำเร็จ ติดต่อทีมงาน' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
