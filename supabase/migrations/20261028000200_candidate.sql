-- WorkDee · 02 พื้นที่ส่วนตัวของคนหางาน: โปรไฟล์ การศึกษา แผนอาชีพ
-- Candidate (personal space). Companies never read these tables directly:
-- they only get a snapshot copied into an application when the candidate applies
-- or accepts an invitation (decision #4).

create table public.candidate_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  headline text not null default '' check (char_length(headline) <= 160),
  intro text not null default '' check (char_length(intro) <= 2000),
  province text check (province is null or char_length(province) <= 80),
  birth_year int check (birth_year is null or birth_year between 1940 and 2015),
  show_age boolean not null default false,
  skills text[] not null default '{}',
  tools text[] not null default '{}',
  languages jsonb not null default '[]'::jsonb,     -- [{name, detail}]  เช่น TOEIC 785
  certificates jsonb not null default '[]'::jsonb,  -- [{name, detail}]
  projects jsonb not null default '[]'::jsonb,      -- [{title, detail, verified_by}]
  experiences jsonb not null default '[]'::jsonb,   -- [{title, org, period, detail}]
  pref_job_types public.job_type[] not null default '{}',
  pref_provinces text[] not null default '{}',
  expected_salary int check (expected_salary is null or expected_salary between 0 and 1000000),
  discoverable boolean not null default false,      -- ให้บริษัทค้นเจอแบบไม่เห็นชื่อ (เฟสถัดไป)
  hidden_company_ids uuid[] not null default '{}',  -- บริษัทที่ไม่ต้องการให้เห็นเลย
  updated_at timestamptz not null default now(),
  constraint skills_limit check (cardinality(skills) <= 40 and cardinality(tools) <= 40)
);
alter table public.candidate_profiles enable row level security;
create policy "candidate_profiles: own" on public.candidate_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger candidate_profiles_touch before update on public.candidate_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
create table public.educations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  institution_id uuid references public.institutions (id) on delete set null,
  institution_name text not null check (char_length(institution_name) between 2 and 200),
  level text not null default 'bachelor' check (level in ('vocational', 'high_vocational', 'bachelor', 'master', 'doctorate', 'other')),
  faculty text check (faculty is null or char_length(faculty) <= 120),
  major text check (major is null or char_length(major) <= 120),
  status text not null default 'studying' check (status in ('studying', 'graduated')),
  year_label text check (year_label is null or char_length(year_label) <= 40),
  gpa numeric(3, 2) check (gpa is null or (gpa >= 0 and gpa <= 4)),
  verify_level public.verify_level not null default 'none',
  doc_path text,
  verify_note text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index educations_user_idx on public.educations (user_id);
create index educations_institution_idx on public.educations (institution_id) where institution_id is not null;
alter table public.educations enable row level security;
create policy "educations: own" on public.educations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "educations: verifiers read" on public.educations
  for select using (
    public.is_platform_admin()
    or (institution_id is not null and public.is_institution_staff(institution_id))
  );

-- กันไม่ให้ผู้ใช้ยืนยันวุฒิตัวเอง และถ้าแก้ข้อมูลหลักหลังยืนยันแล้ว ต้องยืนยันใหม่
create or replace function public.guard_education()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  if public.is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.verify_level not in ('none', 'doc_pending') then
      new.verify_level := 'none';
    end if;
    if new.verify_level = 'doc_pending' and new.doc_path is null then
      new.verify_level := 'none';
    end if;
    new.verified_at := null;
    new.verified_by := null;
    new.verify_note := null;
    return new;
  end if;
  -- UPDATE by the owner
  if new.verified_at is distinct from old.verified_at or new.verified_by is distinct from old.verified_by then
    raise exception 'แก้สถานะการยืนยันวุฒิเองไม่ได้';
  end if;
  if new.verify_level is distinct from old.verify_level and new.verify_level not in ('none', 'doc_pending') then
    raise exception 'แก้สถานะการยืนยันวุฒิเองไม่ได้';
  end if;
  if new.verify_level = 'doc_pending' and new.doc_path is null then
    raise exception 'แนบใบรับรองผลการศึกษาก่อนส่งตรวจ';
  end if;
  if old.verify_level in ('doc', 'inst') and (
       new.institution_id is distinct from old.institution_id
    or new.institution_name is distinct from old.institution_name
    or new.level is distinct from old.level
    or new.major is distinct from old.major
    or new.faculty is distinct from old.faculty
    or new.gpa is distinct from old.gpa
    or new.status is distinct from old.status
    or new.year_label is distinct from old.year_label) then
    new.verify_level := 'none';
    new.verified_at := null;
    new.verified_by := null;
    new.verify_note := 'ข้อมูลถูกแก้หลังยืนยัน ต้องยืนยันใหม่';
  end if;
  return new;
