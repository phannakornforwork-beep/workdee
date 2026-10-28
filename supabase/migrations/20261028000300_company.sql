-- WorkDee · 03 พื้นที่บริษัท: บริษัท ลำดับชั้นตำแหน่ง สิทธิ์ที่มอบต่อกันได้ สมาชิก คำเชิญ ประวัติ การอนุมัติ
-- Company space with a delegated permission hierarchy.
--
-- Permission model (สิทธิ์):
--   * ผูกกับ "ตำแหน่ง" ไม่ผูกกับคน แต่ละตำแหน่งมี grants = {perm: 0|1|2}
--     0 = ไม่มี, 1 = เฉพาะแผนกตัวเอง (subtree ของแผนกที่ตำแหน่งสังกัด), 2 = ทั้งบริษัท
--   * ตำแหน่งราก = เจ้าของกิจการ มีทุกสิทธิ์ระดับ 2 รวมการชำระเงิน (billing) ซึ่งตำแหน่งอื่นมีไม่ได้
--   * จัดการได้เฉพาะตำแหน่งที่อยู่ลึกกว่าตัวเอง (members=1: เฉพาะใต้ตัวเอง, members=2: ทุกสาย)
--   * ให้สิทธิ์ได้ไม่เกินที่ตัวเองมี และเมื่อลดสิทธิ์ ตำแหน่งใต้ลงไปที่เกินจะถูกลดตาม
--   * เจ้าของเห็นทุกอย่างเฉพาะในพื้นที่บริษัท ไม่มีทางเห็นพื้นที่ส่วนตัวของพนักงาน (ข้อตัดสินใจข้อ 2)

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  reg_no text not null check (reg_no ~ '^[0-9]{13}$'),
  size_range text check (size_range is null or size_range in ('1-19', '20-49', '50-199', '200+')),
  industry text check (industry is null or char_length(industry) <= 80),
  province text check (province is null or char_length(province) <= 80),
  about text not null default '' check (char_length(about) <= 3000),
  website text check (website is null or char_length(website) <= 300),
  status public.company_status not null default 'pending',
  cert_path text,
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  quiet_start time not null default '18:00',
  quiet_end time not null default '08:30',
  timezone text not null default 'Asia/Bangkok',
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'business', 'institution')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_reg_no_active on public.companies (reg_no) where status in ('pending', 'verified', 'suspended');
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();
alter table public.companies enable row level security;

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  parent_id uuid references public.positions (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 80),
  is_owner boolean not null default false,
  is_department boolean not null default false,
  grants jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  constraint positions_root_is_owner check ((parent_id is null) = is_owner)
);
create unique index positions_one_root on public.positions (company_id) where parent_id is null;
create index positions_parent_idx on public.positions (parent_id);
alter table public.positions enable row level security;

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active', 'removed')),
  after_hours_consent boolean not null default false,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (company_id, user_id),
  foreign key (company_id, position_id) references public.positions (company_id, id) on delete restrict
);
create index company_members_user_idx on public.company_members (user_id) where status = 'active';
create index company_members_position_idx on public.company_members (position_id);
alter table public.company_members enable row level security;

-- ---------------------------------------------------------------------------
-- ฟังก์ชันช่วยเรื่องลำดับชั้น
create or replace function public.perm_keys()
returns text[] language sql immutable as $$
  select array['team', 'post', 'approve_post', 'screen', 'offer', 'leave', 'members', 'announce', 'billing'];
$$;

create or replace function public.position_ancestors(p_pos uuid)
returns table (id uuid, parent_id uuid, lvl int)
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive up as (
    select p.id, p.parent_id, 0 as lvl from public.positions p where p.id = p_pos
    union all
    select p.id, p.parent_id, up.lvl + 1 from public.positions p join up on p.id = up.parent_id
    where up.lvl < 50
  )
  select up.id, up.parent_id, up.lvl from up;
$$;

