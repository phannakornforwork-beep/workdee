import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { replyLine, verifyLineSignature } from '@/lib/notify/line';
import { SITE_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
};

// Webhook ของ LINE Official Account: ผู้ใช้พิมพ์รหัส 6 หลักจากหน้าการแจ้งเตือนเพื่อเชื่อมบัญชี
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyLineSignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events || [];
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const admin = createAdminClient();
  for (const ev of events) {
    const lineUser = ev.source?.type === 'user' ? ev.source.userId : undefined;
    if (!lineUser) continue;
    if (ev.type === 'unfollow') {
      await admin.rpc('unlink_line_by_line_id', { p_line_user_id: lineUser });
      continue;
    }
    if (ev.type === 'follow' && ev.replyToken) {
      await replyLine(ev.replyToken, `สวัสดีจาก WorkDee\nเชื่อมบัญชีเพื่อรับแจ้งเตือน: เปิด ${SITE_URL}/me/notifications กด "สร้างรหัสเชื่อม LINE" แล้วพิมพ์รหัส 6 หลักในแชตนี้`);
      continue;
    }
    if (ev.type === 'message' && ev.message?.type === 'text' && ev.replyToken) {
      const code = (ev.message.text || '').replace(/\s/g, '');
      if (/^\d{6}$/.test(code)) {
        const { data, error } = await admin.rpc('link_line_account', { p_code: code, p_line_user_id: lineUser });
        await replyLine(
          ev.replyToken,
          !error && data ? 'เชื่อมบัญชี WorkDee สำเร็จ เรื่องสำคัญจะแจ้งเข้าที่นี่ ปรับได้ที่หน้าการแจ้งเตือน' : 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว (ใช้ได้ 15 นาที) สร้างรหัสใหม่ในหน้าการแจ้งเตือน'
        );
      } else {
        await replyLine(ev.replyToken, `บัญชีนี้ใช้ส่งการแจ้งเตือนจาก WorkDee เท่านั้น ตอบข้อความหรือดูรายละเอียดได้ที่ ${SITE_URL}`);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
