-- WorkDee · 07 แชต: ห้องทั้งบริษัท ห้องแผนก ห้องคุยกับผู้สมัครแยกตามใบสมัคร ประกาศพร้อมสถานะการอ่าน
-- Chat. Data belongs to the company space. Messages sent during quiet hours are delivered
-- (as LINE/email notifications) at the end of quiet hours unless urgent and the recipient
-- consented beforehand (in the spirit of Labour Protection Act s.23/1).

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('company', 'department', 'candidate')),
  title text not null check (char_length(title) between 1 and 160),
  department_id uuid,
  application_id uuid unique references public.applications (id) on delete cascade,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  foreign key (company_id, department_id) references public.positions (company_id, id) on delete cascade,
  constraint chat_rooms_kind_refs check (
    (kind = 'department') = (department_id is not null) and (kind = 'candidate') = (application_id is not null))
);
create unique index chat_rooms_one_company_room on public.chat_rooms (company_id) where kind = 'company';
create unique index chat_rooms_one_department_room on public.chat_rooms (department_id) where kind = 'department';
alter table public.chat_rooms enable row level security;

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid default auth.uid() references auth.users (id) on delete set null,
  sender_name text not null default '',
  sender_side text not null default 'company' check (sender_side in ('company', 'candidate', 'system')),
  body text not null check (char_length(body) between 1 and 4000),
  is_announcement boolean not null default false,
  urgent boolean not null default false,
  batch_id uuid,
  visible_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, id desc);
create index chat_messages_batch_idx on public.chat_messages (batch_id) where batch_id is not null;
alter table public.chat_messages enable row level security;

