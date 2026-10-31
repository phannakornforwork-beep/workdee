// ทดสอบการสร้างโปรไฟล์อัตโนมัติเมื่อสมัคร (อีเมล และ Google ที่ส่งชื่อมาใน full_name)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql, uniq } from './helpers.mjs';

function newUser(meta) {
  const email = `${uniq('g')}@example.com`;
  const id = sql(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             '${email}', '${JSON.stringify(meta)}'::jsonb, now(), now()) returning id`
  ).trim();
  return { id, email };
}

test('Google sign-up uses full_name, then name, then email prefix as display name', async () => {
  const a = newUser({ full_name: 'สมหญิง กูเกิล', name: 'Somying' });
  assert.equal(sql(`select display_name from public.profiles where id = '${a.id}'`).trim(), 'สมหญิง กูเกิล');
  const b = newUser({ name: 'Only Name' });
  assert.equal(sql(`select display_name from public.profiles where id = '${b.id}'`).trim(), 'Only Name');
  const c = newUser({});
  assert.equal(sql(`select display_name from public.profiles where id = '${c.id}'`).trim(), c.email.split('@')[0]);
  const d = newUser({ display_name: 'ชื่อที่ตั้งเอง', full_name: 'Google Name' });
  assert.equal(sql(`select display_name from public.profiles where id = '${d.id}'`).trim(), 'ชื่อที่ตั้งเอง');
});
