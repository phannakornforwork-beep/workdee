// แปลงผลทดสอบ (TAP) ที่ไม่ผ่านเป็นคำอธิบายบน GitHub Actions ให้อ่านได้จากหน้า Actions
// Usage: node tests/ci-annotate.mjs <tap-file> [extra-log-file]
import fs from 'node:fs';
const [tap, extra] = process.argv.slice(2);
const enc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
const lines = fs.existsSync(tap) ? fs.readFileSync(tap, 'utf8').split('\n') : [];
let count = 0;
for (let i = 0; i < lines.length && count < 8; i++) {
  const m = lines[i].match(/^\s*not ok \d+ - (.*)$/);
  if (!m) continue;
  const block = [];
  for (let j = i + 1; j < lines.length && j < i + 60; j++) {
    if (/^\s*(ok|not ok) \d+ - /.test(lines[j]) || /# Subtest/.test(lines[j])) break;
    block.push(lines[j]);
  }
  // skip parent tests whose only failure is a failing subtest
  if (block.some((l) => /failureType: 'subtestsFailed'/.test(l))) continue;
  console.log(`::error title=${m[1].replace(/[:,]/g, ' ')}::${enc(block.join('\n'))}`);
  count++;
}
if (extra && fs.existsSync(extra)) {
  const tail = fs.readFileSync(extra, 'utf8').split('\n').slice(-60).join('\n');
  console.log(`::error title=log tail::${enc(tail)}`);
}
