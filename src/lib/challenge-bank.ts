// คลังโจทย์พิสูจน์สกิล (แบรนด์สมมติทั้งหมด) ใช้กับปุ่ม "ให้ AI คิดโจทย์" ในหน้าลงประกาศ
// ระบบเลือก 5 โจทย์: โจทย์ที่แท็กตรงกับข้อความของ HR ขึ้นก่อน ที่เหลือสุ่มจากคลัง
import { JOB_TEMPLATES } from '@/lib/templates';

export type BankChallenge = {
  title: string;
  brief: string;
  deliverable: string;
  minutes: number;
  due_days: number;
  skill_key: string;
  tags: string[];
  criteria: { name: string; weight: number; description?: string }[];
};

const EXTRA: BankChallenge[] = [
  {
    title: 'แคมเปญโฆษณา 2 สัปดาห์ งบ 15,000 บาท',
    brief: 'ร้านกาแฟสมมติ "ดอยเช้า" 3 สาขา จะเปิดเมนูโกโก้มะพร้าวใน 2 สัปดาห์ วางแผนโฆษณาบน Facebook และ Instagram งบ 15,000 บาท\nส่ง 1) กลุ่มเป้าหมาย 2) การแบ่งงบรายวัน 3) ตัวอย่างโฆษณา 2 ชิ้น 4) ตัวเลขที่จะดูเพื่อปรับงบ',
    deliverable: 'แผน 1–2 หน้า + ตัวอย่างโฆษณา 2 ชิ้น',
    minutes: 90, due_days: 3, skill_key: 'performance-ads',
    tags: ['ยิงแอด', 'โฆษณา', 'ads', 'meta', 'facebook', 'การตลาด', 'marketing', 'งบ'],
    criteria: [
      { name: 'กลุ่มเป้าหมาย', weight: 25, description: 'ระบุอายุ พื้นที่รอบสาขา และเหตุผล' },
      { name: 'การแบ่งงบ', weight: 30, description: 'มีช่วงทดสอบและเกณฑ์เพิ่มหรือลดงบ' },
      { name: 'ตัวอย่างโฆษณา', weight: 25, description: 'ข้อความชัด มีคำเชิญชวน ตรงโทนแบรนด์' },
      { name: 'ตัวชี้วัด', weight: 20, description: 'เลือก CTR CPC ยอดขาย และบอกจุดตัดสินใจ' }
    ]
  },
  {
    title: 'วางแผนคลิปสั้น 5 คลิปให้ร้านอาหาร',
    brief: 'ร้านอาหารสมมติ "ข้าวมันไก่ป้าแดง" อยากเพิ่มลูกค้าวัยทำงานผ่าน TikTok เขียนไอเดียคลิป 5 คลิป พร้อมบทพูด 3 วินาทีแรก และถ่ายหรือทำสตอรี่บอร์ด 1 คลิป',
    deliverable: 'ตารางไอเดีย 5 คลิป + สตอรี่บอร์ดหรือคลิปตัวอย่าง 1 คลิป',
    minutes: 90, due_days: 3, skill_key: 'short-video',
    tags: ['คลิป', 'วิดีโอ', 'tiktok', 'ตัดต่อ', 'reels', 'คอนเทนต์', 'video'],
    criteria: [
      { name: 'ไอเดียตรงกลุ่มเป้าหมาย', weight: 35, description: 'ไอเดียตอบโจทย์คนวัยทำงาน' },
      { name: 'ดึงดูดใน 3 วินาทีแรก', weight: 35, description: 'เปิดคลิปแล้วอยากดูต่อ' },
      { name: 'ความเป็นไปได้ในการถ่าย', weight: 30, description: 'ถ่ายได้จริงด้วยมือถือและงบน้อย' }
    ]
  },
  {
    title: 'สรุปยอดขายจากไฟล์ Excel',
    brief: 'ร้านค้าออนไลน์สมมติ "บ้านผ้าฝ้าย" มีข้อมูลยอดขาย 3 เดือน (สินค้า ช่องทาง วันที่ ยอดเงิน) สรุปว่าสินค้าและช่องทางไหนขายดี และเสนอ 3 สิ่งที่ควรทำเดือนหน้า',
    deliverable: 'ไฟล์ Excel/Sheets พร้อม Pivot หรือกราฟ + สรุป 1 หน้า',
    minutes: 60, due_days: 3, skill_key: 'data-analysis',
    tags: ['excel', 'sheets', 'ข้อมูล', 'วิเคราะห์', 'data', 'รายงาน', 'ตัวเลข', 'ยอดขาย'],
    criteria: [
      { name: 'ความถูกต้องของตัวเลข', weight: 40, description: 'สรุปยอดถูกต้อง ตรวจซ้ำได้' },
      { name: 'การนำเสนอข้อมูล', weight: 30, description: 'กราฟหรือตารางอ่านง่าย' },
      { name: 'ข้อเสนอที่ทำได้จริง', weight: 30, description: 'ข้อเสนออ้างอิงจากตัวเลข' }
    ]
  },
  {
    title: 'ออกแบบหน้าจอสมัครสมาชิกในแอป',
    brief: 'แอปสมมติ "ออมดี" ช่วยคนจบใหม่ออมเงิน ออกแบบหน้าจอสมัครสมาชิก 3 หน้าบนมือถือ ให้กรอกน้อยที่สุดและเข้าใจง่าย',
    deliverable: 'ไฟล์ Figma หรือภาพหน้าจอ 3 หน้า + เหตุผลการออกแบบ',
    minutes: 120, due_days: 4, skill_key: 'ux-ui',
    tags: ['ux', 'ui', 'figma', 'ออกแบบ', 'แอป', 'design', 'หน้าจอ'],
    criteria: [
      { name: 'ใช้งานง่าย', weight: 40, description: 'ขั้นตอนน้อย คำชัด ผิดแล้วแก้ได้' },
      { name: 'ความสวยงามและความสม่ำเสมอ', weight: 30, description: 'สี ตัวอักษร ระยะห่างสม่ำเสมอ' },
      { name: 'เหตุผลการออกแบบ', weight: 30, description: 'อธิบายได้ว่าเลือกแบบนี้เพราะอะไร' }
    ]
  },
  {
    title: 'สร้างหน้าแสดงรายการสินค้าด้วย React',
    brief: 'ร้านสมมติ "ของดีชุมชน" ต้องการหน้ารายการสินค้าที่ค้นหาและกรองตามหมวดได้ ใช้ข้อมูลสินค้าตัวอย่าง 20 รายการ (JSON ที่ให้)',
    deliverable: 'ลิงก์ GitHub + ลิงก์เดโม + README สั้น ๆ',
    minutes: 180, due_days: 5, skill_key: 'frontend-react',
    tags: ['react', 'javascript', 'typescript', 'เว็บ', 'โปรแกรม', 'developer', 'frontend', 'code'],
    criteria: [
      { name: 'ทำงานได้ครบตามโจทย์', weight: 40, description: 'ค้นหาและกรองถูกต้อง' },
      { name: 'คุณภาพโค้ด', weight: 35, description: 'อ่านง่าย แบ่งส่วนดี ตั้งชื่อชัด' },
      { name: 'การอธิบายงาน', weight: 25, description: 'README บอกวิธีรันและสิ่งที่ตัดสินใจ' }
    ]
  },
  {
    title: 'ตอบอีเมลลูกค้าต่างชาติเป็นภาษาอังกฤษ',
    brief: 'บริษัทนำเที่ยวสมมติ "สยามทริป" ได้รับอีเมลลูกค้าต่างชาติ 3 ฉบับ (สอบถามราคา ขอเลื่อนวัน และร้องเรียน) เขียนตอบทั้ง 3 ฉบับเป็นภาษาอังกฤษ',
    deliverable: 'อีเมลตอบกลับ 3 ฉบับ',
    minutes: 60, due_days: 2, skill_key: 'english-email',
    tags: ['ภาษาอังกฤษ', 'english', 'อีเมล', 'ลูกค้า', 'ท่องเที่ยว', 'สื่อสาร', 'toeic', 'ielts'],
    criteria: [
      { name: 'ความถูกต้องทางภาษา', weight: 35, description: 'ไวยากรณ์และคำศัพท์ถูกต้อง' },
      { name: 'น้ำเสียงเหมาะสม', weight: 30, description: 'สุภาพ เป็นมืออาชีพ เข้าใจความรู้สึกลูกค้า' },
      { name: 'แก้ปัญหาได้ชัด', weight: 35, description: 'ตอบครบทุกประเด็นและบอกขั้นต่อไป' }
    ]
  },
  {
    title: 'จัดทำบัญชีรายรับรายจ่ายร้านค้าเล็ก',
    brief: 'ร้านกาแฟสมมติ "มุมเล็ก" มีรายการรับจ่ายเดือนตุลาคม 25 รายการ จัดหมวดหมู่ ทำสรุปกำไรขาดทุน และชี้รายจ่ายที่ควรระวัง',
    deliverable: 'ไฟล์ Excel/Sheets + สรุป 1 หน้า',
    minutes: 60, due_days: 3, skill_key: 'small-business-accounting',
    tags: ['บัญชี', 'การเงิน', 'accounting', 'excel', 'งบ', 'ภาษี'],
    criteria: [
      { name: 'จัดหมวดถูกต้อง', weight: 35, description: 'หมวดรายรับรายจ่ายสมเหตุสมผล' },
      { name: 'สรุปกำไรขาดทุนถูกต้อง', weight: 40, description: 'ตัวเลขรวมถูกต้อง' },
      { name: 'ข้อสังเกตที่เป็นประโยชน์', weight: 25, description: 'ชี้จุดที่ควรปรับพร้อมเหตุผล' }
    ]
  },
  {
    title: 'วางแผนจัดงานเปิดตัวสินค้า 1 วัน',
    brief: 'แบรนด์เครื่องสำอางสมมติ "ใบบัว" จะจัดงานเปิดตัวที่ห้างวันเสาร์ งบ 50,000 บาท ผู้ร่วมงาน 80 คน วางแผนกำหนดการ ผู้รับผิดชอบ และแผนสำรอง',
    deliverable: 'กำหนดการ + ตารางงานและผู้รับผิดชอบ + แผนสำรอง 3 ข้อ',
    minutes: 90, due_days: 3, skill_key: 'event-planning',
    tags: ['อีเวนต์', 'event', 'จัดงาน', 'ประสานงาน', 'วางแผน', 'project', 'โครงการ'],
    criteria: [
      { name: 'ความครบถ้วนของแผน', weight: 35, description: 'มีเวลา งาน ผู้รับผิดชอบครบ' },
      { name: 'การใช้งบ', weight: 30, description: 'แบ่งงบสมเหตุสมผล ไม่เกินงบ' },
      { name: 'แผนรับมือความเสี่ยง', weight: 35, description: 'คาดการณ์ปัญหาและมีทางแก้' }
    ]
  },
  {
    title: 'เขียนบทความ SEO 800 คำ',
    brief: 'เว็บไซต์สมมติ "สุขภาพดีทุกวัน" ต้องการบทความหัวข้อ "อาหารเช้า 5 นาทีสำหรับคนทำงาน" เลือกคีย์เวิร์ดหลัก เขียนหัวข้อย่อย และเนื้อหาประมาณ 800 คำ',
    deliverable: 'บทความ + คีย์เวิร์ดที่เลือก + meta description',
    minutes: 90, due_days: 3, skill_key: 'seo-writing',
    tags: ['บทความ', 'seo', 'เขียน', 'content', 'คอนเทนต์', 'เว็บไซต์', 'copywriting'],
    criteria: [
      { name: 'โครงสร้างและการใช้คีย์เวิร์ด', weight: 35, description: 'หัวข้อย่อยชัด ใช้คีย์เวิร์ดเป็นธรรมชาติ' },
      { name: 'อ่านง่ายและมีประโยชน์', weight: 40, description: 'ภาษาเข้าใจง่าย นำไปใช้ได้จริง' },
      { name: 'meta description', weight: 25, description: 'สั้น ชัด ชวนคลิก' }
    ]
  },
  {
    title: 'แผนดูแลลูกค้าบน LINE OA',
    brief: 'ร้านเสื้อผ้าออนไลน์สมมติ "ผ้าดี" มีลูกค้าใน LINE OA 3,000 คน วางแผนข้อความ 1 เดือน (โปร ข่าวสินค้าใหม่ ติดตามหลังซื้อ) และเขียนข้อความตัวอย่าง 3 ข้อความ',
    deliverable: 'ปฏิทินข้อความ 1 เดือน + ข้อความตัวอย่าง 3 ข้อความ',
    minutes: 60, due_days: 3, skill_key: 'crm-line',
    tags: ['line', 'ลูกค้า', 'crm', 'ขาย', 'บริการลูกค้า', 'แชต'],
    criteria: [
      { name: 'ความถี่และจังหวะเหมาะสม', weight: 30, description: 'ไม่ส่งถี่จนลูกค้าบล็อก' },
      { name: 'ข้อความน่าสนใจ', weight: 40, description: 'สั้น ชัด มีเหตุผลให้กด' },
      { name: 'วัดผลได้', weight: 30, description: 'บอกตัวเลขที่จะติดตาม' }
    ]
  },
  {
    title: 'ถ่ายภาพสินค้าและแต่งภาพสำหรับขายออนไลน์',
    brief: 'แบรนด์สบู่สมมติ "หอมไทย" ต้องการภาพสินค้า 3 ภาพสำหรับ Shopee ถ่ายด้วยมือถือได้ ใช้ของในบ้านเป็นพร็อพ แต่งภาพให้สีตรงและพื้นหลังสะอาด',
    deliverable: 'ภาพ 3 ภาพ + ภาพก่อนแต่ง 1 ภาพ + คำอธิบายสั้น ๆ',
    minutes: 90, due_days: 3, skill_key: 'product-photo',
    tags: ['ถ่ายภาพ', 'ภาพสินค้า', 'photo', 'lightroom', 'photoshop', 'shopee', 'กราฟิก'],
    criteria: [
      { name: 'คุณภาพภาพ', weight: 40, description: 'คม สว่างพอ สีตรง' },
      { name: 'การจัดองค์ประกอบ', weight: 35, description: 'สินค้าเด่น พร็อพไม่แย่งความสนใจ' },
      { name: 'เหมาะกับช่องทางขาย', weight: 25, description: 'ขนาดและสัดส่วนตรงแพลตฟอร์ม' }
    ]
  },
  {
    title: 'แก้ปัญหาลูกค้าร้องเรียนสินค้าเสียหาย',
    brief: 'ลูกค้าของร้านออนไลน์สมมติ "ครัวสุข" ได้รับจานแตก 2 ใบ และโพสต์รีวิว 1 ดาว เขียนข้อความตอบลูกค้า ข้อความตอบรีวิวสาธารณะ และขั้นตอนป้องกันไม่ให้เกิดซ้ำ',
    deliverable: 'ข้อความ 2 ชิ้น + ขั้นตอนป้องกัน 3–5 ข้อ',
    minutes: 45, due_days: 2, skill_key: 'customer-recovery',
    tags: ['ลูกค้า', 'ร้องเรียน', 'บริการ', 'แชต', 'ขาย', 'customer', 'service'],
    criteria: [
      { name: 'เข้าใจความรู้สึกลูกค้า', weight: 35, description: 'ขอโทษจริงใจ ไม่โทษลูกค้า' },
      { name: 'ทางแก้ชัดเจน', weight: 35, description: 'บอกสิ่งที่ร้านจะทำและเมื่อไร' },
      { name: 'ป้องกันซ้ำ', weight: 30, description: 'ขั้นตอนทำได้จริงในร้านเล็ก' }
    ]
  }
];

export const CHALLENGE_BANK: BankChallenge[] = [
  ...JOB_TEMPLATES.map((t) => ({ ...t.challenge, tags: [t.label, t.challenge.skill_key].concat(t.challenge.skill_key.split('-')) })),
  ...EXTRA
];

/** เลือก 5 โจทย์: ที่แท็กตรงกับข้อความขึ้นก่อน ที่เหลือสุ่ม */
export function pickChallenges(text: string, n = 5, rand: () => number = Math.random): BankChallenge[] {
  const t = text.toLowerCase();
  const scored = CHALLENGE_BANK.map((c) => ({ c, s: c.tags.filter((tag) => t.includes(tag.toLowerCase())).length + rand() * 0.9 }));
  return scored.sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.c);
}
