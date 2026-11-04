// แยกข้อความจาก CV ลงช่องโปรไฟล์ด้วยกฎ (ไม่ใช้ AI)
// 1) หาหัวข้อส่วน เช่น "การศึกษา" "Experience" "ทักษะ"  2) แยกบรรทัดในแต่ละส่วน
// 3) จับคำจากพจนานุกรมทักษะและเครื่องมือทั้งเอกสาร  4) จับรูปแบบ เกรดเฉลี่ย ปี คะแนนสอบภาษา
import { SKILLS, TOOLS, norm } from '@/lib/skills-dict';

export type CvParsed = {
  headline: string;
  intro: string;
  skills: string[];
  tools: string[];
  languages: { name: string; detail: string }[];
  certificates: { name: string; detail: string }[];
  projects: { title: string; detail: string }[];
  experiences: { title: string; detail: string }[];
  educations: { institution_name: string; level: string; major: string; year_label: string; gpa: number | null }[];
  normalized: { as_written: string; skill: string }[];
  found: string[]; // ส่วนที่หาเจอ
  missing: string[]; // ส่วนที่หาไม่เจอ ให้ผู้ใช้ตรวจ
};

type Section = 'about' | 'education' | 'experience' | 'skills' | 'tools' | 'projects' | 'languages' | 'certificates' | 'activities' | 'contact' | 'other';

const HEADINGS: [Section, RegExp][] = [
  ['about', /^(เกี่ยวกับ(ฉัน|ตัวเอง)?|แนะนำตัว|สรุปตัวเอง|ประวัติส่วนตัวโดยย่อ|profile|summary|about( me)?|objective|career objective|เป้าหมาย(อาชีพ|ในการทำงาน)?)$/i],
  ['education', /^(การศึกษา|ประวัติการศึกษา|education|academic( background)?|educational background)$/i],
  ['experience', /^(ประสบการณ์(การทำงาน|ทำงาน)?|ประวัติการทำงาน|การฝึกงาน|ประสบการณ์ฝึกงาน|work experience|experience|employment( history)?|internships?|professional experience)$/i],
  ['skills', /^(ทักษะ|ทักษะ(และความสามารถ|เฉพาะทาง)?|ความสามารถ(พิเศษ)?|skills?|technical skills|soft skills|hard skills|competenc(y|ies)|key skills)$/i],
  ['tools', /^(เครื่องมือ|โปรแกรม(ที่ใช้)?|ซอฟต์แวร์|tools|software|programs?)$/i],
  ['projects', /^(ผลงาน|โปรเจกต์|โปรเจค|โครงงาน|projects?|portfolio|selected works?)$/i],
  ['languages', /^(ภาษา|ทักษะ(ด้าน)?ภาษา|languages?)$/i],
  ['certificates', /^(ใบรับรอง|ใบประกาศ(นียบัตร)?|การอบรม|การฝึกอบรม|certifications?|certificates?|trainings?|courses?|licenses?)$/i],
  ['activities', /^(กิจกรรม|กิจกรรมระหว่างเรียน|activities|extracurricular( activities)?|volunteer(ing)?|leadership)$/i],
  ['contact', /^(ข้อมูลติดต่อ|ติดต่อ|contact|personal (info|information|details)|ข้อมูลส่วนตัว)$/i]
];

const BULLET = /^[\s•●▪◦‣\-–—*·>]+/;
const DATE_RANGE = /((19|20|25)\d{2}|(ม\.?ค|ก\.?พ|มี\.?ค|เม\.?ย|พ\.?ค|มิ\.?ย|ก\.?ค|ส\.?ค|ก\.?ย|ต\.?ค|พ\.?ย|ธ\.?ค)\.?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^\n]{0,20}(-|–|—|ถึง|to)\s*((19|20|25)\d{2}|ปัจจุบัน|present|now)/i;
const PERSONAL = /(@|โทร|tel|phone|mobile|\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b|line id|ที่อยู่|address|วันเกิด|birth|อายุ\s*\d|age\s*\d|เพศ|gender|สัญชาติ|nationality|ศาสนา|religion|สถานภาพ|marital|linkedin\.com|facebook\.com)/i;

function headingOf(line: string): Section | null {
  const t = line.replace(BULLET, '').replace(/[:：\-–—]+$/, '').trim();
  if (t.length > 40) return null;
  for (const [sec, re] of HEADINGS) if (re.test(t)) return sec;
  return null;
}

function splitList(lines: string[]): string[] {
  return lines
    .flatMap((l) => l.replace(BULLET, '').split(/[,،、|/•·;]+|\s{2,}/))
    .map((x) => x.replace(/^(ทักษะ|skills?|โปรแกรม|tools)\s*[:：]\s*/i, '').trim())
    .filter((x) => x.length >= 2 && x.length <= 40 && !/^(และ|and)$/i.test(x));
}

