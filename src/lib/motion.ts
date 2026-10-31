// ทิศทางของการเปลี่ยนหน้าครั้งถัดไป (ใช้เลือกแอนิเมชันเลื่อนซ้าย/ขวา)
// ตั้งค่าโดยเมนูหรือการปัด แล้วหน้าใหม่อ่านครั้งเดียวตอนแสดงผล
export type NavDirection = 'forward' | 'back' | 'none';

let pending: NavDirection = 'none';

export function setNavDirection(d: NavDirection) {
  pending = d;
}

export function takeNavDirection(): NavDirection {
  const d = pending;
  pending = 'none';
  return d;
}
