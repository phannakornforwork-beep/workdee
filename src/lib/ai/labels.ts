// ป้ายระดับความน่าเชื่อถือ ใช้ร่วมกันทั้งฝั่งผู้สมัคร บริษัท และผู้ดูแลระบบ
export const LANG_TRUST: Record<string, { label: string; tone: string; note: string }> = {
  official: { label: 'ยืนยันกับผู้จัดสอบ', tone: 'teal', note: 'นับเต็มในคะแนนหลักฐาน' },
  doc: { label: 'ตรวจเอกสารแล้ว', tone: 'blue', note: 'นับ 70% ในคะแนนหลักฐาน' },
  doc_pending: { label: 'รอทีมงานตรวจ', tone: 'orange', note: 'AI อ่านและตรวจเบื้องต้นผ่านแล้ว' },
  self: { label: 'ระบุเอง', tone: 'gray', note: 'ไม่นับในคะแนน' },
  rejected: { label: 'ตรวจไม่ผ่าน', tone: 'red', note: 'ไม่นับในคะแนน' }
};

export const CERT_CHECK: Record<string, string> = {
  name_match: 'ชื่อตรงกับบัญชี',
  not_expired: 'ยังไม่หมดอายุ',
  has_number: 'มีเลขที่ผลสอบ',
  not_edited: 'ไม่พบร่องรอยแก้ไข'
};

export const EVIDENCE_TONE: Record<string, string> = { green: 'teal', yellow: 'blue', grey: 'gray' };

// สูตรคะแนนรวม (ตรงกับฟังก์ชัน ai_ranking ในฐานข้อมูล)
export const SCORE_WEIGHTS = { match: 30, task: 60, verified: 10 } as const;
