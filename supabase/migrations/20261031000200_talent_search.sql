-- บริษัทค้นหาผู้หางานที่เปิดให้ค้นหา (ไม่เห็นชื่อหรือช่องทางติดต่อ) แล้วเชิญให้สมัครงาน
-- Companies browse anonymised profiles of candidates who opted in (candidate_profiles.discoverable)
-- and invite them to apply. The company sees the full profile only if the candidate applies (principle 4).

insert into public.notification_kinds (kind, audience, label, description, default_email, default_line, default_sms, digest, sort) values
  ('talent_invite', 'candidate', 'บริษัทเชิญให้สมัครงาน', 'เฉพาะเมื่อคุณเปิดให้บริษัทค้นหาโปรไฟล์ได้', true, true, false, false, 115)
on conflict (kind) do nothing;

create table public.talent_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id),
  foreign key (job_id, company_id) references public.jobs (id, company_id) on delete cascade
);
create index talent_invites_company_idx on public.talent_invites (company_id, created_at desc);
alter table public.talent_invites enable row level security;
create policy "talent_invites: candidate reads own" on public.talent_invites for select using (candidate_id = auth.uid());

-- รหัสแทนตัวผู้หางานที่ต่างกันในแต่ละบริษัท (บริษัทเอารหัสไปเทียบข้ามบริษัทไม่ได้ และไม่เห็น user id จริง)
create or replace function public.talent_handle(p_company uuid, p_user uuid)
returns text language sql immutable set search_path = public, pg_temp as $$
  select left(md5('workdee-talent:' || p_company::text || ':' || p_user::text), 16);
$$;
revoke execute on function public.talent_handle(uuid, uuid) from public, anon, authenticated;