create table public.chat_reads (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.chat_reads enable row level security;
create policy "chat_reads: own" on public.chat_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.announcement_reads (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.announcement_reads enable row level security;

-- ---------------------------------------------------------------------------
create or replace function public.room_member_ids(p_room uuid)
returns setof uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.chat_rooms;
begin
  select * into r from public.chat_rooms where id = p_room;
  if r.kind = 'company' then
    return query select m.user_id from public.company_members m where m.company_id = r.company_id and m.status = 'active';
  elsif r.kind = 'department' then
    return query select m.user_id from public.company_members m
      where m.company_id = r.company_id and m.status = 'active'
        and (public.is_ancestor_or_self(r.department_id, m.position_id)
             or public.user_has_perm(m.user_id, r.company_id, 'team', r.department_id));
  elsif r.kind = 'candidate' then
    return query select a.candidate_id from public.applications a where a.id = r.application_id
      union select * from public.job_screeners((select job_id from public.applications where id = r.application_id));
  end if;
end
$$;
revoke execute on function public.room_member_ids(uuid) from public, anon, authenticated;

create or replace function public.can_access_room(p_room uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.chat_rooms;
begin
  if auth.uid() is null then
    return false;
  end if;
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null then
    return false;
  end if;
  if r.kind = 'company' then
    return public.is_company_member(r.company_id);
  elsif r.kind = 'department' then
    return public.is_ancestor_or_self(r.department_id, public.my_position(r.company_id))
        or public.has_perm(r.company_id, 'team', r.department_id);
  else
    return exists (select 1 from public.applications a where a.id = r.application_id
                   and (a.candidate_id = auth.uid() or public.can_screen_job(a.job_id)));
  end if;
end
$$;

create or replace function public.room_company(p_room uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select company_id from public.chat_rooms where id = p_room;
$$;

create policy "chat_rooms: read accessible" on public.chat_rooms for select using (public.can_access_room(id));
create policy "chat_messages: read accessible" on public.chat_messages for select using (
  public.can_access_room(room_id) and (visible_at <= now() or public.is_company_member(public.room_company(room_id))));

create or replace function public.can_see_announcement_reads(p_message bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.chat_messages m join public.chat_rooms r on r.id = m.room_id
                 where m.id = p_message and m.is_announcement
                   and (m.sender_id = auth.uid() or public.perm_level(r.company_id, 'announce') >= 1 or public.is_company_owner(r.company_id)));
$$;
create policy "announcement_reads: read" on public.announcement_reads for select using (
  user_id = auth.uid() or public.can_see_announcement_reads(message_id));

-- ห้องเริ่มต้น
create or replace function public.ensure_company_room()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.chat_rooms (company_id, kind, title) values (new.id, 'company', 'ทั้งบริษัท')
  on conflict do nothing;
  return new;
end
$$;
revoke execute on function public.ensure_company_room() from public, anon, authenticated;
create trigger companies_chat_room after insert on public.companies for each row execute function public.ensure_company_room();

create or replace function public.sync_department_room()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.is_department then
    insert into public.chat_rooms (company_id, kind, title, department_id)
    values (new.company_id, 'department', 'แผนก ' || new.title, new.id)
    on conflict (department_id) where kind = 'department' do update set title = excluded.title, archived = false;
  elsif tg_op = 'UPDATE' and old.is_department then
    update public.chat_rooms set archived = true where department_id = new.id and kind = 'department';
  end if;
  return new;
end
$$;
revoke execute on function public.sync_department_room() from public, anon, authenticated;
create trigger positions_chat_room after insert or update of is_department, title on public.positions
  for each row execute function public.sync_department_room();

create or replace function public.ensure_candidate_room(p_app uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  a public.applications;
  v_title text;
begin
  select * into a from public.applications where id = p_app;
  if a.id is null or not (a.candidate_id = auth.uid() or public.can_screen_job(a.job_id) or public.is_privileged()) then
    raise exception 'ไม่พบใบสมัคร';
  end if;
  select id into v_id from public.chat_rooms where application_id = p_app;
  if v_id is null then
    select title into v_title from public.jobs where id = a.job_id;
    insert into public.chat_rooms (company_id, kind, title, application_id)
    values (a.company_id, 'candidate', left(coalesce(nullif(a.candidate_name, ''), 'ผู้สมัคร') || ' · ' || v_title, 160), p_app)
    on conflict (application_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.chat_rooms where application_id = p_app;
    end if;
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
create or replace function public.guard_chat_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.chat_rooms;
  v_name text;
begin
  select * into r from public.chat_rooms where id = new.room_id;
  if new.sender_id is not null then
    select display_name into v_name from public.profiles where id = new.sender_id;
  end if;
  new.sender_name := coalesce(nullif(v_name, ''), case when new.sender_id is null then 'ระบบ WorkDee' else 'ผู้ใช้' end);
  if r.kind = 'candidate' and exists (select 1 from public.applications a where a.id = r.application_id and a.candidate_id = new.sender_id) then
    new.sender_side := 'candidate';
    new.is_announcement := false;
    new.urgent := false;
  elsif new.sender_id is null then
    new.sender_side := 'system';
  else
    new.sender_side := 'company';
  end if;
  if not public.is_privileged() then
    new.batch_id := null;
    new.visible_at := now();
  end if;
  new.created_at := now();
  return new;
end
$$;
revoke execute on function public.guard_chat_message() from public, anon, authenticated;
create trigger chat_messages_guard before insert on public.chat_messages for each row execute function public.guard_chat_message();

create or replace function public.after_chat_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.chat_rooms;
  a public.applications;
  v_company_name text;
  v_uid uuid;
  v_preview text := left(new.body, 140);
begin
  select * into r from public.chat_rooms where id = new.room_id;
  update public.chat_rooms set last_message_at = new.created_at where id = r.id;
  if r.kind = 'candidate' then
    select * into a from public.applications where id = r.application_id;
    if new.sender_side = 'company' then
      select name into v_company_name from public.companies where id = r.company_id;
      perform public.notify(a.candidate_id, null, 'app_message', 'ข้อความจาก ' || v_company_name, v_preview,
                            '/me/applications/' || a.id || '?tab=chat', false, new.batch_id, new.visible_at);
    elsif new.sender_side = 'candidate' then
      for v_uid in select * from public.job_screeners(a.job_id) loop
        perform public.notify(v_uid, r.company_id, 'chat_message', 'ผู้สมัคร ' || a.candidate_name || ' ส่งข้อความ', v_preview,
                              '/c/' || r.company_id || '/chat/' || r.id);
      end loop;
    end if;
  elsif new.is_announcement then
    for v_uid in select * from public.room_member_ids(r.id) loop
      if v_uid is distinct from new.sender_id then
        perform public.notify(v_uid, r.company_id, 'chat_message', 'ประกาศ: ' || left(new.body, 80), 'จาก ' || new.sender_name || ' · ' || r.title,
                              '/c/' || r.company_id || '/chat/' || r.id, new.urgent);
      end if;
    end loop;
  end if;
  return new;
end
$$;
revoke execute on function public.after_chat_message() from public, anon, authenticated;
create trigger chat_messages_after after insert on public.chat_messages for each row execute function public.after_chat_message();

-- ส่งข้อความ (ทุกฝั่งใช้ฟังก์ชันนี้ เพื่อได้ข้อความแจ้งความผิดพลาดเป็นภาษาไทย)
create or replace function public.post_chat_message(p_room uuid, p_body text, p_announcement boolean default false, p_urgent boolean default false)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  r public.chat_rooms;
  a public.applications;
  v_id bigint;
  v_is_candidate boolean := false;
begin
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or not public.can_access_room(p_room) then
    raise exception 'ไม่พบห้องแชต';
  end if;
  if r.archived then
    raise exception 'ห้องนี้ถูกปิดแล้ว';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'พิมพ์ข้อความก่อนส่ง';
  end if;
  if r.kind = 'candidate' then
    select * into a from public.applications where id = r.application_id;
    v_is_candidate := a.candidate_id = v_user;
    if v_is_candidate and (a.stage = 'withdrawn' or a.access_revoked_at is not null) then
      raise exception 'ใบสมัครนี้ปิดแล้ว ส่งข้อความไม่ได้';
    end if;
  end if;
  if coalesce(p_announcement, false) then
    if r.kind = 'candidate' then
      raise exception 'ห้องคุยกับผู้สมัครประกาศไม่ได้';
    end if;
    if r.kind = 'company' and public.perm_level(r.company_id, 'announce') < 2 then
      raise exception 'ตำแหน่งของคุณประกาศถึงทั้งบริษัทไม่ได้';
    end if;
    if r.kind = 'department' and not public.has_perm(r.company_id, 'announce', r.department_id) then
      raise exception 'ตำแหน่งของคุณประกาศในแผนกนี้ไม่ได้';
    end if;
  end if;
  if coalesce(p_urgent, false) and not v_is_candidate and not public.has_perm(r.company_id, 'announce') then
    raise exception 'ตำแหน่งของคุณส่งข้อความด่วนไม่ได้';
  end if;
  insert into public.chat_messages (room_id, sender_id, body, is_announcement, urgent)
  values (p_room, v_user, left(trim(p_body), 4000), coalesce(p_announcement, false), coalesce(p_urgent, false) and not v_is_candidate)
  returning id into v_id;
  insert into public.chat_reads (room_id, user_id, last_read_at) values (p_room, v_user, now())
  on conflict (room_id, user_id) do update set last_read_at = now();
  return v_id;
end
$$;

-- ส่งข้อความถึงผู้สมัครหลายคน (ข้อความเดียวกัน แทนชื่อให้แต่ละคน) ยกเลิกได้ใน 30 วินาที
create or replace function public.message_applicants(p_apps uuid[], p_message text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_company uuid := public.lock_company_apps(p_apps);
  v_batch uuid;
  v_vis timestamptz := now() + interval '30 seconds';
  v_app uuid;
  v_room uuid;
begin
  if char_length(trim(coalesce(p_message, ''))) < 2 then
    raise exception 'พิมพ์ข้อความก่อนส่ง';
  end if;
  if exists (select 1 from public.applications a where a.id = any (p_apps) and (a.stage = 'withdrawn' or a.access_revoked_at is not null)) then
    raise exception 'ผู้สมัครบางคนถอนใบสมัครแล้ว เอาออกจากรายการก่อน';
  end if;
  v_batch := public.new_batch(v_company, 'message', p_apps, null, p_message);
  perform public.enable_privileged();
  foreach v_app in array p_apps loop
    v_room := public.ensure_candidate_room(v_app);
    insert into public.chat_messages (room_id, sender_id, body, batch_id, visible_at)
    values (v_room, v_user, left(public.fill_message(p_message, v_app), 4000), v_batch, v_vis);
  end loop;
  perform set_config('workdee.privileged', 'off', true);
  return v_batch;
end
$$;

create or replace function public.mark_room_read(p_room uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_access_room(p_room) then
    return;
  end if;
  insert into public.chat_reads (room_id, user_id, last_read_at) values (p_room, auth.uid(), now())
  on conflict (room_id, user_id) do update set last_read_at = now();
  insert into public.announcement_reads (message_id, user_id)
  select m.id, auth.uid() from public.chat_messages m
  where m.room_id = p_room and m.is_announcement and m.sender_id is distinct from auth.uid() and m.visible_at <= now()
  on conflict do nothing;
end
$$;

create or replace function public.chat_room_list(p_company uuid)
returns table (room_id uuid, kind text, title text, last_message_at timestamptz, last_body text, last_sender text, unread int)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.kind, r.title, r.last_message_at,
         (select m.body from public.chat_messages m where m.room_id = r.id and m.visible_at <= now() order by m.id desc limit 1),
         (select m.sender_name from public.chat_messages m where m.room_id = r.id and m.visible_at <= now() order by m.id desc limit 1),
         (select count(*)::int from public.chat_messages m
           where m.room_id = r.id and m.visible_at <= now() and m.sender_id is distinct from auth.uid()
             and m.created_at > coalesce((select cr.last_read_at from public.chat_reads cr where cr.room_id = r.id and cr.user_id = auth.uid()), '-infinity'))
  from public.chat_rooms r
  where r.company_id = p_company and not r.archived and public.can_access_room(r.id)
  order by case r.kind when 'company' then 0 when 'department' then 1 else 2 end, r.last_message_at desc nulls last;
$$;

create or replace function public.announcement_status(p_message bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m public.chat_messages;
  v_total int;
  v_read int;
  v_unread text[];
begin
  if not public.can_see_announcement_reads(p_message) then
    return null;
  end if;
  select * into m from public.chat_messages where id = p_message;
  select count(*) into v_total from public.room_member_ids(m.room_id) u where u is distinct from m.sender_id;
  select count(*) into v_read from public.announcement_reads where message_id = p_message;
  select array_agg(cm.display_name order by cm.display_name) into v_unread
    from public.room_member_ids(m.room_id) u
    join public.company_members cm on cm.user_id = u and cm.company_id = (select company_id from public.chat_rooms where id = m.room_id)
   where u is distinct from m.sender_id and not exists (select 1 from public.announcement_reads ar where ar.message_id = p_message and ar.user_id = u);
  return jsonb_build_object('read', v_read, 'total', v_total, 'unread_names', coalesce(to_jsonb(v_unread), '[]'::jsonb));
end
$$;

-- เตือนคนที่ยังไม่อ่านประกาศ
create or replace function public.remind_announcement(p_message bigint)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.chat_messages;
  r public.chat_rooms;
  v_uid uuid;
  v_count int := 0;
begin
  perform public.require_user();
  if not public.can_see_announcement_reads(p_message) then
    raise exception 'ไม่พบประกาศ';
  end if;
  select * into m from public.chat_messages where id = p_message;
  select * into r from public.chat_rooms where id = m.room_id;
  for v_uid in select * from public.room_member_ids(r.id) loop
    if v_uid is distinct from m.sender_id and not exists (select 1 from public.announcement_reads where message_id = p_message and user_id = v_uid) then
      perform public.notify(v_uid, r.company_id, 'chat_message', 'เตือน: กดรับทราบประกาศ', left(m.body, 140), '/c/' || r.company_id || '/chat/' || r.id);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

-- เปิดให้ Supabase Realtime ส่งข้อความใหม่แบบเรียลไทม์ (เคารพ RLS)
alter publication supabase_realtime add table public.chat_messages;
