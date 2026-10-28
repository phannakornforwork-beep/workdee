// ทดสอบงานของทีม: มองเห็นตามสิทธิ์ team มอบหมายงานในขอบเขต และการลาที่หัวหน้าอนุมัติ
import test from 'node:test';
import assert from 'node:assert/strict';
import { signUp, ok, fails, select, rootPosition, join, verifiedCompany } from './helpers.mjs';

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

  const today = new Date().toISOString().slice(0, 10);
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