create or replace function public.search_talent(p_company uuid, p_query text default null, p_province text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_prov text := nullif(trim(coalesce(p_province, '')), '');
  v_rows jsonb;
begin
  if public.perm_level(p_company, 'screen') = 0 then
    raise exception 'ตำแหน่งของคุณยังไม่มีสิทธิ์ดูผู้สมัคร';
  end if;
  if not exists (select 1 from public.companies where id = p_company and status = 'verified') then
    raise exception 'ค้นหาผู้หางานได้หลังบริษัทได้รับการยืนยัน';
  end if;

  select coalesce(jsonb_agg(r order by r.results_count desc, r.updated_at desc), '[]'::jsonb) into v_rows
  from (
    select
      public.talent_handle(p_company, cp.user_id) as handle,
      cp.headline, cp.province, cp.skills, cp.tools, cp.pref_job_types, cp.updated_at,
      (select jsonb_build_object('level', e.level, 'major', e.major, 'status', e.status, 'verified', e.verify_level in ('doc', 'inst'))
         from public.educations e where e.user_id = cp.user_id
         order by (e.verify_level in ('doc', 'inst')) desc, e.status = 'graduated' desc, e.created_at desc limit 1) as education,
      coalesce((
        select jsonb_agg(jsonb_build_object('skill', b.skill_key, 'title', b.title, 'total', b.total) order by b.total desc)
        from (
          select distinct on (ch.skill_key) ch.skill_key, ch.title, s.total
          from public.applications a
          join public.challenges ch on ch.job_id = a.job_id
          join public.challenge_scores s on s.application_id = a.id
          where a.candidate_id = cp.user_id and s.total >= 70 and coalesce(ch.skill_key, '') <> ''
          order by ch.skill_key, s.total desc
        ) b), '[]'::jsonb) as results,
      (select count(*) from public.applications a join public.challenge_scores s on s.application_id = a.id
        where a.candidate_id = cp.user_id and s.total >= 70) as results_count,
      exists (select 1 from public.applications a where a.candidate_id = cp.user_id and a.company_id = p_company) as applied,
      (select coalesce(jsonb_agg(ti.job_id), '[]'::jsonb) from public.talent_invites ti
        where ti.candidate_id = cp.user_id and ti.company_id = p_company) as invited_jobs
    from public.candidate_profiles cp
    where cp.discoverable
      and cp.user_id <> auth.uid()
      and not (p_company = any (cp.hidden_company_ids))
      and not exists (select 1 from public.company_members m where m.company_id = p_company and m.user_id = cp.user_id and m.status = 'active')
      and (v_prov is null or cp.province = v_prov)
      and (v_q is null
           or cp.headline ilike '%' || v_q || '%'
           or exists (select 1 from unnest(cp.skills || cp.tools) t where t ilike '%' || v_q || '%'))
    limit 60
  ) r;
  return v_rows;
end
$$;
revoke execute on function public.search_talent(uuid, text, text) from public, anon;
grant execute on function public.search_talent(uuid, text, text) to authenticated;

create or replace function public.invite_talent(p_job uuid, p_handle text, p_message text default '')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  j public.jobs;
  v_company_name text;
  v_candidate uuid;
  v_id uuid;
  v_msg text := left(trim(coalesce(p_message, '')), 500);
begin
  select * into j from public.jobs where id = p_job;
  if not found then
    raise exception 'ไม่พบประกาศ';
  end if;
  if not public.has_perm(j.company_id, 'screen', j.department_id) then
    raise exception 'ตำแหน่งของคุณเชิญผู้หางานให้ประกาศนี้ไม่ได้';
  end if;
  if j.status <> 'open' then
    raise exception 'เชิญได้เฉพาะประกาศที่เปิดรับอยู่';
  end if;

  select cp.user_id into v_candidate
  from public.candidate_profiles cp
  where cp.discoverable
    and public.talent_handle(j.company_id, cp.user_id) = p_handle
    and not (j.company_id = any (cp.hidden_company_ids))
    and not exists (select 1 from public.company_members m where m.company_id = j.company_id and m.user_id = cp.user_id and m.status = 'active');
  if v_candidate is null then
    raise exception 'ผู้หางานคนนี้ปิดการค้นหาแล้ว หรือไม่อยู่ในรายการ';
  end if;
  if exists (select 1 from public.applications where job_id = p_job and candidate_id = v_candidate) then
    raise exception 'ผู้หางานคนนี้สมัครประกาศนี้แล้ว';
  end if;
  if exists (select 1 from public.talent_invites where job_id = p_job and candidate_id = v_candidate) then
    raise exception 'เชิญคนนี้ให้ประกาศนี้ไปแล้ว';
  end if;
  if (select count(*) from public.talent_invites where company_id = j.company_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'เชิญได้วันละไม่เกิน 30 คนต่อบริษัท เพื่อไม่ให้ผู้หางานถูกรบกวน';
  end if;

  insert into public.talent_invites (company_id, job_id, candidate_id, message, invited_by)
  values (j.company_id, p_job, v_candidate, v_msg, auth.uid())
  returning id into v_id;

  select name into v_company_name from public.companies where id = j.company_id;
  perform public.notify(
    v_candidate, null, 'talent_invite',
    v_company_name || ' เชิญคุณสมัครตำแหน่ง ' || j.title,
    case when v_msg = '' then 'บริษัทเห็นทักษะในโปรไฟล์ของคุณ (ไม่เห็นชื่อ) ถ้าสนใจ กดดูประกาศแล้วสมัครได้เลย'
         else v_msg || E'\n\nบริษัทยังไม่เห็นชื่อหรือข้อมูลติดต่อของคุณ จนกว่าคุณจะกดสมัคร' end,
    '/jobs/' || p_job
  );
  perform public.audit(j.company_id, 'talent.invited', jsonb_build_object('job_id', p_job, 'invite_id', v_id));
  return v_id;
end
$$;
revoke execute on function public.invite_talent(uuid, text, text) from public, anon;
grant execute on function public.invite_talent(uuid, text, text) to authenticated;

-- สมัครจากคำเชิญ: บันทึกที่มาว่า "invitation" เพื่อให้บริษัทเห็นว่ามาจากการเชิญ
create or replace function public.mark_invited_application()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.talent_invites where job_id = new.job_id and candidate_id = new.candidate_id) then
    new.source := 'invitation';
  end if;
  return new;
end
$$;
revoke execute on function public.mark_invited_application() from public, anon, authenticated;
create trigger applications_mark_invited before insert on public.applications
  for each row execute function public.mark_invited_application();
