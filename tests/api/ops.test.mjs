// ทดสอบงานตามเวลา (กติกา 7 วัน) ช่วงเวลาเงียบ LINE ไฟล์แนบ แชตประกาศ ผู้ดูแลระบบ และการใช้ผลโจทย์ซ้ำ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signUp, ok, fails, select, sql, upsert, rootPosition, join, verifiedCompany, candidate, openJob,
  releaseBatches, service, upload, download, makeAdmin, challengeFields
} from './helpers.mjs';

async function setup() {
  const owner = await signUp('เจ้าของ');
  const companyId = await verifiedCompany(owner, 'บริษัท ทดสอบเวลา จำกัด');
  const root = rootPosition(companyId);
  const hrPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'HR', p_grants: { team: 2, post: 2, screen: 2, members: 2, announce: 2 } });
  const staffPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'พนักงาน', p_grants: { team: 1 } });
  const hr = await signUp('HR');
  const staff = await signUp('พนักงาน');
  await join(hr, owner, companyId, hrPos);
  await join(staff, owner, companyId, staffPos);
  return { owner, companyId, root, hr, staff, hrPos, staffPos };
}

test('7-day rule: warn on day 5, escalate to owner on day 6, auto-close on day 7', async () => {
  const { owner, companyId, root, hr } = await setup();
  const { jobId } = await openJob(owner, companyId, root);
  const cand = await candidate('ผู้สมัคร รอนาน');
  const app = await ok(cand, 'apply_to_job', { p_job: jobId });

  sql(`update public.applications set sla_due_at = now() + interval '36 hours' where id = '${app}';`);
  let res = await ok(service, 'sla_sweep', {});
  assert.ok(res.warnings >= 1);
  assert.equal(sql(`select warned_at is not null and escalated_at is null from public.applications where id = '${app}';`), 't');
  const warn = await select(hr, `notifications?kind=eq.sla_warning&company_id=eq.${companyId}&select=title,urgent`);
  assert.equal(warn.length, 1);
  assert.equal(warn[0].urgent, true);

  sql(`update public.applications set sla_due_at = now() + interval '12 hours' where id = '${app}';`);
  res = await ok(service, 'sla_sweep', {});
  assert.ok(res.owner_escalations >= 1);
  assert.equal((await select(owner, `notifications?kind=eq.sla_warning&company_id=eq.${companyId}&select=title`)).filter((n) => n.title.includes('1 วัน')).length, 1);

  sql(`update public.applications set sla_due_at = now() - interval '1 minute' where id = '${app}';`);
  res = await ok(service, 'sla_sweep', {});
  assert.ok(res.auto_closed >= 1);
  const mine = await ok(cand, 'my_application', { p_app: app });
  assert.equal(mine.app.stage, 'rejected');
  assert.equal(mine.app.closed_by_system, true);
  assert.match(mine.app.reject_labels, /ไม่ได้ตอบภายใน 7 วัน/);

  // อัตราการตอบที่แสดงในประกาศ (ต้องมีอย่างน้อย 5 ใบสมัครที่ครบ 7 วันแล้ว)
  sql(`update public.applications set created_at = now() - interval '10 days' where id = '${app}';`);
  for (let i = 0; i < 4; i++) {
    const c = await candidate(`ผู้สมัคร ${i}`);
    const a = await ok(c, 'apply_to_job', { p_job: jobId });
    await ok(hr, 'reject_applications', { p_apps: [a], p_reasons: ['missing_core_skill'] });
    sql(`update public.applications set created_at = now() - interval '10 days' where id = '${a}';`);
  }
  const stats = await select({ token: null }, `public_companies?id=eq.${companyId}&select=response_rate,response_sample`);
  assert.equal(stats[0].response_sample, 5);
  assert.equal(stats[0].response_rate, 80);

  await fails(owner, 'sla_sweep', {}, /permission denied|not found|Could not find/i);
});

