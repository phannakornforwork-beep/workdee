-- WorkDee · 17 ฟีเจอร์ AI ตาม feedback อาจารย์ (4 พ.ย. 2026)
--   A สแกน CV (ไม่มีตารางใหม่: AI เติมฟอร์มโปรไฟล์ ผู้สมัครตรวจแล้วกดบันทึกเอง)
--   B AI สร้างคุณสมบัติ + โจทย์ + rubric      → job_ai_profiles
--   C คัดกรองผู้สมัครทุกคนพร้อมประโยคหลักฐาน   → application_ai
--   D คะแนนอธิบายได้ 30/60/10                → ai_ranking()
--   E แฟ้มผลงานอัตโนมัติ                     → my_portfolio(), portfolio_hidden
--   F ใบรับรองภาษา 3 ระดับ                   → language_certificates
-- หลัก: AI แนะนำ คนตัดสิน · ไม่ใช้ชื่อ อายุ เพศ รูป หรือชื่อสถาบันในการคิดคะแนน

-- ---------------------------------------------------------------------------
-- B. คุณสมบัติที่ AI แตกจากวัตถุประสงค์ของ HR (HR แก้ได้ก่อนบันทึก)
create table public.job_ai_profiles (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  objective text not null default '' check (char_length(objective) <= 3000),
  qualifications jsonb not null default '[]'::jsonb, -- [{name, description, must_have, weight}]
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.job_ai_profiles enable row level security;
create policy "job_ai_profiles: screeners read" on public.job_ai_profiles
  for select using (public.can_screen_job(job_id) or exists (
    select 1 from public.jobs j where j.id = job_id and public.has_perm(j.company_id, 'post', j.department_id)));

create or replace function public.save_job_ai_profile(p_job uuid, p_objective text, p_quals jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  j public.jobs;
  q jsonb;
  v_sum int := 0;
  v_names text[] := '{}';
begin
  select * into j from public.jobs where id = p_job;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(j.company_id, 'post', j.department_id) then
    raise exception 'ตำแหน่งของคุณแก้ประกาศของแผนกนี้ไม่ได้';
  end if;
  p_quals := coalesce(p_quals, '[]'::jsonb);
  if jsonb_typeof(p_quals) <> 'array' or jsonb_array_length(p_quals) > 8 then
    raise exception 'คุณสมบัติต้องไม่เกิน 8 ข้อ';
  end if;
  for q in select * from jsonb_array_elements(p_quals) loop
    if char_length(trim(coalesce(q ->> 'name', ''))) < 2 or char_length(q ->> 'name') > 120 then
      raise exception 'ตั้งชื่อคุณสมบัติทุกข้อ (2–120 ตัวอักษร)';
    end if;
    if trim(q ->> 'name') = any (v_names) then
      raise exception 'ชื่อคุณสมบัติซ้ำกัน: %', q ->> 'name';
    end if;
    v_names := v_names || trim(q ->> 'name');
    if coalesce((q ->> 'weight')::int, 0) not between 1 and 100 then
      raise exception 'น้ำหนักคุณสมบัติแต่ละข้อต้องอยู่ระหว่าง 1–100';
    end if;
    v_sum := v_sum + (q ->> 'weight')::int;
  end loop;
  if jsonb_array_length(p_quals) > 0 and v_sum <> 100 then
    raise exception 'น้ำหนักคุณสมบัติรวมกันต้องได้ 100 (ตอนนี้ %)', v_sum;
  end if;
  insert into public.job_ai_profiles (job_id, objective, qualifications, updated_by, updated_at)
  values (p_job, left(coalesce(p_objective, ''), 3000), p_quals, v_user, now())
  on conflict (job_id) do update
    set objective = excluded.objective, qualifications = excluded.qualifications,
        updated_by = excluded.updated_by, updated_at = now();
end
$$;
grant execute on function public.save_job_ai_profile(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- F. ใบรับรองภาษา: self = ระบุเอง (ไม่นับ) · doc_pending = AI อ่านแล้ว รอทีมงาน
--    doc = ทีมงานตรวจเอกสารแล้ว (นับ 70%) · official = ยืนยันกับผู้จัดสอบ (นับเต็ม)
create table public.language_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam text not null check (char_length(exam) between 2 and 60),
  score_text text not null check (char_length(score_text) between 1 and 40),
  sub_scores jsonb not null default '{}'::jsonb,
  cert_number text check (cert_number is null or char_length(cert_number) <= 80),
  exam_date date,
  expires_on date,
  holder_name text check (holder_name is null or char_length(holder_name) <= 160),
  doc_path text,
  trust text not null default 'self' check (trust in ('self', 'doc_pending', 'doc', 'official', 'rejected')),
  checks jsonb not null default '{}'::jsonb,
  verify_url text check (verify_url is null or char_length(verify_url) <= 500),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index language_certificates_user_idx on public.language_certificates (user_id, created_at desc);
create index language_certificates_queue_idx on public.language_certificates (created_at) where trust = 'doc_pending';
alter table public.language_certificates enable row level security;
create policy "language_certificates: own read" on public.language_certificates
  for select using (user_id = auth.uid() or public.is_platform_admin());
-- ผู้ใช้เพิ่มเองได้เฉพาะระดับ "ระบุเอง"; ระดับอื่นตั้งโดยเซิร์ฟเวอร์หลัง AI อ่าน หรือโดยทีมงาน
create policy "language_certificates: own insert self" on public.language_certificates
  for insert with check (user_id = auth.uid() and trust = 'self' and reviewed_at is null);
create policy "language_certificates: own delete" on public.language_certificates
  for delete using (user_id = auth.uid());

create or replace function public.admin_review_language_cert(p_id uuid, p_level text, p_note text default null, p_verify_url text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := public.require_user();
begin
  if not public.is_platform_admin() then
    raise exception 'สำหรับผู้ดูแลระบบเท่านั้น';
  end if;
  if p_level not in ('doc', 'official', 'rejected') then
    raise exception 'ผลการตรวจไม่ถูกต้อง';
  end if;
  if p_level = 'official' and coalesce(p_verify_url, '') !~ '^https?://' then
    raise exception 'ระดับยืนยันกับผู้จัดสอบต้องแนบลิงก์ตรวจผลของผู้จัดสอบ';
  end if;
  update public.language_certificates
     set trust = p_level, review_note = nullif(trim(coalesce(p_note, '')), ''),
         verify_url = case when p_level = 'official' then p_verify_url else verify_url end,
         reviewed_by = v_user, reviewed_at = now()
   where id = p_id;
  if not found then
    raise exception 'ไม่พบใบรับรอง';
  end if;
end
$$;
grant execute on function public.admin_review_language_cert(uuid, text, text, text) to authenticated;

-- บริษัทเห็นใบรับรองที่ตรวจแล้วของผู้สมัครงานตน (เฉพาะเมื่อผู้สมัครยังให้สิทธิ์เข้าถึงโปรไฟล์)
create or replace function public.application_language_certs(p_app uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'exam', l.exam, 'score', l.score_text, 'exam_date', l.exam_date, 'expires_on', l.expires_on,
           'trust', l.trust, 'verify_url', l.verify_url) order by l.created_at desc), '[]'::jsonb)
  from public.applications a
  join public.language_certificates l on l.user_id = a.candidate_id and l.trust in ('doc', 'official')
  where a.id = p_app and a.profile_snapshot is not null and public.can_screen_app(p_app);
$$;
grant execute on function public.application_language_certs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- E. แฟ้มผลงาน: ผู้สมัครซ่อนรายการได้ แต่แก้คะแนนไม่ได้ (คะแนนมาจาก challenge_scores ที่บริษัทให้)
create table public.portfolio_hidden (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  primary key (user_id, application_id)
);
alter table public.portfolio_hidden enable row level security;
create policy "portfolio_hidden: own" on public.portfolio_hidden
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_app_candidate(application_id));

create or replace function public.my_portfolio()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with items as (
    select a.id as application_id, j.title as job_title, co.name as company_name, j.job_type::text as job_type,
           a.stage::text as stage, c.skill_key, cs.scores, cs.total, cs.feedback, cs.reused, cs.graded_at,
           s.submitted_at,
           exists (select 1 from public.portfolio_hidden h where h.user_id = a.candidate_id and h.application_id = a.id) as hidden
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.companies co on co.id = a.company_id
    left join public.challenges c on c.job_id = a.job_id
    left join public.challenge_scores cs on cs.application_id = a.id
    left join public.challenge_submissions s on s.application_id = a.id
    where a.candidate_id = public.require_user()
      and (cs.application_id is not null or a.stage = 'hired')
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by coalesce(i.graded_at, i.submitted_at) desc nulls last) from items i), '[]'::jsonb),
    'stats', jsonb_build_object(
      'done', (select count(*) from items where total is not null and not reused),
      'avg', (select round(avg(total)) from items where total is not null and not reused),
      'interviews', (select count(*) from items where stage in ('interview', 'offer', 'hired')),
      'hired', (select count(*) from items where stage = 'hired'),
      'repeat_companies', (select count(*) from (select company_name from items where stage = 'hired' group by company_name having count(*) > 1) x)
    ));
