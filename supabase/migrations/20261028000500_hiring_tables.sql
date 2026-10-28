-- WorkDee · 05 การจ้างงาน: ประกาศ โจทย์ ใบสมัคร คะแนน สัมภาษณ์ ข้อเสนอ ข้อความสำเร็จรูป
-- Hiring tables, helpers, RLS and public views.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  department_id uuid not null,
  title text not null check (char_length(title) between 2 and 120),
  job_type public.job_type not null default 'full_time',
  description text not null default '' check (char_length(description) <= 8000),
  responsibilities text not null default '' check (char_length(responsibilities) <= 4000),
  requirements text not null default '' check (char_length(requirements) <= 4000),
  skills text[] not null default '{}',
  province text check (province is null or char_length(province) <= 80),
  work_mode text not null default 'onsite' check (work_mode in ('onsite', 'hybrid', 'remote')),
  salary_min int check (salary_min is null or salary_min >= 0),
  salary_max int check (salary_max is null or salary_max >= 0),
  pay_unit text not null default 'month' check (pay_unit in ('month', 'day', 'hour', 'project')),
  gig_days int check (gig_days is null or gig_days between 1 and 365),
  gig_start date,
  gig_end date,
  headcount int not null default 1 check (headcount between 1 and 500),
  challenge_seats int not null default 10 check (challenge_seats between 1 and 200),
  status public.job_status not null default 'draft',
  approval_note text,
  published_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (company_id, department_id) references public.positions (company_id, id) on delete restrict,
  constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max),
  constraint jobs_gig_dates check (gig_start is null or gig_end is null or gig_start <= gig_end)
);
create index jobs_company_idx on public.jobs (company_id, status);
create index jobs_open_idx on public.jobs (published_at desc) where status = 'open';
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();
alter table public.jobs enable row level security;

create table public.challenges (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  brief text not null check (char_length(brief) between 20 and 6000),
  deliverable text not null default '' check (char_length(deliverable) <= 2000),
  time_limit_minutes int not null default 60 check (time_limit_minutes between 10 and 480),
  due_days int not null default 3 check (due_days between 1 and 7),
  criteria jsonb not null default '[]'::jsonb,
  ai_policy text not null default 'allowed_declare' check (ai_policy in ('not_allowed', 'allowed_declare', 'encouraged')),
  skill_key text check (skill_key is null or skill_key ~ '^[a-z0-9-]{2,40}$'),
  accept_reuse boolean not null default true,
  reuse_min_score int not null default 75 check (reuse_min_score between 50 and 100),
  updated_at timestamptz not null default now()
);
create trigger challenges_touch before update on public.challenges for each row execute function public.touch_updated_at();
alter table public.challenges enable row level security;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  company_id uuid not null,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  candidate_name text not null default '',
  stage public.app_stage not null default 'applied',
  stage_entered_at timestamptz not null default now(),
  sla_due_at timestamptz,          -- บริษัทต้องตอบภายใน (null = รอผู้สมัคร หรือปิดแล้ว)
  candidate_due_at timestamptz,    -- ผู้สมัครต้องทำภายใน (ส่งโจทย์ เลือกเวลาสัมภาษณ์ ตอบข้อเสนอ)
  warned_at timestamptz,           -- เตือนวันที่ 5 ของขั้นนี้แล้ว
  escalated_at timestamptz,        -- แจ้งเจ้าของวันที่ 6 ของขั้นนี้แล้ว
  profile_snapshot jsonb,          -- null หลังผู้สมัครถอนและถอนสิทธิ์เข้าถึง
  verify_level public.verify_level not null default 'none',
  intro_message text not null default '' check (char_length(intro_message) <= 2000),
  expected_salary int check (expected_salary is null or expected_salary between 0 and 1000000),
  share_plan boolean not null default false,
  match_score int not null default 0 check (match_score between 0 and 100),
  source text not null default 'apply' check (source in ('apply', 'invitation')),
  challenge_invited_at timestamptz,
  reject_reasons text[],
  reject_note text,
  rejected_by uuid references auth.users (id) on delete set null,
  closed_by_system boolean not null default false,
  closed_at timestamptz,
  withdraw_reason text,
  access_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id),
  foreign key (job_id, company_id) references public.jobs (id, company_id) on delete cascade
);
create index applications_company_idx on public.applications (company_id, stage);
create index applications_candidate_idx on public.applications (candidate_id, created_at desc);
create index applications_sla_idx on public.applications (sla_due_at) where sla_due_at is not null;
create index applications_cand_due_idx on public.applications (candidate_due_at) where candidate_due_at is not null;
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();
alter table public.applications enable row level security;