// รวมบรรทัดเป็นรายการ: บรรทัดที่ไม่ใช่ bullet = หัวรายการ, bullet ถัดไป = รายละเอียด
function entries(lines: string[]): { title: string; detail: string }[] {
  const out: { title: string; detail: string }[] = [];
  for (const raw of lines) {
    const isBullet = BULLET.test(raw) && !DATE_RANGE.test(raw.slice(0, 12));
    const line = raw.replace(BULLET, '').trim();
    if (!line) continue;
    const last = out[out.length - 1];
    if (isBullet && last) last.detail = [last.detail, line].filter(Boolean).join(' · ');
    else if (last && !last.detail && DATE_RANGE.test(line) && line.length < 40) last.detail = line;
    else out.push({ title: line.slice(0, 160), detail: '' });
  }
  return out.slice(0, 10).map((e) => ({ title: e.title, detail: e.detail.slice(0, 300) }));
}

function level(line: string): string {
  if (/(ปริญญาเอก|ph\.?d|doctor)/i.test(line)) return 'doctorate';
  if (/(ปริญญาโท|master|m\.?b\.?a|m\.?sc|m\.?a\.|มหาบัณฑิต)/i.test(line)) return 'master';
  if (/(ปวส|high vocational|อนุปริญญา|diploma)/i.test(line)) return 'high_vocational';
  if (/(ปวช|vocational certificate)/i.test(line)) return 'vocational';
  if (/(ปริญญาตรี|bachelor|b\.?b\.?a|b\.?sc|b\.?eng|b\.?a\.|บัณฑิต|วท\.?บ|บธ\.?บ|ศศ\.?บ|วศ\.?บ|นศ\.?บ|บช\.?บ|ศ\.?บ)/i.test(line)) return 'bachelor';
  return '';
}