end
$$;
create trigger educations_guard before insert or update on public.educations
  for each row execute function public.guard_education();

-- ---------------------------------------------------------------------------
-- แผนอาชีพ (Sandbox) แชร์กับบริษัทได้เฉพาะเมื่อเจ้าของเปิด และแชร์เป็นรายใบสมัคร
create table public.career_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal_title text not null default '' check (char_length(goal_title) <= 160),
  goal_detail text not null default '' check (char_length(goal_detail) <= 2000),
  steps jsonb not null default '[]'::jsonb, -- [{title, doing, done}]
  share_with_companies boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.career_plans enable row level security;
create policy "career_plans: own" on public.career_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger career_plans_touch before update on public.career_plans
  for each row execute function public.touch_updated_at();

-- กล่อง "ชีวิตส่วนตัว" (ข้อตัดสินใจข้อ 5): ไม่มีฟังก์ชันใดอ่านตารางนี้ให้บริษัท และไม่ใช้คัดกรอง
create table public.career_private_notes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  life_notes text not null default '' check (char_length(life_notes) <= 4000),
  updated_at timestamptz not null default now()
);
alter table public.career_private_notes enable row level security;
create policy "career_private_notes: own" on public.career_private_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger career_private_notes_touch before update on public.career_private_notes
  for each row execute function public.touch_updated_at();

-- ระดับการยืนยันวุฒิสูงสุดของผู้ใช้
create or replace function public.best_verify_level(p_user uuid)
returns public.verify_level language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select verify_level from public.educations
      where user_id = p_user and verify_level in ('inst', 'doc')
      order by case verify_level when 'inst' then 0 else 1 end limit 1),
    'none'::public.verify_level);
$$;
revoke execute on function public.best_verify_level(uuid) from public, anon, authenticated;

-- สำเนาโปรไฟล์ที่ส่งให้บริษัทตอนสมัคร (ไม่มีอีเมล เบอร์โทร ที่อยู่ หรือวันเกิด)
create or replace function public.build_snapshot(p_user uuid, p_share_plan boolean)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cp public.candidate_profiles;
  plan public.career_plans;
  edu jsonb;
  result jsonb;
begin
  select * into cp from public.candidate_profiles where user_id = p_user;
  if not found then
    raise exception 'กรอกโปรไฟล์ก่อนสมัครงาน';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'institution_name', e.institution_name,
      'level', e.level,
      'faculty', e.faculty,
      'major', e.major,
      'status', e.status,
      'year_label', e.year_label,
      'gpa', e.gpa,
      'verify_level', case when e.verify_level in ('doc', 'inst') then e.verify_level::text else 'none' end
    ) order by e.created_at), '[]'::jsonb)
    into edu from public.educations e where e.user_id = p_user;
  result := jsonb_build_object(
    'full_name', cp.full_name,
    'headline', cp.headline,
    'intro', cp.intro,
    'province', cp.province,
    'age', case when cp.show_age and cp.birth_year is not null
                then extract(year from now())::int - cp.birth_year end,
    'skills', to_jsonb(cp.skills),
    'tools', to_jsonb(cp.tools),
    'languages', cp.languages,
    'certificates', cp.certificates,
    'projects', cp.projects,
    'experiences', cp.experiences,
    'educations', edu,
    'snapshot_at', now()
  );
  if p_share_plan then
    select * into plan from public.career_plans where user_id = p_user;
    if found and plan.share_with_companies then
      result := result || jsonb_build_object('plan', jsonb_build_object(
        'goal_title', plan.goal_title, 'goal_detail', plan.goal_detail, 'steps', plan.steps));
    end if;
  end if;
  return result;
end
$$;
revoke execute on function public.build_snapshot(uuid, boolean) from public, anon, authenticated;
