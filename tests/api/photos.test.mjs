// ทดสอบรูปโปรไฟล์ผู้หางานและโลโก้บริษัท: สิทธิ์อัปโหลด ตำแหน่งไฟล์ และการแสดงในประกาศ/ใบสมัคร
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ANON, signUp, ok, fails, select, upsert, rootPosition, join, verifiedCompany, candidate, openJob } from './helpers.mjs';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0f6e64"/></svg>';

async function put(who, path) {
  const res = await fetch(`${BASE}/storage/v1/object/media/${path}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'image/svg+xml' }, body: svg
  });
  return res.status;
}

test('candidates upload their own photo; it travels with applications only', async () => {
  const c = await candidate('รูป ผู้หางาน');
  const other = await signUp('คนอื่น');
  assert.equal(await put(c, `avatars/${c.id}/a.svg`), 200);
  assert.notEqual(await put(c, `avatars/${other.id}/a.svg`), 200, 'cannot upload into someone else\'s folder');

  const pub = await fetch(`${BASE}/storage/v1/object/public/media/avatars/${c.id}/a.svg`);
  assert.equal(pub.status, 200, 'public read without login');
  assert.match(pub.headers.get('content-type') || '', /svg/);

  const bad = await upsert(c, 'candidate_profiles', { user_id: c.id, full_name: 'รูป ผู้หางาน', photo_path: `avatars/${other.id}/a.svg` });
  assert.ok(bad.status >= 400, 'photo path must be inside own folder');
  const good = await upsert(c, 'candidate_profiles', { user_id: c.id, full_name: 'รูป ผู้หางาน', photo_path: `avatars/${c.id}/a.svg` });
  assert.ok(good.status < 300);

  const owner = await signUp('เจ้าของรูป');
  const companyId = await verifiedCompany(owner, 'บริษัท โลโก้ จำกัด');
  const { jobId } = await openJob(owner, companyId, rootPosition(companyId));
  const app = await ok(c, 'apply_to_job', { p_job: jobId });
  const detail = await ok(owner, 'application_detail', { p_app: app });
  assert.equal(detail.app.profile_snapshot.photo_path, `avatars/${c.id}/a.svg`);
  const board = await ok(owner, 'company_pipeline', { p_company: companyId });
  assert.equal(board.find((r) => r.id === app).photo_path, `avatars/${c.id}/a.svg`);
});

test('only owners and company-wide team admins set the company logo; it shows on the job board', async () => {
  const owner = await signUp('เจ้าของโลโก้');
  const companyId = await verifiedCompany(owner, 'บริษัท ป้ายสวย จำกัด');
  const root = rootPosition(companyId);
  const staffPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'พนักงาน', p_grants: { team: 1 } });
  const staff = await signUp('พนักงานโลโก้');
  await join(staff, owner, companyId, staffPos);

  assert.notEqual(await put(staff, `logos/${companyId}/x.svg`), 200);
  assert.equal(await put(owner, `logos/${companyId}/logo.svg`), 200);
  await fails(staff, 'set_company_logo', { p_company: companyId, p_path: `logos/${companyId}/logo.svg` }, /เฉพาะเจ้าของ/);
  await fails(owner, 'set_company_logo', { p_company: companyId, p_path: `logos/someone-else/logo.svg` }, /ตำแหน่งไฟล์/);
  await ok(owner, 'set_company_logo', { p_company: companyId, p_path: `logos/${companyId}/logo.svg` });

  const { jobId } = await openJob(owner, companyId, root);
  const rows = await select({ token: null }, `job_board?id=eq.${jobId}&select=company_logo_path`);
  assert.equal(rows[0].company_logo_path, `logos/${companyId}/logo.svg`);
  const feed = await ok({ token: null }, 'job_feed', {});
  assert.equal(feed.find((r) => r.id === jobId).company_logo_path, `logos/${companyId}/logo.svg`);

  await ok(owner, 'set_company_logo', { p_company: companyId, p_path: null });
  assert.equal((await select({ token: null }, `job_board?id=eq.${jobId}&select=company_logo_path`))[0].company_logo_path, null);
});