create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications (id) on delete cascade,
  kind text not null,
  actor_kind text not null check (actor_kind in ('candidate', 'company', 'system')),
  actor_name text not null default '',
  message text not null default '',
  data jsonb not null default '{}'::jsonb,
  visible_to_candidate boolean not null default true,
  batch_id uuid,
  visible_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, created_at);
create index application_events_batch_idx on public.application_events (batch_id) where batch_id is not null;
alter table public.application_events enable row level security;

create table public.challenge_submissions (
  application_id uuid primary key references public.applications (id) on delete cascade,
  answer text not null default '' check (char_length(answer) <= 20000),
  links text[] not null default '{}',
  file_paths text[] not null default '{}',
  ai_use text not null default 'none' check (ai_use in ('none', 'ideas', 'partial', 'heavy')),
  ai_detail text not null default '' check (char_length(ai_detail) <= 1000),
  reasoning text not null default '' check (char_length(reasoning) <= 4000),
  reused_from uuid references public.applications (id) on delete set null,
  started_at timestamptz,
  submitted_at timestamptz
);
alter table public.challenge_submissions enable row level security;

create table public.challenge_scores (
  application_id uuid primary key references public.applications (id) on delete cascade,
  scores jsonb not null,  -- [{name, weight, score}]
  total int not null check (total between 0 and 100),
  feedback text not null default '' check (char_length(feedback) <= 3000),
  reused boolean not null default false,
  graded_by uuid references auth.users (id) on delete set null,
  graded_by_name text not null default '',
  graded_at timestamptz not null default now()
);
alter table public.challenge_scores enable row level security;

create table public.application_notes (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
alter table public.application_notes enable row level security;

create table public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null default 'online' check (mode in ('online', 'onsite', 'phone')),
  location text not null default '' check (char_length(location) <= 300),
  meeting_url text check (meeting_url is null or char_length(meeting_url) <= 500),
  capacity int not null default 1 check (capacity between 1 and 20),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint interview_slot_time check (ends_at > starts_at)
);
create index interview_slots_company_idx on public.interview_slots (company_id, starts_at);
alter table public.interview_slots enable row level security;

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  offered_slot_ids uuid[] not null default '{}',
  slot_id uuid references public.interview_slots (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  mode text,
  location text,
  meeting_url text,
  status text not null default 'awaiting_candidate'
    check (status in ('awaiting_candidate', 'confirmed', 'reschedule_requested', 'cancelled', 'completed', 'no_show')),
  candidate_note text not null default '',
  batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_app_idx on public.interviews (application_id);
create trigger interviews_touch before update on public.interviews for each row execute function public.touch_updated_at();
alter table public.interviews enable row level security;

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  salary int not null check (salary between 0 and 10000000),
  pay_unit text not null default 'month' check (pay_unit in ('month', 'day', 'hour', 'project')),
  start_date date,
  note text not null default '' check (char_length(note) <= 3000),
  expires_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'sent', 'accepted', 'declined', 'expired', 'withdrawn')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  responded_at timestamptz,
  decline_reason text
);
alter table public.offers enable row level security;

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('reject', 'invite_challenge', 'invite_interview', 'message')),
  label text not null check (char_length(label) between 1 and 80),
  body text not null check (char_length(body) between 1 and 3000),
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index message_templates_company_idx on public.message_templates (company_id, kind);
alter table public.message_templates enable row level security;

