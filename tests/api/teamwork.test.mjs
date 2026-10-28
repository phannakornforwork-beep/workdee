// ทดสอบงานของทีม: มองเห็นตามสิทธิ์ team มอบหมายงานในขอบเขต และการลาที่หัวหน้าอนุมัติ
import test from 'node:test';
import assert from 'node:assert/strict';
import { signUp, ok, fails, select, insert, rootPosition, join, verifiedCompany } from './helpers.mjs';

test('tasks and leave follow the team hierarchy', async () => {
  const owner = await signUp('เจ้าของ');
  const companyId = await verifiedCompany(owner, 'บริษัท งานทีม จำกัด');
  const root = rootPosition(companyId);
  const mktHead = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'หัวหน้าการตลาด', p_is_department: true, p_grants: { team: 1, leave: 1 } });
  const mktStaff = await ok(owner, 'create_position', { p_company: companyId, p_parent: mktHead, p_title: 'Content', p_grants: { team: 1 } });
  const whHead = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'หัวหน้าคลัง', p_is_department: true, p_grants: { team: 1, leave: 1 } });
  const whStaff = await ok(owner, 'create_position', { p_company: companyId, p_parent: whHead, p_title: 'พนักงานคลัง', p_grants: {} });
  const [h1, s1, h2, s2] = [await signUp('วิทย์'), await signUp('มาลี'), await signUp('ประเสริฐ'), await signUp('อำไพ')];
  await join(h1, owner, companyId, mktHead);
  await join(s1, owner, companyId, mktStaff);
  await join(h2, owner, companyId, whHead);
  await join(s2, owner, companyId, whStaff);

  const project = await ok(h1, 'save_project', { p_company: companyId, p_project: null, p_name: 'เปิดตัวน้ำพริกสูตรใหม่' });
  const task = await ok(h1, 'save_task', { p_company: companyId, p_task: null, p_fields: { title: 'ถ่ายวิดีโอสูตรเมนู 3 คลิป', assignee_id: s1.id, project_id: project, due_date: '2026-11-05' } });
  await fails(h1, 'save_task', { p_company: companyId, p_task: null, p_fields: { title: 'งานข้ามแผนก', assignee_id: s2.id } }, /ขอบเขตทีม/);
  await fails(s2, 'save_project', { p_company: companyId, p_project: null, p_name: 'ไม่มีสิทธิ์' }, /โปรเจกต์ไม่ได้/);
  await ok(s1, 'save_task', { p_company: companyId, p_task: task, p_fields: { status: 'blocked', blocked_note: 'รอสินค้าตัวอย่าง' } });

  const seenByMkt = await ok(h1, 'team_work', { p_company: companyId });
  assert.equal(seenByMkt.tasks.length, 1);
  assert.equal(seenByMkt.tasks[0].status, 'blocked');
  const seenByWarehouse = await ok(h2, 'team_work', { p_company: companyId });
  assert.equal(seenByWarehouse.tasks.length, 0, 'other departments do not see marketing tasks');
  const seenByOwner = await ok(owner, 'team_work', { p_company: companyId });
  assert.equal(seenByOwner.tasks.length, 1);
  assert.equal((await select(s2, `tasks?company_id=eq.${companyId}&select=id`)).length, 0);

  // วันที่ตามเวลาไทย (ระบบนับการลาวันนี้ตามเวลาไทย)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const leave = await ok(s2, 'request_leave', { p_company: companyId, p_type: 'sick', p_start: today, p_end: today, p_reason: 'ไม่สบาย' });
  const view = await ok(h2, 'team_overview', { p_company: companyId });
  const req = view.approvals.find((a) => a.kind === 'leave');
  assert.equal(req.can_decide, true);
  await fails(h1, 'decide_approval', { p_request: req.id, p_approve: true }, /ไม่มีสิทธิ์/);
  await ok(h2, 'decide_approval', { p_request: req.id, p_approve: true });
  const rows = await select(s2, `leave_requests?id=eq.${leave}&select=status`);
  assert.equal(rows[0].status, 'approved');
  assert.equal((await select(h1, `leave_requests?id=eq.${leave}&select=id`)).length, 0, 'other heads cannot see this leave');
  const home = await ok(owner, 'team_work', { p_company: companyId });
  assert.equal(home.leave_today.length, 1);
  // หัวหน้าลาเอง → ส่งให้ระดับถัดขึ้นไป (เจ้าของ)
  await ok(h2, 'request_leave', { p_company: companyId, p_type: 'personal', p_start: today, p_end: today });
  const ownerView = await ok(owner, 'team_overview', { p_company: companyId });
  assert.ok(ownerView.approvals.some((a) => a.kind === 'leave' && a.status === 'pending' && a.can_decide));
});

