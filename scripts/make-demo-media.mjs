// สร้างรูปเดโม (โลโก้บริษัทสมมติ + รูปโปรไฟล์ภาพวาด) เป็นไฟล์ SVG ใน scripts/demo-media
// ทุกรูปออกแบบขึ้นใหม่ ไม่ใช่รูปคนจริงหรือแบรนด์จริง  ·  node scripts/make-demo-media.mjs
import fs from 'node:fs';
import path from 'node:path';

const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'demo-media');
fs.mkdirSync(out, { recursive: true });
const write = (name, svg) => fs.writeFileSync(path.join(out, name), svg.trim() + '\n');

// ---------------------------------------------------------------- โลโก้บริษัท
write('logo-sukjai.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="40" fill="#FFF4E8"/>
  <path d="M52 92h96l-8 52a20 20 0 0 1-20 17H80a20 20 0 0 1-20-17z" fill="#C2410C"/>
  <rect x="44" y="82" width="112" height="16" rx="8" fill="#9A3412"/>
  <path d="M100 74c-6-14 4-26 14-30-2 10 6 16 2 26-3 6-10 8-16 4z" fill="#16A34A"/>
  <path d="M100 74c-8-8-20-6-26-2 8 4 10 12 20 10z" fill="#22C55E"/>
  <path d="M84 120c6 8 26 8 32 0" fill="none" stroke="#FFF4E8" stroke-width="6" stroke-linecap="round"/>
</svg>`);

write('logo-baansuan.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="40" fill="#ECFDF5"/>
  <circle cx="100" cy="100" r="64" fill="#065F46"/>
  <path d="M70 92h52v22a26 26 0 0 1-52 0z" fill="#ECFDF5"/>
  <path d="M122 98h8a12 12 0 0 1 0 24h-8" fill="none" stroke="#ECFDF5" stroke-width="7"/>
  <path d="M84 84c-4-8 4-12 0-20M98 84c-4-8 4-12 0-20M112 84c-4-8 4-12 0-20" fill="none" stroke="#6EE7B7" stroke-width="5" stroke-linecap="round"/>
  <path d="M56 146c18-10 70-10 88 0" fill="none" stroke="#6EE7B7" stroke-width="6" stroke-linecap="round"/>
</svg>`);