function educations(lines: string[]): CvParsed['educations'] {
  const text = lines.map((l) => l.replace(BULLET, '').trim()).filter(Boolean);
  const out: CvParsed['educations'] = [];
  let cur: CvParsed['educations'][number] | null = null;
  for (const l of text) {
    const isInst = /(มหาวิทยาลัย|university|วิทยาลัย|college|สถาบัน|institute|โรงเรียน|school|academy)/i.test(l);
    if (isInst && (!cur || cur.institution_name)) {
      cur = { institution_name: '', level: '', major: '', year_label: '', gpa: null };
      out.push(cur);
    }
    if (!cur) {
      cur = { institution_name: '', level: '', major: '', year_label: '', gpa: null };
      out.push(cur);
    }
    if (isInst && !cur.institution_name) cur.institution_name = l.replace(/\s*[,|(].*$/, '').replace(DATE_RANGE, '').trim().slice(0, 200);
    cur.level ||= level(l);
    const major = l.match(/(?:สาขา(?:วิชา)?|major(?: in)?|in|คณะ)\s*[:：]?\s*([^,|()\d]{2,60})/i);
    if (major && !cur.major && !/มหาวิทยาลัย|university/i.test(major[1])) cur.major = major[1].split(/\s(?:เกรด|gpa|ปี|เกียรตินิยม|honou?rs?)/i)[0].trim();
    const gpa = l.match(/(?:gpax?|เกรดเฉลี่ย(?:สะสม)?|g\.p\.a\.?)\s*[:：]?\s*([0-4]\.\d{1,2})/i);
    if (gpa) cur.gpa = Number(gpa[1]);
    const years = l.match(/(?:19|20|25)\d{2}/g);
    if (years && !cur.year_label) cur.year_label = /(ปัจจุบัน|present|กำลังศึกษา)/i.test(l) ? `กำลังศึกษา (${years[0]})` : `จบ ${years[years.length - 1]}`;
  }
  return out.filter((e) => e.institution_name || e.major).slice(0, 4).map((e) => ({ ...e, level: e.level || (/(โรงเรียน|school)/i.test(e.institution_name) ? 'other' : 'bachelor') }));
}

/** แปลงข้อความ CV เป็นข้อมูลโปรไฟล์ ข้ามข้อมูลส่วนตัว (ชื่อ เบอร์ อีเมล ที่อยู่ อายุ เพศ) */
export function parseCv(raw: string): CvParsed {
  const lines = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const buckets: Record<Section, string[]> = { about: [], education: [], experience: [], skills: [], tools: [], projects: [], languages: [], certificates: [], activities: [], contact: [], other: [] };
  let sec: Section = 'other';
  for (const l of lines) {
    const h = headingOf(l);
    if (h) {
      sec = h;
      // "ทักษะ: Canva, Excel" — หัวข้อกับเนื้อหาอยู่บรรทัดเดียวกัน
      continue;
    }
    const inline = l.match(/^([^:：]{2,25})[:：]\s*(.+)$/);
    const inlineSec = inline ? headingOf(inline[1]) : null;
    if (inlineSec && inline) {
      buckets[inlineSec].push(inline[2]);
      continue;
    }
    if (PERSONAL.test(l) && l.length < 120) continue;
    buckets[sec].push(l);
  }

  const whole = norm(lines.filter((l) => !PERSONAL.test(l)).join('\n'));

  // ทักษะ: จากส่วนทักษะ + จับคำพ้องทั้งเอกสาร
  const normalized: CvParsed['normalized'] = [];
  const skillSet = new Map<string, string>();
  // คำกว้างเกินไปที่ไม่นับเป็นหลักฐานทักษะในการสแกน CV
  const WEAK = new Set(['ขาย', 'ลูกค้า', 'ทีม', 'data', 'design', 'video', 'คลิป', 'project', 'โครงการ', 'event', 'api', 'git', 'html', 'css', 'ออกแบบ', 'โซเชียล', 'ยอดขาย', 'วางแผน', 'insight', 'dashboard', 'ผู้นำ', 'การเงิน', 'สถิติ', 'english', 'ภาษาอังกฤษ', 'ielts', 'toeic', 'toefl', 'cu-tep', 'canva', 'capcut', 'figma', 'excel', 'google sheets', 'sheets', 'notion', 'trello', 'tiktok', 'photoshop', 'illustrator', 'premiere', 'node', 'react', 'python', 'javascript', 'typescript', 'sql']);
  for (const s of SKILLS) {
    const hit = s.keys.find((k) => !WEAK.has(norm(k)) && whole.includes(norm(k)));
    if (hit) {
      const name = s.name;
      skillSet.set(norm(name), name);
      if (norm(hit) !== norm(name)) normalized.push({ as_written: hit, skill: name });
    }
  }
  const toolSet = new Map<string, string>();
  for (const [name, keys] of TOOLS) if (keys.some((k) => ` ${whole} `.includes(norm(k)))) toolSet.set(norm(name), name);
  for (const item of splitList([...buckets.skills, ...buckets.tools])) {
    const k = norm(item);
    const asTool = TOOLS.find(([n, ks]) => norm(n) === k || ks.some((x) => norm(x).trim() === k));
    if (asTool) toolSet.set(norm(asTool[0]), asTool[0]);
    else if (
      ![...skillSet.keys()].some((s) => s.includes(k) || k.includes(s)) &&
      !SKILLS.some((sk) => skillSet.has(norm(sk.name)) && sk.keys.some((x) => k.includes(norm(x)) || norm(x).includes(k)))
    )
      skillSet.set(k, item);
  }

  // ภาษา: ส่วนภาษา + คะแนนสอบที่พบในเอกสาร
  const languages = entries(buckets.languages).map((e) => {
    const [name, ...rest] = e.title.split(/[:：\-–(]/);
    return { name: name.trim().slice(0, 60), detail: [rest.join(' ').replace(/\)$/, '').trim(), e.detail].filter(Boolean).join(' · ').slice(0, 200) };
  });
  for (const m of whole.matchAll(/(toeic|ielts|toefl(?: ibt)?|cu-tep|tu-get|jlpt|hsk|topik)\s*[:：]?\s*(n[1-5]|\d{1,3}(?:\.\d)?)/gi)) {
    const exam = m[1].toUpperCase();
    if (!languages.some((l) => norm(`${l.name} ${l.detail}`).includes(m[1]))) languages.push({ name: exam, detail: m[2].toUpperCase() });
  }

  const experiences = [...entries(buckets.experience), ...entries(buckets.activities)].slice(0, 10);
  const projects = entries(buckets.projects);
  const certificates = entries(buckets.certificates).map((e) => ({ name: e.title, detail: e.detail }));
  const edus = educations(buckets.education);

  const intro = buckets.about.join(' ').slice(0, 600);
  const skills = [...skillSet.values()].slice(0, 25);
  const major = edus[0]?.major;
  const headline = (
    intro.split(/(?<=[.!?])\s|\s{2,}/)[0]?.slice(0, 120) ||
    [major ? `${edus[0]?.year_label?.startsWith('กำลัง') ? 'นักศึกษา' : 'บัณฑิต'}${major}` : '', skills.slice(0, 3).join(', ')].filter(Boolean).join(' · ')
  ).slice(0, 160);

  const checks: [string, boolean][] = [
    ['การศึกษา', edus.length > 0],
    ['ทักษะ', skills.length > 0],
    ['ประสบการณ์', experiences.length > 0],
    ['ผลงาน', projects.length > 0],
    ['ภาษา', languages.length > 0],
    ['แนะนำตัว', Boolean(intro)]
  ];
  return {
    headline,
    intro,
    skills,
    tools: [...toolSet.values()].slice(0, 25),
    languages: languages.slice(0, 8),
    certificates: certificates.slice(0, 10),
    projects,
    experiences,
    educations: edus,
    normalized: normalized.slice(0, 8),
    found: checks.filter(([, ok]) => ok).map(([k]) => k),
    missing: checks.filter(([, ok]) => !ok).map(([k]) => k)
  };
}
