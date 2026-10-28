// ตัวช่วยทดสอบ: ยิงคำขอผ่าน API แบบเดียวกับที่เว็บใช้ (Auth + REST + Storage)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const keysFile = process.env.STACK_KEYS || path.join(root, '.stack/keys.env');
const keys = Object.fromEntries(
  fs.readFileSync(keysFile, 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2))
);

export const BASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
export const ANON = keys.SUPABASE_ANON_KEY;
export const SERVICE = keys.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DB_URL || 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

let counter = 0;
export function uniq(prefix = 'u') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

export async function signUp(name) {
  const email = `${uniq(name.replace(/\W/g, '').toLowerCase() || 'user')}@example.com`;
  const res = await fetch(`${BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test-password-123', data: { display_name: name } })
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error(`signup failed: ${JSON.stringify(body)}`);
  return { token: body.access_token, id: body.user.id, email, name };
}

function headers(token, extra = {}) {
  return { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json', ...extra };
}

export async function rpc(who, fn, args = {}) {
  const token = typeof who === 'string' ? who : who?.token;
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(token), body: JSON.stringify(args) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) return { error: data?.message || text, status: res.status, data: null };
  return { data, status: res.status, error: null };
}

export async function ok(who, fn, args = {}) {
  const r = await rpc(who, fn, args);
  if (r.error) throw new Error(`${fn} failed: ${r.error}`);
  return r.data;
}

export async function fails(who, fn, args, pattern) {
  const r = await rpc(who, fn, args);
  if (!r.error) throw new Error(`${fn} should have failed but returned ${JSON.stringify(r.data)}`);
  if (pattern && !pattern.test(r.error)) throw new Error(`${fn} failed with unexpected message: ${r.error}`);
  return r.error;
}

export async function select(who, pathAndQuery) {
  const token = typeof who === 'string' ? who : who?.token;
  const res = await fetch(`${BASE}/rest/v1/${pathAndQuery}`, { headers: headers(token) });
  const data = await res.json();
  if (!res.ok) throw new Error(`select ${pathAndQuery} failed: ${JSON.stringify(data)}`);
  return data;
}

export async function patch(who, pathAndQuery, body) {
  const token = typeof who === 'string' ? who : who?.token;
  const res = await fetch(`${BASE}/rest/v1/${pathAndQuery}`, {
    method: 'PATCH', headers: headers(token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

export async function upsert(who, table, body) {
  const token = typeof who === 'string' ? who : who?.token;
  const res = await fetch(`${BASE}/rest/v1/${table}`, {
    method: 'POST', headers: headers(token, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

export async function upload(who, bucket, objectPath, content = 'file') {
  const token = typeof who === 'string' ? who : who?.token;
  const res = await fetch(`${BASE}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: content
  });
  return { status: res.status, body: await res.json() };
}

export async function download(who, bucket, objectPath) {
  const token = typeof who === 'string' ? who : who?.token;
  const res = await fetch(`${BASE}/storage/v1/object/authenticated/${bucket}/${objectPath}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` }
  });
  return { status: res.status };
}

// รัน SQL ตรงในฐานข้อมูล (ใช้จำลองเวลาที่ผ่านไป หรือเตรียมข้อมูลผู้ดูแล)
export function sql(statement) {
  return execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', statement], { encoding: 'utf8' }).trim();
}

export function makeAdmin(user) {
  sql(`insert into public.platform_admins (user_id) values ('${user.id}') on conflict do nothing;`);
}

export const service = { token: SERVICE };

// ปล่อยให้สิ่งที่รอ 30 วินาที (ยกเลิกได้) มองเห็นได้ทันทีในการทดสอบ
export function releaseBatches() {
  sql(`update public.application_events set visible_at = now() - interval '1 second' where visible_at > now();
       update public.notifications set visible_at = now() - interval '1 second' where visible_at > now();
       update public.chat_messages set visible_at = now() - interval '1 second' where visible_at > now();
       update public.action_batches set undo_until = now() - interval '1 second' where undo_until > now();`);
}

export async function verifiedCompany(owner, name = 'บริษัท ทดสอบ จำกัด') {
  const regNo = String(Date.now()).slice(-9).padStart(13, '1');
  const id = await ok(owner, 'create_company', { p_name: name, p_reg_no: regNo, p_size: '20-49', p_industry: 'อาหาร', p_province: 'กรุงเทพมหานคร' });
  sql(`update public.companies set status = 'verified' where id = '${id}';`);
  return id;
}

export function rootPosition(companyId) {
  return sql(`select id from public.positions where company_id = '${companyId}' and parent_id is null;`);
}

export async function join(user, owner, companyId, positionId) {
  const code = await ok(owner, 'create_invite', { p_company: companyId, p_position: positionId });
  return ok(user, 'accept_invite', { p_code: code });
}

export async function candidate(name, extra = {}) {
  const u = await signUp(name);
  const r = await upsert(u, 'candidate_profiles', {
    user_id: u.id, full_name: name, headline: 'นักศึกษาการตลาด', intro: 'ชอบเขียนคอนเทนต์', province: 'กรุงเทพมหานคร',
    skills: ['Content Writing', 'Facebook Ads'], tools: ['Canva'], pref_job_types: ['full_time'], ...extra
  });
  if (r.status >= 300) throw new Error(`profile failed ${JSON.stringify(r.data)}`);
  return u;
}

export const challengeFields = {
  title: 'วางแผนเปิดตัวสินค้าใหม่ (แบรนด์สมมติ)',
  brief: 'แบรนด์สมมติ "ครัวบ้านสวน" จะเปิดตัวน้ำจิ้มสูตรใหม่ ให้วางแผนคอนเทนต์ 1 สัปดาห์ งบ 20,000 บาท',
  deliverable: 'แผน 1 หน้า + ตัวอย่างโพสต์ 1 ชิ้น',
  time_limit_minutes: 60,
  due_days: 3,
  criteria: [
    { name: 'เข้าใจกลุ่มเป้าหมาย', weight: 40 },
    { name: 'ความชัดเจนของข้อความ', weight: 35 },
    { name: 'การวัดผล', weight: 25 }
  ],
  ai_policy: 'allowed_declare',
  skill_key: 'content-marketing'
};

export async function openJob(user, companyId, departmentId, extra = {}) {
  const jobId = await ok(user, 'save_job', {
    p_company: companyId, p_job: null,
    p_fields: { title: 'เจ้าหน้าที่การตลาดออนไลน์', job_type: 'full_time', department_id: departmentId, description: 'ดูแลคอนเทนต์',
                skills: ['Content Writing', 'Facebook Ads', 'Google Analytics'], province: 'กรุงเทพมหานคร', salary_min: 18000, salary_max: 22000,
                challenge_seats: 10, ...extra }
  });
  await ok(user, 'save_challenge', { p_job: jobId, p_fields: challengeFields });
  const status = await ok(user, 'submit_job', { p_job: jobId });
  return { jobId, status };
}
