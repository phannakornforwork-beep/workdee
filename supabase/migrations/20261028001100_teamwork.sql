-- WorkDee · 11 งานของทีม: โปรเจกต์ งานที่มอบหมาย และการลา (อยู่ในพื้นที่บริษัทเท่านั้น)
-- Team work: projects, tasks and leave requests. Visibility follows the "team" permission:
-- level 1 = people in my department, level 2 = whole company. Everyone sees their own items.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  due_date date,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index projects_company_idx on public.projects (company_id, status);
alter table public.projects enable row level security;
create policy "projects: members read" on public.projects for select using (public.is_company_member(company_id));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (char_length(title) between 2 and 200),
  detail text not null default '' check (char_length(detail) <= 4000),
  assignee_id uuid references auth.users (id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'review', 'blocked', 'done')),
  blocked_note text,
  due_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index tasks_company_idx on public.tasks (company_id, status);
create index tasks_assignee_idx on public.tasks (assignee_id);
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
alter table public.tasks enable row level security;

create table public.task_follows (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (task_id, user_id)
);
alter table public.task_follows enable row level security;
create policy "task_follows: own" on public.task_follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  leave_type text not null check (leave_type in ('sick', 'personal', 'vacation', 'other')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  reason text not null default '' check (char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_dates check (end_date >= start_date and end_date - start_date <= 60)
);
create index leave_requests_company_idx on public.leave_requests (company_id, start_date);
alter table public.leave_requests enable row level security;

-- เห็นงานของเพื่อนร่วมงานคนนี้ได้ไหม
create or replace function public.can_see_member_work(p_company uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    p_user = auth.uid()
    or (public.is_company_member(p_company)
        and public.member_position(p_company, p_user) is not null
        and public.has_perm(p_company, 'team', public.member_position(p_company, p_user))));
$$;

create policy "tasks: visible work" on public.tasks for select using (
  public.is_company_member(company_id)
  and (assignee_id = auth.uid() or created_by = auth.uid()
       or (assignee_id is not null and public.can_see_member_work(company_id, assignee_id))));

create or replace function public.can_see_leave(p_company uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    p_user = auth.uid()
    or (public.is_company_member(p_company)
        and (public.has_perm(p_company, 'leave', public.member_position(p_company, p_user))
             or public.can_see_member_work(p_company, p_user))));
$$;

create policy "leave_requests: visible" on public.leave_requests for select using (public.can_see_leave(company_id, user_id));

-- ---------------------------------------------------------------------------
create or replace function public.save_project(p_company uuid, p_project uuid, p_name text, p_description text default '', p_due date default null, p_status text default 'active')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform public.require_user();
  if not public.has_perm(p_company, 'team') then
    raise exception 'ตำแหน่งของคุณสร้างหรือแก้โปรเจกต์ไม่ได้';
  end if;
  if p_project is null then
    insert into public.projects (company_id, name, description, due_date, status, created_by)
    values (p_company, trim(p_name), coalesce(p_description, ''), p_due, coalesce(p_status, 'active'), auth.uid())
    returning id into v_id;
  else
    update public.projects set name = trim(p_name), description = coalesce(p_description, ''), due_date = p_due, status = coalesce(p_status, status)
     where id = p_project and company_id = p_company returning id into v_id;
    if v_id is null then
      raise exception 'ไม่พบโปรเจกต์';
    end if;
  end if;
  return v_id;
end
$$;

create or replace function public.save_task(p_company uuid, p_task uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  t public.tasks;
  v_assignee uuid;
  v_id uuid;
  v_name text;
begin
  if not public.is_company_member(p_company) then
    raise exception 'คุณไม่ได้เป็นสมาชิกบริษัทนี้';
  end if;
  v_assignee := coalesce(nullif(p_fields ->> 'assignee_id', '')::uuid, v_user);
  if public.member_position(p_company, v_assignee) is null then
    raise exception 'ผู้รับผิดชอบต้องเป็นสมาชิกบริษัท';
  end if;
  if p_fields ? 'project_id' and nullif(p_fields ->> 'project_id', '') is not null
     and not exists (select 1 from public.projects where id = (p_fields ->> 'project_id')::uuid and company_id = p_company) then
    raise exception 'ไม่พบโปรเจกต์';
  end if;
  if p_task is null then
    if v_assignee <> v_user and not public.can_see_member_work(p_company, v_assignee) then
      raise exception 'มอบหมายงานได้เฉพาะคนในขอบเขตทีมของคุณ';
    end if;
    insert into public.tasks (company_id, project_id, title, detail, assignee_id, status, blocked_note, due_date, created_by)
    values (p_company, nullif(p_fields ->> 'project_id', '')::uuid, trim(coalesce(p_fields ->> 'title', '')), coalesce(p_fields ->> 'detail', ''),
            v_assignee, coalesce(nullif(p_fields ->> 'status', ''), 'todo'), nullif(p_fields ->> 'blocked_note', ''),
            nullif(p_fields ->> 'due_date', '')::date, v_user)
    returning id into v_id;
    if v_assignee <> v_user then
      select display_name into v_name from public.profiles where id = v_user;
      perform public.notify(v_assignee, p_company, 'team_update', 'งานใหม่จาก ' || coalesce(v_name, ''), trim(p_fields ->> 'title'), '/c/' || p_company || '/work');
    end if;
    return v_id;
  end if;
  select * into t from public.tasks where id = p_task and company_id = p_company for update;
  if t.id is null then
    raise exception 'ไม่พบงาน';
  end if;
  if not (t.assignee_id = v_user or t.created_by = v_user or (t.assignee_id is not null and public.can_see_member_work(p_company, t.assignee_id))) then
    raise exception 'แก้ได้เฉพาะงานของคุณหรือคนในทีมที่คุณดูแล';
  end if;
  if v_assignee <> coalesce(t.assignee_id, v_assignee) and v_assignee <> v_user and not public.can_see_member_work(p_company, v_assignee) then
    raise exception 'มอบหมายงานได้เฉพาะคนในขอบเขตทีมของคุณ';
  end if;
  update public.tasks set
    title = case when p_fields ? 'title' then trim(p_fields ->> 'title') else title end,
    detail = case when p_fields ? 'detail' then coalesce(p_fields ->> 'detail', '') else detail end,
    project_id = case when p_fields ? 'project_id' then nullif(p_fields ->> 'project_id', '')::uuid else project_id end,
    assignee_id = case when p_fields ? 'assignee_id' then v_assignee else assignee_id end,
    status = case when p_fields ? 'status' then p_fields ->> 'status' else status end,
    blocked_note = case when p_fields ? 'blocked_note' then nullif(p_fields ->> 'blocked_note', '') else blocked_note end,
    due_date = case when p_fields ? 'due_date' then nullif(p_fields ->> 'due_date', '')::date else due_date end,
    done_at = case when p_fields ->> 'status' = 'done' then now() when p_fields ? 'status' then null else done_at end
  where id = p_task;
  return p_task;
end
$$;

create or replace function public.delete_task(p_task uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.tasks;
begin
  perform public.require_user();
  select * into t from public.tasks where id = p_task;
  if t.id is null or not (t.created_by = auth.uid() or public.is_company_owner(t.company_id)) then
    raise exception 'ลบได้เฉพาะงานที่คุณสร้าง';
  end if;
  delete from public.tasks where id = p_task;
end
$$;

-- ภาพรวม "ใครทำอะไรอยู่" ตามสิทธิ์ team ของผู้เรียก
create or replace function public.team_work(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if not public.is_company_member(p_company) then
    return null;
  end if;
  return jsonb_build_object(
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'due_date', p.due_date, 'status', p.status,
        'total', (select count(*) from public.tasks t where t.project_id = p.id),
        'done', (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'done'),
        'blocked', (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'blocked')) order by p.due_date nulls last), '[]'::jsonb)
      from public.projects p where p.company_id = p_company and p.status = 'active'),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'detail', t.detail, 'status', t.status,
        'blocked_note', t.blocked_note, 'due_date', t.due_date, 'project_id', t.project_id,
        'project_name', (select name from public.projects where id = t.project_id),
        'assignee_id', t.assignee_id, 'assignee_name', m.display_name,
        'position_title', (select title from public.positions where id = m.position_id),
        'department_title', (select title from public.positions where id = public.dept_of(m.position_id)),
        'followed', exists (select 1 from public.task_follows f where f.task_id = t.id and f.user_id = v_user),
        'mine', t.assignee_id = v_user) order by t.due_date nulls last, t.created_at), '[]'::jsonb)
      from public.tasks t
      left join public.company_members m on m.company_id = t.company_id and m.user_id = t.assignee_id
      where t.company_id = p_company and t.status <> 'done'
        and (t.assignee_id = v_user or t.created_by = v_user or (t.assignee_id is not null and public.can_see_member_work(p_company, t.assignee_id)))),
    'leave_today', (select coalesce(jsonb_agg(jsonb_build_object('user_id', l.user_id, 'display_name', m.display_name, 'leave_type', l.leave_type,
        'start_date', l.start_date, 'end_date', l.end_date, 'status', l.status)), '[]'::jsonb)
      from public.leave_requests l join public.company_members m on m.company_id = l.company_id and m.user_id = l.user_id
      where l.company_id = p_company and l.status in ('approved', 'pending')
        and (now() at time zone 'Asia/Bangkok')::date between l.start_date and l.end_date
        and (l.user_id = v_user or public.can_see_member_work(p_company, l.user_id))),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name,
        'position_title', p.title) order by m.display_name), '[]'::jsonb)
      from public.company_members m join public.positions p on p.id = m.position_id
      where m.company_id = p_company and m.status = 'active' and (m.user_id = v_user or public.can_see_member_work(p_company, m.user_id))));
