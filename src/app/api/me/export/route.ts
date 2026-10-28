import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ดาวน์โหลดข้อมูลทั้งหมดของฉัน (สิทธิ์ของเจ้าของข้อมูลตาม PDPA)
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="workdee-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store'
    }
  });
}
