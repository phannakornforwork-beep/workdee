// พจนานุกรมทักษะ + คำพ้องความหมาย (ไทย/อังกฤษ) ใช้ทั้งสแกน CV คัดกรองด้วยคีย์เวิร์ด และโหมดสาธิต
// ไม่ใช้ AI: จับคำตรงตัวกับคำพ้อง เช่น "ยิงแอด" = Meta Ads
export type Skill = { name: string; description: string; keys: string[]; rubric: string; full: string };

// คำพ้องที่ใช้จับความหมาย เช่น "ยิงแอด" = Meta Ads
export const SKILLS: Skill[] = [
  { name: 'ยิงโฆษณาออนไลน์ (Meta Ads)', description: 'ตั้งแคมเปญ เลือกกลุ่มเป้าหมาย และคุมงบโฆษณาบน Facebook/Instagram', keys: ['meta ads', 'facebook ads', 'fb ads', 'ยิงแอด', 'ยิงads', 'โฆษณาออนไลน์', 'โฆษณาเฟซบุ๊ก', 'โฆษณา facebook', 'ads manager', 'บูสต์โพสต์', 'tiktok ads', 'google ads', 'แคมเปญโฆษณา'], rubric: 'กลุ่มเป้าหมายและแผนโฆษณา', full: 'ระบุกลุ่มเป้าหมายชัด พร้อมเหตุผลและช่องทางที่เลือก' },
  { name: 'เขียนคอนเทนต์โซเชียล', description: 'เขียนโพสต์และแคปชันที่ตรงโทนแบรนด์และชวนให้ลงมือทำ', keys: ['คอนเทนต์', 'content', 'แคปชัน', 'caption', 'copywriting', 'เขียนโพสต์', 'โพสต์', 'เขียนบทความ', 'ดูแลเพจ', 'แอดมินเพจ', 'social media', 'โซเชียล'], rubric: 'คุณภาพคอนเทนต์', full: 'ข้อความชัด ตรงโทนแบรนด์ และมีคำเชิญชวนที่ทำตามได้' },
  { name: 'อ่านผลและปรับงบ', description: 'อ่านตัวเลข เช่น CTR CPC ยอดขาย แล้วปรับงบหรือแผนตามผล', keys: ['ctr', 'cpc', 'cpa', 'roas', 'วิเคราะห์ผล', 'ปรับงบ', 'รายงานผล', 'insight', 'analytics', 'ยอดเข้าถึง', 'ยอดขาย', 'kpi', 'ตัวชี้วัด'], rubric: 'ตัวชี้วัดและการปรับแผน', full: 'เลือกตัวเลขที่เหมาะ และบอกจุดตัดสินใจว่าจะปรับเมื่อไร' },
  { name: 'ถ่ายและตัดต่อวิดีโอสั้น', description: 'ถ่ายและตัดต่อคลิปสั้นสำหรับ TikTok, Reels', keys: ['ตัดต่อ', 'วิดีโอ', 'video', 'คลิป', 'capcut', 'premiere', 'reels', 'tiktok', 'ถ่ายทำ'], rubric: 'ไอเดียวิดีโอ', full: 'มีโครงเรื่องคลิปชัดใน 3 วินาทีแรก และเหมาะกับแพลตฟอร์ม' },
  { name: 'ออกแบบกราฟิก', description: 'ออกแบบภาพโพสต์และสื่อด้วย Canva, Figma หรือ Photoshop', keys: ['canva', 'figma', 'photoshop', 'illustrator', 'ออกแบบ', 'กราฟิก', 'graphic', 'design', 'โปสเตอร์'], rubric: 'งานออกแบบ', full: 'ภาพอ่านง่าย ลำดับสายตาชัด ตรงแบรนด์' },
  { name: 'วิเคราะห์ข้อมูลด้วย Excel/Sheets', description: 'จัดการและสรุปข้อมูลด้วยสูตร ตาราง Pivot และกราฟ', keys: ['excel', 'google sheets', 'sheets', 'pivot', 'vlookup', 'xlookup', 'วิเคราะห์ข้อมูล', 'data', 'dashboard', 'power bi', 'sql', 'สถิติ'], rubric: 'การวิเคราะห์ข้อมูล', full: 'สรุปข้อมูลถูกต้อง และอธิบายสิ่งที่ตัวเลขบอกได้' },
  { name: 'งานขายและดูแลลูกค้า', description: 'นำเสนอสินค้า ปิดการขาย และดูแลลูกค้าหลังการขาย', keys: ['ขาย', 'sales', 'ลูกค้า', 'customer', 'ปิดการขาย', 'เสนอขาย', 'บริการลูกค้า', 'crm', 'ตอบแชต'], rubric: 'การสื่อสารกับลูกค้า', full: 'เข้าใจความต้องการลูกค้า และเสนอทางออกที่ชัด' },
  { name: 'เขียนโปรแกรมเว็บ', description: 'พัฒนาเว็บด้วย JavaScript/TypeScript, React หรือภาษาอื่น', keys: ['javascript', 'typescript', 'react', 'next.js', 'node', 'python', 'html', 'css', 'เขียนโปรแกรม', 'developer', 'api', 'git'], rubric: 'คุณภาพโค้ด', full: 'โค้ดทำงานถูกต้อง อ่านง่าย และอธิบายการตัดสินใจได้' },
  { name: 'บัญชีและการเงิน', description: 'บันทึกบัญชี ทำงบ และตรวจเอกสารการเงิน', keys: ['บัญชี', 'accounting', 'งบการเงิน', 'ภาษี', 'vat', 'ใบกำกับ', 'express', 'การเงิน', 'finance'], rubric: 'ความถูกต้องทางบัญชี', full: 'ตัวเลขถูกต้อง อ้างหลักการบัญชีได้' },
  { name: 'ภาษาอังกฤษเพื่อการทำงาน', description: 'สื่อสาร เขียนอีเมล และนำเสนอเป็นภาษาอังกฤษ', keys: ['english', 'ภาษาอังกฤษ', 'ielts', 'toeic', 'toefl', 'cu-tep'], rubric: 'การสื่อสารภาษาอังกฤษ', full: 'สื่อสารชัด ถูกไวยากรณ์ และเหมาะกับผู้อ่าน' },
  { name: 'บริหารโครงการและประสานงาน', description: 'วางแผนงาน ติดตามกำหนดส่ง และประสานหลายฝ่าย', keys: ['ประสานงาน', 'วางแผน', 'project', 'โครงการ', 'จัดงาน', 'event', 'ทีม', 'ผู้นำ', 'trello', 'notion'], rubric: 'การวางแผนงาน', full: 'แผนมีลำดับ กำหนดเวลา และผู้รับผิดชอบชัด' }
];


