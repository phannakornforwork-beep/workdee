// ทดสอบแบบเปิดหน้าเว็บจริง: ทุกหน้าหลักต้องแสดงผลได้ (สถานะ 200) ทั้งคนทั่วไป ผู้หางาน บริษัท และผู้ดูแลระบบ
// Smoke test against a running `next start` (WEB_URL) backed by the local stack (tests/stack/start.sh).
// Logs in by writing the same session cookie that @supabase/ssr writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE as API, ANON, ok, upsert, verifiedCompany, rootPosition, openJob, makeAdmin, releaseBatches } from '../api/helpers.mjs';

const WEB = (process.env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET || '';

// คุกกี้ session แบบเดียวกับ @supabase/ssr: sb-<ref>-auth-token = "base64-" + base64url(JSON) แบ่งชิ้นละ 3180 ตัวอักษร
function cookieFor(session) {
  const key = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const size = 3180;
  if (value.length <= size) return `${key}=${value}`;
  const parts = [];
  for (let i = 0; i * size < value.length; i++) parts.push(`${key}.${i}=${value.slice(i * size, (i + 1) * size)}`);
  return parts.join('; ');
}

let n = 0;
async function account(name) {
  n += 1;
  const email = `smoke${Date.now().toString(36)}${n}@example.com`;
  const res = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test-password-123', data: { display_name: name } })
  });
  const s = await res.json();
  if (!s.access_token) throw new Error(`signup failed: ${JSON.stringify(s)}`);
  if (!s.expires_at) s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
  return { token: s.access_token, id: s.user.id, email, name, cookie: cookieFor(s) };
}

async function get(path, who) {
  const res = await fetch(WEB + path, { headers: who ? { cookie: who.cookie } : {}, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') || '', body: await res.text() };
}

async function expectPage(path, who, text) {
  const r = await get(path, who);
  assert.equal(r.status, 200, `${path} → ${r.status} ${r.location} ${r.body.slice(0, 400)}`);
  assert.ok(!r.body.includes('เกิดข้อผิดพลาด'), `${path} rendered the error page`);
  if (text) assert.ok(r.body.includes(text), `${path} should contain "${text}"`);
  return r;
}

test('public pages render', async () => {
  for (const [path, text] of [
    ['/', 'WorkDee'],
    ['/jobs', 'ประกาศงาน'],
    ['/login', 'เข้าสู่ระบบ'],
    ['/signup', 'สมัคร'],
    ['/forgot-password', 'รหัสผ่าน'],
    ['/privacy', 'นโยบายความเป็นส่วนตัว'],
    ['/terms', 'เงื่อนไขการใช้งาน']
  ]) {
    await expectPage(path, null, text);
  }
  const missing = await get('/this-page-does-not-exist');
  assert.equal(missing.status, 404);
});

test('private areas need a login and background endpoints need their secrets', async () => {
  for (const path of ['/me', '/spaces', '/admin', '/companies/new']) {
    const r = await get(path);
    assert.ok([302, 303, 307, 308].includes(r.status), `${path} should redirect, got ${r.status}`);
    assert.ok(r.location.includes('/login'), `${path} should go to login, got ${r.location}`);
  }
  const cron = await fetch(`${WEB}/api/cron/dispatch`);
  assert.equal(cron.status, 401);
  const line = await fetch(`${WEB}/api/line/webhook`, { method: 'POST', body: '{"events":[]}', headers: { 'x-line-signature': 'bad' } });
  assert.equal(line.status, 401);
  if (CRON_SECRET) {
    const okRun = await fetch(`${WEB}/api/cron/dispatch`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(okRun.status, 200);
    const body = await okRun.json();
    assert.equal(body.ok, true, JSON.stringify(body));
  }
});

test('company, candidate and admin pages render with real data', async () => {
  const owner = await account('เจ้าของร้านสโมค');
  const companyId = await verifiedCompany(owner, 'บริษัท ทดสอบหน้าเว็บ จำกัด');
  const root = rootPosition(companyId);
  const dept = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'หัวหน้าการตลาด', p_is_department: true, p_grants: { team: 1, post: 1, screen: 1 } });
  const { jobId } = await openJob(owner, companyId, dept);

  const cand = await account('มินท์ สโมค');
  const prof = await upsert(cand, 'candidate_profiles', {
    user_id: cand.id, full_name: 'มินท์ สโมค', headline: 'นักศึกษาการตลาดปีสุดท้าย', intro: 'ชอบทำคอนเทนต์', province: 'กรุงเทพมหานคร',
    skills: ['Content Writing', 'Facebook Ads'], tools: ['Canva'], pref_job_types: ['full_time']
  });
  assert.ok(prof.status < 300, JSON.stringify(prof.data));
  const appId = await ok(cand, 'apply_to_job', { p_job: jobId, p_intro: 'สนใจงานนี้มาก', p_expected_salary: 20000, p_share_plan: false });
  await ok(owner, 'save_task', { p_company: companyId, p_task: null, p_fields: { title: 'เตรียมโพสต์เปิดตัว', assignee_id: owner.id } });
  const code = await ok(owner, 'create_invite', { p_company: companyId, p_position: dept });
  const rooms = await ok(owner, 'chat_room_list', { p_company: companyId });
  releaseBatches();

  await expectPage('/spaces', owner, 'บริษัท ทดสอบหน้าเว็บ จำกัด');
  const c = `/c/${companyId}`;
  for (const path of [
    c, `${c}/work`, `${c}/work?tab=team`, `${c}/work?tab=projects`, `${c}/work?tab=leave`,
    `${c}/jobs`, `${c}/jobs/new`, `${c}/jobs/${jobId}`, `${c}/pipeline`, `${c}/applications/${appId}`, `${c}/interviews`,
    `${c}/team`, `${c}/team?tab=positions`, `${c}/team?tab=invite`, `${c}/team?tab=approvals`, `${c}/team?tab=log`,
    `${c}/chat?list=1`, `${c}/chat/${rooms[0].room_id}`, `${c}/notifications`, `${c}/settings`, `${c}/settings?new=1`, `${c}/help`
  ]) {
    await expectPage(path, owner);
  }
  const chat = await get(`${c}/chat`, owner);
  assert.ok([302, 303, 307, 308].includes(chat.status) && chat.location.includes('/chat/'), `chat index should open a room, got ${chat.status}`);

  // พื้นที่บริษัทเปิดไม่ได้สำหรับคนนอก
  const outsider = await get(c, cand);
  assert.ok([302, 303, 307, 308].includes(outsider.status), `outsider should be redirected, got ${outsider.status}`);

  for (const path of ['/me', '/me/profile', '/me/applications', `/me/applications/${appId}`, '/me/notifications', '/me/plan', '/me/privacy', `/jobs/${jobId}`, '/companies/new']) {
    await expectPage(path, cand);
  }
  await expectPage(`/join/${code}`, cand, 'บริษัท ทดสอบหน้าเว็บ จำกัด');
  await expectPage(`/jobs/${jobId}`, null);

  const notAdmin = await expectPage('/admin', cand);
  assert.ok(notAdmin.body.includes('ผู้ดูแลระบบ WorkDee เท่านั้น'));
  makeAdmin(owner);
  await expectPage('/admin', owner, 'บริษัทรอยืนยัน');
});
