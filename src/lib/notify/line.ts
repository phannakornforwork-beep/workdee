import crypto from 'node:crypto';

// LINE Messaging API ผ่าน LINE Official Account (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2568)
const API = 'https://api.line.me/v2/bot/message';

export function lineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET);
}

export async function pushLine(to: string | null, title: string, body: string, link: string | null): Promise<'sent' | 'skipped'> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !to) return 'skipped';
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const text = [title, body, link ? `${site}${link}` : ''].filter(Boolean).join('\n').slice(0, 4900);
  const res = await fetch(`${API}/push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] })
  });
  if (!res.ok) throw new Error(`line ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'sent';
}

export async function replyLine(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  await fetch(`${API}/reply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] })
  });
}

// ตรวจลายเซ็นของ webhook (x-line-signature = base64(HMAC-SHA256(channelSecret, body)))
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
