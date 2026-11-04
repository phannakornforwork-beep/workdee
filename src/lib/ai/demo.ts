// โหมดสาธิต: ทำงานแทน AI เมื่อยังไม่มี ANTHROPIC_API_KEY
// - คัดกรองและร่างคะแนน: ใช้พจนานุกรมคำพ้อง (ไทย/อังกฤษ) จับคู่กับข้อความจริงในโปรไฟล์และคำตอบ หลักฐานเป็นประโยคจริง
// - สแกน CV และใบรับรองภาษา: อ่านไฟล์จริงไม่ได้ จึงคืนข้อมูลตัวอย่าง และบอกผู้ใช้ชัดเจน
import type { CertRead, CvExtract, GradeSuggestion, JobDesign, MatchItem, Qualification, Screening } from '@/lib/ai/tasks';

import { SKILLS, type Skill } from '@/lib/skills-dict';

import { norm } from '@/lib/skills-dict';

function skillsIn(text: string): Skill[] {
  const t = norm(text);
  return SKILLS.filter((s) => s.keys.some((k) => t.includes(norm(k))) || t.includes(norm(s.name)));
}

function sentences(text: string): string[] {
  return text
    .split(/\n|(?<=[.!?。])\s+|\s{2,}|•|·/)
    .map((x) => x.replace(/^[-*\s]+/, '').trim())
    .filter((x) => x.length >= 4);
}

// ---------------------------------------------------------------- B
export function demoDesignJob(input: { title: string; objective: string }, toHundred: <T extends { weight: number }>(xs: T[], min: number) => T[]): JobDesign {
  let found = skillsIn(`${input.title} ${input.objective}`).slice(0, 5);
  if (found.length < 3) {
    for (const s of SKILLS) {
      if (found.length >= 3) break;
      if (!found.includes(s) && ['เขียนคอนเทนต์โซเชียล', 'วิเคราะห์ข้อมูลด้วย Excel/Sheets', 'บริหารโครงการและประสานงาน'].includes(s.name)) found = [...found, s];
    }
  }
  // ข้อที่อยู่ในวลีแบบ "ถ้า...ได้ด้วยจะดี" = มีแล้วดี นอกนั้น = ต้องมี
  const nice = /(ถ้า|จะดี|มีแล้วดี|เพิ่มเติม|เป็นข้อดี|nice to have)/;
  const clauses = input.objective.split(/[\s,;]+|และ(?=ถ้า)/).filter(Boolean);
  const isNice = (s: Skill) => clauses.some((c) => nice.test(c) && s.keys.some((k) => norm(c).includes(norm(k))));
  const quals = toHundred(
    found.map((s) => ({ name: s.name, description: s.description, must_have: !isNice(s), weight: isNice(s) ? 15 : 30 })),
    1
  );
  const criteria = toHundred(found.slice(0, 4).map((s) => ({ name: s.rubric, weight: 25, description: `เต็ม: ${s.full} · ครึ่งเดียว: ทำได้บางส่วน แต่ขาดเหตุผลหรือรายละเอียด` })), 5);
  const role = input.title || 'ตำแหน่งนี้';
  return {
    requirements: quals.map((q) => `${q.must_have ? 'ต้องมี' : 'มีแล้วดี'}: ${q.name}`).join('\n'),
    skills: found.map((s) => s.name.replace(/\s*\(.*\)/, '')).concat(found.flatMap((s) => (s.name.match(/\((.*)\)/) || [])[1] || [])).slice(0, 10),
    qualifications: quals,
    challenge: {
      title: `โจทย์จริงสำหรับ${role}: แบรนด์สมมติ "บ้านดี"`,
      brief: `แบรนด์สมมติ "บ้านดี" เป็นธุรกิจขนาดเล็ก 3 สาขา กำลังจะเปิดสินค้าใหม่ภายใน 2 สัปดาห์ และต้องการคนที่ ${input.objective.slice(0, 200)}\n\nสิ่งที่ต้องส่ง\n${criteria
        .map((c, i) => `${i + 1}) ${c.name}`)
        .join('\n')}\n\nเขียนเหตุผลประกอบสั้น ๆ ว่าทำไมเลือกแบบนี้ ใช้เวลาไม่เกิน 90 นาที`,
      deliverable: 'ไฟล์ PDF หรือลิงก์เอกสาร 1–3 หน้า',
      minutes: 90,
      due_days: 3,
      skill_key: ''
    },
    criteria
  };
}

// ---------------------------------------------------------------- C
export function demoScreen(quals: Qualification[], profileText: string, matchScore: (xs: { weight: number; level: number }[]) => number): Screening {
  const lines = sentences(profileText);
  const matches: MatchItem[] = quals.map((q) => {
    const known = SKILLS.find((s) => norm(s.name) === norm(q.name) || norm(q.name).includes(norm(s.name.replace(/\s*\(.*\)/, ''))));
    const keys = [...(known?.keys || []), ...q.name.split(/[\s/(),]+/).filter((w) => w.length >= 3)].map(norm);
    let best = '';
    let hits = 0;
    for (const line of lines) {
      const n = keys.filter((k) => norm(line).includes(k)).length;
      if (n > hits) {
        hits = n;
        best = line;
      }
    }
    const level: 0 | 0.5 | 1 = hits >= 2 || (hits === 1 && /(ปี|เดือน|โปรเจกต์|ฝึกงาน|ลูกค้า|งบ|บาท|ยอด|\d)/.test(best)) ? 1 : hits === 1 ? 0.5 : 0;
    return {
      name: q.name, must_have: q.must_have, weight: q.weight, level,
      evidence: level ? best.slice(0, 200) : '',
      note: level === 1 ? 'พบคำที่เกี่ยวข้องพร้อมรายละเอียดประสบการณ์' : level === 0.5 ? 'พบคำที่เกี่ยวข้อง แต่ยังไม่เห็นผลงานหรือระยะเวลา' : 'ไม่พบคำที่เกี่ยวข้องในโปรไฟล์'
    };
  });
  const strong = matches.filter((m) => m.level === 1).map((m) => m.name);
  const weak = matches.filter((m) => m.level < 1).map((m) => m.name);
  return {
    matches,
    match_score: Math.round(matchScore(matches)),
    missing_must: matches.filter((m) => m.must_have && m.level === 0).map((m) => m.name),
    summary: `${strong.length ? `เด่นเรื่อง ${strong.slice(0, 2).join(', ')}` : 'ยังไม่เห็นหลักฐานชัดในคุณสมบัติหลัก'}${weak.length ? ` · ควรถามเพิ่มเรื่อง ${weak.slice(0, 2).join(', ')}` : ''}`
  };
}