test('candidate deadlines expire stale steps and remind a day before', async () => {
  const { owner, companyId, root, hr } = await setup();
  const { jobId } = await openJob(owner, companyId, root);
  const c = await candidate('ผู้สมัคร ลืมส่ง');
  const app = await ok(c, 'apply_to_job', { p_job: jobId });
  await ok(hr, 'invite_to_challenge', { p_apps: [app] });
  releaseBatches();
  sql(`update public.applications set candidate_due_at = now() + interval '20 hours' where id = '${app}';`);
  let res = await ok(service, 'sla_sweep', {});
  assert.ok(res.candidate_reminders >= 1);
  assert.equal((await select(c, `notifications?kind=eq.deadline&select=id`)).length, 1);
  sql(`update public.applications set candidate_due_at = now() - interval '1 minute' where id = '${app}';`);
  res = await ok(service, 'sla_sweep', {});
  assert.ok(res.candidate_expired >= 1);
  assert.equal((await ok(c, 'my_application', { p_app: app })).app.stage, 'expired');
  // ที่นั่งรอบโจทย์คืนกลับเมื่อหมดเวลา
  assert.equal(Number(sql(`select public.challenge_seats_used('${jobId}');`)), 0);
});

test('quiet hours delay LINE/email until morning unless urgent with consent', async () => {
  const { owner, companyId, hr, staff } = await setup();
  for (const u of [staff, hr]) {
    sql(`insert into public.line_links (user_id, line_user_id, linked_at) values ('${u.id}', 'U${u.id.replace(/-/g, '')}', now());`);
  }
  // 20:00 เวลาไทย = 13:00 UTC
  const at = `date_trunc('day', now() at time zone 'Asia/Bangkok') + time '20:00'`;
  sql(`select public.notify('${staff.id}', '${companyId}', 'chat_message', 'ทดสอบนอกเวลา', '', null, false, null, (${at}) at time zone 'Asia/Bangkok');
       insert into public.notification_prefs (user_id, kind, email, line) values ('${staff.id}', 'chat_message', false, true);`);
  sql(`select public.notify('${staff.id}', '${companyId}', 'chat_message', 'ทดสอบนอกเวลา 2', '', null, false, null, (${at}) at time zone 'Asia/Bangkok');`);
  const after = sql(`select to_char(d.deliver_after at time zone 'Asia/Bangkok', 'HH24:MI') from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.title = 'ทดสอบนอกเวลา 2' and n.user_id = '${staff.id}';`);
  assert.equal(after, '08:30');
  // ยินยอมรับเรื่องด่วนนอกเวลาไว้ก่อน → ส่งทันที
  await ok(staff, 'set_quiet_consent', { p_company: companyId, p_consent: true });
  sql(`select public.notify('${staff.id}', '${companyId}', 'chat_message', 'ด่วนมาก', '', null, true, null, (${at}) at time zone 'Asia/Bangkok');`);
  const urgent = sql(`select to_char(d.deliver_after at time zone 'Asia/Bangkok', 'HH24:MI') from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.title = 'ด่วนมาก' and n.user_id = '${staff.id}';`);
  assert.equal(urgent, '20:00');
  void owner;
});

test('LINE linking and the delivery outbox', async () => {
  const u = await signUp('ผู้ใช้ LINE');
  const code = await ok(u, 'create_line_link_code');
  assert.match(code, /^\d{6}$/);
  const linked = await ok(service, 'link_line_account', { p_code: code, p_line_user_id: 'Uabc123' });
  assert.equal(linked, u.id);
  await fails(u, 'link_line_account', { p_code: code, p_line_user_id: 'Uhack' }, /permission denied|Could not find/i);
  // เคลียร์คิวที่ค้างจากการทดสอบอื่นก่อน
  sql(`update public.notification_deliveries set status = 'skipped' where status = 'pending';`);
  sql(`select public.notify('${u.id}', null, 'app_update', 'มีความคืบหน้า', 'ทดสอบ', '/me', false);`);
  const claimed = await ok(service, 'claim_deliveries', { p_limit: 10 });
  const mine = claimed.filter((d) => d.user_id === u.id);
  assert.deepEqual(mine.map((d) => d.channel).sort(), ['email', 'line']);
  assert.equal(mine.find((d) => d.channel === 'line').line_user_id, 'Uabc123');
  for (const d of mine) await ok(service, 'complete_delivery', { p_id: d.delivery_id, p_ok: true });
  assert.equal((await ok(service, 'claim_deliveries', { p_limit: 10 })).filter((d) => d.user_id === u.id).length, 0);
  await fails(u, 'claim_deliveries', {}, /permission denied|Could not find/i);
});