end
$$;

-- ---------------------------------------------------------------------------
-- ลางาน: หัวหน้าโดยตรงอนุมัติ (ถ้าเปิดกฎ)
create or replace function public.request_leave(p_company uuid, p_type text, p_start date, p_end date, p_reason text default '', p_half_day boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_pos uuid := public.member_position(p_company, v_user);
  v_dept uuid;
  v_approver uuid;
  v_id uuid;
  v_name text;
  v_req uuid;
begin
  if v_pos is null then
    raise exception 'คุณไม่ได้เป็นสมาชิกบริษัทนี้';
  end if;
  if p_end < p_start then
    raise exception 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
  end if;
  insert into public.leave_requests (company_id, user_id, leave_type, start_date, end_date, half_day, reason)
  values (p_company, v_user, p_type, p_start, p_end, coalesce(p_half_day, false), left(coalesce(p_reason, ''), 1000))
  returning id into v_id;
  if not public.rule_on(p_company, 'leave_needs_head') or public.user_is_owner(v_user, p_company) then
    update public.leave_requests set status = 'approved', decided_at = now() where id = v_id;
    return v_id;
  end if;
  v_dept := public.dept_of(v_pos);
  if v_dept = v_pos then
    -- เป็นหัวหน้าแผนกเอง → หัวหน้าถัดขึ้นไป
    select public.dept_of(parent_id) into v_approver from public.positions where id = v_pos;
  else
    v_approver := v_dept;
  end if;
  select display_name into v_name from public.profiles where id = v_user;
  insert into public.approval_requests (company_id, kind, ref_id, title, requested_by, requested_by_name, approver_position_id)
  values (p_company, 'leave', v_id,
          'การลา: ' || coalesce(v_name, '') || ' · ' || to_char(p_start, 'DD/MM') || case when p_end > p_start then '–' || to_char(p_end, 'DD/MM') else '' end,
          v_user, coalesce(v_name, ''), coalesce(v_approver, (select id from public.positions where company_id = p_company and parent_id is null)))
  returning id into v_req;
  perform public.notify_approvers(v_req);
  return v_id;
end
$$;

create or replace function public.cancel_leave(p_leave uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.leave_requests set status = 'cancelled' where id = p_leave and user_id = public.require_user() and status in ('pending', 'approved');
  if not found then
    raise exception 'ยกเลิกการลานี้ไม่ได้';
  end if;
  update public.approval_requests set status = 'cancelled' where kind = 'leave' and ref_id = p_leave and status = 'pending';
end
$$;

-- ขยาย decide_approval ให้รองรับการลา
create or replace function public.apply_leave_decision()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind = 'leave' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    update public.leave_requests set status = new.status, decided_by = new.decided_by, decided_at = new.decided_at where id = new.ref_id;
  end if;
  return new;
end
$$;
revoke execute on function public.apply_leave_decision() from public, anon, authenticated;
create trigger approval_requests_leave after update of status on public.approval_requests
  for each row execute function public.apply_leave_decision();