test('task followers and creators hear about blocked and finished work', async () => {
  const owner = await signUp('เจ้าของร้าน');
  const companyId = await verifiedCompany(owner, 'บริษัท ติดตามงาน จำกัด');
  const root = rootPosition(companyId);
  const mktHead = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'หัวหน้าการตลาด', p_is_department: true, p_grants: { team: 1 } });
  const mktStaff = await ok(owner, 'create_position', { p_company: companyId, p_parent: mktHead, p_title: 'กราฟิก', p_grants: {} });
  const whHead = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'หัวหน้าคลัง', p_is_department: true, p_grants: { team: 1 } });
  const [head, staff, other] = [await signUp('ศิริ'), await signUp('ต้น'), await signUp('สมใจ')];
  await join(head, owner, companyId, mktHead);
  await join(staff, owner, companyId, mktStaff);
  await join(other, owner, companyId, whHead);

  const task = await ok(head, 'save_task', { p_company: companyId, p_task: null, p_fields: { title: 'ออกแบบป้ายหน้าร้าน', assignee_id: staff.id } });
  const ownerFollow = await insert(owner, 'task_follows', { task_id: task, user_id: owner.id });
  assert.equal(ownerFollow.status, 201, 'owner can follow a task they can see');
  const outsiderFollow = await insert(other, 'task_follows', { task_id: task, user_id: other.id });
  assert.notEqual(outsiderFollow.status, 201, 'another department cannot follow a task it cannot see');

  await ok(staff, 'save_task', { p_company: companyId, p_task: task, p_fields: { status: 'blocked', blocked_note: 'รอโลโก้ไฟล์ใหญ่' } });
  const headNotes = await select(head, `notifications?company_id=eq.${companyId}&kind=eq.team_update&select=title,body`);
  assert.ok(headNotes.some((n) => n.title.includes('งานติดปัญหา') && n.body.includes('รอโลโก้')), 'creator is told the task is blocked');
  const ownerNotes = await select(owner, `notifications?company_id=eq.${companyId}&kind=eq.team_update&select=title`);
  assert.ok(ownerNotes.some((n) => n.title.includes('งานติดปัญหา')), 'follower is told the task is blocked');
  const staffNotes = await select(staff, `notifications?company_id=eq.${companyId}&title=like.*ติดปัญหา*&select=title`);
  assert.equal(staffNotes.length, 0, 'the person who changed the status is not notified');
  const otherNotes = await select(other, `notifications?company_id=eq.${companyId}&title=like.*ป้ายหน้าร้าน*&select=title`);
  assert.equal(otherNotes.length, 0);

  await ok(staff, 'save_task', { p_company: companyId, p_task: task, p_fields: { status: 'done' } });
  const done = await select(head, `notifications?company_id=eq.${companyId}&title=like.*งานเสร็จแล้ว*&select=title`);
  assert.equal(done.length, 1);
});

test('cancelling a leave approval request cancels the leave', async () => {
  const owner = await signUp('เจ้าของร้านลา');
  const companyId = await verifiedCompany(owner, 'บริษัท ยกเลิกลา จำกัด');
  const root = rootPosition(companyId);
  const headPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'หัวหน้าร้าน', p_is_department: true, p_grants: { team: 1, leave: 1 } });
  const staffPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: headPos, p_title: 'พนักงานหน้าร้าน', p_grants: {} });
  const staff = await signUp('น้ำ');
  await join(staff, owner, companyId, staffPos);
  const day = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
  const leave = await ok(staff, 'request_leave', { p_company: companyId, p_type: 'personal', p_start: day, p_end: day });
  const view = await ok(staff, 'team_overview', { p_company: companyId });
  const req = view.approvals.find((a) => a.kind === 'leave' && a.mine);
  await ok(staff, 'cancel_approval', { p_request: req.id });
  const rows = await select(staff, `leave_requests?id=eq.${leave}&select=status`);
  assert.equal(rows[0].status, 'cancelled');
});