create or replace function public.position_descendants(p_pos uuid)
returns table (id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive down as (
    select p.id, 0 as lvl from public.positions p where p.parent_id = p_pos
    union all
    select p.id, down.lvl + 1 from public.positions p join down on p.parent_id = down.id
    where down.lvl < 50
  )
  select down.id from down;
$$;

create or replace function public.is_ancestor_or_self(p_anc uuid, p_pos uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.position_ancestors(p_pos) a where a.id = p_anc);
$$;

create or replace function public.position_depth(p_pos uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(lvl), 0) from public.position_ancestors(p_pos);
$$;

-- แผนกที่ตำแหน่งสังกัด = ตำแหน่งที่ใกล้ที่สุด (รวมตัวเอง) ที่เป็นแผนก หรือราก
create or replace function public.dept_of(p_pos uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select a.id from public.position_ancestors(p_pos) a
  join public.positions p on p.id = a.id
  where p.is_department or p.parent_id is null
  order by a.lvl limit 1;
$$;

create or replace function public.member_position(p_company uuid, p_user uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select position_id from public.company_members
  where company_id = p_company and user_id = p_user and status = 'active';
$$;

create or replace function public.user_is_owner(p_user uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.company_members m join public.positions p on p.id = m.position_id
    where m.company_id = p_company and m.user_id = p_user and m.status = 'active' and p.parent_id is null);
$$;

create or replace function public.user_perm_level(p_user uuid, p_company uuid, p_perm text)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(case when p.parent_id is null then 2 else coalesce((p.grants ->> p_perm)::int, 0) end), 0)
  from public.company_members m join public.positions p on p.id = m.position_id
  where m.company_id = p_company and m.user_id = p_user and m.status = 'active';
$$;

-- p_target = แผนก/ตำแหน่งเป้าหมาย (เช่น แผนกของประกาศงาน) ถ้า null แปลว่า "มีสิทธิ์นี้ที่ใดที่หนึ่ง"
create or replace function public.user_has_perm(p_user uuid, p_company uuid, p_perm text, p_target uuid default null)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lvl int := public.user_perm_level(p_user, p_company, p_perm);
  v_pos uuid;
begin
  if v_lvl >= 2 then
    return true;
  elsif v_lvl = 1 then
    if p_target is null then
      return true;
    end if;
    v_pos := public.member_position(p_company, p_user);
    return public.is_ancestor_or_self(public.dept_of(v_pos), p_target);
  end if;
  return false;
end
$$;
revoke execute on function public.user_has_perm(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.user_perm_level(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.user_is_owner(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.member_position(uuid, uuid) from public, anon, authenticated;

create or replace function public.my_position(p_company uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select public.member_position(p_company, auth.uid());
$$;

create or replace function public.has_perm(p_company uuid, p_perm text, p_target uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and public.user_has_perm(auth.uid(), p_company, p_perm, p_target);
$$;

create or replace function public.perm_level(p_company uuid, p_perm text)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then 0 else public.user_perm_level(auth.uid(), p_company, p_perm) end;
$$;

create or replace function public.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.company_members
                 where company_id = p_company and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_company_owner(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and public.user_is_owner(auth.uid(), p_company);
$$;

create or replace function public.company_owner_ids(p_company uuid)
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id from public.company_members m join public.positions p on p.id = m.position_id
  where m.company_id = p_company and m.status = 'active' and p.parent_id is null;
$$;
revoke execute on function public.company_owner_ids(uuid) from public, anon, authenticated;

-- จัดการตำแหน่งเป้าหมายได้ไหม (กติกา: เฉพาะที่ลึกกว่าตัวเอง)
create or replace function public.can_manage_position(p_company uuid, p_target uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_my uuid;
  v_lvl int;
  v_tcompany uuid;
  v_tparent uuid;
begin
  if v_user is null then
    return false;
  end if;
  select company_id, parent_id into v_tcompany, v_tparent from public.positions where id = p_target;
  if v_tcompany is null or v_tcompany <> p_company or v_tparent is null then
    return false;
  end if;
  v_my := public.member_position(p_company, v_user);
  if v_my is null then
    return false;
  end if;
  if public.user_is_owner(v_user, p_company) then
    return true;
  end if;
  v_lvl := public.user_perm_level(v_user, p_company, 'members');
  if v_lvl = 0 then
    return false;
  end if;
  if public.position_depth(p_target) <= public.position_depth(v_my) then
    return false;
  end if;
  if v_lvl = 2 then
    return true;
  end if;
  return public.is_ancestor_or_self(v_my, p_target);
end
$$;

-- ตรวจความถูกต้องของตำแหน่ง
create or replace function public.guard_position()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  k text;
  v jsonb;
  v_parent_company uuid;
begin
  if new.parent_id is null then
    new.is_owner := true;
    new.is_department := true;
    new.grants := '{}'::jsonb;
    return new;
  end if;
  new.is_owner := false;
  select company_id into v_parent_company from public.positions where id = new.parent_id;
  if v_parent_company is null or v_parent_company <> new.company_id then
    raise exception 'ตำแหน่งแม่ต้องอยู่ในบริษัทเดียวกัน';
  end if;
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    if new.parent_id = new.id or exists (select 1 from public.position_descendants(new.id) d where d.id = new.parent_id) then
      raise exception 'ย้ายตำแหน่งไปอยู่ใต้ตำแหน่งลูกของตัวเองไม่ได้';
    end if;
  end if;
  if jsonb_typeof(new.grants) <> 'object' then
    raise exception 'รูปแบบสิทธิ์ไม่ถูกต้อง';
  end if;
  for k, v in select * from jsonb_each(new.grants) loop
    if not (k = any (public.perm_keys())) then
      raise exception 'ไม่รู้จักสิทธิ์ %', k;
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::int not in (0, 1, 2) then
      raise exception 'ระดับสิทธิ์ต้องเป็น 0, 1 หรือ 2';
    end if;
  end loop;
  if coalesce((new.grants ->> 'billing')::int, 0) > 0 then
    raise exception 'การชำระเงินเป็นสิทธิ์ของเจ้าของกิจการเท่านั้น';
  end if;
  return new;
end
$$;
create trigger positions_guard before insert or update on public.positions
  for each row execute function public.guard_position();

-- ชื่อที่แสดงในทีมตามชื่อบัญชี
create or replace function public.sync_member_display_name()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.company_members set display_name = new.display_name where user_id = new.id;
  end if;
  return new;
end
$$;
revoke execute on function public.sync_member_display_name() from public, anon, authenticated;
create trigger profiles_sync_members after update on public.profiles
  for each row execute function public.sync_member_display_name();

-- ---------------------------------------------------------------------------
-- RLS
create policy "companies: members read" on public.companies
  for select using (public.is_company_member(id) or public.is_platform_admin());
create policy "positions: members read" on public.positions
  for select using (public.is_company_member(company_id) or public.is_platform_admin());
create policy "company_members: members read" on public.company_members
  for select using (public.is_company_member(company_id) or user_id = auth.uid() or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- ประวัติการเปลี่ยนแปลง (ลบหรือแก้ไม่ได้)
create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_company_idx on public.audit_log (company_id, created_at desc);
alter table public.audit_log enable row level security;
create policy "audit_log: managers read" on public.audit_log
  for select using (public.has_perm(company_id, 'members') or public.is_platform_admin());
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create or replace function public.audit(p_company uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (company_id, actor_id, actor_name, action, detail)
  values (p_company, auth.uid(), coalesce(v_name, case when auth.uid() is null then 'ระบบ' else '' end), p_action, coalesce(p_detail, '{}'::jsonb));
end
$$;
revoke execute on function public.audit(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- กฎการอนุมัติ และคำขออนุมัติ
create table public.approval_rules (
  company_id uuid not null references public.companies (id) on delete cascade,
  rule text not null check (rule in ('job_post_needs_head', 'offer_over_range_needs_owner', 'leave_needs_head', 'reject_after_interview_needs_head', 'escalate_after_24h')),
  enabled boolean not null default true,
  primary key (company_id, rule)
);
alter table public.approval_rules enable row level security;
create policy "approval_rules: members read" on public.approval_rules
  for select using (public.is_company_member(company_id));

create or replace function public.rule_on(p_company uuid, p_rule text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select enabled from public.approval_rules where company_id = p_company and rule = p_rule), false);
$$;

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('job_post', 'offer', 'leave', 'reject_after_interview')),
  ref_id uuid not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_name text not null default '',
  approver_position_id uuid references public.positions (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_requests_company_idx on public.approval_requests (company_id, status, created_at desc);
create unique index approval_requests_one_pending on public.approval_requests (kind, ref_id) where status = 'pending';
alter table public.approval_requests enable row level security;

-- ผู้อนุมัติ = คนที่อยู่ตำแหน่งผู้อนุมัติ หรือสายบังคับบัญชาเหนือขึ้นไป หรือเจ้าของ
create or replace function public.can_decide_approval(p_request uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.approval_requests r
    where r.id = p_request and r.status = 'pending'
      and (public.is_company_owner(r.company_id)
           or (r.approver_position_id is not null
               and public.is_ancestor_or_self(public.member_position(r.company_id, auth.uid()), r.approver_position_id)))
      and r.requested_by is distinct from auth.uid());
$$;

create policy "approval_requests: involved read" on public.approval_requests
  for select using (
    requested_by = auth.uid()
    or public.is_company_owner(company_id)
    or public.perm_level(company_id, 'members') = 2
    or (approver_position_id is not null
        and public.is_ancestor_or_self(public.my_position(company_id), approver_position_id))
  );

-- ---------------------------------------------------------------------------
-- คำเชิญเข้าทีม (ลิงก์/อีเมล)
create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  position_id uuid not null,
  code text not null unique,
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  max_uses int not null default 50 check (max_uses between 1 and 500),
  uses int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, position_id) references public.positions (company_id, id) on delete cascade
);
alter table public.company_invites enable row level security;
create policy "company_invites: managers read" on public.company_invites
  for select using (public.has_perm(company_id, 'members'));

-- ---------------------------------------------------------------------------
-- RPC: บริษัท
create or replace function public.create_company(
  p_name text, p_reg_no text, p_size text default null, p_industry text default null, p_province text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_company uuid;
  v_root uuid;
  v_name text;
begin
  if char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'กรอกชื่อบริษัทตามหนังสือรับรอง';
  end if;
  if coalesce(p_reg_no, '') !~ '^[0-9]{13}$' then
    raise exception 'เลขทะเบียนนิติบุคคลต้องเป็นตัวเลข 13 หลัก';
  end if;
  if (select count(*) from public.companies where created_by = v_user and status in ('pending', 'verified')) >= 3 then
    raise exception 'สร้างบริษัทได้สูงสุด 3 แห่งต่อบัญชี ติดต่อทีมงานหากต้องการเพิ่ม';
  end if;
  if exists (select 1 from public.companies where reg_no = p_reg_no and status in ('pending', 'verified', 'suspended')) then
    raise exception 'เลขทะเบียนนี้มีในระบบแล้ว ถ้าเป็นบริษัทของคุณ ให้ขอลิงก์เชิญจากเจ้าของในระบบ หรือติดต่อทีมงาน';
  end if;

  insert into public.companies (name, reg_no, size_range, industry, province, created_by)
  values (trim(p_name), p_reg_no, nullif(p_size, ''), nullif(trim(coalesce(p_industry, '')), ''), nullif(trim(coalesce(p_province, '')), ''), v_user)
  returning id into v_company;

  insert into public.positions (company_id, parent_id, title, is_owner, is_department)
  values (v_company, null, 'เจ้าของกิจการ', true, true)
  returning id into v_root;

  select display_name into v_name from public.profiles where id = v_user;
  insert into public.company_members (company_id, user_id, position_id, display_name)
  values (v_company, v_user, v_root, coalesce(v_name, ''));

  insert into public.approval_rules (company_id, rule, enabled)
  values (v_company, 'job_post_needs_head', true),
         (v_company, 'offer_over_range_needs_owner', true),
         (v_company, 'leave_needs_head', true),
         (v_company, 'reject_after_interview_needs_head', false),
         (v_company, 'escalate_after_24h', true);

  perform public.audit(v_company, 'company.created', jsonb_build_object('name', trim(p_name)));
  return v_company;
end
$$;

create or replace function public.update_company_profile(p_company uuid, p_fields jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := public.require_user();
begin
  if not (public.is_company_owner(p_company) or public.perm_level(p_company, 'members') = 2) then
    raise exception 'เฉพาะเจ้าของกิจการหรือผู้ดูแลทีมทั้งบริษัทแก้ข้อมูลบริษัทได้';
  end if;
  update public.companies set
    about = coalesce(p_fields ->> 'about', about),
    website = case when p_fields ? 'website' then nullif(trim(p_fields ->> 'website'), '') else website end,
    province = case when p_fields ? 'province' then nullif(trim(p_fields ->> 'province'), '') else province end,
    industry = case when p_fields ? 'industry' then nullif(trim(p_fields ->> 'industry'), '') else industry end,
    size_range = case when p_fields ? 'size_range' then nullif(p_fields ->> 'size_range', '') else size_range end,
    quiet_start = coalesce((p_fields ->> 'quiet_start')::time, quiet_start),
    quiet_end = coalesce((p_fields ->> 'quiet_end')::time, quiet_end)
  where id = p_company;
  perform public.audit(p_company, 'company.updated', p_fields - 'about');
end
$$;

-- เจ้าของแนบหนังสือรับรองบริษัท (อัปโหลดไฟล์เข้า storage ก่อน แล้วส่ง path มา)
create or replace function public.set_company_certificate(p_company uuid, p_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_user();
  if not public.is_company_owner(p_company) then
    raise exception 'เฉพาะเจ้าของกิจการแนบเอกสารบริษัทได้';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_company::text then
    raise exception 'ตำแหน่งไฟล์ไม่ถูกต้อง';
  end if;
  update public.companies
     set cert_path = p_path,
         status = case when status = 'rejected' then 'pending'::public.company_status else status end,
         review_note = case when status = 'rejected' then null else review_note end
   where id = p_company;
  perform public.audit(p_company, 'company.certificate_uploaded', '{}'::jsonb);
end
$$;

create or replace function public.set_quiet_consent(p_company uuid, p_consent boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := public.require_user();
begin
  update public.company_members set after_hours_consent = coalesce(p_consent, false)
   where company_id = p_company and user_id = v_user and status = 'active';
  if not found then
    raise exception 'คุณไม่ได้เป็นสมาชิกบริษัทนี้';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RPC: ตำแหน่งและสิทธิ์
create or replace function public.create_position(
  p_company uuid, p_parent uuid, p_title text, p_is_department boolean default false, p_grants jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_my uuid := public.member_position(p_company, v_user);
  v_owner boolean := public.user_is_owner(v_user, p_company);
  v_id uuid;
  k text;
  v jsonb;
begin
  if v_my is null then
    raise exception 'คุณไม่ได้เป็นสมาชิกบริษัทนี้';
  end if;
  if not v_owner and public.user_perm_level(v_user, p_company, 'members') = 0 then
    raise exception 'ตำแหน่งของคุณไม่มีสิทธิ์จัดการทีม';
  end if;
  if not exists (select 1 from public.positions where id = p_parent and company_id = p_company) then
    raise exception 'ไม่พบตำแหน่งแม่';
  end if;
  if not (v_owner or p_parent = v_my or public.can_manage_position(p_company, p_parent)) then
    raise exception 'สร้างตำแหน่งได้เฉพาะใต้ตำแหน่งของคุณหรือตำแหน่งที่คุณดูแล';
  end if;
  for k, v in select * from jsonb_each(coalesce(p_grants, '{}'::jsonb)) loop
    if not v_owner and (v #>> '{}')::int > public.user_perm_level(v_user, p_company, k) then
      raise exception 'ให้สิทธิ์เกินกว่าที่คุณมีไม่ได้ (%)', k;
    end if;
  end loop;
  insert into public.positions (company_id, parent_id, title, is_department, grants)
  values (p_company, p_parent, trim(p_title), coalesce(p_is_department, false), coalesce(p_grants, '{}'::jsonb))
  returning id into v_id;
  perform public.audit(p_company, 'position.created', jsonb_build_object('position_id', v_id, 'title', trim(p_title), 'grants', p_grants));
  return v_id;
end
$$;

create or replace function public.update_position(p_position uuid, p_title text, p_is_department boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid;
begin
  perform public.require_user();
  select company_id into v_company from public.positions where id = p_position;
  if v_company is null then
    raise exception 'ไม่พบตำแหน่ง';
  end if;
  if not public.can_manage_position(v_company, p_position) then
    raise exception 'แก้ได้เฉพาะตำแหน่งที่อยู่ต่ำกว่าคุณ';
  end if;
  update public.positions set title = coalesce(nullif(trim(p_title), ''), title),
                              is_department = coalesce(p_is_department, is_department)
   where id = p_position;
  perform public.audit(v_company, 'position.updated', jsonb_build_object('position_id', p_position, 'title', p_title, 'is_department', p_is_department));
end
$$;

create or replace function public.set_position_grant(p_position uuid, p_perm text, p_level int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_company uuid;
  v_parent uuid;
  v_title text;
begin
  select company_id, parent_id, title into v_company, v_parent, v_title from public.positions where id = p_position;
  if v_company is null then
    raise exception 'ไม่พบตำแหน่ง';
  end if;
  if not (p_perm = any (public.perm_keys())) then
    raise exception 'ไม่รู้จักสิทธิ์ %', p_perm;
  end if;
  if p_level not in (0, 1, 2) then
    raise exception 'ระดับสิทธิ์ต้องเป็น 0, 1 หรือ 2';
  end if;
  if v_parent is null then
    raise exception 'เจ้าของกิจการมีทุกสิทธิ์อยู่แล้ว แก้ไม่ได้';
  end if;
  if p_perm = 'billing' and p_level > 0 then
    raise exception 'การชำระเงินเป็นสิทธิ์ของเจ้าของกิจการเท่านั้น';
  end if;
  if not public.can_manage_position(v_company, p_position) then
    raise exception 'ตั้งสิทธิ์ได้เฉพาะตำแหน่งที่อยู่ต่ำกว่าคุณ';
  end if;
  if not public.user_is_owner(v_user, v_company) and p_level > public.user_perm_level(v_user, v_company, p_perm) then
    raise exception 'ให้สิทธิ์เกินกว่าที่คุณมีไม่ได้';
  end if;
  update public.positions set grants = grants || jsonb_build_object(p_perm, p_level) where id = p_position;
  -- ลดตามลงไปทั้งสาย
  update public.positions set grants = grants || jsonb_build_object(p_perm, p_level)
   where id in (select d.id from public.position_descendants(p_position) d)
     and coalesce((grants ->> p_perm)::int, 0) > p_level;
  perform public.audit(v_company, 'position.grant', jsonb_build_object('position_id', p_position, 'title', v_title, 'perm', p_perm, 'level', p_level));
end
$$;

create or replace function public.delete_position(p_position uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid; v_title text;
begin
  perform public.require_user();
  select company_id, title into v_company, v_title from public.positions where id = p_position;
  if v_company is null then
    raise exception 'ไม่พบตำแหน่ง';
  end if;
  if not public.can_manage_position(v_company, p_position) then
    raise exception 'ลบได้เฉพาะตำแหน่งที่อยู่ต่ำกว่าคุณ';
  end if;
  if exists (select 1 from public.positions where parent_id = p_position) then
    raise exception 'ย้ายหรือลบตำแหน่งย่อยก่อน';
  end if;
  if exists (select 1 from public.company_members where position_id = p_position and status = 'active') then
    raise exception 'ย้ายสมาชิกออกจากตำแหน่งนี้ก่อน';
  end if;
  delete from public.company_members where position_id = p_position and status = 'removed';
  delete from public.positions where id = p_position;
  perform public.audit(v_company, 'position.deleted', jsonb_build_object('title', v_title));
end
$$;

-- ผังตัวอย่างสำหรับ SME (เจ้าของเรียกครั้งเดียวตอนเริ่ม)
create or replace function public.apply_org_template(p_company uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_root uuid; v_head uuid;
begin
  perform public.require_user();
  if not public.is_company_owner(p_company) then
    raise exception 'เฉพาะเจ้าของกิจการใช้ผังตัวอย่างได้';
  end if;
  select id into v_root from public.positions where company_id = p_company and parent_id is null;
  if exists (select 1 from public.positions where company_id = p_company and parent_id is not null) then
    raise exception 'บริษัทนี้มีตำแหน่งอยู่แล้ว';
  end if;
  insert into public.positions (company_id, parent_id, title, is_department, grants) values
    (p_company, v_root, 'HR และธุรการ', false,
     '{"team":2,"post":2,"screen":2,"members":2,"announce":2,"offer":0,"approve_post":0,"leave":0}'::jsonb);
  insert into public.positions (company_id, parent_id, title, is_department, grants) values
    (p_company, v_root, 'หัวหน้าแผนก (ตัวอย่าง)', true,
     '{"team":1,"post":1,"approve_post":1,"screen":1,"offer":1,"leave":1,"members":1,"announce":1}'::jsonb)
    returning id into v_head;
  insert into public.positions (company_id, parent_id, title, is_department, grants) values
    (p_company, v_head, 'พนักงาน', false, '{"team":1}'::jsonb);
  perform public.audit(p_company, 'org.template_applied', '{}'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- RPC: สมาชิก
create or replace function public.assign_member_position(p_company uuid, p_user uuid, p_position uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := public.require_user();
  v_owner boolean := public.user_is_owner(v_me, p_company);
  v_cur uuid := public.member_position(p_company, p_user);
  v_cur_root boolean;
  v_new_root boolean;
  v_title text;
begin
  if v_cur is null then
    raise exception 'ไม่พบสมาชิกคนนี้ในบริษัท';
  end if;
  select parent_id is null, title into v_new_root, v_title from public.positions where id = p_position and company_id = p_company;
  if v_new_root is null then
    raise exception 'ไม่พบตำแหน่ง';
  end if;
  select parent_id is null into v_cur_root from public.positions where id = v_cur;
  if v_new_root or v_cur_root then
    if not v_owner then
      raise exception 'เฉพาะเจ้าของกิจการแต่งตั้งหรือถอดเจ้าของได้';
    end if;
    if v_cur_root and not v_new_root and (select count(*) from public.company_owner_ids(p_company)) <= 1 then
      raise exception 'ต้องมีเจ้าของกิจการอย่างน้อย 1 คน แต่งตั้งเจ้าของคนใหม่ก่อน';
    end if;
  else
    if p_user = v_me and not v_owner then
      raise exception 'เปลี่ยนตำแหน่งตัวเองไม่ได้';
    end if;
    if not (public.can_manage_position(p_company, v_cur) and public.can_manage_position(p_company, p_position)) then
      raise exception 'ย้ายได้เฉพาะคนและตำแหน่งที่อยู่ต่ำกว่าคุณ';
    end if;
  end if;
  update public.company_members set position_id = p_position where company_id = p_company and user_id = p_user;
  perform public.audit(p_company, 'member.position', jsonb_build_object('user_id', p_user, 'position_id', p_position, 'title', v_title));
  perform public.notify(p_user, p_company, 'team_update', 'ตำแหน่งของคุณเปลี่ยนเป็น ' || v_title, '', '/c/' || p_company || '/team');
end
$$;

create or replace function public.remove_member(p_company uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := public.require_user();
  v_cur uuid := public.member_position(p_company, p_user);
  v_root boolean;
begin
  if v_cur is null then
    raise exception 'ไม่พบสมาชิกคนนี้ในบริษัท';
  end if;
  if p_user = v_me then
    raise exception 'ใช้ปุ่มออกจากบริษัทแทน';
  end if;
  select parent_id is null into v_root from public.positions where id = v_cur;
  if v_root then
    if not public.user_is_owner(v_me, p_company) then
      raise exception 'เฉพาะเจ้าของกิจการถอดเจ้าของได้';
    end if;
  elsif not public.can_manage_position(p_company, v_cur) then
    raise exception 'นำออกได้เฉพาะคนที่อยู่ต่ำกว่าคุณ';
  end if;
  update public.company_members set status = 'removed', removed_at = now()
   where company_id = p_company and user_id = p_user;
  perform public.audit(p_company, 'member.removed', jsonb_build_object('user_id', p_user));
end
$$;

create or replace function public.leave_company(p_company uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := public.require_user();
begin
  if public.user_is_owner(v_me, p_company) and (select count(*) from public.company_owner_ids(p_company)) <= 1 then
    raise exception 'คุณเป็นเจ้าของคนเดียว แต่งตั้งเจ้าของคนใหม่ก่อนออก';
  end if;
  update public.company_members set status = 'removed', removed_at = now()
   where company_id = p_company and user_id = v_me and status = 'active';
  if not found then
    raise exception 'คุณไม่ได้เป็นสมาชิกบริษัทนี้';
  end if;
  perform public.audit(p_company, 'member.left', jsonb_build_object('user_id', v_me));
end
$$;

-- ---------------------------------------------------------------------------
-- RPC: คำเชิญ
create or replace function public.new_invite_code()
returns text language plpgsql volatile set search_path = public, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := 'WD';
    for i in 0..7 loop
      v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.company_invites ci where ci.code = v_code);
  end loop;
  return v_code;
end
$$;
revoke execute on function public.new_invite_code() from public, anon, authenticated;

create or replace function public.create_invite(
  p_company uuid, p_position uuid, p_email text default null, p_days int default 7, p_max_uses int default 50, p_note text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_code text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not exists (select 1 from public.positions where id = p_position and company_id = p_company) then
    raise exception 'ไม่พบตำแหน่ง';
  end if;
  if not (public.is_company_owner(p_company) or public.can_manage_position(p_company, p_position)) then
    raise exception 'เชิญได้เฉพาะเข้าตำแหน่งที่อยู่ต่ำกว่าคุณ';
  end if;
  if (select parent_id is null from public.positions where id = p_position) and not public.is_company_owner(p_company) then
    raise exception 'เฉพาะเจ้าของกิจการเชิญเจ้าของร่วมได้';
  end if;
  v_code := public.new_invite_code();
  insert into public.company_invites (company_id, position_id, code, email, note, created_by, expires_at, max_uses)
  values (p_company, p_position, v_code, v_email, p_note, v_user,
          now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30)),
          case when v_email is not null then 1 else least(greatest(coalesce(p_max_uses, 50), 1), 500) end);
  perform public.audit(p_company, 'invite.created', jsonb_build_object('position_id', p_position, 'email', v_email));
  return v_code;
end
$$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid; v_position uuid;
begin
  perform public.require_user();
  select company_id, position_id into v_company, v_position from public.company_invites where id = p_invite;
  if v_company is null then
    raise exception 'ไม่พบคำเชิญ';
  end if;
  if not (public.is_company_owner(v_company) or public.can_manage_position(v_company, v_position)) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกคำเชิญนี้';
  end if;
  update public.company_invites set revoked_at = now() where id = p_invite;
  perform public.audit(v_company, 'invite.revoked', jsonb_build_object('invite_id', p_invite));
end
$$;

create or replace function public.invite_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', c.name,
      'company_status', c.status,
      'position_title', p.title,
      'for_email', i.email is not null,
      'valid', i.revoked_at is null and i.expires_at > now() and i.uses < i.max_uses,
      'expires_at', i.expires_at)
    from public.company_invites i
    join public.companies c on c.id = i.company_id
    join public.positions p on p.id = i.position_id
    where i.code = upper(trim(p_code))), jsonb_build_object('valid', false));
$$;
grant execute on function public.invite_preview(text) to anon, authenticated;

create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  inv public.company_invites;
  v_email text;
  v_name text;
  v_existing text;
begin
  select * into inv from public.company_invites where code = upper(trim(p_code)) for update;
  if not found or inv.revoked_at is not null or inv.expires_at <= now() or inv.uses >= inv.max_uses then
    raise exception 'ลิงก์เชิญหมดอายุหรือถูกยกเลิกแล้ว ขอลิงก์ใหม่จากหัวหน้าหรือ HR';
  end if;
  select email into v_email from auth.users where id = v_user;
  if inv.email is not null and lower(coalesce(v_email, '')) <> inv.email then
    raise exception 'คำเชิญนี้ส่งถึงอีเมลอื่น เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ';
  end if;
  select status into v_existing from public.company_members where company_id = inv.company_id and user_id = v_user;
  if v_existing = 'active' then
    raise exception 'คุณเป็นสมาชิกบริษัทนี้อยู่แล้ว';
  end if;
  select display_name into v_name from public.profiles where id = v_user;
  if v_existing = 'removed' then
    update public.company_members
       set status = 'active', position_id = inv.position_id, removed_at = null, joined_at = now(), display_name = coalesce(v_name, '')
     where company_id = inv.company_id and user_id = v_user;
  else
    insert into public.company_members (company_id, user_id, position_id, display_name)
    values (inv.company_id, v_user, inv.position_id, coalesce(v_name, ''));
  end if;
  update public.company_invites set uses = uses + 1 where id = inv.id;
  perform public.audit(inv.company_id, 'member.joined', jsonb_build_object('user_id', v_user, 'position_id', inv.position_id));
  if inv.created_by is not null then
    perform public.notify(inv.created_by, inv.company_id, 'team_update', coalesce(nullif(v_name, ''), 'สมาชิกใหม่') || ' เข้าร่วมทีมแล้ว', '', '/c/' || inv.company_id || '/team');
  end if;
  return inv.company_id;
end
$$;

-- คำเชิญที่ส่งถึงอีเมลของฉันและยังใช้ได้
create or replace function public.my_pending_invites()
returns table (code text, company_name text, position_title text, expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.code, c.name, p.title, i.expires_at
  from public.company_invites i
  join public.companies c on c.id = i.company_id
  join public.positions p on p.id = i.position_id
  where i.email = (select lower(email) from auth.users where id = auth.uid())
    and i.revoked_at is null and i.expires_at > now() and i.uses < i.max_uses
    and not exists (select 1 from public.company_members m
                    where m.company_id = i.company_id and m.user_id = auth.uid() and m.status = 'active');
$$;

-- พื้นที่ที่ฉันเข้าได้ (หน้าเลือกพื้นที่)
create or replace function public.my_spaces()
returns table (company_id uuid, company_name text, company_status public.company_status, position_title text, is_owner boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.name, c.status, p.title, p.parent_id is null
  from public.company_members m
  join public.companies c on c.id = m.company_id
  join public.positions p on p.id = m.position_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.joined_at;
$$;

-- สิทธิ์ของฉันในบริษัท (ใช้ซ่อน/แสดงเมนู)
create or replace function public.my_company_access(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_pos uuid := public.member_position(p_company, v_user);
  result jsonb := '{}'::jsonb;
  k text;
begin
  if v_pos is null then
    return null;
  end if;
  foreach k in array public.perm_keys() loop
    result := result || jsonb_build_object(k, public.user_perm_level(v_user, p_company, k));
  end loop;
  return jsonb_build_object(
    'position_id', v_pos,
    'position_title', (select title from public.positions where id = v_pos),
    'department_id', public.dept_of(v_pos),
    'is_owner', public.user_is_owner(v_user, p_company),
    'perms', result,
    'company', (select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'quiet_start', c.quiet_start, 'quiet_end', c.quiet_end) from public.companies c where c.id = p_company));
end
$$;

-- ---------------------------------------------------------------------------
-- RPC: กฎการอนุมัติ (เจ้าของเท่านั้น)
create or replace function public.set_approval_rule(p_company uuid, p_rule text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_user();
  if not public.is_company_owner(p_company) then
    raise exception 'เฉพาะเจ้าของกิจการเปลี่ยนกฎการอนุมัติได้';
  end if;
  insert into public.approval_rules (company_id, rule, enabled) values (p_company, p_rule, p_enabled)
  on conflict (company_id, rule) do update set enabled = excluded.enabled;
  perform public.audit(p_company, 'approval_rule.updated', jsonb_build_object('rule', p_rule, 'enabled', p_enabled));
end
$$;