test('storage policies follow ownership and application access', async () => {
  const { owner, companyId, root, hr, staff } = await setup();
  assert.equal((await upload(owner, 'company-docs', `${companyId}/cert.pdf`)).status, 200);
  assert.notEqual((await upload(staff, 'company-docs', `${companyId}/fake.pdf`)).status, 200);
  await ok(owner, 'set_company_certificate', { p_company: companyId, p_path: `${companyId}/cert.pdf` });
  assert.equal((await download(owner, 'company-docs', `${companyId}/cert.pdf`)).status, 200);
  assert.notEqual((await download(staff, 'company-docs', `${companyId}/cert.pdf`)).status, 200);

  const { jobId } = await openJob(owner, companyId, root);
  const c = await candidate('ผู้สมัคร แนบไฟล์');
  const other = await candidate('ผู้สมัคร คนอื่น');
  const app = await ok(c, 'apply_to_job', { p_job: jobId });
  assert.notEqual((await upload(c, 'submissions', `${app}/plan.pdf`)).status, 200, 'cannot upload before invitation');
  await ok(hr, 'invite_to_challenge', { p_apps: [app] });
  assert.equal((await upload(c, 'submissions', `${app}/plan.pdf`)).status, 200);
  assert.notEqual((await upload(other, 'submissions', `${app}/x.pdf`)).status, 200);
  await ok(c, 'submit_challenge', { p_app: app, p_answer: '', p_files: [`${app}/plan.pdf`], p_reasoning: 'เลือกเน้นวิดีโอสั้นเพราะกลุ่มเป้าหมาย' });
  assert.equal((await download(hr, 'submissions', `${app}/plan.pdf`)).status, 200);
  assert.notEqual((await download(other, 'submissions', `${app}/plan.pdf`)).status, 200);
  assert.notEqual((await upload(c, 'submissions', `${app}/late.pdf`)).status, 200, 'no uploads after submitting');

  const eduId = (await upsert(c, 'educations', { institution_name: 'มหาวิทยาลัยพาร์ตเนอร์', major: 'การตลาด' })).data[0].id;
  assert.equal((await upload(c, 'education-docs', `${c.id}/${eduId}/transcript.pdf`)).status, 200);
  assert.notEqual((await upload(c, 'education-docs', `${other.id}/${eduId}/x.pdf`)).status, 200);
});

