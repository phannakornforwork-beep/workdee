// ทดสอบเส้นทางจ้างงานครบวงจร: ประกาศ → อนุมัติ → สมัคร → โจทย์ → ให้คะแนน → สัมภาษณ์ → ข้อเสนอ
// พร้อมกติกา: เหตุผลแบบมีโครงสร้าง, ที่นั่งรอบโจทย์, ทำหลายคนพร้อมกัน + ยกเลิก 30 วินาที, ความเป็นส่วนตัว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signUp, ok, fails, rpc, select, sql, upsert, rootPosition, join, verifiedCompany, candidate,
  challengeFields, openJob, releaseBatches
} from './helpers.mjs';

test('hiring workflow end to end', async (t) => {
  const owner = await signUp('สมชาย สุขใจ');
  const companyId = await verifiedCompany(owner, 'สุขใจฟู้ดส์ จำกัด');
  const root = rootPosition(companyId);
  const headPos = await ok(owner, 'create_position', {
    p_company: companyId, p_parent: root, p_title: 'หัวหน้าการตลาด', p_is_department: true,
    p_grants: { team: 1, post: 1, approve_post: 1, screen: 1, offer: 1, members: 1, announce: 1 }
  });
  const hrPos = await ok(owner, 'create_position', {
    p_company: companyId, p_parent: root, p_title: 'HR และบัญชี', p_grants: { team: 2, post: 2, screen: 2, members: 2, announce: 2 }
  });
  const head = await signUp('วิทย์ ศักดิ์ดี');
  const hr = await signUp('กมลชนก วงศ์ดี');
  await join(head, owner, companyId, headPos);
  await join(hr, owner, companyId, hrPos);

  // บริษัทที่ผู้สมัครคนแรกทำงานอยู่ (ต้องมองไม่เห็นว่าเขากำลังหางาน)
  const otherOwner = await signUp('เจ้าของบริษัทเดิม');
  const otherCompany = await verifiedCompany(otherOwner, 'บริษัทเดิม จำกัด');
  const otherRoot = rootPosition(otherCompany);
  const otherStaffPos = await ok(otherOwner, 'create_position', { p_company: otherCompany, p_parent: otherRoot, p_title: 'พนักงาน', p_grants: { team: 1 } });

  const c1 = await candidate('พิมพ์ชนก ใจดี');
  const c2 = await candidate('ธนกร ศรีสุข');
  const c3 = await candidate('ณัฐธิดา แก้วมณี');
  const c4 = await candidate('วรเมธ ทองดี', { skills: ['Video'], tools: [] });
  await join(c1, otherOwner, otherCompany, otherStaffPos);
  await upsert(c1, 'career_private_notes', { user_id: c1.id, life_notes: 'ดูแลคุณแม่ทุกเย็น' });
  await upsert(c1, 'career_plans', { user_id: c1.id, goal_title: 'Content Lead', share_with_companies: false });

  let jobId;
  await t.test('posting needs the department head approval when the poster lacks it', async () => {
    const r = await openJob(hr, companyId, headPos);
    jobId = r.jobId;
    assert.equal(r.status, 'pending_approval');
    const view = await ok(head, 'team_overview', { p_company: companyId });
    const req = view.approvals.find((a) => a.kind === 'job_post');
    assert.equal(req.can_decide, true);
    await fails(hr, 'decide_approval', { p_request: req.id, p_approve: true }, /ไม่มีสิทธิ์อนุมัติ/);
    await ok(head, 'decide_approval', { p_request: req.id, p_approve: true });
    const board = await select({ token: null }, `job_board?id=eq.${jobId}&select=id,title,company_name,challenge_title`);
    assert.equal(board.length, 1, 'open job is public');
    assert.equal(board[0].company_name, 'สุขใจฟู้ดส์ จำกัด');
    const hrNotes = await select(hr, `notifications?kind=eq.approval&select=title`);
    assert.ok(hrNotes.some((n) => n.title.startsWith('อนุมัติแล้ว')));
  });

  await t.test('publishing rules: verified company, salary range, challenge for full-time', async () => {
    const draft = await ok(owner, 'save_job', { p_company: companyId, p_job: null, p_fields: { title: 'งานไม่มีเงินเดือน', department_id: headPos } });
    await fails(owner, 'submit_job', { p_job: draft }, /ช่วงค่าตอบแทน/);
    await ok(owner, 'save_job', { p_company: companyId, p_job: draft, p_fields: { salary_min: 15000, salary_max: 18000 } });
    await fails(owner, 'submit_job', { p_job: draft }, /โจทย์/);
    await fails(owner, 'save_challenge', { p_job: draft, p_fields: { ...challengeFields, criteria: [{ name: 'a', weight: 50 }] } }, /ตั้งชื่อเกณฑ์|100%/);
    await fails(owner, 'save_challenge', { p_job: draft, p_fields: { ...challengeFields, criteria: [{ name: 'เกณฑ์หนึ่ง', weight: 60 }, { name: 'เกณฑ์สอง', weight: 30 }] } }, /100%/);
    await ok(owner, 'delete_job', { p_job: draft });
  });

  const apps = {};
  await t.test('candidates apply with a profile snapshot only', async () => {
    for (const [k, c] of Object.entries({ c1, c2, c3, c4 })) {
      apps[k] = await ok(c, 'apply_to_job', { p_job: jobId, p_intro: 'สนใจมากค่ะ', p_expected_salary: 20000, p_share_plan: true });
    }
    await fails(c1, 'apply_to_job', { p_job: jobId }, /สมัครงานนี้แล้ว/);
    const nobody = await signUp('ไม่มีโปรไฟล์');
    await fails(nobody, 'apply_to_job', { p_job: jobId }, /โปรไฟล์/);
    const detail = await ok(hr, 'application_detail', { p_app: apps.c1 });
    assert.equal(detail.app.profile_snapshot.full_name, 'พิมพ์ชนก ใจดี');
    assert.equal(detail.app.profile_snapshot.plan, undefined, 'plan is not shared unless the candidate turned sharing on');
    assert.ok(!JSON.stringify(detail).includes('ดูแลคุณแม่'), 'private life notes never leave the personal space');
    assert.ok(detail.app.sla_due_at, '7-day clock starts');
    const notes = await select(head, `notifications?kind=eq.new_application&select=id`);
    assert.equal(notes.length, 4);
    const deliveries = Number(sql(`select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.kind = 'new_application';`));
    assert.equal(deliveries, 0, 'new applications go to the daily digest, not instant LINE/email');
  });

  await t.test('the current employer cannot see that its employee is applying elsewhere', async () => {
    assert.equal((await select(otherOwner, `applications?select=id`)).length, 0);
    assert.equal((await ok(otherOwner, 'company_pipeline', { p_company: otherCompany })).length, 0);
    assert.equal((await rpc(otherOwner, 'application_detail', { p_app: apps.c1 })).data, null);
    assert.equal((await select(hr, `candidate_profiles?select=user_id`)).length, 0, 'companies never read candidate profiles directly');
    assert.equal((await select(hr, `educations?select=id`)).length, 0);
    const myNotes = await select(c1, `notifications?space=eq.company&select=id`);
    assert.equal(myNotes.length, 0);
  });

  let batch;
  await t.test('bulk invite respects challenge seats and can be undone within 30 seconds', async () => {
    sql(`update public.jobs set challenge_seats = 2 where id = '${jobId}';`);
    await fails(hr, 'invite_to_challenge', { p_apps: [apps.c1, apps.c2, apps.c3] }, /ที่นั่งรอบโจทย์/);
    sql(`update public.jobs set challenge_seats = 10 where id = '${jobId}';`);
    batch = await ok(hr, 'invite_to_challenge', { p_apps: [apps.c1, apps.c2, apps.c3], p_message: 'สวัสดีค่ะคุณ{ชื่อ} เชิญทำโจทย์ตำแหน่ง{ตำแหน่ง}' });
    const mine = await ok(c1, 'my_application', { p_app: apps.c1 });
    assert.equal(mine.app.stage, 'challenge_invited');
    assert.ok(!mine.events.some((e) => e.kind === 'challenge_invited'), 'candidate does not see it during the undo window');
    assert.equal((await select(c1, `notifications?kind=eq.app_update&select=id`)).length, 0);
    const undone = await ok(hr, 'undo_batch', { p_batch: batch });
    assert.equal(undone, 3);
    assert.equal((await ok(c1, 'my_application', { p_app: apps.c1 })).app.stage, 'applied');
    batch = await ok(hr, 'invite_to_challenge', { p_apps: [apps.c1, apps.c2, apps.c3], p_message: 'สวัสดีค่ะคุณ{ชื่อ} เชิญทำโจทย์ตำแหน่ง{ตำแหน่ง}' });
    releaseBatches();
    await fails(hr, 'undo_batch', { p_batch: batch }, /30 วินาที/);
    const after = await ok(c1, 'my_application', { p_app: apps.c1 });
    const ev = after.events.find((e) => e.kind === 'challenge_invited');
    assert.equal(ev.message, 'สวัสดีค่ะคุณพิมพ์ชนก เชิญทำโจทย์ตำแหน่งเจ้าหน้าที่การตลาดออนไลน์');
    assert.ok(after.challenge.brief.includes('ครัวบ้านสวน'), 'brief is revealed only after invitation');
    const preview = await ok(c4, 'my_application', { p_app: apps.c4 });
    assert.equal(preview.challenge.brief, undefined, 'not-invited candidates see only a preview');
  });

  await t.test('candidates submit with reasoning and AI declaration', async () => {
    await ok(c1, 'start_challenge', { p_app: apps.c1 });
    await fails(c1, 'submit_challenge', { p_app: apps.c1, p_answer: 'แผนคอนเทนต์ 7 วัน เน้น LINE OA และ TikTok', p_reasoning: '' }, /ทำไมเลือก/);
    await fails(c1, 'submit_challenge', { p_app: apps.c1, p_answer: 'แผนคอนเทนต์ 7 วัน เน้น LINE OA และ TikTok', p_reasoning: 'คนทำอาหารเองอยากได้สูตร', p_ai_use: 'ideas' }, /AI/);
    await ok(c1, 'submit_challenge', { p_app: apps.c1, p_answer: 'แผนคอนเทนต์ 7 วัน เน้น LINE OA และ TikTok', p_reasoning: 'คนทำอาหารเองอยากได้สูตรต่อเนื่อง', p_ai_use: 'ideas', p_ai_detail: 'ช่วยคิดหัวข้อ' });
    await ok(c2, 'submit_challenge', { p_app: apps.c2, p_answer: 'กินข้าวกับอะไรดี? ตอบด้วยน้ำจิ้มสูตรใหม่ แผนโพสต์ 5 วัน', p_reasoning: 'ใช้คำถามที่คนถามทุกวัน' });
    const submitted = await select(head, `notifications?kind=eq.challenge_submitted&select=id`);
    assert.equal(submitted.length, 2);
  });

  await t.test('rejection needs structured reasons and graded submissions', async () => {
    await fails(hr, 'reject_applications', { p_apps: [apps.c1, apps.c4], p_reasons: ['missing_core_skill'] }, /ให้คะแนนโจทย์ก่อน.*พิมพ์ชนก/);
    await fails(hr, 'reject_applications', { p_apps: [apps.c4], p_reasons: [] }, /อย่างน้อย 1 ข้อ/);
    await fails(hr, 'reject_applications', { p_apps: [apps.c4], p_reasons: ['other'] }, /ระบุเหตุผลเพิ่ม/);
    await fails(hr, 'reject_applications', { p_apps: [apps.c4], p_reasons: ['no_response'] }, /เหตุผลไม่ถูกต้อง/);
    const r = await ok(hr, 'reject_applications', { p_apps: [apps.c4], p_reasons: ['missing_core_skill', 'stronger_candidate'], p_message: 'สวัสดีค่ะคุณ{ชื่อ} ขอบคุณที่สนใจ{บริษัท}' });
    assert.equal(r.rejected, 1);
    releaseBatches();
    const mine = await ok(c4, 'my_application', { p_app: apps.c4 });
    assert.equal(mine.app.stage, 'rejected');
    assert.equal(mine.app.reject_labels, 'ขาดสกิลที่ตำแหน่งนี้ใช้ทุกวัน · เลือกผู้สมัครที่ตรงกว่าแล้ว');
    const note = await select(c4, `notifications?kind=eq.app_update&select=body`);
    assert.ok(note[0].body.startsWith('สวัสดีค่ะคุณวรเมธ ขอบคุณที่สนใจสุขใจฟู้ดส์'));
  });

  await t.test('grading validates every criterion and shows scores to the candidate', async () => {
    await fails(hr, 'grade_challenge', { p_app: apps.c1, p_scores: [{ name: 'เข้าใจกลุ่มเป้าหมาย', score: 30 }] }, /ครบทุกเกณฑ์/);
    await fails(hr, 'grade_challenge', { p_app: apps.c1, p_scores: [{ name: 'เข้าใจกลุ่มเป้าหมาย', score: 45 }, { name: 'ความชัดเจนของข้อความ', score: 30 }, { name: 'การวัดผล', score: 20 }] }, /0–40/);
    const total = await ok(hr, 'grade_challenge', { p_app: apps.c1, p_scores: [{ name: 'เข้าใจกลุ่มเป้าหมาย', score: 36 }, { name: 'ความชัดเจนของข้อความ', score: 30 }, { name: 'การวัดผล', score: 22 }], p_feedback: 'วางแผนวัดผลชัดเจน' });
    assert.equal(total, 88);
    await ok(head, 'grade_challenge', { p_app: apps.c2, p_scores: [{ name: 'เข้าใจกลุ่มเป้าหมาย', score: 30 }, { name: 'ความชัดเจนของข้อความ', score: 28 }, { name: 'การวัดผล', score: 20 }] });
    const mine = await ok(c1, 'my_application', { p_app: apps.c1 });
    assert.equal(mine.score.total, 88);
    assert.equal(mine.score.scores.length, 3);
  });

  let slots;
  await t.test('interviews: self-scheduling with capacity and reschedule', async () => {
    const t1 = new Date(Date.now() + 26 * 3600e3).toISOString();
    const t2 = new Date(Date.now() + 28 * 3600e3).toISOString();
    const t3 = new Date(Date.now() + 50 * 3600e3).toISOString();
    assert.equal(await ok(hr, 'create_interview_slots', { p_company: companyId, p_job: jobId, p_slots: [
      { starts_at: t1, minutes: 45, mode: 'online', meeting_url: 'https://meet.example.com/a' },
      { starts_at: t2, minutes: 45, mode: 'onsite', location: 'สำนักงานใหญ่' },
      { starts_at: t3, minutes: 45, mode: 'online' }] }), 3);
    slots = sql(`select string_agg(id::text, ',' order by starts_at) from public.interview_slots where job_id = '${jobId}';`).split(',');
    await ok(hr, 'invite_to_interview', { p_apps: [apps.c1, apps.c2], p_slot_ids: [slots[0], slots[1]] });
    releaseBatches();
    const m1 = await ok(c1, 'my_application', { p_app: apps.c1 });
    assert.equal(m1.interview.status, 'awaiting_candidate');
    assert.equal(m1.interview.options.length, 2);
    assert.equal(m1.interview.meeting_url, null, 'meeting link is hidden until confirmed');
    await ok(c1, 'book_interview', { p_interview: m1.interview.id, p_slot: slots[0] });
    const m2 = await ok(c2, 'my_application', { p_app: apps.c2 });
    await fails(c2, 'book_interview', { p_interview: m2.interview.id, p_slot: slots[0] }, /เต็ม/);
    await fails(c2, 'book_interview', { p_interview: m2.interview.id, p_slot: slots[2] }, /เวลาที่บริษัทเสนอ/);
    await ok(c2, 'book_interview', { p_interview: m2.interview.id, p_slot: slots[1] });
    await ok(c2, 'request_interview_reschedule', { p_interview: m2.interview.id, p_note: 'สะดวกวันพฤหัสช่วงบ่าย' });
    await ok(hr, 'offer_interview_slots', { p_interview: m2.interview.id, p_slot_ids: [slots[2]] });
    await ok(c2, 'book_interview', { p_interview: m2.interview.id, p_slot: slots[2] });
    const confirmed = await ok(c1, 'my_application', { p_app: apps.c1 });
    assert.equal(confirmed.interview.meeting_url, 'https://meet.example.com/a');
    const updates = await select(head, `notifications?kind=eq.interview_update&select=id`);
    assert.ok(updates.length >= 3);
  });

  await t.test('offers above the range need owner approval; candidates accept or decline', async () => {
    await fails(hr, 'make_offer', { p_app: apps.c1, p_salary: 21000 }, /เสนองานในแผนกนี้ไม่ได้/);
    const status = await ok(head, 'make_offer', { p_app: apps.c1, p_salary: 25000, p_start_date: '2026-12-01', p_note: 'สัญญา 1 ปี' });
    assert.equal(status, 'pending_approval');
    assert.equal((await ok(c1, 'my_application', { p_app: apps.c1 })).offer, null, 'candidate does not see an unapproved offer');
    const view = await ok(owner, 'team_overview', { p_company: companyId });
    const req = view.approvals.find((a) => a.kind === 'offer' && a.status === 'pending');
    assert.ok(req.title.includes('เกินช่วงเงินเดือน'));
    await fails(head, 'decide_approval', { p_request: req.id, p_approve: true }, /ไม่มีสิทธิ์อนุมัติ/);
    await ok(owner, 'decide_approval', { p_request: req.id, p_approve: true, p_note: 'ผลโจทย์ดีมาก' });
    const mine = await ok(c1, 'my_application', { p_app: apps.c1 });
    assert.equal(mine.app.stage, 'offer');
    assert.equal(mine.offer.salary, 25000);
    await ok(c1, 'respond_offer', { p_offer: mine.offer.id, p_accept: true });
    assert.equal((await ok(c1, 'my_application', { p_app: apps.c1 })).app.stage, 'hired');
    assert.equal(await ok(head, 'make_offer', { p_app: apps.c2, p_salary: 20000 }), 'sent');
    const m2 = await ok(c2, 'my_application', { p_app: apps.c2 });
    await ok(c2, 'respond_offer', { p_offer: m2.offer.id, p_accept: false, p_reason: 'ได้งานที่อื่นแล้ว' });
    assert.equal((await ok(c2, 'my_application', { p_app: apps.c2 })).app.stage, 'declined');
  });

  await t.test('messaging many applicants personalises each message and opens a chat room', async () => {
    const b = await ok(hr, 'message_applicants', { p_apps: [apps.c3], p_message: 'สวัสดีค่ะคุณ{ชื่อ} อย่าลืมส่งโจทย์นะคะ' });
    assert.ok(b);
    const room = sql(`select id from public.chat_rooms where application_id = '${apps.c3}';`);
    assert.equal((await select(c3, `chat_messages?room_id=eq.${room}&select=body`)).length, 0, 'hidden during the undo window');
    releaseBatches();
    const msgs = await select(c3, `chat_messages?room_id=eq.${room}&select=body,sender_side`);
    assert.equal(msgs[0].body, 'สวัสดีค่ะคุณณัฐธิดา อย่าลืมส่งโจทย์นะคะ');
    await ok(c3, 'post_chat_message', { p_room: room, p_body: 'รับทราบค่ะ จะส่งพรุ่งนี้' });
    const replies = await select(hr, `notifications?kind=eq.chat_message&select=title`);
    assert.ok(replies.some((n) => n.title.includes('ณัฐธิดา')));
    assert.equal((await select(otherOwner, `chat_messages?room_id=eq.${room}&select=id`)).length, 0);
    await fails(c3, 'post_chat_message', { p_room: room, p_body: 'x', p_announcement: true }, /ประกาศไม่ได้/);
  });

  await t.test('closing a job auto-replies to everyone still waiting', async () => {
    const r = await ok(head, 'close_job', { p_job: jobId });
    assert.equal(r.auto_replied, 1);
    const m3 = await ok(c3, 'my_application', { p_app: apps.c3 });
    assert.equal(m3.app.stage, 'rejected');
    assert.equal(m3.app.reject_labels, 'ปิดรับตำแหน่งแล้ว');
    assert.equal((await select({ token: null }, `job_board?id=eq.${jobId}&select=id`)).length, 0);
  });

  await t.test('withdrawing revokes the shared profile', async () => {
    const { jobId: job2 } = await openJob(owner, companyId, headPos, { title: 'ผู้ช่วยการตลาด' });
    const app = await ok(c4, 'apply_to_job', { p_job: job2 });
    await ok(c4, 'withdraw_application', { p_app: app, p_reason: 'ได้งานแล้ว' });
    const detail = await ok(owner, 'application_detail', { p_app: app });
    assert.equal(detail.app.profile_snapshot, null);
    assert.equal(detail.app.stage, 'withdrawn');
    const consents = await select(c4, `consents?application_id=eq.${app}&select=revoked_at`);
    assert.ok(consents[0].revoked_at);
    const exported = await ok(c4, 'export_my_data');
    assert.equal(exported.applications.length, 2);
  });
});