// เครื่องมือ/โปรแกรมที่พบบ่อยใน CV (ชื่อมาตรฐาน: คำที่ใช้จับ)
export const TOOLS: [string, string[]][] = [
  ['Canva', ['canva']], ['Figma', ['figma']], ['Photoshop', ['photoshop']], ['Illustrator', ['illustrator']],
  ['Premiere Pro', ['premiere']], ['CapCut', ['capcut']], ['Lightroom', ['lightroom']], ['After Effects', ['after effects']],
  ['Excel', ['excel']], ['Google Sheets', ['google sheets', 'google sheet']], ['Power BI', ['power bi', 'powerbi']], ['SQL', ['sql']],
  ['Python', ['python']], ['JavaScript', ['javascript']], ['TypeScript', ['typescript']], ['React', ['react']],
  ['Word', ['microsoft word', 'ms word']], ['PowerPoint', ['powerpoint']], ['Notion', ['notion']], ['Trello', ['trello']],
  ['Google Analytics', ['google analytics', 'ga4']], ['Meta Business Suite', ['meta business', 'business suite', 'ads manager']],
  ['WordPress', ['wordpress']], ['AutoCAD', ['autocad']], ['SAP', [' sap ']], ['Express (บัญชี)', ['express']], ['LINE OA', ['line oa', 'line official']]
];

// ไม่ใช้ NFKC เพราะแยกสระ "ำ" เป็น 2 ตัวอักษร ทำให้ตำแหน่งไฮไลต์เลื่อน; รวม ํ+า ที่ PDF บางไฟล์แยกไว้กลับเป็น ำ
export const norm = (s: string) => s.replace(/\u0e4d\u0e32/g, '\u0e33').toLowerCase();

/** ขยายคีย์เวิร์ดที่ HR พิมพ์ด้วยคำพ้อง เช่น "ยิงแอด" → [ยิงแอด, meta ads, facebook ads, ...] */
export function expandKeyword(kw: string): string[] {
  const k = norm(kw.trim());
  if (!k) return [];
  const out = new Set([k]);
  for (const s of SKILLS) {
    const all = [norm(s.name), ...s.keys.map(norm)];
    if (all.some((a) => a === k || a.includes(k) || (k.length >= 4 && k.includes(a)))) all.forEach((a) => out.add(a));
  }
  for (const [name, keys] of TOOLS) {
    const all = [norm(name), ...keys.map((x) => norm(x).trim())];
    if (all.includes(k)) all.forEach((a) => out.add(a));
  }
  return [...out].filter((x) => x.length >= 2);
}
