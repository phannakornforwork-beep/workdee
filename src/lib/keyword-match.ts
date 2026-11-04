// คัดกรองผู้สมัครด้วยคีย์เวิร์ด (ไม่ใช้ AI)
// HR พิมพ์คีย์เวิร์ด → ขยายด้วยคำพ้อง → หาในข้อความแนะนำตัวของใบสมัครและโปรไฟล์ → เรียงตามจำนวนคีย์เวิร์ดที่เจอ
import { expandKeyword, norm } from '@/lib/skills-dict';

export type Snap = {
  headline?: string; intro?: string; skills?: string[]; tools?: string[];
  projects?: { title: string; detail: string }[]; experiences?: { title: string; detail: string }[];
  certificates?: { name: string; detail: string }[]; languages?: { name: string; detail: string }[];
};

export type Hit = { keyword: string; term: string; source: string; snippet: string };
export type KeywordResult = { hits: Hit[]; missing: string[]; score: number };

export function parseKeywords(q: string): string[] {
  return [...new Set(q.split(/[,，\n;]+/).map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 12);
}

function sources(intro: string, s: Snap | null): [string, string][] {
  const pairs = (xs?: { title?: string; name?: string; detail: string }[]) => (xs || []).map((x) => `${x.title || x.name}: ${x.detail}`).join('\n');
  return [
    ['แนะนำตัวในใบสมัคร', intro || ''],
    ['แนะนำตัวในโปรไฟล์', [s?.headline, s?.intro].filter(Boolean).join('\n')],
    ['ประสบการณ์', pairs(s?.experiences)],
    ['ผลงาน', pairs(s?.projects)],
    ['ทักษะ', [...(s?.skills || []), ...(s?.tools || [])].join(', ')],
    ['ใบรับรองและภาษา', [pairs(s?.certificates), pairs(s?.languages)].filter(Boolean).join('\n')]
  ];
}

function snippetAround(text: string, at: number, len: number): string {
  // ตัดเป็นประโยค/บรรทัดที่มีคำนั้น ไม่เกิน ~160 ตัวอักษร
  const start = Math.max(text.lastIndexOf('\n', at) + 1, at - 70, 0);
  let end = text.indexOf('\n', at + len);
  if (end < 0) end = text.length;
  end = Math.min(end, at + len + 90);
  return `${start > 0 && text[start - 1] !== '\n' ? '…' : ''}${text.slice(start, end).trim()}${end < text.length && text[end] !== '\n' ? '…' : ''}`;
}

export function matchKeywords(keywords: string[], intro: string, snap: Snap | null): KeywordResult {
  const srcs = sources(intro, snap).filter(([, t]) => t.trim());
  const hits: Hit[] = [];
  const missing: string[] = [];
  for (const kw of keywords) {
    const terms = expandKeyword(kw).sort((a, b) => b.length - a.length);
    let found: Hit | null = null;
    for (const [label, text] of srcs) {
      const n = norm(text);
      for (const t of terms) {
        const at = n.indexOf(t);
        if (at >= 0) {
          found = { keyword: kw, term: text.slice(at, at + t.length), source: label, snippet: snippetAround(text, at, t.length) };
          break;
        }
      }
      if (found) break;
    }
    if (found) hits.push(found);
    else missing.push(kw);
  }
  return { hits, missing, score: keywords.length ? Math.round((hits.length / keywords.length) * 100) : 0 };
}

/** แบ่งข้อความเพื่อไฮไลต์คำที่เจอ */
export function highlight(snippet: string, term: string): { text: string; mark: boolean }[] {
  const i = norm(snippet).indexOf(norm(term));
  if (i < 0 || !term) return [{ text: snippet, mark: false }];
  return [
    { text: snippet.slice(0, i), mark: false },
    { text: snippet.slice(i, i + term.length), mark: true },
    { text: snippet.slice(i + term.length), mark: false }
  ].filter((p) => p.text);
}
