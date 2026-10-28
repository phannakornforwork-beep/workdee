-- WorkDee · 04 การแจ้งเตือน: ในแอป อีเมล LINE (ผ่าน LINE Official Account) และ SMS
-- In-app notifications + an outbox of external deliveries processed by the app server.
-- LINE Notify ปิดบริการตั้งแต่ 31 มี.ค. 2568 จึงส่งผ่าน Messaging API ของ LINE Official Account

create table public.notification_kinds (
  kind text primary key,
  audience text not null check (audience in ('candidate', 'company')),
  label text not null,
  description text not null default '',
  default_email boolean not null default false,
  default_line boolean not null default false,
  default_sms boolean not null default false,
  digest boolean not null default false, -- ค่าเริ่มต้นรวมไว้ในสรุปประจำวันแทนการส่งทันที
  sort int not null default 0
);
alter table public.notification_kinds enable row level security;
create policy "notification_kinds: public read" on public.notification_kinds for select using (true);

insert into public.notification_kinds (kind, audience, label, description, default_email, default_line, default_sms, digest, sort) values
  ('new_application', 'company', 'ผู้สมัครใหม่', 'รวมไว้ในสรุปประจำวันก็พอสำหรับบริษัทส่วนใหญ่', false, false, false, true, 10),
  ('challenge_submitted', 'company', 'ผู้สมัครส่งโจทย์ รอให้คะแนน', 'แจ้งคนที่มีสิทธิ์ให้คะแนนของประกาศนั้น', true, true, false, false, 20),
  ('sla_warning', 'company', 'ใกล้ครบ 7 วัน', 'เตือนวันที่ 5 และแจ้งเจ้าของวันที่ 6 เรื่องที่พลาดไม่ได้ เปิด SMS ได้', true, true, true, false, 30),
  ('interview_update', 'company', 'นัดสัมภาษณ์: ยืนยัน ขอเลื่อน ยกเลิก', 'แจ้งทุกคนที่ดูแลประกาศนั้น', true, true, false, false, 40),
  ('hiring_update', 'company', 'ผู้สมัครตอบข้อเสนอหรือถอนใบสมัคร', '', true, true, false, false, 45),
  ('approval', 'company', 'เรื่องรออนุมัติและผลการอนุมัติ', 'ประกาศงาน ข้อเสนองาน การลา', false, true, false, false, 50),
  ('chat_message', 'company', 'ข้อความแชตและประกาศ', 'นอกเวลางานจะรวมแจ้งตอนเช้า', false, false, false, false, 60),
  ('team_update', 'company', 'การเปลี่ยนแปลงในทีม', 'ได้รับตำแหน่งใหม่ มีสมาชิกใหม่เข้าร่วม', false, false, false, false, 70),
  ('digest', 'company', 'สรุปประจำวัน 08:30', 'เรื่องที่ต้องทำวันนี้ในข้อความเดียว', true, true, false, false, 80),
  ('company_review', 'company', 'ผลการยืนยันบริษัท', '', true, true, false, false, 90),
  ('app_update', 'candidate', 'ความคืบหน้าใบสมัคร', 'เชิญทำโจทย์ ผลการพิจารณา นัดสัมภาษณ์ ข้อเสนองาน', true, true, false, false, 110),
  ('app_message', 'candidate', 'ข้อความจากบริษัท', '', true, true, false, false, 120),
  ('deadline', 'candidate', 'ใกล้ครบกำหนด', 'โจทย์ใกล้ครบเวลา ข้อเสนอใกล้หมดอายุ', true, true, false, false, 130),
  ('verification', 'candidate', 'ผลการยืนยันวุฒิ', '', true, false, false, false, 140);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  space text not null check (space in ('personal', 'company')),
  company_id uuid references public.companies (id) on delete cascade,
  kind text not null references public.notification_kinds (kind),
  title text not null,
  body text not null default '',
  link text,
  urgent boolean not null default false,
  batch_id uuid,
  visible_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_space_company check ((space = 'company') = (company_id is not null))
);
create index notifications_user_idx on public.notifications (user_id, space, company_id, created_at desc);
create index notifications_batch_idx on public.notifications (batch_id) where batch_id is not null;
alter table public.notifications enable row level security;
create policy "notifications: read own" on public.notifications
  for select using (user_id = auth.uid() and visible_at <= now());