$$;
grant execute on function public.my_portfolio() to authenticated;

-- หลักฐานที่ยืนยันแล้วของผู้สมัคร (ใช้คิด 10%) — เรียกจากเซิร์ฟเวอร์เท่านั้น
create or replace function public.candidate_evidence(p_user uuid, p_exclude_app uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_points int := 0;
  v_edu public.verify_level := public.best_verify_level(p_user);
  v_n int;
  r record;
begin
  if v_edu = 'inst' then
    v_items := v_items || jsonb_build_object('label', 'วุฒิการศึกษา ยืนยันโดยสถาบัน', 'trust', 'green', 'points', 40);
    v_points := v_points + 40;
  elsif v_edu = 'doc' then
    v_items := v_items || jsonb_build_object('label', 'วุฒิการศึกษา ทีมงานตรวจเอกสารแล้ว', 'trust', 'yellow', 'points', 28);
    v_points := v_points + 28;
  end if;
  select count(*) into v_n
  from public.applications a join public.challenge_scores cs on cs.application_id = a.id
  where a.candidate_id = p_user and not cs.reused and a.id is distinct from p_exclude_app
    and not exists (select 1 from public.portfolio_hidden h where h.user_id = p_user and h.application_id = a.id);
  if v_n > 0 then
    v_items := v_items || jsonb_build_object('label', format('ผลโจทย์บน WorkDee %s งาน', v_n), 'trust', 'green', 'points', least(v_n, 2) * 20);
    v_points := v_points + least(v_n, 2) * 20;
  end if;
  for r in select exam, score_text, trust from public.language_certificates
           where user_id = p_user and trust in ('doc', 'official')
             and (expires_on is null or expires_on >= current_date)
           order by case trust when 'official' then 0 else 1 end limit 1 loop
    v_items := v_items || jsonb_build_object('label', format('%s %s', r.exam, r.score_text),
                                             'trust', case r.trust when 'official' then 'green' else 'yellow' end,
                                             'points', case r.trust when 'official' then 20 else 14 end);
    v_points := v_points + case r.trust when 'official' then 20 else 14 end;
  end loop;
  return jsonb_build_object('score', least(v_points, 100), 'items', v_items);
end
$$;
revoke execute on function public.candidate_evidence(uuid, uuid) from public, anon, authenticated;
grant execute on function public.candidate_evidence(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- C/D. ผลวิเคราะห์ของ AI ต่อใบสมัคร (เขียนโดยเซิร์ฟเวอร์ บริษัทอ่าน)
create table public.application_ai (
  application_id uuid primary key references public.applications (id) on delete cascade,
  match_score int check (match_score is null or match_score between 0 and 100),
  matches jsonb not null default '[]'::jsonb,       -- [{name, must_have, weight, level, evidence, note}]
  missing_must text[] not null default '{}',
  verified_score int not null default 0 check (verified_score between 0 and 100),
  verified_items jsonb not null default '[]'::jsonb, -- [{label, trust, points}]
  summary text not null default '' check (char_length(summary) <= 1000),
  screened_at timestamptz,
  grade_suggestion jsonb,                            -- {scores:[{name, weight, score, reason}], feedback}
  graded_at timestamptz,
  model text not null default ''
);
alter table public.application_ai enable row level security;
create policy "application_ai: screeners read" on public.application_ai
  for select using (public.can_screen_app(application_id));

-- อันดับผู้สมัครของประกาศ: 0.30 ตรงคุณสมบัติ + 0.60 ผลโจทย์ (คะแนนที่ HR ให้) + 0.10 หลักฐานยืนยันแล้ว
-- ไม่ส่งชื่อสถาบัน อายุ หรือรูปในผลลัพธ์นี้โดยตั้งใจ
create or replace function public.ai_ranking(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.can_screen_job(p_job) then
    raise exception 'คุณไม่มีสิทธิ์ดูผู้สมัครของประกาศนี้';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.total desc nulls last, x.match_score desc nulls last, x.created_at)
    from (
      select a.id, a.candidate_name, a.stage::text as stage, a.created_at,
             ai.match_score, ai.missing_must, ai.verified_score, ai.screened_at, ai.summary,
             cs.total as task_score,
             case when cs.total is not null and ai.match_score is not null
                  then round(0.30 * ai.match_score + 0.60 * cs.total + 0.10 * coalesce(ai.verified_score, 0))::int end as total
      from public.applications a
      left join public.application_ai ai on ai.application_id = a.id
      left join public.challenge_scores cs on cs.application_id = a.id
      where a.job_id = p_job and a.profile_snapshot is not null
        and a.stage not in ('withdrawn', 'expired')
    ) x), '[]'::jsonb);
end
$$;
grant execute on function public.ai_ranking(uuid) to authenticated;