write('logo-thailogistics.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="40" fill="#1E3A8A"/>
  <path d="M36 72h80v56H36z" fill="#FBBF24"/>
  <path d="M116 88h26l22 22v18h-48z" fill="#F8FAFC"/>
  <path d="M124 96h16l12 14h-28z" fill="#1E3A8A"/>
  <circle cx="64" cy="134" r="13" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="6"/>
  <circle cx="140" cy="134" r="13" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="6"/>
  <path d="M50 90h40M50 106h28" stroke="#1E3A8A" stroke-width="7" stroke-linecap="round"/>
  <path d="M150 52l14 0 0 14" fill="none" stroke="#FBBF24" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M164 52l-22 22" stroke="#FBBF24" stroke-width="7" stroke-linecap="round"/>
</svg>`);

// ---------------------------------------------------------------- รูปโปรไฟล์ภาพวาด
const HAIR = {
  long: (c) => `<path d="M48 104c-4-44 22-70 52-70s58 24 52 70l6 70H42z" fill="${c}"/>`,
  bob: (c) => `<path d="M46 112c-6-50 22-78 54-78s60 28 54 78c-4 14-10 20-16 22V96H62v38c-8-2-14-10-16-22z" fill="${c}"/>`,
  bun: (c) => `<circle cx="100" cy="30" r="20" fill="${c}"/><path d="M58 98c-4-38 16-58 42-58s46 20 42 58c-8-20-26-30-42-30s-34 10-42 30z" fill="${c}"/>`,
  short: (c) => `<path d="M58 92c-4-36 16-54 42-54s48 18 42 54c-6-14-14-22-26-24-10 6-34 8-58 24z" fill="${c}"/>`,
  side: (c) => `<path d="M58 96c-6-40 16-60 44-60 24 0 44 16 40 58-10-22-30-34-56-30-12 2-22 14-28 32z" fill="${c}"/>`,
  curly: (c) => `<g fill="${c}"><circle cx="66" cy="74" r="16"/><circle cx="84" cy="56" r="18"/><circle cx="108" cy="52" r="18"/><circle cx="130" cy="64" r="16"/><circle cx="138" cy="86" r="12"/><circle cx="62" cy="94" r="10"/></g>`
};
const BACK = { long: true, bob: true };

function person({ bg, skin, hair, hairColor, shirt, glasses = false, smile = 'soft' }) {
  const back = BACK[hair] ? HAIR[hair](hairColor) : '';
  const front = BACK[hair]
    ? `<path d="M62 96c4-28 18-40 38-40s34 12 38 40c-12-16-24-22-38-22s-28 6-38 22z" fill="${hairColor}"/>`
    : HAIR[hair](hairColor);
  const mouth = smile === 'big'
    ? `<path d="M88 122c6 10 18 10 24 0z" fill="#7F1D1D"/>`
    : `<path d="M88 122c6 6 18 6 24 0" fill="none" stroke="#7F1D1D" stroke-width="3.5" stroke-linecap="round"/>`;
  const specs = glasses
    ? `<g fill="none" stroke="#1F2937" stroke-width="3.5"><circle cx="84" cy="104" r="10"/><circle cx="116" cy="104" r="10"/><path d="M94 104h12"/></g>`
    : '';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="${bg}"/>
  ${back}
  <path d="M40 200c0-34 26-54 60-54s60 20 60 54z" fill="${shirt}"/>
  <path d="M86 140h28v14a14 14 0 0 1-28 0z" fill="${skin}"/>
  <ellipse cx="100" cy="102" rx="38" ry="44" fill="${skin}"/>
  <ellipse cx="62" cy="106" rx="7" ry="10" fill="${skin}"/>
  <ellipse cx="138" cy="106" rx="7" ry="10" fill="${skin}"/>
  ${front}
  <circle cx="84" cy="104" r="4.5" fill="#1F2937"/>
  <circle cx="116" cy="104" r="4.5" fill="#1F2937"/>
  <ellipse cx="74" cy="118" rx="7" ry="4" fill="#F9A8D4" opacity=".45"/>
  <ellipse cx="126" cy="118" rx="7" ry="4" fill="#F9A8D4" opacity=".45"/>
  ${specs}
  ${mouth}
</svg>`;
}

const people = {
  'avatar-candidate.svg': { bg: '#D1FAE5', skin: '#F2C7A5', hair: 'long', hairColor: '#2B1B14', shirt: '#0F6E64', smile: 'big' },
  'avatar-c2.svg': { bg: '#DBEAFE', skin: '#D9A47E', hair: 'short', hairColor: '#111827', shirt: '#1D4ED8' },
  'avatar-c3.svg': { bg: '#FCE7F3', skin: '#F0C4A0', hair: 'bob', hairColor: '#3B2418', shirt: '#BE185D', smile: 'big' },
  'avatar-c4.svg': { bg: '#FEF3C7', skin: '#C98E66', hair: 'curly', hairColor: '#1C1917', shirt: '#B45309', glasses: true },
  'avatar-c5.svg': { bg: '#EDE9FE', skin: '#EBC09C', hair: 'bun', hairColor: '#422006', shirt: '#6D28D9', smile: 'big' },
  'avatar-c6.svg': { bg: '#E0F2FE', skin: '#E2B08A', hair: 'side', hairColor: '#0F172A', shirt: '#0E7490', glasses: true },
  'avatar-c7.svg': { bg: '#FFEDD5', skin: '#D8A27C', hair: 'long', hairColor: '#57301A', shirt: '#C2410C', glasses: true }
};
for (const [name, p] of Object.entries(people)) write(name, person(p));
console.log('สร้างรูปเดโมแล้ว:', fs.readdirSync(out).join(', '));