create table public.action_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  kind text not null check (kind in ('reject', 'invite_challenge', 'invite_interview', 'message')),
  app_ids uuid[] not null,
  previous jsonb not null default '[]'::jsonb,
  reasons text[],
  message text,
  undo_until timestamptz not null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.action_batches enable row level security;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null,
  company_id uuid references public.companies (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index consents_user_idx on public.consents (user_id, granted_at desc);
alter table public.consents enable row level security;
create policy "consents: read own" on public.consents for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ฟังก์ชันช่วย
create or replace function public.job_department(p_job uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select department_id from public.jobs where id = p_job;
$$;

create or replace function public.can_screen_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.jobs j where j.id = p_job and public.has_perm(j.company_id, 'screen', j.department_id));
$$;

create or replace function public.can_screen_app(p_app uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id
                 where a.id = p_app and public.has_perm(j.company_id, 'screen', j.department_id));
$$;

create or replace function public.is_app_candidate(p_app uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications where id = p_app and candidate_id = auth.uid());
$$;

create or replace function public.has_applied(p_job uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications where job_id = p_job and candidate_id = auth.uid());
$$;

-- คนที่ดูแลผู้สมัครของประกาศนี้ (ได้รับแจ้งเตือน)
create or replace function public.job_screeners(p_job uuid)
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id from public.jobs j
  join public.company_members m on m.company_id = j.company_id and m.status = 'active'
  where j.id = p_job and public.user_has_perm(m.user_id, j.company_id, 'screen', j.department_id);
$$;
revoke execute on function public.job_screeners(uuid) from public, anon, authenticated;

create or replace function public.challenge_seats_used(p_job uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.applications
  where job_id = p_job and challenge_invited_at is not null and stage not in ('withdrawn', 'expired');
$$;

-- คะแนนความตรงกันระหว่างงานกับโปรไฟล์ 0–100
create or replace function public.compute_match(p_job uuid, p_user uuid)
returns int language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  j public.jobs;
  cp public.candidate_profiles;
  skill_score numeric := 0;
  total numeric := 0;
  have text[];
  need text[];
  hit int;
begin
  select * into j from public.jobs where id = p_job;
  select * into cp from public.candidate_profiles where user_id = p_user;
  if j.id is null or cp.user_id is null then
    return 0;
  end if;
  have := array(select lower(trim(x)) from unnest(cp.skills || cp.tools) x);
  need := array(select lower(trim(x)) from unnest(j.skills) x);
  if cardinality(need) > 0 then
    select count(*) into hit from unnest(need) n where n = any (have);
    skill_score := 55.0 * hit / cardinality(need);
  else
    skill_score := 30;
  end if;
  total := skill_score;
  if cardinality(cp.pref_job_types) = 0 or j.job_type = any (cp.pref_job_types) then
    total := total + 15;
  end if;
  if j.work_mode = 'remote' or cp.province is null or j.province is null or j.province = cp.province
     or j.province = any (cp.pref_provinces) then
    total := total + 15;
  end if;
  if cp.expected_salary is null or j.salary_max is null or j.pay_unit <> 'month' or cp.expected_salary <= j.salary_max then
    total := total + 10;
  end if;
  if public.best_verify_level(p_user) in ('doc', 'inst') then
    total := total + 5;
  end if;
  return least(100, greatest(0, round(total)))::int;
end
$$;
revoke execute on function public.compute_match(uuid, uuid) from public, anon, authenticated;

-- แทนคำในข้อความ {ชื่อ} {ตำแหน่ง} {บริษัท}
create or replace function public.fill_message(p_text text, p_app uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select replace(replace(replace(coalesce(p_text, ''),
           '{ชื่อ}', coalesce(nullif(split_part(trim(a.candidate_name), ' ', 1), ''), 'ผู้สมัคร')),
           '{ตำแหน่ง}', j.title),
           '{บริษัท}', c.name)
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = a.company_id
  where a.id = p_app;
$$;
revoke execute on function public.fill_message(text, uuid) from public, anon, authenticated;

create or replace function public.add_app_event(
  p_app uuid, p_kind text, p_actor_kind text, p_message text default '', p_data jsonb default '{}'::jsonb,
  p_visible boolean default true, p_batch uuid default null, p_visible_at timestamptz default now())
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  if p_actor_kind = 'system' then
    v_name := 'ระบบ WorkDee';
  else
    select display_name into v_name from public.profiles where id = auth.uid();
  end if;
  insert into public.application_events (application_id, kind, actor_kind, actor_name, message, data, visible_to_candidate, batch_id, visible_at)
  values (p_app, p_kind, p_actor_kind, coalesce(v_name, ''), coalesce(p_message, ''), coalesce(p_data, '{}'::jsonb), p_visible, p_batch, coalesce(p_visible_at, now()));
end
$$;
revoke execute on function public.add_app_event(uuid, text, text, text, jsonb, boolean, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
create policy "jobs: company members read" on public.jobs
  for select using (public.is_company_member(company_id) or public.has_applied(id) or public.is_platform_admin());

create policy "challenges: company members read" on public.challenges
  for select using (exists (select 1 from public.jobs j where j.id = job_id and public.is_company_member(j.company_id)));

create policy "applications: candidate or screener read" on public.applications
  for select using (candidate_id = auth.uid() or public.can_screen_job(job_id));

create policy "application_events: read" on public.application_events
  for select using (
    public.can_screen_app(application_id)
    or (visible_to_candidate and visible_at <= now() and public.is_app_candidate(application_id)));

create policy "challenge_submissions: read" on public.challenge_submissions
  for select using (public.is_app_candidate(application_id) or public.can_screen_app(application_id));

create policy "challenge_scores: read" on public.challenge_scores
  for select using (public.is_app_candidate(application_id) or public.can_screen_app(application_id));

create policy "application_notes: screeners read" on public.application_notes
  for select using (public.can_screen_app(application_id));

create policy "interview_slots: company read" on public.interview_slots
  for select using (public.has_perm(company_id, 'screen'));

create policy "interviews: read" on public.interviews
  for select using (public.is_app_candidate(application_id) or public.can_screen_app(application_id));

create policy "offers: read" on public.offers
  for select using (
    public.can_screen_app(application_id)
    or (public.is_app_candidate(application_id) and status in ('sent', 'accepted', 'declined', 'expired')));

create policy "message_templates: members read" on public.message_templates
  for select using (public.is_company_member(company_id));

create policy "action_batches: screeners read" on public.action_batches
  for select using (public.has_perm(company_id, 'screen'));

-- ---------------------------------------------------------------------------
-- ข้อความสำเร็จรูปเริ่มต้นของทุกบริษัท
create or replace function public.seed_company_defaults()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.message_templates (company_id, kind, label, body, is_default) values
    (new.id, 'reject', 'ขอบคุณที่สนใจ (มาตรฐาน)',
     'สวัสดีค่ะคุณ{ชื่อ} ขอบคุณที่สนใจตำแหน่ง{ตำแหน่ง} กับ{บริษัท} รอบนี้เราขอไม่ไปต่อในขั้นถัดไป ตามเหตุผลด้านล่าง ข้อมูลและผลงานของคุณยังอยู่ในโปรไฟล์ ใช้สมัครงานอื่นได้ทันทีค่ะ', true),
    (new.id, 'reject', 'ตำแหน่งได้คนแล้ว',
     'สวัสดีค่ะคุณ{ชื่อ} ตำแหน่ง{ตำแหน่ง} ได้ผู้ร่วมงานแล้ว ขอบคุณที่สนใจ{บริษัท}ค่ะ ระบบแนะนำงานที่ใกล้เคียงให้คุณแล้ว', true),
    (new.id, 'invite_challenge', 'เชิญเข้ารอบโจทย์',
     'สวัสดีค่ะคุณ{ชื่อ} ยินดีด้วยค่ะ คุณผ่านคัดเบื้องต้นตำแหน่ง{ตำแหน่ง} ขอเชิญทำโจทย์สั้นๆ กดเริ่มได้จากหน้าใบสมัครใน WorkDee', true),
    (new.id, 'invite_interview', 'เชิญสัมภาษณ์ ให้เลือกเวลาเอง',
     'สวัสดีค่ะคุณ{ชื่อ} ขอเชิญสัมภาษณ์ตำแหน่ง{ตำแหน่ง} กับ{บริษัท} เลือกเวลาที่สะดวกได้จากหน้าใบสมัครใน WorkDee ภายใน 2 วันค่ะ', true),
    (new.id, 'message', 'ขอเอกสารเพิ่ม',
     'สวัสดีค่ะคุณ{ชื่อ} รบกวนส่งสำเนาใบรับรองผลการศึกษาเพิ่มเติมภายในวันศุกร์นี้ค่ะ', true),
    (new.id, 'message', 'แจ้งผลผ่านรอบ',
     'สวัสดีค่ะคุณ{ชื่อ} ยินดีด้วยค่ะ คุณผ่านรอบนี้ของตำแหน่ง{ตำแหน่ง} ทีม{บริษัท}จะติดต่อขั้นต่อไปภายใน 2 วัน', true);
  return new;
end
$$;
revoke execute on function public.seed_company_defaults() from public, anon, authenticated;
create trigger companies_seed_defaults after insert on public.companies
  for each row execute function public.seed_company_defaults();

-- ---------------------------------------------------------------------------
-- มุมมองสาธารณะ (เปิดให้ทุกคนอ่าน ตั้งใจเลือกเฉพาะคอลัมน์ที่เปิดเผยได้)
create view public.company_response_stats as
select a.company_id,
       count(*)::int as sample_size,
       count(*) filter (where a.closed_by_system and 'no_response' = any (a.reject_reasons))::int as missed,
       case when count(*) >= 5
            then round(100.0 * (1 - (count(*) filter (where a.closed_by_system and 'no_response' = any (a.reject_reasons)))::numeric / count(*)))::int
       end as response_rate
from public.applications a
where a.created_at > now() - interval '90 days'
  and a.created_at < now() - interval '7 days'
  and a.stage <> 'withdrawn'
group by a.company_id;

create view public.public_companies as
select c.id, c.name, c.industry, c.province, c.size_range, c.about, c.website, c.created_at,
       s.response_rate, coalesce(s.sample_size, 0) as response_sample
from public.companies c
left join public.company_response_stats s on s.company_id = c.id
where c.status = 'verified';

create view public.job_board as
select j.id, j.company_id, c.name as company_name, c.industry as company_industry,
       j.title, j.job_type, j.description, j.responsibilities, j.requirements, j.skills,
       j.province, j.work_mode, j.salary_min, j.salary_max, j.pay_unit,
       j.gig_days, j.gig_start, j.gig_end, j.headcount, j.published_at, j.closes_at,
       (ch.job_id is not null) as has_challenge,
       ch.title as challenge_title, ch.time_limit_minutes, ch.due_days, ch.criteria as challenge_criteria,
       ch.ai_policy, ch.accept_reuse, ch.skill_key,
       s.response_rate, coalesce(s.sample_size, 0) as response_sample
from public.jobs j
join public.companies c on c.id = j.company_id and c.status = 'verified'
left join public.challenges ch on ch.job_id = j.id
left join public.company_response_stats s on s.company_id = j.company_id
where j.status = 'open' and (j.closes_at is null or j.closes_at > now());

grant select on public.job_board, public.public_companies to anon, authenticated;
revoke select on public.company_response_stats from anon;