create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null references public.notification_kinds (kind) on delete cascade,
  email boolean not null default false,
  line boolean not null default false,
  sms boolean not null default false,
  primary key (user_id, kind)
);
alter table public.notification_prefs enable row level security;
create policy "notification_prefs: own" on public.notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'line', 'sms')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  deliver_after timestamptz not null default now(),
  attempts int not null default 0,
  claimed_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_deliveries_due_idx on public.notification_deliveries (status, deliver_after);
alter table public.notification_deliveries enable row level security; -- เฉพาะ service role

create table public.line_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  line_user_id text unique,
  link_code text unique,
  code_expires_at timestamptz,
  linked_at timestamptz
);
alter table public.line_links enable row level security;
create policy "line_links: read own" on public.line_links for select using (user_id = auth.uid());

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  digest_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "user_settings: own" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- เวลาถัดไปที่ส่งได้ (เลื่อนออกจากช่วงเวลาเงียบของบริษัท)
create or replace function public.next_allowed_time(p_at timestamptz, p_start time, p_end time, p_tz text)
returns timestamptz language plpgsql stable as $$
declare
  local_ts timestamp := p_at at time zone p_tz;
  lt time := local_ts::time;
  d date := local_ts::date;
  in_quiet boolean;
begin
  if p_start is null or p_end is null or p_start = p_end then
    return p_at;
  end if;
  if p_start > p_end then
    in_quiet := lt >= p_start or lt < p_end;
  else
    in_quiet := lt >= p_start and lt < p_end;
  end if;
  if not in_quiet then
    return p_at;
  end if;
  if p_start > p_end and lt >= p_start then
    d := d + 1;
  end if;
  return (d + p_end) at time zone p_tz;
end
$$;