test('education verification cannot be self-granted; admins and institutions verify', async () => {
  const c = await candidate('นักศึกษา');
  const admin = await signUp('แอดมิน');
  makeAdmin(admin);
  const edu = (await upsert(c, 'educations', { institution_name: 'มหาวิทยาลัยพาร์ตเนอร์', major: 'การตลาด', verify_level: 'inst' })).data[0];
  assert.equal(edu.verify_level, 'none', 'self-verification is ignored on insert');
  const r = await fetch(`${process.env.SUPABASE_URL || 'http://127.0.0.1:54321'}/rest/v1/educations?id=eq.${edu.id}`, {
    method: 'PATCH', headers: { apikey: c.token, Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ verify_level: 'doc' })
  });
  assert.ok(r.status >= 400);
  await fetch(`${process.env.SUPABASE_URL || 'http://127.0.0.1:54321'}/rest/v1/educations?id=eq.${edu.id}`, {
    method: 'PATCH', headers: { apikey: c.token, Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ verify_level: 'doc_pending', doc_path: `${c.id}/${edu.id}/t.pdf` })
  });
  const queue = await ok(admin, 'admin_queue');
  assert.ok(queue.educations.some((e) => e.id === edu.id));
  await ok(admin, 'admin_review_education', { p_education: edu.id, p_approve: true, p_note: 'ตรวจใบรับรองผลแล้ว' });
  assert.equal(sql(`select verify_level from public.educations where id = '${edu.id}';`), 'doc');
  // แก้ข้อมูลหลักหลังยืนยัน → ต้องยืนยันใหม่
  await fetch(`${process.env.SUPABASE_URL || 'http://127.0.0.1:54321'}/rest/v1/educations?id=eq.${edu.id}`, {
    method: 'PATCH', headers: { apikey: c.token, Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gpa: 3.99 })
  });
  assert.equal(sql(`select verify_level from public.educations where id = '${edu.id}';`), 'none');

  const inst = sql(`insert into public.institutions (name, is_partner) values ('มหาวิทยาลัยพาร์ตเนอร์ ${Date.now()}', true) returning id;`);
  const staff = await signUp('เจ้าหน้าที่ทะเบียน');
  sql(`insert into public.institution_staff (institution_id, user_id) values ('${inst}', '${staff.id}');`);
  await fails(staff, 'institution_review_education', { p_education: edu.id, p_approve: true }, /สถาบันคุณ/);
  sql(`update public.educations set institution_id = '${inst}' where id = '${edu.id}';`);
  await ok(staff, 'institution_review_education', { p_education: edu.id, p_approve: true });
  assert.equal(sql(`select verify_level from public.educations where id = '${edu.id}';`), 'inst');
});

test('announcements: permission, read receipts and reminders', async () => {
  const { companyId, hr, staff } = await setup();
  const room = sql(`select id from public.chat_rooms where company_id = '${companyId}' and kind = 'company';`);
  await fails(staff, 'post_chat_message', { p_room: room, p_body: 'ประกาศ', p_announcement: true }, /ประกาศถึงทั้งบริษัทไม่ได้/);
  await ok(staff, 'post_chat_message', { p_room: room, p_body: 'สวัสดีทุกคน' });
  const msgId = await ok(hr, 'post_chat_message', { p_room: room, p_body: 'วันศุกร์นี้ปิดคลังสินค้าเร็ว 16:00', p_announcement: true });
  let status = await ok(hr, 'announcement_status', { p_message: msgId });
  assert.equal(status.read, 0);
  assert.equal(status.total, 2);
  await ok(staff, 'mark_room_read', { p_room: room });
  status = await ok(hr, 'announcement_status', { p_message: msgId });
  assert.equal(status.read, 1);
  assert.deepEqual(status.unread_names, ['เจ้าของ']);
  assert.equal(await ok(hr, 'remind_announcement', { p_message: msgId }), 1);
  assert.equal(await ok(staff, 'announcement_status', { p_message: msgId }), null, 'staff without announce permission cannot see who read');
  const rooms = await ok(staff, 'chat_room_list', { p_company: companyId });
  assert.equal(rooms.find((r) => r.room_id === room).unread, 0);
  assert.equal(rooms.find((r) => r.room_id === room).last_body, 'วันศุกร์นี้ปิดคลังสินค้าเร็ว 16:00');

  // ขอสถานะหลายประกาศในคำขอเดียว: ได้ผลเท่ากับขอทีละข้อความ และคนไม่มีสิทธิ์ได้ null
  const batch = await ok(hr, 'announcement_statuses', { p_messages: [msgId] });
  assert.equal(batch.length, 1);
  assert.equal(batch[0].status.read, 1);
  const hidden = await ok(staff, 'announcement_statuses', { p_messages: [msgId] });
  assert.equal(hidden[0].status, null);
});

