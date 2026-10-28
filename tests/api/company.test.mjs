// ทดสอบพื้นที่บริษัท: การยืนยันบริษัท ลำดับชั้น การมอบสิทธิ์ต่อ คำเชิญ ประวัติการเปลี่ยนแปลง
import test from 'node:test';
import assert from 'node:assert/strict';
import { signUp, ok, fails, rpc, select, sql, makeAdmin, rootPosition, join } from './helpers.mjs';

test('company lifecycle, hierarchy and delegated permissions', async (t) => {
  const owner = await signUp('สมชาย สุขใจ');
  const admin = await signUp('แอดมิน WorkDee');
  makeAdmin(admin);
  const regNo = '0105' + String(Date.now()).slice(-9);

  const companyId = await ok(owner, 'create_company', { p_name: 'สุขใจฟู้ดส์ จำกัด', p_reg_no: regNo, p_size: '20-49', p_industry: 'อาหาร', p_province: 'กรุงเทพมหานคร' });

  await t.test('validates registration number and duplicates', async () => {
    await fails(owner, 'create_company', { p_name: 'X', p_reg_no: '123' }, /ชื่อบริษัท|13 หลัก/);
    await fails(owner, 'create_company', { p_name: 'ซ้ำ จำกัด', p_reg_no: regNo }, /มีในระบบแล้ว/);
  });

  await t.test('owner sees the new space, seeded room and templates', async () => {
    const spaces = await ok(owner, 'my_spaces');
    assert.equal(spaces.length, 1);
    assert.equal(spaces[0].is_owner, true);
    assert.equal(spaces[0].company_status, 'pending');
    const rooms = await ok(owner, 'chat_room_list', { p_company: companyId });
    assert.equal(rooms.filter((r) => r.kind === 'company').length, 1);
    const templates = await select(owner, `message_templates?company_id=eq.${companyId}&select=kind`);
    assert.ok(templates.length >= 5);
  });

  await t.test('only platform admins verify companies', async () => {
    await fails(owner, 'admin_review_company', { p_company: companyId, p_approve: true }, /ผู้ดูแลแพลตฟอร์ม/);
    await fails(admin, 'admin_review_company', { p_company: companyId, p_approve: false, p_note: '' }, /ระบุเหตุผล/);
    await ok(admin, 'admin_review_company', { p_company: companyId, p_approve: true, p_note: 'ตรวจหนังสือรับรองแล้ว' });
    const notes = await select(owner, `notifications?company_id=eq.${companyId}&kind=eq.company_review&select=title`);
    assert.equal(notes.length, 1);
  });

  const root = rootPosition(companyId);
  const head = await signUp('วิทย์ ศักดิ์ดี');
  const hr = await signUp('กมลชนก วงศ์ดี');
  const staff = await signUp('มาลี ใจงาม');
  let headPos; let hrPos; let staffPos; let subPos;

  await t.test('owner builds positions and invites people', async () => {
    headPos = await ok(owner, 'create_position', {
      p_company: companyId, p_parent: root, p_title: 'หัวหน้าการตลาด', p_is_department: true,
      p_grants: { team: 1, post: 1, approve_post: 1, screen: 1, offer: 1, members: 1, announce: 1 }
    });
    hrPos = await ok(owner, 'create_position', {
      p_company: companyId, p_parent: root, p_title: 'HR และบัญชี', p_is_department: false,
      p_grants: { team: 2, post: 2, screen: 2, members: 2, announce: 2 }
    });
    staffPos = await ok(owner, 'create_position', { p_company: companyId, p_parent: headPos, p_title: 'Content Executive', p_grants: { team: 1 } });
    await fails(owner, 'create_position', { p_company: companyId, p_parent: root, p_title: 'การเงิน', p_grants: { billing: 1 } }, /ชำระเงิน/);
    await join(head, owner, companyId, headPos);
    await join(hr, owner, companyId, hrPos);
    await join(staff, owner, companyId, staffPos);
    const rooms = await ok(head, 'chat_room_list', { p_company: companyId });
    assert.ok(rooms.some((r) => r.kind === 'department'), 'department room is created for the head');
  });

  await t.test('heads manage only positions below them, with at most their own level', async () => {
    subPos = await ok(head, 'create_position', { p_company: companyId, p_parent: headPos, p_title: 'กราฟิกดีไซเนอร์', p_grants: { team: 1, screen: 1 } });
    await fails(head, 'create_position', { p_company: companyId, p_parent: root, p_title: 'แผนกใหม่' }, /ใต้ตำแหน่งของคุณ/);
    await fails(head, 'create_position', { p_company: companyId, p_parent: headPos, p_title: 'เกินสิทธิ์', p_grants: { screen: 2 } }, /เกินกว่าที่คุณมี/);
    await fails(head, 'set_position_grant', { p_position: subPos, p_perm: 'screen', p_level: 2 }, /เกินกว่าที่คุณมี/);
    await fails(head, 'set_position_grant', { p_position: headPos, p_perm: 'screen', p_level: 1 }, /ต่ำกว่าคุณ/);
    await fails(head, 'set_position_grant', { p_position: hrPos, p_perm: 'screen', p_level: 0 }, /ต่ำกว่าคุณ/);
    await fails(staff, 'set_position_grant', { p_position: subPos, p_perm: 'team', p_level: 0 }, /ต่ำกว่าคุณ/);
    await ok(head, 'set_position_grant', { p_position: subPos, p_perm: 'post', p_level: 1 });
  });

  await t.test('company-wide manager (HR) manages deeper positions in any branch but not peers', async () => {
    await ok(hr, 'set_position_grant', { p_position: subPos, p_perm: 'announce', p_level: 1 });
    await fails(hr, 'set_position_grant', { p_position: headPos, p_perm: 'post', p_level: 0 }, /ต่ำกว่าคุณ/);
  });

  await t.test('lowering a grant cascades down the line', async () => {
    await ok(owner, 'set_position_grant', { p_position: headPos, p_perm: 'screen', p_level: 0 });
    const sub = sql(`select grants ->> 'screen' from public.positions where id = '${subPos}';`);
    assert.equal(sub, '0');
    await ok(owner, 'set_position_grant', { p_position: headPos, p_perm: 'screen', p_level: 1 });
  });

  await t.test('owners cannot be removed below one, and heads cannot promote themselves', async () => {
    await fails(owner, 'leave_company', { p_company: companyId }, /เจ้าของคนเดียว/);
    await fails(head, 'assign_member_position', { p_company: companyId, p_user: head.id, p_position: root }, /เจ้าของ/);
    await fails(head, 'assign_member_position', { p_company: companyId, p_user: hr.id, p_position: staffPos }, /ต่ำกว่าคุณ/);
    await ok(head, 'assign_member_position', { p_company: companyId, p_user: staff.id, p_position: subPos });
    await ok(owner, 'assign_member_position', { p_company: companyId, p_user: head.id, p_position: root });
    await ok(owner, 'assign_member_position', { p_company: companyId, p_user: head.id, p_position: headPos });
  });

  await t.test('invites expire, are revocable and email-bound when set', async () => {
    const outsider = await signUp('คนนอก');
    const code = await ok(owner, 'create_invite', { p_company: companyId, p_position: staffPos, p_email: 'someone-else@example.com' });
    await fails(outsider, 'accept_invite', { p_code: code }, /อีเมลอื่น/);
    const preview = await ok({ token: null }, 'invite_preview', { p_code: code });
    assert.equal(preview.valid, true);
    assert.equal(preview.company_name, 'สุขใจฟู้ดส์ จำกัด');
    const open = await ok(owner, 'create_invite', { p_company: companyId, p_position: staffPos });
    const inviteId = sql(`select id from public.company_invites where code = '${open}';`);
    await ok(owner, 'revoke_invite', { p_invite: inviteId });
    await fails(outsider, 'accept_invite', { p_code: open }, /หมดอายุหรือถูกยกเลิก/);
    await fails(staff, 'create_invite', { p_company: companyId, p_position: staffPos }, /ต่ำกว่าคุณ/);
  });

  await t.test('audit log is append-only and visible to managers only', async () => {
    const logs = await select(owner, `audit_log?company_id=eq.${companyId}&select=action`);
    assert.ok(logs.length > 5);
    const staffLogs = await select(staff, `audit_log?company_id=eq.${companyId}&select=action`);
    assert.equal(staffLogs.length, 0);
    const res = await fetch(`${process.env.SUPABASE_URL || 'http://127.0.0.1:54321'}/rest/v1/audit_log?company_id=eq.${companyId}`, {
      method: 'DELETE', headers: { apikey: owner.token, Authorization: `Bearer ${owner.token}` }
    });
    assert.ok(res.status >= 400 || (await select(owner, `audit_log?company_id=eq.${companyId}&select=id`)).length === logs.length);
  });

  await t.test('team overview shows what each person can manage', async () => {
    const view = await ok(head, 'team_overview', { p_company: companyId });
    const byTitle = Object.fromEntries(view.positions.map((p) => [p.title, p]));
    assert.equal(byTitle['กราฟิกดีไซเนอร์'].can_manage, true);
    assert.equal(byTitle['HR และบัญชี'].can_manage, false);
    assert.equal(view.me.perms.screen, 1);
    const outsider = await signUp('คนนอก 2');
    assert.equal((await rpc(outsider, 'team_overview', { p_company: companyId })).data, null);
  });

  await t.test('approval rules are owner-only', async () => {
    await fails(hr, 'set_approval_rule', { p_company: companyId, p_rule: 'job_post_needs_head', p_enabled: false }, /เจ้าของ/);
    await ok(owner, 'set_approval_rule', { p_company: companyId, p_rule: 'reject_after_interview_needs_head', p_enabled: false });
  });
});
