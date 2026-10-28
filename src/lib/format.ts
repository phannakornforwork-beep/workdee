// ข้อความภาษาไทยและการจัดรูปแบบ วันที่/เงิน/สถานะ

const TZ = 'Asia/Bangkok';

export function thaiDate(iso?: string | null, withTime = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(d);
}

export function thaiDateTime(iso?: string | null): string {
  return thaiDate(iso, true);
}

export function shortDateTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function relative(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} วันที่แล้ว`;
  return thaiDate(iso);
}

// เหลือกี่วัน (ปัดขึ้น) ถ้าเลยแล้วคืนค่าติดลบหรือ 0
export function daysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export function dueText(iso?: string | null): string {
  const d = daysLeft(iso);
  if (d === null) return '';
  if (d <= 0) return 'ครบกำหนดวันนี้';
  return `ภายใน ${d} วัน`;
}

export function money(n?: number | null): string {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('th-TH').format(n);
}

export const PAY_UNIT: Record<string, string> = {
  month: 'บาท/เดือน',
  day: 'บาท/วัน',
  hour: 'บาท/ชั่วโมง',
  project: 'บาท/โปรเจกต์'
};

export function salaryRange(min?: number | null, max?: number | null, unit = 'month'): string {
  const u = PAY_UNIT[unit] || 'บาท';
  if (min && max) return `${money(min)}–${money(max)} ${u}`;
  if (max) return `ไม่เกิน ${money(max)} ${u}`;
  if (min) return `ตั้งแต่ ${money(min)} ${u}`;
  return 'ตามตกลง';
}

export const JOB_TYPE: Record<string, string> = {
  full_time: 'งานประจำ',
  contract: 'สัญญาจ้าง',
  part_time: 'พาร์ตไทม์',
  internship: 'ฝึกงาน',
  gig: 'จ็อบระยะสั้น'
};

export const WORK_MODE: Record<string, string> = { onsite: 'เข้าออฟฟิศ', hybrid: 'ไฮบริด', remote: 'ทำงานทางไกล' };

export const STAGE: Record<string, string> = {
  applied: 'สมัครแล้ว · รอคัด',
  challenge_invited: 'รอบโจทย์ · รอผู้สมัครส่ง',
  challenge_submitted: 'ส่งโจทย์แล้ว · รอบริษัท',
  interview: 'รอบสัมภาษณ์',
  offer: 'เสนองาน',
  hired: 'รับเข้าทำงาน',
  rejected: 'ไม่ผ่าน',
  withdrawn: 'ถอนใบสมัคร',
  declined: 'ปฏิเสธข้อเสนอ',
  expired: 'หมดเวลา'
};

export const CLOSED_STAGES = ['hired', 'rejected', 'withdrawn', 'declined', 'expired'];

export const VERIFY: Record<string, { label: string; tone: 'teal' | 'blue' | 'gray' | 'orange' }> = {
  inst: { label: 'ยืนยันโดยสถาบัน', tone: 'teal' },
  doc: { label: 'ตรวจเอกสารแล้ว', tone: 'blue' },
  doc_pending: { label: 'รอตรวจเอกสาร', tone: 'orange' },
  none: { label: 'วุฒิยังไม่ยืนยัน', tone: 'gray' }
};

export const AI_USE: Record<string, string> = {
  none: 'ไม่ได้ใช้ AI',
  ideas: 'ใช้ AI ช่วยคิดไอเดีย',
  partial: 'ใช้ AI ช่วยเขียนบางส่วน',
  heavy: 'ใช้ AI ช่วยเป็นส่วนใหญ่'
};

export const AI_POLICY: Record<string, string> = {
  not_allowed: 'ขอให้ไม่ใช้ AI',
  allowed_declare: 'ใช้ AI ได้ แต่ต้องบอกว่าใช้ส่วนไหน',
  encouraged: 'ใช้ AI ได้เต็มที่ ขอเห็นวิธีคิด'
};

export const PERMS: { key: string; label: string; hint: string }[] = [
  { key: 'team', label: 'ดูงานของทีม', hint: 'เห็นว่าใครทำอะไรอยู่ มอบหมายงาน' },
  { key: 'post', label: 'ลงประกาศงาน', hint: 'สร้าง แก้ และปิดประกาศ' },
  { key: 'approve_post', label: 'อนุมัติประกาศ', hint: 'อนุมัติประกาศก่อนเผยแพร่' },
  { key: 'screen', label: 'ดูแลผู้สมัคร', hint: 'คัด ให้คะแนน นัดสัมภาษณ์ ตอบผู้สมัคร' },
  { key: 'offer', label: 'เสนองาน', hint: 'ส่งข้อเสนอจ้างงาน' },
  { key: 'leave', label: 'อนุมัติการลา', hint: '' },
  { key: 'members', label: 'จัดการทีม', hint: 'เชิญคน ตั้งตำแหน่งและสิทธิ์ที่อยู่ต่ำกว่า' },
  { key: 'announce', label: 'ประกาศถึงทีม', hint: 'ส่งประกาศพร้อมดูว่าใครอ่านแล้ว' },
  { key: 'billing', label: 'การชำระเงิน', hint: 'เฉพาะเจ้าของกิจการ' }
];

export const LEVEL: Record<number, string> = { 0: 'ไม่มี', 1: 'แผนกตัวเอง', 2: 'ทั้งบริษัท' };

export const RULES: { key: string; label: string }[] = [
  { key: 'job_post_needs_head', label: 'ประกาศงานใหม่ ต้องให้หัวหน้าแผนกของตำแหน่งนั้นอนุมัติก่อนเผยแพร่' },
  { key: 'offer_over_range_needs_owner', label: 'เสนองานที่เงินเดือนเกินช่วงในประกาศ ต้องให้เจ้าของอนุมัติ' },
  { key: 'leave_needs_head', label: 'การลา ให้หัวหน้าโดยตรงอนุมัติ' },
  { key: 'reject_after_interview_needs_head', label: 'ปฏิเสธผู้สมัครหลังสัมภาษณ์ ต้องให้หัวหน้าแผนกเห็นชอบก่อนส่ง' },
  { key: 'escalate_after_24h', label: 'ผู้อนุมัติไม่ตอบใน 24 ชั่วโมง ส่งต่อให้หัวหน้าถัดขึ้นไป' }
];

export const PROVINCES = [
  'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม', 'ชลบุรี', 'ระยอง', 'เชียงใหม่', 'เชียงราย',
  'ขอนแก่น', 'นครราชสีมา', 'อุดรธานี', 'อุบลราชธานี', 'ภูเก็ต', 'สงขลา', 'สุราษฎร์ธานี', 'พิษณุโลก', 'นครสวรรค์', 'อยุธยา'
];

export function firstName(full?: string | null): string {
  return (full || '').trim().split(/\s+/)[0] || '';
}

export function initials(name?: string | null): string {
  const n = (name || '').trim();
  return n ? n.slice(0, 1) : '?';
}

export const EVENT_LABEL: Record<string, string> = {
  applied: 'ส่งใบสมัคร', challenge_invited: 'เชิญทำโจทย์', challenge_submitted: 'ส่งโจทย์แล้ว', challenge_reused: 'ใช้ผลโจทย์เดิม',
  graded: 'ให้คะแนนโจทย์', interview_invited: 'เชิญสัมภาษณ์', interview_booked: 'ยืนยันเวลาสัมภาษณ์', reschedule_requested: 'ขอเลื่อนนัด',
  interview_slots_offered: 'เสนอเวลาสัมภาษณ์ใหม่', interview_completed: 'สัมภาษณ์แล้ว', interview_no_show: 'ไม่มาตามนัด',
  offer_pending_approval: 'ข้อเสนอรออนุมัติ', offer_sent: 'ส่งข้อเสนองาน', offer_accepted: 'ตอบรับข้อเสนอ', offer_declined: 'ปฏิเสธข้อเสนอ',
  rejected: 'แจ้งผลพร้อมเหตุผล', auto_closed: 'ระบบปิดใบสมัคร (เลย 7 วัน)', withdrawn: 'ถอนใบสมัคร', expired: 'หมดเวลา',
  access_revoked: 'ถอนสิทธิ์เข้าถึงโปรไฟล์', message: 'ข้อความ'
};
