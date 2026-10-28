// ส่งอีเมลผ่าน Resend (https://resend.com) ถ้ายังไม่ตั้งค่า RESEND_API_KEY จะข้ามไป
export async function sendEmail(to: string | null, subject: string, text: string, link: string | null): Promise<'sent' | 'skipped'> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !to) return 'skipped';
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const url = link ? `${site}${link}` : site;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1c1f23">
    <p style="font-weight:700;font-size:17px;margin:0 0 8px">${escapeHtml(subject)}</p>
    ${text ? `<p style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(text)}</p>` : ''}
    <p><a href="${url}" style="display:inline-block;background:#0f6e64;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">เปิดใน WorkDee</a></p>
    <p style="color:#5b6168;font-size:12px">ปรับการแจ้งเตือนได้ที่หน้าการแจ้งเตือนใน WorkDee</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `WorkDee · ${subject}`, html, text: `${subject}\n\n${text}\n\n${url}` })
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'sent';
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
