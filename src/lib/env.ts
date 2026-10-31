// ค่าตั้งค่าจาก environment (รองรับทั้งชื่อคีย์แบบใหม่และแบบเดิมของ Supabase)
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const LINE_ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL || '';
// แสดงปุ่ม "ดำเนินการต่อด้วย Google" เมื่อเปิด Google provider ใน Supabase แล้ว (ตั้งเป็น 1)
export const GOOGLE_AUTH_ENABLED = /^(1|true|yes)$/i.test(process.env.NEXT_PUBLIC_AUTH_GOOGLE || '');

export function serverSecretKey(): string {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);
}

// อีเมลติดต่อทีมงาน (แสดงในหน้าช่วยเหลือ นโยบาย และเงื่อนไข)
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '';