test('my_company_access returns permissions, logo and unread count in one call', async () => {
  const { owner, companyId, hr, staff } = await setup();
  const own = await ok(owner, 'my_company_access', { p_company: companyId });
  assert.equal(own.is_owner, true);
  assert.ok(Object.values(own.perms).every((v) => v === 2), 'owner has every permission at company level');
  const h = await ok(hr, 'my_company_access', { p_company: companyId });
  assert.equal(h.is_owner, false);
  assert.equal(h.perms.post, 2);
  assert.equal(h.perms.offer, 0);
  assert.equal(h.position_title, 'HR');
  assert.ok('logo_path' in h.company);
  assert.equal(typeof h.unread, 'number');
  const s = await ok(staff, 'my_company_access', { p_company: companyId });
  assert.equal(s.perms.team, 1);
  const outsider = await signUp('คนนอก');
  assert.equal(await ok(outsider, 'my_company_access', { p_company: companyId }), null);
});

test('reusing a passed challenge result for the same skill', async () => {
  const { owner, companyId, root, hr } = await setup();
  const { jobId: job1 } = await openJob(owner, companyId, root, { title: 'งานแรก' });
  const { jobId: job2 } = await openJob(owner, companyId, root, { title: 'งานที่สอง' });
  const c = await candidate('ผู้สมัคร เก่ง');
  const a1 = await ok(c, 'apply_to_job', { p_job: job1 });
  await ok(hr, 'invite_to_challenge', { p_apps: [a1] });
  await ok(c, 'submit_challenge', { p_app: a1, p_answer: 'แผนการตลาดที่ละเอียดมาก ครบทุกช่องทาง', p_reasoning: 'เพราะกลุ่มเป้าหมายใช้ LINE' });
  await ok(hr, 'grade_challenge', { p_app: a1, p_scores: challengeFields.criteria.map((x) => ({ name: x.name, score: Math.round(x.weight * 0.9) })) });
  const a2 = await ok(c, 'apply_to_job', { p_job: job2 });
  await ok(hr, 'invite_to_challenge', { p_apps: [a2] });
  releaseBatches();
  const mine = await ok(c, 'my_application', { p_app: a2 });
  assert.equal(mine.reusable.length, 1);
  await ok(c, 'reuse_challenge', { p_app: a2, p_source_app: a1 });
  const detail = await ok(hr, 'application_detail', { p_app: a2 });
  assert.equal(detail.score.reused, true);
  assert.equal(detail.score.total, challengeFields.criteria.reduce((s, x) => s + Math.round(x.weight * 0.9), 0));
  assert.equal(detail.app.stage, 'challenge_submitted');
});

test('digest, data export and account deletion blockers', async () => {
  const { owner, companyId, root, hr } = await setup();
  const { jobId } = await openJob(owner, companyId, root);
  const c = await candidate('ผู้สมัคร สรุป');
  const app = await ok(c, 'apply_to_job', { p_job: jobId });
  sql(`update public.applications set sla_due_at = now() + interval '1 day' where id = '${app}';`);
  const n = await ok(service, 'build_digests', {});
  assert.ok(n >= 2);
  const digests = await select(hr, `notifications?kind=eq.digest&company_id=eq.${companyId}&select=body`);
  assert.equal(digests.length, 1);
  assert.match(digests[0].body, /ต้องตอบภายใน 2 วัน 1 คน/);
  assert.equal(await ok(service, 'build_digests', {}), 0, 'one digest per person per day');
  const blockers = await ok(owner, 'account_deletion_blockers');
  assert.deepEqual(blockers, ['บริษัท ทดสอบเวลา จำกัด']);
  assert.deepEqual(await ok(hr, 'account_deletion_blockers'), []);
  const data = await ok(c, 'export_my_data');
  assert.equal(data.applications.length, 1);
  assert.ok(data.account.email);
});