// ---------------------------------------------------------------- D
export function demoGrade(input: { criteria: { name: string; weight: number; description?: string }[]; answer: string; reasoning: string }): GradeSuggestion {
  const text = `${input.answer}\n${input.reasoning}`;
  const length = text.replace(/\s+/g, '').length;
  const base = length > 1200 ? 0.8 : length > 500 ? 0.65 : length > 150 ? 0.5 : 0.3;
  const scores = input.criteria.map((c) => {
    const known = SKILLS.find((sk) => sk.rubric === c.name);
    const words = [...new Set([
      ...(known?.keys || []),
      ...`${c.name} ${(c.description || '').split('·')[0]}`.split(/[\s,/:·()]+|และ|ของ|ที่|เต็ม/).filter((w) => w.length >= 3)
    ].map(norm))];
    const found = words.filter((w) => norm(text).includes(w));
    const ratio = Math.min(1, base + Math.min(0.2, found.length * 0.05));
    const score = Math.round(c.weight * ratio);
    return {
      name: c.name, weight: c.weight, score,
      reason: found.length
        ? `คำตอบพูดถึง ${found.slice(0, 3).join(', ')} ตามเกณฑ์ ${ratio >= 0.8 ? 'ครบเกือบทุกประเด็น' : 'แต่ยังขาดรายละเอียดหรือเหตุผลประกอบ'}`
        : 'ยังไม่เห็นคำตอบที่ตรงกับเกณฑ์นี้ชัดเจน ลองเพิ่มตัวอย่างหรือเหตุผล'
    };
  });
  const top = [...scores].sort((a, b) => b.score / b.weight - a.score / a.weight);
  return {
    scores,
    feedback: `ทำได้ดีในส่วน${top[0]?.name || 'ภาพรวม'} ควรพัฒนาเรื่อง${top[top.length - 1]?.name || 'รายละเอียด'} โดยเพิ่มเหตุผลและตัวอย่างที่วัดผลได้`
  };
}

// ---------------------------------------------------------------- A, F (อ่านไฟล์จริงไม่ได้ในโหมดสาธิต)
export function demoCv(): CvExtract {
  return {
    headline: 'บัณฑิตการตลาดดิจิทัล ดูแลเพจและยิงแอดให้ร้านค้าขนาดเล็ก',
    intro: 'จบการตลาดดิจิทัล มีประสบการณ์ฝึกงานดูแลเพจร้านเบเกอรี่ 2 สาขา ยิงแอดงบเดือนละ 8,000 บาท และรับงานฟรีแลนซ์เขียนคอนเทนต์ให้ร้านเสื้อผ้าออนไลน์',
    skills: ['Meta Ads', 'เขียนคอนเทนต์', 'วิเคราะห์ผลโฆษณา', 'ตัดต่อวิดีโอสั้น'],
    tools: ['Canva', 'CapCut', 'Google Sheets'],
    languages: [{ name: 'ภาษาอังกฤษ', detail: 'TOEIC 785' }],
    certificates: [{ name: 'Google Digital Garage', detail: '2568' }],
    projects: [{ title: 'แคมเปญเปิดสาขาใหม่ร้านเบเกอรี่', detail: 'ยอดเข้าถึง 42,000 คน งบ 6,000 บาท' }],
    experiences: [
      { title: 'ฝึกงานฝ่ายการตลาด', detail: 'ร้านเบเกอรี่ 2 สาขา 4 เดือน · ดูแลเพจและยิงแอดงบเดือนละ 8,000 บาท' },
      { title: 'ฟรีแลนซ์เขียนคอนเทนต์', detail: 'ร้านเสื้อผ้าออนไลน์ 6 เดือน · เขียนโพสต์สัปดาห์ละ 5 ชิ้น' }
    ],
    educations: [{ institution_name: 'มหาวิทยาลัยตัวอย่าง', level: 'bachelor', major: 'การตลาดดิจิทัล', year_label: 'จบ 2568', gpa: 3.42 }],
    normalized: [{ as_written: 'ยิงแอดเฟซบุ๊ก', skill: 'Meta Ads' }, { as_written: 'ทำคลิปลง TikTok', skill: 'ตัดต่อวิดีโอสั้น' }],
    low_confidence: ['experiences'],
    confidence: 0.88
  };
}

export function demoCert(accountName: string): CertRead {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 5);
  return {
    exam: 'IELTS',
    score_text: '6.5',
    sub_scores: { Listening: '7.0', Reading: '6.5', Writing: '6.0', Speaking: '6.5' },
    cert_number: 'DEMO-25TH008417',
    exam_date: d.toISOString().slice(0, 10),
    holder_name: accountName,
    looks_edited: false
  };
}