create or replace function public.notify(
  p_user uuid, p_company uuid, p_kind text, p_title text, p_body text default '', p_link text default null,
  p_urgent boolean default false, p_batch uuid default null, p_visible_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  k public.notification_kinds;
  pref public.notification_prefs;
  has_pref boolean;
  v_after timestamptz := coalesce(p_visible_at, now());
  v_email boolean;
  v_line boolean;
  v_sms boolean;
  q_start time;
  q_end time;
  v_tz text;
  v_consent boolean;
begin
  if p_user is null then
    return null;
  end if;
  select * into k from public.notification_kinds where kind = p_kind;
  if not found then
    raise exception 'unknown notification kind %', p_kind;
  end if;
  insert into public.notifications (user_id, space, company_id, kind, title, body, link, urgent, batch_id, visible_at)
  values (p_user, case when p_company is null then 'personal' else 'company' end, p_company, p_kind,
          left(p_title, 300), left(coalesce(p_body, ''), 2000), p_link, coalesce(p_urgent, false), p_batch, coalesce(p_visible_at, now()))
  returning id into v_id;

  select * into pref from public.notification_prefs where user_id = p_user and kind = p_kind;
  has_pref := found;
  v_email := case when has_pref then pref.email else k.default_email and not k.digest end;
  v_line := case when has_pref then pref.line else k.default_line and not k.digest end;
  v_sms := case when has_pref then pref.sms else k.default_sms and not k.digest end;
  v_sms := v_sms and coalesce(p_urgent, false);

  if p_company is not null then
    select quiet_start, quiet_end, timezone into q_start, q_end, v_tz from public.companies where id = p_company;
    select after_hours_consent into v_consent from public.company_members where company_id = p_company and user_id = p_user;
    if not (coalesce(p_urgent, false) and coalesce(v_consent, false)) then
      v_after := public.next_allowed_time(v_after, q_start, q_end, coalesce(v_tz, 'Asia/Bangkok'));
    end if;
  end if;

  if v_email then
    insert into public.notification_deliveries (notification_id, channel, deliver_after) values (v_id, 'email', v_after);
  end if;
  if v_line and exists (select 1 from public.line_links where user_id = p_user and line_user_id is not null) then
    insert into public.notification_deliveries (notification_id, channel, deliver_after) values (v_id, 'line', v_after);
  end if;
  if v_sms and exists (select 1 from public.profiles where id = p_user and phone is not null) then
    insert into public.notification_deliveries (notification_id, channel, deliver_after) values (v_id, 'sms', v_after);
  end if;
  return v_id;
end
$$;
revoke execute on function public.notify(uuid, uuid, text, text, text, text, boolean, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.unread_count(p_company uuid default null)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.notifications
  where user_id = auth.uid() and read_at is null and visible_at <= now()
    and ((p_company is null and space = 'personal') or company_id = p_company);
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null, p_company uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := public.require_user();
begin
  if p_ids is not null then
    update public.notifications set read_at = now()
     where user_id = v_user and id = any (p_ids) and read_at is null;
  else
    update public.notifications set read_at = now()
     where user_id = v_user and read_at is null and visible_at <= now()
       and ((p_company is null and space = 'personal') or company_id = p_company);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- เชื่อม LINE: ผู้ใช้กดสร้างรหัส แล้วพิมพ์รหัสในแชตกับบัญชี LINE ของแพลตฟอร์ม
create or replace function public.create_line_link_code()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_code text;
begin
  loop
    v_code := lpad(((get_byte(extensions.gen_random_bytes(4), 0) * 65536
                     + get_byte(extensions.gen_random_bytes(4), 1) * 256
                     + get_byte(extensions.gen_random_bytes(4), 2)) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.line_links where link_code = v_code and code_expires_at > now());
  end loop;
  insert into public.line_links (user_id, link_code, code_expires_at)
  values (v_user, v_code, now() + interval '15 minutes')
  on conflict (user_id) do update set link_code = excluded.link_code, code_expires_at = excluded.code_expires_at;
  return v_code;
end
$$;

-- เรียกจาก webhook ของ LINE (service role เท่านั้น)
create or replace function public.link_line_account(p_code text, p_line_user_id text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid;
begin
  select user_id into v_user from public.line_links
   where link_code = trim(p_code) and code_expires_at > now();
  if v_user is null then
    return null;
  end if;
  update public.line_links set line_user_id = null where line_user_id = p_line_user_id and user_id <> v_user;
  update public.line_links
     set line_user_id = p_line_user_id, linked_at = now(), link_code = null, code_expires_at = null
   where user_id = v_user;
  return v_user;
end
$$;
revoke execute on function public.link_line_account(text, text) from public, anon, authenticated;

create or replace function public.unlink_line()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.line_links set line_user_id = null, linked_at = null where user_id = public.require_user();
end
$$;

-- เมื่อผู้ใช้บล็อกบัญชี LINE ของแพลตฟอร์ม (service role)
create or replace function public.unlink_line_by_line_id(p_line_user_id text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.line_links set line_user_id = null, linked_at = null where line_user_id = p_line_user_id;
$$;
revoke execute on function public.unlink_line_by_line_id(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- คิวส่งออก (service role เท่านั้น)
create or replace function public.claim_deliveries(p_limit int default 50)
returns table (
  delivery_id bigint, channel text, user_id uuid, email text, line_user_id text, phone text,
  kind text, title text, body text, link text, urgent boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with c as (
    select d.id from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where ((d.status = 'pending')
        or (d.status = 'sending' and d.claimed_at < now() - interval '15 minutes' and d.attempts < 3))
      and d.deliver_after <= now() and n.visible_at <= now()
    order by d.deliver_after
    limit greatest(1, least(p_limit, 200))
    for update of d skip locked
  ), u as (
    update public.notification_deliveries d
       set status = 'sending', attempts = d.attempts + 1, claimed_at = now()
      from c where d.id = c.id
    returning d.id, d.channel, d.notification_id
  )
  select u.id, u.channel, n.user_id, au.email::text, ll.line_user_id, pr.phone,
         n.kind, n.title, n.body, n.link, n.urgent
  from u
  join public.notifications n on n.id = u.notification_id
  join auth.users au on au.id = n.user_id
  left join public.line_links ll on ll.user_id = n.user_id
  left join public.profiles pr on pr.id = n.user_id;
end
$$;
revoke execute on function public.claim_deliveries(int) from public, anon, authenticated;

create or replace function public.complete_delivery(p_id bigint, p_ok boolean, p_error text default null, p_skip boolean default false)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.notification_deliveries
     set status = case when p_skip then 'skipped' when p_ok then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() else sent_at end,
         last_error = left(p_error, 500),
         deliver_after = case when p_ok or p_skip then deliver_after else now() + interval '10 minutes' end
   where id = p_id;
$$;
revoke execute on function public.complete_delivery(bigint, boolean, text, boolean) from public, anon, authenticated;
