-- WorkDee · 06 ขั้นตอนการจ้างงาน (RPC) ทุกการเปลี่ยนสถานะผ่านฟังก์ชันเหล่านี้ เพื่อบังคับกติกาเสมอ
-- Hiring workflow RPCs. All state changes go through these functions so the rules always hold:
--   * บริษัทต้องตอบทุกขั้นภายใน 7 วัน (sla_due_at)
--   * ปฏิเสธต้องมีเหตุผลแบบมีโครงสร้างอย่างน้อย 1 ข้อ และต้องให้คะแนนโจทย์ที่ส่งแล้วก่อน
--   * ทำหลายคนพร้อมกันได้ และยกเลิกได้ภายใน 30 วินาที (ผู้สมัครยังไม่เห็นจนพ้น 30 วินาที)

-- ---------------------------------------------------------------------------
-- ประกาศงาน
create or replace function public.save_job(p_company uuid, p_job uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_root uuid;
  v_dept uuid;
  v_skills text[];
  j public.jobs;
  v_id uuid;
begin
  select id into v_root from public.positions where company_id = p_company and parent_id is null;
  if v_root is null then
    raise exception 'ไม่พบบริษัท';
  end if;
  if p_fields ? 'skills' then
    v_skills := array(select left(trim(x), 60) from jsonb_array_elements_text(p_fields -> 'skills') x where trim(x) <> '' limit 20);
  end if;

  if p_job is null then
    v_dept := coalesce(nullif(p_fields ->> 'department_id', '')::uuid, v_root);
    if not exists (select 1 from public.positions where id = v_dept and company_id = p_company) then
      raise exception 'ไม่พบแผนก';
    end if;
    if not public.has_perm(p_company, 'post', v_dept) then
      raise exception 'ตำแหน่งของคุณลงประกาศให้แผนกนี้ไม่ได้';
    end if;
    insert into public.jobs (company_id, department_id, title, job_type, description, responsibilities, requirements, skills,
                             province, work_mode, salary_min, salary_max, pay_unit, gig_days, gig_start, gig_end,
                             headcount, challenge_seats, closes_at, created_by)
    values (p_company, v_dept, trim(coalesce(p_fields ->> 'title', '')),
            coalesce(nullif(p_fields ->> 'job_type', '')::public.job_type, 'full_time'),
            coalesce(p_fields ->> 'description', ''), coalesce(p_fields ->> 'responsibilities', ''), coalesce(p_fields ->> 'requirements', ''),
            coalesce(v_skills, '{}'),
            nullif(trim(coalesce(p_fields ->> 'province', '')), ''),
            coalesce(nullif(p_fields ->> 'work_mode', ''), 'onsite'),
            nullif(p_fields ->> 'salary_min', '')::int, nullif(p_fields ->> 'salary_max', '')::int,
            coalesce(nullif(p_fields ->> 'pay_unit', ''), 'month'),
            nullif(p_fields ->> 'gig_days', '')::int, nullif(p_fields ->> 'gig_start', '')::date, nullif(p_fields ->> 'gig_end', '')::date,
            coalesce(nullif(p_fields ->> 'headcount', '')::int, 1),
            coalesce(nullif(p_fields ->> 'challenge_seats', '')::int, 10),
            nullif(p_fields ->> 'closes_at', '')::timestamptz,
            v_user)
    returning id into v_id;
    perform public.audit(p_company, 'job.created', jsonb_build_object('job_id', v_id, 'title', p_fields ->> 'title'));
    return v_id;
  end if;

  select * into j from public.jobs where id = p_job and company_id = p_company for update;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(p_company, 'post', j.department_id) then
    raise exception 'ตำแหน่งของคุณแก้ประกาศของแผนกนี้ไม่ได้';
  end if;
  if j.status = 'closed' then
    raise exception 'ประกาศที่ปิดแล้วแก้ไม่ได้';
  end if;
  if j.status = 'pending_approval' then
    raise exception 'ประกาศนี้รออนุมัติอยู่ ยกเลิกคำขออนุมัติก่อนแก้';
  end if;
  v_dept := coalesce(nullif(p_fields ->> 'department_id', '')::uuid, j.department_id);
  if v_dept <> j.department_id then
    if j.status <> 'draft' then
      raise exception 'เปลี่ยนแผนกได้เฉพาะประกาศที่ยังเป็นร่าง';
    end if;
    if not public.has_perm(p_company, 'post', v_dept) then
      raise exception 'ตำแหน่งของคุณลงประกาศให้แผนกนี้ไม่ได้';
    end if;
  end if;
  update public.jobs set
    department_id = v_dept,
    title = case when p_fields ? 'title' then trim(p_fields ->> 'title') else title end,
    job_type = case when p_fields ? 'job_type' then (p_fields ->> 'job_type')::public.job_type else job_type end,
    description = case when p_fields ? 'description' then coalesce(p_fields ->> 'description', '') else description end,
    responsibilities = case when p_fields ? 'responsibilities' then coalesce(p_fields ->> 'responsibilities', '') else responsibilities end,
    requirements = case when p_fields ? 'requirements' then coalesce(p_fields ->> 'requirements', '') else requirements end,
    skills = coalesce(v_skills, skills),
    province = case when p_fields ? 'province' then nullif(trim(coalesce(p_fields ->> 'province', '')), '') else province end,
    work_mode = case when p_fields ? 'work_mode' then coalesce(nullif(p_fields ->> 'work_mode', ''), work_mode) else work_mode end,
    salary_min = case when p_fields ? 'salary_min' then nullif(p_fields ->> 'salary_min', '')::int else salary_min end,
    salary_max = case when p_fields ? 'salary_max' then nullif(p_fields ->> 'salary_max', '')::int else salary_max end,
    pay_unit = case when p_fields ? 'pay_unit' then coalesce(nullif(p_fields ->> 'pay_unit', ''), pay_unit) else pay_unit end,
    gig_days = case when p_fields ? 'gig_days' then nullif(p_fields ->> 'gig_days', '')::int else gig_days end,
    gig_start = case when p_fields ? 'gig_start' then nullif(p_fields ->> 'gig_start', '')::date else gig_start end,
    gig_end = case when p_fields ? 'gig_end' then nullif(p_fields ->> 'gig_end', '')::date else gig_end end,
    headcount = case when p_fields ? 'headcount' then coalesce(nullif(p_fields ->> 'headcount', '')::int, headcount) else headcount end,
    challenge_seats = case when p_fields ? 'challenge_seats' then coalesce(nullif(p_fields ->> 'challenge_seats', '')::int, challenge_seats) else challenge_seats end,
    closes_at = case when p_fields ? 'closes_at' then nullif(p_fields ->> 'closes_at', '')::timestamptz else closes_at end
  where id = p_job;
  return p_job;
end
$$;

create or replace function public.save_challenge(p_job uuid, p_fields jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  j public.jobs;
  v_criteria jsonb := coalesce(p_fields -> 'criteria', '[]'::jsonb);
  v_sum int := 0;
  c jsonb;
  v_names text[] := '{}';
  v_old jsonb;
begin
  select * into j from public.jobs where id = p_job;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(j.company_id, 'post', j.department_id) then
    raise exception 'ตำแหน่งของคุณแก้โจทย์ของแผนกนี้ไม่ได้';
  end if;
  if jsonb_typeof(v_criteria) <> 'array' or jsonb_array_length(v_criteria) < 1 or jsonb_array_length(v_criteria) > 6 then
    raise exception 'เกณฑ์ให้คะแนนต้องมี 1–6 ข้อ';
  end if;
  for c in select * from jsonb_array_elements(v_criteria) loop
    if char_length(trim(coalesce(c ->> 'name', ''))) < 2 then
      raise exception 'ตั้งชื่อเกณฑ์ทุกข้อ';
    end if;
    if trim(c ->> 'name') = any (v_names) then
      raise exception 'ชื่อเกณฑ์ซ้ำกัน: %', c ->> 'name';
    end if;
    v_names := v_names || trim(c ->> 'name');
    if coalesce((c ->> 'weight')::int, 0) < 5 then
      raise exception 'น้ำหนักแต่ละเกณฑ์ต้องอย่างน้อย 5%%';
    end if;
    v_sum := v_sum + (c ->> 'weight')::int;
  end loop;
  if v_sum <> 100 then
    raise exception 'น้ำหนักเกณฑ์รวมกันต้องได้ 100%% (ตอนนี้ %)', v_sum;
  end if;
  select criteria into v_old from public.challenges where job_id = p_job;
  if v_old is not null and v_old <> v_criteria and exists (
       select 1 from public.challenge_submissions s join public.applications a on a.id = s.application_id
       where a.job_id = p_job and s.submitted_at is not null) then
    raise exception 'มีผู้สมัครส่งโจทย์แล้ว เปลี่ยนเกณฑ์ไม่ได้เพื่อความยุติธรรม';
  end if;
  insert into public.challenges (job_id, title, brief, deliverable, time_limit_minutes, due_days, criteria, ai_policy, skill_key, accept_reuse, reuse_min_score)
  values (p_job, trim(coalesce(p_fields ->> 'title', '')), coalesce(p_fields ->> 'brief', ''), coalesce(p_fields ->> 'deliverable', ''),
          coalesce(nullif(p_fields ->> 'time_limit_minutes', '')::int, 60), coalesce(nullif(p_fields ->> 'due_days', '')::int, 3),
          (select jsonb_agg(jsonb_build_object('name', trim(x ->> 'name'), 'weight', (x ->> 'weight')::int, 'description', coalesce(x ->> 'description', ''))) from jsonb_array_elements(v_criteria) x),
          coalesce(nullif(p_fields ->> 'ai_policy', ''), 'allowed_declare'),
          nullif(lower(trim(coalesce(p_fields ->> 'skill_key', ''))), ''),
          coalesce((p_fields ->> 'accept_reuse')::boolean, true),
          coalesce(nullif(p_fields ->> 'reuse_min_score', '')::int, 75))
  on conflict (job_id) do update set
    title = excluded.title, brief = excluded.brief, deliverable = excluded.deliverable,
    time_limit_minutes = excluded.time_limit_minutes, due_days = excluded.due_days, criteria = excluded.criteria,
    ai_policy = excluded.ai_policy, skill_key = excluded.skill_key, accept_reuse = excluded.accept_reuse,
    reuse_min_score = excluded.reuse_min_score;
end
$$;

create or replace function public.notify_approvers(p_request uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.approval_requests;
  v_uid uuid;
  v_count int := 0;
begin
  select * into r from public.approval_requests where id = p_request;
  for v_uid in
    select m.user_id from public.company_members m
    where m.company_id = r.company_id and m.status = 'active' and m.position_id = r.approver_position_id
      and m.user_id is distinct from r.requested_by
  loop
    perform public.notify(v_uid, r.company_id, 'approval', 'รออนุมัติ: ' || r.title, 'ส่งโดย ' || r.requested_by_name, '/c/' || r.company_id || '/team?tab=approvals');
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    for v_uid in select * from public.company_owner_ids(r.company_id) loop
      if v_uid is distinct from r.requested_by then
        perform public.notify(v_uid, r.company_id, 'approval', 'รออนุมัติ: ' || r.title, 'ส่งโดย ' || r.requested_by_name, '/c/' || r.company_id || '/team?tab=approvals');
      end if;
    end loop;
  end if;
end
$$;
revoke execute on function public.notify_approvers(uuid) from public, anon, authenticated;

create or replace function public.publish_job_now(p_job uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.jobs
     set status = 'open', published_at = now(), approval_note = null,
         closes_at = coalesce(closes_at, now() + interval '30 days')
   where id = p_job;
$$;
revoke execute on function public.publish_job_now(uuid) from public, anon, authenticated;

create or replace function public.submit_job(p_job uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  j public.jobs;
  v_company public.companies;
  v_req uuid;
  v_name text;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(j.company_id, 'post', j.department_id) then
    raise exception 'ตำแหน่งของคุณเผยแพร่ประกาศของแผนกนี้ไม่ได้';
  end if;
  if j.status <> 'draft' then
    raise exception 'ประกาศนี้ไม่ได้อยู่ในสถานะร่าง';
  end if;
  select * into v_company from public.companies where id = j.company_id;
  if v_company.status <> 'verified' then
    raise exception 'บริษัทยังไม่ได้รับการยืนยัน ร่างประกาศไว้ได้ แต่เผยแพร่ได้หลังยืนยันเสร็จ';
  end if;
  if j.salary_max is null then
    raise exception 'ระบุช่วงค่าตอบแทนก่อนเผยแพร่ ผู้สมัครเห็นช่วงนี้ตั้งแต่แรก';
  end if;
  if j.job_type in ('full_time', 'contract', 'internship') and not exists (select 1 from public.challenges where job_id = p_job) then
    raise exception 'งานประจำ สัญญาจ้าง และฝึกงาน ต้องมีโจทย์พิสูจน์สกิลก่อนเผยแพร่';
  end if;
  if public.rule_on(j.company_id, 'job_post_needs_head') and not public.has_perm(j.company_id, 'approve_post', j.department_id) then
    select display_name into v_name from public.profiles where id = v_user;
    insert into public.approval_requests (company_id, kind, ref_id, title, requested_by, requested_by_name, approver_position_id)
    values (j.company_id, 'job_post', p_job, 'ประกาศงาน ' || j.title, v_user, coalesce(v_name, ''), j.department_id)
    returning id into v_req;
    update public.jobs set status = 'pending_approval' where id = p_job;
    perform public.notify_approvers(v_req);
    perform public.audit(j.company_id, 'job.approval_requested', jsonb_build_object('job_id', p_job, 'title', j.title));
    return 'pending_approval';
  end if;
  perform public.publish_job_now(p_job);
  perform public.audit(j.company_id, 'job.published', jsonb_build_object('job_id', p_job, 'title', j.title));
  return 'open';
end
$$;

create or replace function public.delete_job(p_job uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.jobs;
begin
  perform public.require_user();
  select * into j from public.jobs where id = p_job;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(j.company_id, 'post', j.department_id) then
    raise exception 'ตำแหน่งของคุณลบประกาศของแผนกนี้ไม่ได้';
  end if;
  if j.status <> 'draft' then
    raise exception 'ลบได้เฉพาะประกาศที่ยังเป็นร่าง ประกาศที่เผยแพร่แล้วให้ปิดรับแทน';
  end if;
  delete from public.jobs where id = p_job;
  perform public.audit(j.company_id, 'job.deleted', jsonb_build_object('title', j.title));
end
$$;

-- ---------------------------------------------------------------------------
-- คนหางาน: สมัคร ถอน
create or replace function public.apply_to_job(p_job uuid, p_intro text default '', p_expected_salary int default null, p_share_plan boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  j public.jobs;
  v_status public.company_status;
  cp public.candidate_profiles;
  v_snapshot jsonb;
  v_id uuid;
  v_uid uuid;
begin
  select * into j from public.jobs where id = p_job;
  if not found or j.status <> 'open' or (j.closes_at is not null and j.closes_at <= now()) then
    raise exception 'ประกาศนี้ปิดรับแล้ว';
  end if;
  select status into v_status from public.companies where id = j.company_id;
  if v_status <> 'verified' then
    raise exception 'ประกาศนี้ปิดรับแล้ว';
  end if;
  if exists (select 1 from public.applications where job_id = p_job and candidate_id = v_user) then
    raise exception 'คุณสมัครงานนี้แล้ว ดูสถานะได้ที่ใบสมัครของฉัน';
  end if;
  select * into cp from public.candidate_profiles where user_id = v_user;
  if not found or char_length(trim(cp.full_name)) < 2 then
    raise exception 'กรอกชื่อและโปรไฟล์ก่อนสมัครงาน';
  end if;
  if cp.hidden_company_ids @> array[j.company_id] then
    raise exception 'คุณตั้งค่าซ่อนโปรไฟล์จากบริษัทนี้ไว้ เอาออกจากรายการก่อนสมัคร';
  end if;
  v_snapshot := public.build_snapshot(v_user, coalesce(p_share_plan, false));
  insert into public.applications (job_id, company_id, candidate_id, candidate_name, stage, stage_entered_at, sla_due_at,
                                   profile_snapshot, verify_level, intro_message, expected_salary, share_plan, match_score)
  values (p_job, j.company_id, v_user, cp.full_name, 'applied', now(), now() + interval '7 days',
          v_snapshot, public.best_verify_level(v_user), left(coalesce(p_intro, ''), 2000), p_expected_salary,
          coalesce(p_share_plan, false) and v_snapshot ? 'plan', public.compute_match(p_job, v_user))
  returning id into v_id;
  insert into public.consents (user_id, purpose, company_id, application_id, detail)
  values (v_user, 'share_profile_with_company', j.company_id, v_id,
          jsonb_build_object('job_title', j.title, 'share_plan', coalesce(p_share_plan, false) and v_snapshot ? 'plan'));
  perform public.add_app_event(v_id, 'applied', 'candidate', '', '{}'::jsonb);
  for v_uid in select * from public.job_screeners(p_job) loop
    perform public.notify(v_uid, j.company_id, 'new_application', 'ผู้สมัครใหม่: ' || cp.full_name, j.title,
                          '/c/' || j.company_id || '/applications/' || v_id);
  end loop;
  return v_id;
end
$$;

create or replace function public.withdraw_application(p_app uuid, p_reason text default '', p_revoke boolean default true)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
  v_uid uuid;
  v_title text;
begin
  select * into a from public.applications where id = p_app and candidate_id = v_user for update;
  if not found then
    raise exception 'ไม่พบใบสมัคร';
  end if;
  if a.stage in ('hired', 'rejected', 'withdrawn', 'declined', 'expired') then
    raise exception 'ใบสมัครนี้ปิดแล้ว';
  end if;
  update public.applications set
    stage = 'withdrawn', stage_entered_at = now(), closed_at = now(), sla_due_at = null, candidate_due_at = null,
    withdraw_reason = left(coalesce(p_reason, ''), 500),
    profile_snapshot = case when coalesce(p_revoke, true) then null else profile_snapshot end,
    access_revoked_at = case when coalesce(p_revoke, true) then now() else access_revoked_at end
  where id = p_app;
  update public.interviews set status = 'cancelled' where application_id = p_app and status in ('awaiting_candidate', 'confirmed', 'reschedule_requested');
  update public.offers set status = 'withdrawn' where application_id = p_app and status in ('draft', 'pending_approval', 'sent');
  update public.approval_requests set status = 'cancelled' where status = 'pending' and kind = 'offer'
     and ref_id in (select id from public.offers where application_id = p_app);
  if coalesce(p_revoke, true) then
    update public.consents set revoked_at = now() where application_id = p_app and revoked_at is null;
  end if;
  perform public.add_app_event(p_app, 'withdrawn', 'candidate', coalesce(p_reason, ''), '{}'::jsonb);
  select title into v_title from public.jobs where id = a.job_id;
  for v_uid in select * from public.job_screeners(a.job_id) loop
    perform public.notify(v_uid, a.company_id, 'hiring_update', a.candidate_name || ' ถอนใบสมัคร', v_title,
                          '/c/' || a.company_id || '/applications/' || p_app);
  end loop;
end
$$;

-- ถอนสิทธิ์ที่บริษัทเห็นโปรไฟล์ (ใบสมัครที่ปิดแล้ว)
create or replace function public.revoke_application_access(p_app uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
begin
  select * into a from public.applications where id = p_app and candidate_id = v_user for update;
  if not found then
    raise exception 'ไม่พบใบสมัคร';
  end if;
  if a.stage not in ('hired', 'rejected', 'withdrawn', 'declined', 'expired') then
    raise exception 'ใบสมัครยังดำเนินอยู่ ถอนใบสมัครก่อน';
  end if;
  update public.applications set profile_snapshot = null, access_revoked_at = now() where id = p_app;
  update public.consents set revoked_at = now() where application_id = p_app and revoked_at is null;
  perform public.add_app_event(p_app, 'access_revoked', 'candidate', 'ผู้สมัครถอนสิทธิ์การเข้าถึงโปรไฟล์', '{}'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- การทำทีละหลายคน: เก็บสถานะเดิมไว้เพื่อยกเลิกได้ใน 30 วินาที
create or replace function public.lock_company_apps(p_apps uuid[])
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_count int;
begin
  if p_apps is null or cardinality(p_apps) = 0 then
    raise exception 'ยังไม่ได้เลือกผู้สมัคร';
  end if;
  if cardinality(p_apps) > 200 then
    raise exception 'เลือกได้ครั้งละไม่เกิน 200 คน';
  end if;
  perform 1 from public.applications where id = any (p_apps) for update;
  select count(distinct company_id), min(company_id::text)::uuid into v_count, v_company
    from public.applications where id = any (p_apps);
  if v_count <> 1 then
    raise exception 'ผู้สมัครที่เลือกต้องอยู่ในบริษัทเดียวกัน';
  end if;
  if (select count(*) from public.applications where id = any (p_apps)) <> (select count(distinct x) from unnest(p_apps) x) then
    raise exception 'ไม่พบผู้สมัครบางคน';
  end if;
  if exists (select 1 from public.applications a where a.id = any (p_apps) and not public.can_screen_job(a.job_id)) then
    raise exception 'คุณไม่มีสิทธิ์ดูแลผู้สมัครบางคนที่เลือก';
  end if;
  return v_company;
end
$$;
revoke execute on function public.lock_company_apps(uuid[]) from public, anon, authenticated;

create or replace function public.new_batch(p_company uuid, p_kind text, p_apps uuid[], p_reasons text[] default null, p_message text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_name text;
begin
  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.action_batches (company_id, actor_id, actor_name, kind, app_ids, previous, reasons, message, undo_until)
  select p_company, auth.uid(), coalesce(v_name, ''), p_kind, p_apps,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'stage', a.stage, 'stage_entered_at', a.stage_entered_at, 'sla_due_at', a.sla_due_at,
           'candidate_due_at', a.candidate_due_at, 'challenge_invited_at', a.challenge_invited_at,
           'warned_at', a.warned_at, 'escalated_at', a.escalated_at, 'closed_at', a.closed_at,
           'reject_reasons', a.reject_reasons, 'reject_note', a.reject_note, 'rejected_by', a.rejected_by,
           'interviews', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status)), '[]'::jsonb)
                          from public.interviews i where i.application_id = a.id))), '[]'::jsonb),
         p_reasons, p_message, now() + interval '30 seconds'
  from public.applications a where a.id = any (p_apps)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.new_batch(uuid, text, uuid[], text[], text) from public, anon, authenticated;

create or replace function public.reset_stage(p_app uuid, p_stage public.app_stage, p_sla timestamptz, p_candidate_due timestamptz)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.applications
     set stage = p_stage, stage_entered_at = now(), sla_due_at = p_sla, candidate_due_at = p_candidate_due,
         warned_at = null, escalated_at = null,
         closed_at = case when p_stage in ('hired', 'rejected', 'withdrawn', 'declined', 'expired') then now() else null end
   where id = p_app;
$$;
revoke execute on function public.reset_stage(uuid, public.app_stage, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.invite_to_challenge(p_apps uuid[], p_message text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_company uuid := public.lock_company_apps(p_apps);
  v_batch uuid;
  v_vis timestamptz := now() + interval '30 seconds';
  r record;
  v_msg text;
begin
  if exists (select 1 from public.applications a where a.id = any (p_apps) and a.stage <> 'applied') then
    raise exception 'เชิญเข้ารอบโจทย์ได้เฉพาะผู้สมัครที่อยู่ขั้นรอคัด';
  end if;
  if exists (select 1 from public.applications a left join public.challenges c on c.job_id = a.job_id
             where a.id = any (p_apps) and c.job_id is null) then
    raise exception 'ประกาศบางตำแหน่งยังไม่มีโจทย์';
  end if;
  for r in
    select j.id, j.title, j.challenge_seats, public.challenge_seats_used(j.id) as used, count(*) as picked
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.id = any (p_apps) group by j.id, j.title, j.challenge_seats
  loop
    if r.used + r.picked > r.challenge_seats then
      raise exception 'ที่นั่งรอบโจทย์ของ "%" เหลือ % ที่ แต่เลือก % คน', r.title, greatest(r.challenge_seats - r.used, 0), r.picked;
    end if;
  end loop;
  v_batch := public.new_batch(v_company, 'invite_challenge', p_apps, null, p_message);
  for r in
    select a.id, a.job_id, j.title, c.due_days from public.applications a
    join public.jobs j on j.id = a.job_id join public.challenges c on c.job_id = a.job_id
    where a.id = any (p_apps)
  loop
    perform public.reset_stage(r.id, 'challenge_invited', null, v_vis + make_interval(days => r.due_days));
    update public.applications set challenge_invited_at = now() where id = r.id;
    v_msg := public.fill_message(coalesce(nullif(trim(p_message), ''), 'ขอเชิญทำโจทย์สั้นๆ ของตำแหน่ง{ตำแหน่ง} กดเริ่มได้จากหน้าใบสมัคร'), r.id);
    perform public.add_app_event(r.id, 'challenge_invited', 'company', v_msg, jsonb_build_object('due_days', r.due_days), true, v_batch, v_vis);
    perform public.notify((select candidate_id from public.applications where id = r.id), null, 'app_update',
                          'ได้รับเชิญทำโจทย์: ' || r.title, v_msg, '/me/applications/' || r.id, false, v_batch, v_vis);
  end loop;
  return v_batch;
end
$$;

-- ---------------------------------------------------------------------------
-- โจทย์: เริ่ม ส่ง ใช้ผลเดิม ให้คะแนน
create or replace function public.start_challenge(p_app uuid)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
  v_started timestamptz;
begin
  select * into a from public.applications where id = p_app and candidate_id = v_user;
  if not found or a.stage <> 'challenge_invited' then
    raise exception 'ใบสมัครนี้ไม่ได้อยู่ในรอบโจทย์';
  end if;
  if a.candidate_due_at is not null and a.candidate_due_at < now() then
    raise exception 'เลยกำหนดส่งโจทย์แล้ว';
  end if;
  insert into public.challenge_submissions (application_id, started_at) values (p_app, now())
  on conflict (application_id) do update set started_at = coalesce(public.challenge_submissions.started_at, now())
  returning started_at into v_started;
  return v_started;
end
$$;

create or replace function public.submit_challenge(
  p_app uuid, p_answer text, p_links text[] default '{}', p_files text[] default '{}',
  p_ai_use text default 'none', p_ai_detail text default '', p_reasoning text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
  v_title text;
  v_uid uuid;
  f text;
begin
  select * into a from public.applications where id = p_app and candidate_id = v_user for update;
  if not found or a.stage <> 'challenge_invited' then
    raise exception 'ใบสมัครนี้ไม่ได้อยู่ในรอบโจทย์';
  end if;
  if a.candidate_due_at is not null and a.candidate_due_at < now() then
    raise exception 'เลยกำหนดส่งโจทย์แล้ว';
  end if;
  if char_length(trim(coalesce(p_answer, ''))) < 20 and coalesce(cardinality(p_files), 0) = 0 and coalesce(cardinality(p_links), 0) = 0 then
    raise exception 'ใส่คำตอบอย่างน้อย 20 ตัวอักษร หรือแนบไฟล์/ลิงก์ผลงาน';
  end if;
  if char_length(trim(coalesce(p_reasoning, ''))) < 10 then
    raise exception 'อธิบายสั้นๆ ว่าทำไมเลือกทำแบบนี้ บริษัทใช้ส่วนนี้ประกอบการให้คะแนน';
  end if;
  if coalesce(p_ai_use, 'none') not in ('none', 'ideas', 'partial', 'heavy') then
    raise exception 'เลือกการใช้ AI ให้ถูกต้อง';
  end if;
  if coalesce(p_ai_use, 'none') <> 'none' and char_length(trim(coalesce(p_ai_detail, ''))) < 3 then
    raise exception 'บอกสั้นๆ ว่าใช้ AI ช่วยส่วนไหน';
  end if;
  foreach f in array coalesce(p_files, '{}') loop
    if split_part(f, '/', 1) <> p_app::text then
      raise exception 'ไฟล์แนบไม่ถูกต้อง';
    end if;
  end loop;
  insert into public.challenge_submissions (application_id, answer, links, file_paths, ai_use, ai_detail, reasoning, started_at, submitted_at)
  values (p_app, left(coalesce(p_answer, ''), 20000), coalesce(p_links, '{}'), coalesce(p_files, '{}'), coalesce(p_ai_use, 'none'),
          left(coalesce(p_ai_detail, ''), 1000), left(coalesce(p_reasoning, ''), 4000), now(), now())
  on conflict (application_id) do update set
    answer = excluded.answer, links = excluded.links, file_paths = excluded.file_paths, ai_use = excluded.ai_use,
    ai_detail = excluded.ai_detail, reasoning = excluded.reasoning, submitted_at = now();
  perform public.reset_stage(p_app, 'challenge_submitted', now() + interval '7 days', null);
  perform public.add_app_event(p_app, 'challenge_submitted', 'candidate', '', jsonb_build_object('ai_use', p_ai_use));
  select title into v_title from public.jobs where id = a.job_id;
  for v_uid in select * from public.job_screeners(a.job_id) loop
    perform public.notify(v_uid, a.company_id, 'challenge_submitted', a.candidate_name || ' ส่งโจทย์แล้ว รอให้คะแนน', v_title,
                          '/c/' || a.company_id || '/applications/' || p_app);
  end loop;
end
$$;

-- ผลโจทย์ที่ใช้ซ้ำได้กับใบสมัครนี้
create or replace function public.reusable_results(p_app uuid)
returns table (source_app uuid, job_title text, company_name text, total int, graded_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select src.id, sj.title, sc.name, s.total, s.graded_at
  from public.applications a
  join public.challenges ch on ch.job_id = a.job_id and ch.accept_reuse and ch.skill_key is not null
  join public.applications src on src.candidate_id = a.candidate_id and src.id <> a.id
  join public.challenges sch on sch.job_id = src.job_id and sch.skill_key = ch.skill_key
  join public.challenge_scores s on s.application_id = src.id and not s.reused and s.total >= ch.reuse_min_score
  join public.jobs sj on sj.id = src.job_id
  join public.companies sc on sc.id = src.company_id
  where a.id = p_app and a.candidate_id = auth.uid() and a.stage = 'challenge_invited'
    and s.graded_at > now() - interval '12 months';
$$;

create or replace function public.reuse_challenge(p_app uuid, p_source_app uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
  src public.challenge_submissions;
  srcs public.challenge_scores;
  v_title text;
  v_uid uuid;
begin
  if not exists (select 1 from public.reusable_results(p_app) r where r.source_app = p_source_app) then
    raise exception 'ใช้ผลโจทย์นี้กับใบสมัครนี้ไม่ได้';
  end if;
  select * into a from public.applications where id = p_app and candidate_id = v_user for update;
  select * into src from public.challenge_submissions where application_id = p_source_app;
  select * into srcs from public.challenge_scores where application_id = p_source_app;
  insert into public.challenge_submissions (application_id, answer, links, file_paths, ai_use, ai_detail, reasoning, reused_from, started_at, submitted_at)
  values (p_app, src.answer, src.links, '{}', src.ai_use, src.ai_detail, src.reasoning, p_source_app, now(), now())
  on conflict (application_id) do update set answer = excluded.answer, links = excluded.links, file_paths = '{}',
    ai_use = excluded.ai_use, ai_detail = excluded.ai_detail, reasoning = excluded.reasoning, reused_from = excluded.reused_from, submitted_at = now();
  insert into public.challenge_scores (application_id, scores, total, feedback, reused, graded_by_name)
  values (p_app, jsonb_build_array(jsonb_build_object('name', 'ผลโจทย์เดิม (สกิลเดียวกัน)', 'weight', 100, 'score', srcs.total)),
          srcs.total, '', true, 'ผลโจทย์เดิมจากใบสมัครอื่น')
  on conflict (application_id) do update set scores = excluded.scores, total = excluded.total, reused = true, graded_by_name = excluded.graded_by_name, graded_at = now();
  perform public.reset_stage(p_app, 'challenge_submitted', now() + interval '7 days', null);
  perform public.add_app_event(p_app, 'challenge_reused', 'candidate', 'ใช้ผลโจทย์เดิมของสกิลเดียวกัน คะแนน ' || srcs.total, jsonb_build_object('total', srcs.total));
  select title into v_title from public.jobs where id = a.job_id;
  for v_uid in select * from public.job_screeners(a.job_id) loop
    perform public.notify(v_uid, a.company_id, 'challenge_submitted', a.candidate_name || ' ใช้ผลโจทย์เดิม (' || srcs.total || ' คะแนน)', v_title,
                          '/c/' || a.company_id || '/applications/' || p_app);
  end loop;
end
$$;

create or replace function public.grade_challenge(p_app uuid, p_scores jsonb, p_feedback text default '')
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
  v_criteria jsonb;
  c jsonb;
  v_score int;
  v_total int := 0;
  v_out jsonb := '[]'::jsonb;
  v_name text;
  v_title text;
begin
  select * into a from public.applications where id = p_app for update;
  if not found or not public.can_screen_job(a.job_id) then
    raise exception 'ไม่พบใบสมัคร';
  end if;
  if a.stage <> 'challenge_submitted' then
    raise exception 'ให้คะแนนได้เฉพาะใบสมัครที่ส่งโจทย์แล้วและยังไม่ได้ตัดสินใจ';
  end if;
  if exists (select 1 from public.challenge_scores where application_id = p_app and reused) then
    raise exception 'ใบสมัครนี้ใช้ผลโจทย์เดิม คะแนนถูกนำมาแล้ว';
  end if;
  select criteria into v_criteria from public.challenges where job_id = a.job_id;
  for c in select * from jsonb_array_elements(v_criteria) loop
    v_score := null;
    select (x ->> 'score')::int into v_score from jsonb_array_elements(p_scores) x where x ->> 'name' = c ->> 'name';
    if v_score is null then
      raise exception 'ให้คะแนนให้ครบทุกเกณฑ์ (%)', c ->> 'name';
    end if;
    if v_score < 0 or v_score > (c ->> 'weight')::int then
      raise exception 'คะแนน "%" ต้องอยู่ระหว่าง 0–%', c ->> 'name', c ->> 'weight';
    end if;
    v_total := v_total + v_score;
    v_out := v_out || jsonb_build_object('name', c ->> 'name', 'weight', (c ->> 'weight')::int, 'score', v_score);
  end loop;
  select display_name into v_name from public.profiles where id = v_user;
  insert into public.challenge_scores (application_id, scores, total, feedback, graded_by, graded_by_name, graded_at)
  values (p_app, v_out, v_total, left(coalesce(p_feedback, ''), 3000), v_user, coalesce(v_name, ''), now())
  on conflict (application_id) do update set scores = excluded.scores, total = excluded.total, feedback = excluded.feedback,
    graded_by = excluded.graded_by, graded_by_name = excluded.graded_by_name, graded_at = now();
  perform public.add_app_event(p_app, 'graded', 'company', '', jsonb_build_object('total', v_total));
  select title into v_title from public.jobs where id = a.job_id;
  perform public.notify(a.candidate_id, null, 'app_update', 'บริษัทให้คะแนนโจทย์แล้ว: ' || v_title,
                        'คะแนนรวม ' || v_total || '/100 ดูคะแนนรายเกณฑ์ได้ในหน้าใบสมัคร', '/me/applications/' || p_app);
  return v_total;
end
$$;

-- ---------------------------------------------------------------------------
-- ปฏิเสธพร้อมเหตุผล (ทำหลายคนพร้อมกันได้)
create or replace function public.do_reject(p_app uuid, p_reasons text[], p_note text, p_message text, p_batch uuid, p_vis timestamptz, p_system boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.applications;
  v_title text;
  v_msg text;
  v_labels text;
begin
  select * into a from public.applications where id = p_app;
  select title into v_title from public.jobs where id = a.job_id;
  select string_agg(label, ' · ' order by sort) into v_labels from public.reject_reasons where code = any (p_reasons);
  update public.applications set
    stage = 'rejected', stage_entered_at = now(), closed_at = now(), sla_due_at = null, candidate_due_at = null,
    reject_reasons = p_reasons, reject_note = nullif(trim(coalesce(p_note, '')), ''),
    rejected_by = case when p_system then null else auth.uid() end,
    closed_by_system = p_system
  where id = p_app;
  update public.interviews set status = 'cancelled' where application_id = p_app and status in ('awaiting_candidate', 'confirmed', 'reschedule_requested');
  v_msg := public.fill_message(coalesce(nullif(trim(coalesce(p_message, '')), ''), 'ขอบคุณที่สนใจตำแหน่ง{ตำแหน่ง} กับ{บริษัท} รอบนี้ยังไม่ไปต่อในขั้นถัดไป'), p_app);
  perform public.add_app_event(p_app, case when p_system then 'auto_closed' else 'rejected' end,
                               case when p_system then 'system' else 'company' end, v_msg,
                               jsonb_build_object('reasons', p_reasons, 'reason_labels', v_labels, 'note', nullif(trim(coalesce(p_note, '')), '')),
                               true, p_batch, p_vis);
  perform public.notify(a.candidate_id, null, 'app_update', 'ผลการพิจารณา: ' || v_title,
                        v_msg || E'\nเหตุผล: ' || coalesce(v_labels, ''), '/me/applications/' || p_app, false, p_batch, p_vis);
end
$$;
revoke execute on function public.do_reject(uuid, text[], text, text, uuid, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.reject_applications(p_apps uuid[], p_reasons text[], p_note text default null, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_company uuid := public.lock_company_apps(p_apps);
  v_batch uuid;
  v_vis timestamptz := now() + interval '30 seconds';
  v_blocked text;
  v_now uuid[] := '{}';
  v_pending int := 0;
  v_name text;
  r record;
  v_req uuid;
begin
  if p_reasons is null or cardinality(p_reasons) = 0 then
    raise exception 'เลือกเหตุผลอย่างน้อย 1 ข้อ ผู้สมัครทุกคนจะเห็นเหตุผลนี้';
  end if;
  if exists (select 1 from unnest(p_reasons) x where not exists (select 1 from public.reject_reasons rr where rr.code = x and not rr.system_only)) then
    raise exception 'เหตุผลไม่ถูกต้อง';
  end if;
  if 'other' = any (p_reasons) and char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'เลือก "อื่นๆ" แล้วต้องระบุเหตุผลเพิ่ม';
  end if;
  if exists (select 1 from public.applications a where a.id = any (p_apps) and a.stage not in ('applied', 'challenge_invited', 'challenge_submitted', 'interview')) then
    raise exception 'ปฏิเสธได้เฉพาะใบสมัครที่ยังดำเนินอยู่และยังไม่ถึงขั้นเสนองาน';
  end if;
  select string_agg(a.candidate_name, ', ') into v_blocked
    from public.applications a
   where a.id = any (p_apps) and a.stage = 'challenge_submitted'
     and not exists (select 1 from public.challenge_scores s where s.application_id = a.id);
  if v_blocked is not null then
    raise exception 'ให้คะแนนโจทย์ก่อนปฏิเสธ เพราะผู้สมัครต้องได้คะแนนรายเกณฑ์: %', v_blocked;
  end if;
  select display_name into v_name from public.profiles where id = v_user;
  for r in select a.id, a.stage, a.job_id, a.candidate_name, j.department_id, j.title
             from public.applications a join public.jobs j on j.id = a.job_id where a.id = any (p_apps) loop
    if r.stage = 'interview' and public.rule_on(v_company, 'reject_after_interview_needs_head')
       and not public.has_perm(v_company, 'offer', r.department_id) then
      v_req := null;
      insert into public.approval_requests (company_id, kind, ref_id, title, payload, requested_by, requested_by_name, approver_position_id)
      values (v_company, 'reject_after_interview', r.id, 'ปฏิเสธหลังสัมภาษณ์: ' || r.candidate_name || ' · ' || r.title,
              jsonb_build_object('reasons', p_reasons, 'note', p_note, 'message', p_message), v_user, coalesce(v_name, ''), r.department_id)
      on conflict do nothing
      returning id into v_req;
      if v_req is not null then
        perform public.notify_approvers(v_req);
      end if;
      v_pending := v_pending + 1;
    else
      v_now := v_now || r.id;
    end if;
  end loop;
  if cardinality(v_now) > 0 then
    v_batch := public.new_batch(v_company, 'reject', v_now, p_reasons, p_message);
    foreach v_req in array v_now loop
      perform public.do_reject(v_req, p_reasons, p_note, p_message, v_batch, v_vis, false);
    end loop;
  end if;
  return jsonb_build_object('batch_id', v_batch, 'rejected', cardinality(v_now), 'pending_approval', v_pending);
end
$$;

-- ---------------------------------------------------------------------------
-- สัมภาษณ์
create or replace function public.create_interview_slots(p_company uuid, p_job uuid, p_slots jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  s jsonb;
  v_count int := 0;
  v_start timestamptz;
  v_minutes int;
begin
  if p_job is not null and not exists (select 1 from public.jobs where id = p_job and company_id = p_company) then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(p_company, 'screen', case when p_job is null then null else public.job_department(p_job) end) then
    raise exception 'ตำแหน่งของคุณจัดเวลาสัมภาษณ์ไม่ได้';
  end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 or jsonb_array_length(p_slots) > 50 then
    raise exception 'เพิ่มเวลาได้ครั้งละ 1–50 ช่วง';
  end if;
  for s in select * from jsonb_array_elements(p_slots) loop
    v_start := (s ->> 'starts_at')::timestamptz;
    v_minutes := coalesce(nullif(s ->> 'minutes', '')::int, 45);
    if v_start is null or v_start < now() then
      raise exception 'เวลาสัมภาษณ์ต้องเป็นเวลาในอนาคต';
    end if;
    if v_minutes < 15 or v_minutes > 240 then
      raise exception 'ระยะเวลาสัมภาษณ์ต้อง 15–240 นาที';
    end if;
    insert into public.interview_slots (company_id, job_id, starts_at, ends_at, mode, location, meeting_url, capacity, created_by)
    values (p_company, p_job, v_start, v_start + make_interval(mins => v_minutes),
            coalesce(nullif(s ->> 'mode', ''), 'online'), coalesce(s ->> 'location', ''), nullif(trim(coalesce(s ->> 'meeting_url', '')), ''),
            coalesce(nullif(s ->> 'capacity', '')::int, 1), v_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

create or replace function public.delete_interview_slot(p_slot uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare sl public.interview_slots;
begin
  perform public.require_user();
  select * into sl from public.interview_slots where id = p_slot;
  if not found or not public.has_perm(sl.company_id, 'screen', case when sl.job_id is null then null else public.job_department(sl.job_id) end) then
    raise exception 'ไม่พบช่วงเวลานี้';
  end if;
  if exists (select 1 from public.interviews where slot_id = p_slot and status = 'confirmed') then
    raise exception 'มีผู้สมัครจองช่วงเวลานี้แล้ว ยกเลิกนัดก่อน';
  end if;
  delete from public.interview_slots where id = p_slot;
end
$$;

create or replace function public.invite_to_interview(p_apps uuid[], p_slot_ids uuid[], p_message text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  v_company uuid := public.lock_company_apps(p_apps);
  v_batch uuid;
  v_vis timestamptz := now() + interval '30 seconds';
  v_blocked text;
  r record;
  v_msg text;
begin
  if p_slot_ids is null or cardinality(p_slot_ids) = 0 then
    raise exception 'เลือกช่วงเวลาสัมภาษณ์อย่างน้อย 1 ช่วง';
  end if;
  if exists (select 1 from unnest(p_slot_ids) x where not exists (
               select 1 from public.interview_slots s where s.id = x and s.company_id = v_company and s.starts_at > now())) then
    raise exception 'ช่วงเวลาที่เลือกบางช่วงใช้ไม่ได้แล้ว';
  end if;
  if exists (select 1 from public.applications a where a.id = any (p_apps) and a.stage not in ('applied', 'challenge_submitted')) then
    raise exception 'เชิญสัมภาษณ์ได้เฉพาะผู้สมัครที่รอคัด หรือส่งโจทย์แล้ว';
  end if;
  select string_agg(a.candidate_name, ', ') into v_blocked from public.applications a
   where a.id = any (p_apps) and a.stage = 'challenge_submitted'
     and not exists (select 1 from public.challenge_scores s where s.application_id = a.id);
  if v_blocked is not null then
    raise exception 'ให้คะแนนโจทย์ก่อนเชิญสัมภาษณ์: %', v_blocked;
  end if;
  v_batch := public.new_batch(v_company, 'invite_interview', p_apps, null, p_message);
  for r in select a.id, a.candidate_id, j.title from public.applications a join public.jobs j on j.id = a.job_id where a.id = any (p_apps) loop
    perform public.reset_stage(r.id, 'interview', null, v_vis + interval '2 days');
    update public.interviews set status = 'cancelled' where application_id = r.id and status in ('awaiting_candidate', 'reschedule_requested');
    insert into public.interviews (application_id, offered_slot_ids, status, batch_id) values (r.id, p_slot_ids, 'awaiting_candidate', v_batch);
    v_msg := public.fill_message(coalesce(nullif(trim(coalesce(p_message, '')), ''), 'ขอเชิญสัมภาษณ์ตำแหน่ง{ตำแหน่ง} เลือกเวลาที่สะดวกได้จากหน้าใบสมัคร'), r.id);
    perform public.add_app_event(r.id, 'interview_invited', 'company', v_msg, '{}'::jsonb, true, v_batch, v_vis);
    perform public.notify(r.candidate_id, null, 'app_update', 'เชิญสัมภาษณ์: ' || r.title, v_msg, '/me/applications/' || r.id, false, v_batch, v_vis);
  end loop;
  return v_batch;
end
$$;

create or replace function public.interview_options(p_interview uuid)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, mode text, location text, seats_left int)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.starts_at, s.ends_at, s.mode, s.location,
         s.capacity - (select count(*)::int from public.interviews x where x.slot_id = s.id and x.status = 'confirmed')
  from public.interviews i
  join public.applications a on a.id = i.application_id
  join public.interview_slots s on s.id = any (i.offered_slot_ids)
  where i.id = p_interview and (a.candidate_id = auth.uid() or public.can_screen_job(a.job_id))
  order by s.starts_at;
$$;

create or replace function public.book_interview(p_interview uuid, p_slot uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  i public.interviews;
  a public.applications;
  sl public.interview_slots;
  v_uid uuid;
  v_title text;
begin
  select * into i from public.interviews where id = p_interview for update;
  select * into a from public.applications where id = i.application_id;
  if i.id is null or a.candidate_id <> v_user then
    raise exception 'ไม่พบนัดสัมภาษณ์';
  end if;
  if i.status not in ('awaiting_candidate', 'reschedule_requested') or a.stage <> 'interview' then
    raise exception 'นัดนี้เลือกเวลาไม่ได้แล้ว';
  end if;
  if not (p_slot = any (i.offered_slot_ids)) then
    raise exception 'เลือกได้เฉพาะเวลาที่บริษัทเสนอ';
  end if;
  select * into sl from public.interview_slots where id = p_slot for update;
  if sl.id is null or sl.starts_at <= now() then
    raise exception 'ช่วงเวลานี้ผ่านไปแล้ว';
  end if;
  if (select count(*) from public.interviews where slot_id = p_slot and status = 'confirmed') >= sl.capacity then
    raise exception 'ช่วงเวลานี้เต็มแล้ว เลือกเวลาอื่น';
  end if;
  update public.interviews set slot_id = sl.id, starts_at = sl.starts_at, ends_at = sl.ends_at, mode = sl.mode,
    location = sl.location, meeting_url = sl.meeting_url, status = 'confirmed' where id = p_interview;
  update public.applications set candidate_due_at = null, sla_due_at = sl.ends_at + interval '7 days', warned_at = null, escalated_at = null
   where id = a.id;
  perform public.add_app_event(a.id, 'interview_booked', 'candidate', '', jsonb_build_object('starts_at', sl.starts_at, 'mode', sl.mode));
  select title into v_title from public.jobs where id = a.job_id;
  for v_uid in select * from public.job_screeners(a.job_id) loop
    perform public.notify(v_uid, a.company_id, 'interview_update', a.candidate_name || ' ยืนยันนัดสัมภาษณ์ '
                          || to_char(sl.starts_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI'), v_title,
                          '/c/' || a.company_id || '/interviews');
  end loop;
end
$$;

create or replace function public.request_interview_reschedule(p_interview uuid, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  i public.interviews;
  a public.applications;
  v_uid uuid;
  v_title text;
begin
  select * into i from public.interviews where id = p_interview for update;
  select * into a from public.applications where id = i.application_id;
  if i.id is null or a.candidate_id <> v_user then
    raise exception 'ไม่พบนัดสัมภาษณ์';
  end if;
  if i.status not in ('awaiting_candidate', 'confirmed') then
    raise exception 'นัดนี้ขอเลื่อนไม่ได้';
  end if;
  if i.status = 'confirmed' and i.starts_at < now() + interval '2 hours' then
    raise exception 'ขอเลื่อนได้ก่อนเวลานัดอย่างน้อย 2 ชั่วโมง ติดต่อบริษัทในแชตแทน';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'บอกช่วงเวลาที่สะดวกให้บริษัทด้วย';
  end if;
  update public.interviews set status = 'reschedule_requested', candidate_note = left(p_note, 500), slot_id = null,
    starts_at = null, ends_at = null where id = p_interview;
  update public.applications set candidate_due_at = null, sla_due_at = now() + interval '7 days', warned_at = null, escalated_at = null where id = a.id;
  perform public.add_app_event(a.id, 'reschedule_requested', 'candidate', p_note, '{}'::jsonb);
  select title into v_title from public.jobs where id = a.job_id;
  for v_uid in select * from public.job_screeners(a.job_id) loop
    perform public.notify(v_uid, a.company_id, 'interview_update', a.candidate_name || ' ขอเลื่อนนัดสัมภาษณ์', p_note,
                          '/c/' || a.company_id || '/applications/' || a.id);
  end loop;
end
$$;

create or replace function public.offer_interview_slots(p_interview uuid, p_slot_ids uuid[], p_message text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  i public.interviews;
  a public.applications;
  v_title text;
begin
  perform public.require_user();
  select * into i from public.interviews where id = p_interview for update;
  select * into a from public.applications where id = i.application_id;
  if i.id is null or not public.can_screen_job(a.job_id) then
    raise exception 'ไม่พบนัดสัมภาษณ์';
  end if;
  if i.status not in ('reschedule_requested', 'awaiting_candidate') or a.stage <> 'interview' then
    raise exception 'นัดนี้เสนอเวลาใหม่ไม่ได้';
  end if;
  if p_slot_ids is null or cardinality(p_slot_ids) = 0 or exists (select 1 from unnest(p_slot_ids) x where not exists (
       select 1 from public.interview_slots s where s.id = x and s.company_id = a.company_id and s.starts_at > now())) then
    raise exception 'เลือกช่วงเวลาที่ยังไม่ผ่านไปอย่างน้อย 1 ช่วง';
  end if;
  update public.interviews set offered_slot_ids = p_slot_ids, status = 'awaiting_candidate' where id = p_interview;
  update public.applications set candidate_due_at = now() + interval '2 days', sla_due_at = null, warned_at = null, escalated_at = null where id = a.id;
  perform public.add_app_event(a.id, 'interview_slots_offered', 'company', coalesce(p_message, ''), '{}'::jsonb);
  select title into v_title from public.jobs where id = a.job_id;
  perform public.notify(a.candidate_id, null, 'app_update', 'บริษัทเสนอเวลาสัมภาษณ์ใหม่: ' || v_title,
                        coalesce(p_message, 'เลือกเวลาที่สะดวกได้จากหน้าใบสมัคร'), '/me/applications/' || a.id);
end
$$;

create or replace function public.complete_interview(p_interview uuid, p_no_show boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  i public.interviews;
  a public.applications;
begin
  perform public.require_user();
  select * into i from public.interviews where id = p_interview for update;
  select * into a from public.applications where id = i.application_id;
  if i.id is null or not public.can_screen_job(a.job_id) then
    raise exception 'ไม่พบนัดสัมภาษณ์';
  end if;
  if i.status <> 'confirmed' then
    raise exception 'บันทึกผลได้เฉพาะนัดที่ยืนยันแล้ว';
  end if;
  update public.interviews set status = case when p_no_show then 'no_show' else 'completed' end where id = p_interview;
  update public.applications set sla_due_at = now() + interval '7 days', warned_at = null, escalated_at = null where id = a.id;
  perform public.add_app_event(a.id, case when p_no_show then 'interview_no_show' else 'interview_completed' end, 'company', '', '{}'::jsonb, false);
end
$$;

-- ---------------------------------------------------------------------------
-- ข้อเสนองาน
create or replace function public.send_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.offers;
  a public.applications;
  v_title text;
  v_unit text;
begin
  select * into o from public.offers where id = p_offer for update;
  select * into a from public.applications where id = o.application_id;
  update public.offers set status = 'sent', sent_at = now(),
    expires_at = coalesce(expires_at, now() + interval '5 days') where id = p_offer
  returning * into o;
  perform public.reset_stage(a.id, 'offer', null, o.expires_at);
  select title into v_title from public.jobs where id = a.job_id;
  v_unit := case o.pay_unit when 'month' then 'บาท/เดือน' when 'day' then 'บาท/วัน' when 'hour' then 'บาท/ชั่วโมง' else 'บาท/โปรเจกต์' end;
  perform public.add_app_event(a.id, 'offer_sent', 'company', o.note,
                               jsonb_build_object('salary', o.salary, 'pay_unit', o.pay_unit, 'start_date', o.start_date, 'expires_at', o.expires_at));
  perform public.notify(a.candidate_id, null, 'app_update', 'ได้รับข้อเสนองาน: ' || v_title,
                        o.salary || ' ' || v_unit || ' ตอบรับได้ถึง ' || to_char(o.expires_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI'),
                        '/me/applications/' || a.id);
end
$$;
revoke execute on function public.send_offer(uuid) from public, anon, authenticated;

create or replace function public.make_offer(
  p_app uuid, p_salary int, p_pay_unit text default 'month', p_start_date date default null,
  p_note text default '', p_expires_days int default 5)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  a public.applications;
  j public.jobs;
  v_offer uuid;
  v_req uuid;
  v_name text;
  v_root uuid;
begin
  select * into a from public.applications where id = p_app for update;
  if not found then
    raise exception 'ไม่พบใบสมัคร';
  end if;
  select * into j from public.jobs where id = a.job_id;
  if not public.has_perm(a.company_id, 'offer', j.department_id) then
    raise exception 'ตำแหน่งของคุณเสนองานในแผนกนี้ไม่ได้';
  end if;
  if a.stage not in ('applied', 'challenge_submitted', 'interview') then
    raise exception 'เสนองานได้เฉพาะใบสมัครที่ยังดำเนินอยู่';
  end if;
  if a.stage = 'challenge_submitted' and not exists (select 1 from public.challenge_scores where application_id = p_app) then
    raise exception 'ให้คะแนนโจทย์ก่อนเสนองาน';
  end if;
  if p_salary is null or p_salary <= 0 then
    raise exception 'ระบุค่าตอบแทน';
  end if;
  if exists (select 1 from public.offers where application_id = p_app and status in ('sent', 'accepted')) then
    raise exception 'ส่งข้อเสนอให้ผู้สมัครคนนี้แล้ว';
  end if;
  insert into public.offers (application_id, salary, pay_unit, start_date, note, expires_at, status, created_by)
  values (p_app, p_salary, coalesce(p_pay_unit, 'month'), p_start_date, left(coalesce(p_note, ''), 3000),
          now() + make_interval(days => least(greatest(coalesce(p_expires_days, 5), 1), 14)), 'draft', v_user)
  on conflict (application_id) do update set salary = excluded.salary, pay_unit = excluded.pay_unit, start_date = excluded.start_date,
    note = excluded.note, expires_at = excluded.expires_at, status = 'draft', created_by = excluded.created_by
  returning id into v_offer;
  if public.rule_on(a.company_id, 'offer_over_range_needs_owner') and j.salary_max is not null
     and coalesce(p_pay_unit, 'month') = j.pay_unit and p_salary > j.salary_max and not public.is_company_owner(a.company_id) then
    select display_name into v_name from public.profiles where id = v_user;
    select id into v_root from public.positions where company_id = a.company_id and parent_id is null;
    update public.offers set status = 'pending_approval' where id = v_offer;
    insert into public.approval_requests (company_id, kind, ref_id, title, payload, requested_by, requested_by_name, approver_position_id)
    values (a.company_id, 'offer', v_offer,
            'เสนองานเกินช่วงเงินเดือน: ' || a.candidate_name || ' · ' || j.title || ' · ' || p_salary || ' (ช่วงในประกาศ '
              || coalesce(j.salary_min::text, '-') || '–' || j.salary_max || ')',
            jsonb_build_object('salary', p_salary, 'salary_max', j.salary_max), v_user, coalesce(v_name, ''), v_root)
    returning id into v_req;
    perform public.notify_approvers(v_req);
    perform public.add_app_event(p_app, 'offer_pending_approval', 'company', '', jsonb_build_object('salary', p_salary), false);
    return 'pending_approval';
  end if;
  perform public.send_offer(v_offer);
  return 'sent';
end
$$;

create or replace function public.respond_offer(p_offer uuid, p_accept boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  o public.offers;
  a public.applications;
  v_uid uuid;
  v_title text;
begin
  select * into o from public.offers where id = p_offer for update;
  select * into a from public.applications where id = o.application_id for update;
  if o.id is null or a.candidate_id <> v_user then
    raise exception 'ไม่พบข้อเสนองาน';
  end if;
  if o.status <> 'sent' or a.stage <> 'offer' then
    raise exception 'ข้อเสนอนี้ตอบไม่ได้แล้ว';
  end if;
  if o.expires_at is not null and o.expires_at < now() then
    raise exception 'ข้อเสนอนี้หมดอายุแล้ว';
  end if;
  update public.offers set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now(),
    decline_reason = case when p_accept then null else left(coalesce(p_reason, ''), 500) end where id = p_offer;
  perform public.reset_stage(a.id, case when p_accept then 'hired'::public.app_stage else 'declined'::public.app_stage end, null, null);
  perform public.add_app_event(a.id, case when p_accept then 'offer_accepted' else 'offer_declined' end, 'candidate', coalesce(p_reason, ''), '{}'::jsonb);
  select title into v_title from public.jobs where id = a.job_id;
  for v_uid in select * from public.job_screeners(a.job_id) loop
    perform public.notify(v_uid, a.company_id, 'hiring_update',
                          a.candidate_name || case when p_accept then ' ตอบรับข้อเสนองานแล้ว' else ' ปฏิเสธข้อเสนองาน' end, v_title,
                          '/c/' || a.company_id || '/applications/' || a.id, false);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- อนุมัติ / ไม่อนุมัติ
create or replace function public.decide_approval(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  r public.approval_requests;
  v_name text;
  a public.applications;
begin
  if not public.can_decide_approval(p_request) then
    raise exception 'คุณไม่มีสิทธิ์อนุมัติเรื่องนี้ หรือเรื่องนี้ได้รับการตัดสินแล้ว';
  end if;
  select * into r from public.approval_requests where id = p_request for update;
  select display_name into v_name from public.profiles where id = v_user;
  update public.approval_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = v_user, decided_by_name = coalesce(v_name, ''), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_request;

  if r.kind = 'job_post' then
    if p_approve then
      perform public.publish_job_now(r.ref_id);
    else
      update public.jobs set status = 'draft', approval_note = nullif(trim(coalesce(p_note, '')), '') where id = r.ref_id;
    end if;
  elsif r.kind = 'offer' then
    if p_approve then
      perform public.send_offer(r.ref_id);
    else
      update public.offers set status = 'draft' where id = r.ref_id;
    end if;
  elsif r.kind = 'reject_after_interview' then
    if p_approve then
      select * into a from public.applications where id = r.ref_id for update;
      if a.stage = 'interview' then
        perform public.do_reject(r.ref_id, array(select jsonb_array_elements_text(r.payload -> 'reasons')),
                                 r.payload ->> 'note', r.payload ->> 'message', null, now(), false);
      end if;
    end if;
  end if;

  perform public.audit(r.company_id, case when p_approve then 'approval.approved' else 'approval.rejected' end,
                       jsonb_build_object('request_id', r.id, 'kind', r.kind, 'title', r.title));
  if r.requested_by is not null then
    perform public.notify(r.requested_by, r.company_id, 'approval',
                          case when p_approve then 'อนุมัติแล้ว: ' else 'ไม่อนุมัติ: ' end || r.title,
                          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'โดย ' || coalesce(v_name, '')),
                          '/c/' || r.company_id || '/team?tab=approvals');
  end if;
end
$$;

create or replace function public.cancel_approval(p_request uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  r public.approval_requests;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if r.id is null or r.requested_by <> v_user or r.status <> 'pending' then
    raise exception 'ยกเลิกคำขอนี้ไม่ได้';
  end if;
  update public.approval_requests set status = 'cancelled' where id = p_request;
  if r.kind = 'job_post' then
    update public.jobs set status = 'draft' where id = r.ref_id and status = 'pending_approval';
  elsif r.kind = 'offer' then
    update public.offers set status = 'draft' where id = r.ref_id and status = 'pending_approval';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- ยกเลิกการทำหลายคน (ภายใน 30 วินาที)
create or replace function public.undo_batch(p_batch uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  b public.action_batches;
  p jsonb;
  iv jsonb;
  v_count int := 0;
begin
  select * into b from public.action_batches where id = p_batch for update;
  if b.id is null or (b.actor_id <> v_user and not public.is_company_owner(b.company_id)) then
    raise exception 'ไม่พบรายการนี้';
  end if;
  if b.undone_at is not null then
    raise exception 'ยกเลิกไปแล้ว';
  end if;
  if b.undo_until < now() then
    raise exception 'เลย 30 วินาทีแล้ว ระบบส่งถึงผู้สมัครไปแล้ว';
  end if;
  for p in select * from jsonb_array_elements(b.previous) loop
    update public.applications set
      stage = (p ->> 'stage')::public.app_stage,
      stage_entered_at = (p ->> 'stage_entered_at')::timestamptz,
      sla_due_at = (p ->> 'sla_due_at')::timestamptz,
      candidate_due_at = (p ->> 'candidate_due_at')::timestamptz,
      challenge_invited_at = (p ->> 'challenge_invited_at')::timestamptz,
      warned_at = (p ->> 'warned_at')::timestamptz,
      escalated_at = (p ->> 'escalated_at')::timestamptz,
      closed_at = (p ->> 'closed_at')::timestamptz,
      reject_reasons = case when p -> 'reject_reasons' = 'null'::jsonb then null else array(select jsonb_array_elements_text(p -> 'reject_reasons')) end,
      reject_note = p ->> 'reject_note',
      rejected_by = (p ->> 'rejected_by')::uuid,
      closed_by_system = false
    where id = (p ->> 'id')::uuid;
    for iv in select * from jsonb_array_elements(coalesce(p -> 'interviews', '[]'::jsonb)) loop
      update public.interviews set status = iv ->> 'status' where id = (iv ->> 'id')::uuid;
    end loop;
    v_count := v_count + 1;
  end loop;
  delete from public.interviews where batch_id = p_batch;
  delete from public.application_events where batch_id = p_batch;
  delete from public.notifications where batch_id = p_batch;
  delete from public.chat_messages where batch_id = p_batch;
  update public.action_batches set undone_at = now() where id = p_batch;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- ปิดรับประกาศ
create or replace function public.close_job(p_job uuid, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  j public.jobs;
  v_blocked text;
  v_app uuid;
  v_closed int := 0;
  v_remaining int;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(j.company_id, 'post', j.department_id) then
    raise exception 'ตำแหน่งของคุณปิดประกาศของแผนกนี้ไม่ได้';
  end if;
  if j.status = 'closed' then
    raise exception 'ประกาศนี้ปิดแล้ว';
  end if;
  select string_agg(a.candidate_name, ', ') into v_blocked from public.applications a
   where a.job_id = p_job and a.stage = 'challenge_submitted'
     and not exists (select 1 from public.challenge_scores s where s.application_id = a.id);
  if v_blocked is not null then
    raise exception 'มีโจทย์ที่ส่งแล้วแต่ยังไม่ได้ให้คะแนน ให้คะแนนก่อนปิดประกาศ: %', v_blocked;
  end if;
  update public.approval_requests set status = 'cancelled' where kind = 'job_post' and ref_id = p_job and status = 'pending';
  for v_app in select id from public.applications where job_id = p_job and stage in ('applied', 'challenge_invited', 'challenge_submitted') for update loop
    perform public.do_reject(v_app, array['position_closed'], null,
                             coalesce(nullif(trim(coalesce(p_message, '')), ''), 'ตำแหน่ง{ตำแหน่ง} ปิดรับแล้ว ขอบคุณที่สนใจ{บริษัท} ข้อมูลและผลงานของคุณยังอยู่ในโปรไฟล์ ใช้สมัครงานอื่นได้ทันที'),
                             null, now(), false);
    v_closed := v_closed + 1;
  end loop;
  select count(*) into v_remaining from public.applications where job_id = p_job and stage in ('interview', 'offer');
  update public.jobs set status = 'closed', closed_at = now() where id = p_job;
  perform public.audit(j.company_id, 'job.closed', jsonb_build_object('job_id', p_job, 'title', j.title, 'auto_replied', v_closed));
  return jsonb_build_object('auto_replied', v_closed, 'still_in_process', v_remaining);
end
$$;

-- ---------------------------------------------------------------------------
-- ข้อความสำเร็จรูป และบันทึกภายใน
create or replace function public.save_template(p_company uuid, p_kind text, p_label text, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform public.require_user();
  if not public.has_perm(p_company, 'screen') then
    raise exception 'ตำแหน่งของคุณบันทึกข้อความสำเร็จรูปไม่ได้';
  end if;
  insert into public.message_templates (company_id, kind, label, body, created_by)
  values (p_company, p_kind, left(trim(p_label), 80), left(p_body, 3000), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.delete_template(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.message_templates;
begin
  perform public.require_user();
  select * into t from public.message_templates where id = p_id;
  if t.id is null or not (t.created_by = auth.uid() or public.is_company_owner(t.company_id)) then
    raise exception 'ลบได้เฉพาะข้อความที่คุณสร้าง';
  end if;
  delete from public.message_templates where id = p_id;
end
$$;

create or replace function public.add_application_note(p_app uuid, p_body text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  perform public.require_user();
  if not public.can_screen_app(p_app) then
    raise exception 'ไม่พบใบสมัคร';
  end if;
  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.application_notes (application_id, author_id, author_name, body)
  values (p_app, auth.uid(), coalesce(v_name, ''), left(trim(p_body), 3000));
end
$$;
