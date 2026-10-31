// ทดสอบการค้นหาผู้หางานแบบไม่เห็นชื่อ และการเชิญให้สมัครงาน
import test from 'node:test';
import assert from 'node:assert/strict';
import { signUp, ok, fails, select, upsert, rootPosition, join, verifiedCompany, candidate, openJob, sql } from './helpers.mjs';

test('companies find only opted-in candidates, anonymously, and invite them to apply', async () => {
  const owner = await signUp('เจ้าของค้นคน');
  const companyId = await verifiedCompany(owner, 'บริษัท ค้นหาคน จำกัด');
  const root = rootPosition(companyId);
  const staffPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'พนักงาน', p_grants: { team: 1 } });
  const staff = await signUp('พนักงานทั่วไป');
  await join(staff, owner, companyId, staffPos);
  const { jobId } = await openJob(owner, companyId, root, { title: 'นักเขียนคอนเทนต์' });

  const open = await candidate('สุดา เปิดค้นหา', { discoverable: true, headline: 'นักเขียนคอนเทนต์สายอาหาร', skills: ['Content Writing', 'TikTok'] });
  const closed = await candidate('ปิดค้นหา ไม่อยากให้เห็น', { discoverable: false });
  const hidden = await candidate('ซ่อนจากบริษัทนี้', { discoverable: true });
  await upsert(hidden, 'candidate_profiles', { user_id: hidden.id, full_name: 'ซ่อนจากบริษัทนี้', hidden_company_ids: [companyId] });
  const employee = await candidate('พนักงานที่หางาน', { discoverable: true });
  await join(employee, owner, companyId, staffPos);

  const list = await ok(owner, 'search_talent', { p_company: companyId });
  const mine = list.filter((r) => [open, closed, hidden, employee].some((c) => r.headline !== undefined));
  const text = JSON.stringify(list);
  assert.ok(text.includes('นักเขียนคอนเทนต์สายอาหาร'), 'opted-in candidate is listed');
  for (const name of ['สุดา', 'ปิดค้นหา', 'ซ่อนจากบริษัทนี้', 'พนักงานที่หางาน']) assert.ok(!text.includes(name), `no names leak (${name})`);
  assert.ok(!text.includes(open.id) && !text.includes(open.email), 'no user id or email');
  assert.ok(mine.length >= 1);

  const found = (await ok(owner, 'search_talent', { p_company: companyId, p_query: 'tiktok' })).find((r) => r.headline === 'นักเขียนคอนเทนต์สายอาหาร');
  assert.ok(found, 'search matches skills case-insensitively');
  assert.equal((await ok(owner, 'search_talent', { p_company: companyId, p_query: 'ไม่มีทักษะนี้แน่นอน' })).length, 0);

  await fails(staff, 'search_talent', { p_company: companyId }, /ไม่มีสิทธิ์/);
  await fails(staff, 'invite_talent', { p_job: jobId, p_handle: found.handle }, /เชิญผู้หางาน/);

  await ok(owner, 'invite_talent', { p_job: jobId, p_handle: found.handle, p_message: 'ชอบผลงานคลิปอาหารของคุณ' });
  await fails(owner, 'invite_talent', { p_job: jobId, p_handle: found.handle }, /ไปแล้ว/);
  const notes = await select(open, `notifications?kind=eq.talent_invite&select=title,body,link`);
  assert.equal(notes.length, 1);
  assert.ok(notes[0].title.includes('บริษัท ค้นหาคน จำกัด'));
  assert.equal(notes[0].link, `/jobs/${jobId}`);
  const again = (await ok(owner, 'search_talent', { p_company: companyId })).find((r) => r.handle === found.handle);
  assert.deepEqual(again.invited_jobs, [jobId]);

  // สมัครจากคำเชิญ: บริษัทเห็นว่ามาจากการเชิญ และเห็นโปรไฟล์เต็มเฉพาะตอนนี้
  const app = await ok(open, 'apply_to_job', { p_job: jobId });
  assert.equal(sql(`select source from public.applications where id = '${app}'`), 'invitation');
  const detail = await ok(owner, 'application_detail', { p_app: app });
  assert.equal(detail.app.profile_snapshot.full_name, 'สุดา เปิดค้นหา');

  // ปิดการค้นหาแล้วเชิญไม่ได้ และรหัสต่างกันในแต่ละบริษัท
  const other = await signUp('บริษัทอื่น');
  const otherCo = await verifiedCompany(other, 'บริษัท อื่นอีก จำกัด');
  const otherHandle = (await ok(other, 'search_talent', { p_company: otherCo })).find((r) => r.headline === 'นักเขียนคอนเทนต์สายอาหาร').handle;
  assert.notEqual(otherHandle, found.handle);
  await upsert(open, 'candidate_profiles', { user_id: open.id, full_name: 'สุดา เปิดค้นหา', discoverable: false });
  const { jobId: otherJob } = await openJob(other, otherCo, rootPosition(otherCo));
  await fails(other, 'invite_talent', { p_job: otherJob, p_handle: otherHandle }, /ปิดการค้นหา/);
});
