// งาน AI ทั้งหมดของ WorkDee: prompt + โครงสร้างผลลัพธ์ + ตัวตรวจผลก่อนใช้
// ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
import { aiDemo, aiJson, type AiFile } from '@/lib/ai/client';
import { demoCv, demoDesignJob, demoGrade, demoScreen } from '@/lib/ai/demo';

const conf = { type: 'number', minimum: 0, maximum: 1 };

// ---------------------------------------------------------------- A. สแกน CV
export type CvExtract = {
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
  low_confidence: string[];
  confidence: number;
};

export async function extractCv(file: AiFile): Promise<CvExtract> {
  if (aiDemo()) return demoCv();
  return aiJson<CvExtract>({
    tool: 'save_profile_from_cv',
    file,
    system: `คุณช่วยผู้หางานชาวไทยแปลง CV เป็นโปรไฟล์ WorkDee ผู้สมัครจะตรวจและแก้ก่อนบันทึกเสมอ
- ไม่ต้องดึงชื่อ อายุ วันเกิด เพศ ที่อยู่ เบอร์โทร อีเมล หรือรูป
- skills = ทักษะการทำงาน ใช้ชื่อมาตรฐาน เช่น "ยิงแอดเฟซบุ๊ก" → "Meta Ads" และบันทึกคู่ที่แปลงไว้ใน normalized
- tools = โปรแกรมหรือเครื่องมือ เช่น Canva, Excel, Figma
- headline ไม่เกิน 120 ตัวอักษร intro ไม่เกิน 600 ตัวอักษร เขียนจากข้อมูลใน CV เท่านั้น
- low_confidence = ชื่อช่องที่อ่านไม่ชัดหรือต้องตีความ (ใช้ชื่อช่องตาม schema)`,
    prompt: 'สกัดข้อมูลจาก CV ที่แนบ',
    schema: {
      type: 'object',
      required: ['headline', 'intro', 'skills', 'tools', 'languages', 'certificates', 'projects', 'experiences', 'educations', 'normalized', 'low_confidence', 'confidence'],
      properties: {
        headline: { type: 'string' },
        intro: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' }, maxItems: 30 },
        tools: { type: 'array', items: { type: 'string' }, maxItems: 30 },
        languages: { type: 'array', items: { type: 'object', required: ['name', 'detail'], properties: { name: { type: 'string' }, detail: { type: 'string' } } } },
        certificates: { type: 'array', items: { type: 'object', required: ['name', 'detail'], properties: { name: { type: 'string' }, detail: { type: 'string' } } } },
        projects: { type: 'array', items: { type: 'object', required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string' } } } },
        experiences: { type: 'array', items: { type: 'object', required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string', description: 'องค์กร ระยะเวลา และสิ่งที่ทำ' } } } },
        educations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['institution_name', 'level', 'major', 'year_label'],
            properties: {
              institution_name: { type: 'string' },
              level: { type: 'string', enum: ['vocational', 'high_vocational', 'bachelor', 'master', 'doctorate', 'other'] },
              major: { type: 'string' },
              year_label: { type: 'string', description: 'เช่น จบ 2568 หรือ ปี 4' },
              gpa: { type: ['number', 'null'] }
            }
          }
        },
        normalized: { type: 'array', items: { type: 'object', required: ['as_written', 'skill'], properties: { as_written: { type: 'string' }, skill: { type: 'string' } } } },
        low_confidence: { type: 'array', items: { type: 'string' } },
        confidence: conf
      }
    }
  });
}

// ---------------------------------------------------------------- B. วัตถุประสงค์ → คุณสมบัติ + โจทย์ + rubric
export type Qualification = { name: string; description: string; must_have: boolean; weight: number };
export type JobDesign = {
  requirements: string;
  skills: string[];
  qualifications: Qualification[];
  challenge: { title: string; brief: string; deliverable: string; minutes: number; due_days: number; skill_key: string };
  criteria: { name: string; weight: number; description: string }[];
};

export async function designJob(input: { title: string; jobType: string; objective: string }): Promise<JobDesign> {
  if (aiDemo()) return demoDesignJob(input, toHundred);
  const out = await aiJson<JobDesign>({
    tool: 'save_job_design',
    maxTokens: 6000,
    system: `คุณช่วย SME ไทยที่ไม่มีฝ่าย HR ออกแบบการคัดเลือกจากงานจริง
- qualifications: 3–6 ข้อ วัดได้จากผลงานหรือประสบการณ์ ไม่ใช่บุคลิกหรือภูมิหลัง ห้ามกำหนดอายุ เพศ หรือสถาบัน
  must_have = จำเป็นต้องมี, น้ำหนักรวม 100 พอดี
- challenge: โจทย์จากสถานการณ์งานจริงของตำแหน่งนี้ ใช้แบรนด์สมมติเสมอ ทำเสร็จในเวลาที่กำหนด (30–180 นาที)
  ไม่ใช่งานจริงที่บริษัทจะนำไปใช้ฟรี brief ระบุสถานการณ์และสิ่งที่ต้องส่งเป็นข้อ ๆ อย่างน้อย 120 ตัวอักษร
- criteria: rubric 3–5 ข้อ น้ำหนักแต่ละข้ออย่างน้อย 10 รวม 100 พอดี
  description ของแต่ละข้อบอกว่าได้คะแนนเต็มต้องเห็นอะไรในงาน และได้ครึ่งเดียวเมื่อไร (ไม่เกิน 200 ตัวอักษร)
- skill_key: ภาษาอังกฤษตัวเล็กคั่นด้วย - เช่น content-marketing
- requirements: คุณสมบัติสำหรับแสดงในประกาศ บรรทัดละข้อ ขึ้นต้นด้วย "ต้องมี:" หรือ "มีแล้วดี:"`,
    prompt: `ตำแหน่ง: ${input.title || '(ยังไม่ตั้งชื่อ)'}\nประเภทงาน: ${input.jobType}\nวัตถุประสงค์จาก HR:\n"""${input.objective}"""`,
    schema: {
      type: 'object',
      required: ['requirements', 'skills', 'qualifications', 'challenge', 'criteria'],
      properties: {
        requirements: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        qualifications: {
          type: 'array', minItems: 3, maxItems: 6,
          items: { type: 'object', required: ['name', 'description', 'must_have', 'weight'], properties: { name: { type: 'string' }, description: { type: 'string' }, must_have: { type: 'boolean' }, weight: { type: 'integer' } } }
        },
        challenge: {
          type: 'object', required: ['title', 'brief', 'deliverable', 'minutes', 'due_days', 'skill_key'],
          properties: { title: { type: 'string' }, brief: { type: 'string' }, deliverable: { type: 'string' }, minutes: { type: 'integer' }, due_days: { type: 'integer' }, skill_key: { type: 'string' } }
        },
        criteria: {
          type: 'array', minItems: 3, maxItems: 5,
          items: { type: 'object', required: ['name', 'weight', 'description'], properties: { name: { type: 'string' }, weight: { type: 'integer' }, description: { type: 'string' } } }
        }
      }
    }
  });
  return {
    requirements: out.requirements.slice(0, 4000),
    skills: (out.skills || []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    qualifications: toHundred(
      (out.qualifications || []).slice(0, 6).map((q) => ({ name: q.name.trim().slice(0, 120), description: (q.description || '').slice(0, 300), must_have: Boolean(q.must_have), weight: q.weight })),
      1
    ),
    challenge: {
      title: out.challenge.title.slice(0, 160),
      brief: out.challenge.brief.slice(0, 6000),
      deliverable: out.challenge.deliverable.slice(0, 2000),
      minutes: clamp(Math.round(out.challenge.minutes / 10) * 10, 10, 480),
      due_days: clamp(out.challenge.due_days, 1, 7),
      skill_key: /^[a-z0-9-]{2,40}$/.test(out.challenge.skill_key) ? out.challenge.skill_key : ''
    },
    criteria: toHundred(
      (out.criteria || []).slice(0, 5).map((c) => ({ name: c.name.trim().slice(0, 80), weight: c.weight, description: (c.description || '').slice(0, 300) })),
      5
    )
  };
}

// ---------------------------------------------------------------- C. จับคู่คุณสมบัติกับโปรไฟล์
export type MatchItem = { name: string; must_have: boolean; weight: number; level: 0 | 0.5 | 1; evidence: string; note: string };
export type Screening = { matches: MatchItem[]; match_score: number; missing_must: string[]; summary: string };

export async function screenCandidate(quals: Qualification[], profileText: string): Promise<Screening> {
  if (aiDemo()) return demoScreen(quals, profileText, matchScore);
  const out = await aiJson<{ items: { name: string; level: number; evidence: string; note: string }[]; summary: string }>({
    tool: 'save_screening',
    system: `คุณช่วย HR คัดกรองผู้สมัครโดยเทียบ "ความหมาย" ไม่ใช่คำตรงตัว (เช่น "ยิงแอดเฟซบุ๊ก" ตรงกับ "Meta Ads")
- ประเมินทุกคุณสมบัติ level: 1 = มีหลักฐานชัด, 0.5 = มีบางส่วนหรือเกี่ยวข้องทางอ้อม, 0 = ไม่พบ
- evidence = คัดลอกข้อความจากโปรไฟล์ตรงตัวอักษร ไม่เกิน 160 ตัวอักษร (ว่างถ้า level = 0)
- note = เหตุผลสั้น ๆ ไม่เกิน 1 ประโยค
- summary = จุดแข็งและสิ่งที่ควรถามเพิ่ม 1–2 ประโยค ไม่ตัดสินว่าควรรับหรือไม่`,
    prompt: `คุณสมบัติที่ต้องการ:\n${quals.map((q, i) => `${i + 1}. ${q.name}${q.must_have ? ' (ต้องมี)' : ''} — ${q.description}`).join('\n')}\n\nโปรไฟล์ผู้สมัคร:\n"""${profileText}"""`,
    schema: {
      type: 'object', required: ['items', 'summary'],
      properties: {
        items: { type: 'array', items: { type: 'object', required: ['name', 'level', 'evidence', 'note'], properties: { name: { type: 'string' }, level: { type: 'number', enum: [0, 0.5, 1] }, evidence: { type: 'string' }, note: { type: 'string' } } } },
        summary: { type: 'string' }
      }
    }
  });
  const source = squash(profileText);
  const matches: MatchItem[] = quals.map((q) => {
    const hit = out.items.find((x) => squash(x.name) === squash(q.name));
    let level: 0 | 0.5 | 1 = hit?.level === 1 ? 1 : hit?.level === 0.5 ? 0.5 : 0;
    let evidence = (hit?.evidence || '').trim().slice(0, 200);
    let note = (hit?.note || '').slice(0, 200);
    // หลักฐานต้องอยู่ในโปรไฟล์จริง ถ้าไม่พบตรงตัว ลดเหลือ "บางส่วน" และบอก HR
    if (level > 0 && (!evidence || !source.includes(squash(evidence)))) {
      level = level === 1 ? 0.5 : level;
      note = `${note} (AI อ้างข้อความที่ไม่พบตรงตัวในโปรไฟล์ ตรวจเอง)`.trim();
      evidence = '';
    }
    if (level === 0) evidence = '';
    return { name: q.name, must_have: q.must_have, weight: q.weight, level, evidence, note };
  });
  return { matches, match_score: Math.round(matchScore(matches)), missing_must: matches.filter((m) => m.must_have && m.level === 0).map((m) => m.name), summary: (out.summary || '').slice(0, 600) };
}

// ---------------------------------------------------------------- D. ร่างคะแนนโจทย์ตาม rubric
export type GradeSuggestion = { scores: { name: string; weight: number; score: number; reason: string }[]; feedback: string };

export async function suggestGrade(input: {
  criteria: { name: string; weight: number; description?: string }[];
  brief: string;
  deliverable: string;
  answer: string;
  reasoning: string;
  links: string[];
  aiUse: string;
  file?: AiFile;
}): Promise<GradeSuggestion> {
  if (aiDemo()) return demoGrade(input);
  const out = await aiJson<GradeSuggestion>({
    tool: 'save_grade_suggestion',
    file: input.file,
    system: `คุณเป็นผู้ช่วยตรวจงานโจทย์ตาม rubric ให้ HR ผลของคุณเป็นร่าง HR ต้องยืนยันหรือแก้ก่อนบันทึกเสมอ
- score ของแต่ละเกณฑ์เป็นจำนวนเต็ม 0 ถึงน้ำหนักของเกณฑ์นั้น ให้จากสิ่งที่อยู่ในงานเท่านั้น
- reason อ้างสิ่งที่เห็นในงาน 1–2 ประโยค บอกว่าทำไมได้เท่านี้ และขาดอะไรถึงจะได้เต็ม
- การที่ผู้สมัครแจ้งว่าใช้ AI ไม่ใช่เหตุผลในการหักคะแนน
- feedback ถึงผู้สมัคร: จุดที่ทำได้ดีและสิ่งที่ควรพัฒนา สุภาพ ไม่เกิน 600 ตัวอักษร`,
    prompt: `โจทย์:\n${input.brief}\n\nสิ่งที่ต้องส่ง: ${input.deliverable || '-'}\n\nRubric:\n${input.criteria
      .map((c) => `- ${c.name} (เต็ม ${c.weight})${c.description ? `: ${c.description}` : ''}`)
      .join('\n')}\n\nผู้สมัครแจ้งการใช้ AI: ${input.aiUse}\n\nคำตอบของผู้สมัคร:\n"""${input.answer || '(ส่งเป็นไฟล์หรือลิงก์)'}"""\n\nเหตุผลที่ผู้สมัครเลือกทำแบบนี้:\n"""${input.reasoning || '-'}"""\n\nลิงก์ที่แนบ (AI เปิดไม่ได้ ให้ประเมินจากสิ่งที่อ่านได้): ${input.links.join(', ') || '-'}`,
    schema: {
      type: 'object', required: ['scores', 'feedback'],
      properties: {
        scores: { type: 'array', items: { type: 'object', required: ['name', 'score', 'reason'], properties: { name: { type: 'string' }, score: { type: 'integer', minimum: 0 }, reason: { type: 'string' } } } },
        feedback: { type: 'string' }
      }
    }
  });
  return {
    scores: input.criteria.map((c) => {
      const s = out.scores.find((x) => squash(x.name) === squash(c.name));
      if (!s) throw new Error(`AI ไม่ได้ให้คะแนนเกณฑ์ "${c.name}"`);
      return { name: c.name, weight: c.weight, score: clamp(Math.round(s.score), 0, c.weight), reason: (s.reason || '').slice(0, 400) };
    }),
    feedback: (out.feedback || '').slice(0, 3000)
  };
}

// ---------------------------------------------------------------- F. อ่านใบรับรองภาษา
export type CertRead = {
  exam: string; score_text: string; sub_scores: Record<string, string>; cert_number: string; exam_date: string; holder_name: string; looks_edited: boolean;
};

export function readLanguageCert(file: AiFile) {
  return aiJson<CertRead>({
    tool: 'save_language_certificate',
    file,
    system: `อ่านใบรับรองผลสอบภาษา คัดลอกค่าตามที่ปรากฏในเอกสาร
- exam ใช้ชื่อมาตรฐาน: IELTS, TOEFL iBT, TOEIC, CU-TEP, TU-GET, JLPT, HSK, TOPIK หรือชื่อตามเอกสาร
- score_text = คะแนนรวมหรือระดับ เช่น 6.5, 785, N2
- exam_date รูปแบบ YYYY-MM-DD (ว่างถ้าไม่พบ)
- holder_name = ชื่อผู้สอบตามที่พิมพ์ในเอกสาร (ใช้ตรวจว่าตรงกับบัญชีเท่านั้น)
- looks_edited = true ถ้าเห็นร่องรอยตัดต่อ ตัวอักษรไม่สม่ำเสมอ หรือข้อมูลขัดกันเอง
- ถ้าไม่ใช่ใบรับรองผลสอบภาษา ให้ exam = "ไม่ใช่ใบรับรองภาษา"`,
    prompt: 'อ่านเอกสารที่แนบ',
    schema: {
      type: 'object', required: ['exam', 'score_text', 'sub_scores', 'cert_number', 'exam_date', 'holder_name', 'looks_edited'],
      properties: {
        exam: { type: 'string' }, score_text: { type: 'string' }, sub_scores: { type: 'object', additionalProperties: { type: 'string' } },
        cert_number: { type: 'string' }, exam_date: { type: 'string' }, holder_name: { type: 'string' }, looks_edited: { type: 'boolean' }
      }
    }
  });
}

// อายุผลสอบที่ใช้ทั่วไป (ปี) — null = ไม่หมดอายุ
const VALID_YEARS: Record<string, number | null> = { IELTS: 2, 'TOEFL IBT': 2, TOEFL: 2, TOEIC: 2, 'CU-TEP': 2, 'TU-GET': 2, JLPT: null, HSK: 2, TOPIK: 2 };

export function checkCert(read: CertRead, accountNames: string[], today = new Date()) {
  const norm = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^A-Z฀-๿]/g, '');
  const holder = norm(read.holder_name || '');
  const nameMatch = Boolean(holder) && accountNames.some((n) => {
    const a = norm(n);
    return Boolean(a) && (a === holder || (a.length >= 6 && (holder.includes(a) || a.includes(holder))));
  });
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(read.exam_date) && !Number.isNaN(Date.parse(read.exam_date));
  const years = VALID_YEARS[read.exam.toUpperCase()] ?? 2;
  let expires_on: string | null = null;
  let notExpired = false;
  if (validDate) {
    if (years === null) notExpired = true;
    else {
      const d = new Date(`${read.exam_date}T00:00:00Z`);
      d.setUTCFullYear(d.getUTCFullYear() + years);
      expires_on = d.toISOString().slice(0, 10);
      notExpired = d > today;
    }
  }
  const checks = {
    is_language_cert: read.exam !== 'ไม่ใช่ใบรับรองภาษา',
    name_match: nameMatch,
    not_expired: notExpired,
    has_number: Boolean(read.cert_number?.trim()),
    not_edited: !read.looks_edited
  };
  return { checks, expires_on, exam_date: validDate ? read.exam_date : null, passed: Object.values(checks).every(Boolean) };
}

// ---------------------------------------------------------------- ตัวช่วย
export function matchScore(items: { weight: number; level: number }[]): number {
  const total = items.reduce((a, c) => a + c.weight, 0);
  return total ? (items.reduce((a, c) => a + c.weight * c.level, 0) / total) * 100 : 0;
}

export function totalScore(p: { match: number | null; task: number | null; verified: number }): number | null {
  if (p.match === null || p.task === null) return null;
  return Math.round(0.3 * p.match + 0.6 * p.task + 0.1 * p.verified);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

function squash(s: string) {
  return s.normalize('NFKC').toLowerCase().replace(/[\s"'“”‘’.,()\-–—:;!?]+/g, '');
}

/** ปรับน้ำหนักให้รวม 100 พอดี โดยแต่ละข้อไม่ต่ำกว่า min */
export function toHundred<T extends { weight: number }>(items: T[], min: number): T[] {
  if (!items.length) return items;
  const raw = items.map((c) => Math.max(min, Number(c.weight) || min));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((w) => Math.max(min, Math.round((w / sum) * 100)));
  let diff = 100 - scaled.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 500; guard++) {
    const i = diff > 0 ? scaled.indexOf(Math.max(...scaled)) : scaled.findIndex((w) => w === Math.max(...scaled.filter((x) => x > min)));
    if (i < 0) break;
    scaled[i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return items.map((c, i) => ({ ...c, weight: scaled[i] }));
}
