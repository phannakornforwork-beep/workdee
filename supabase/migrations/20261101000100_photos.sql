-- รูปโปรไฟล์ผู้หางานและโลโก้บริษัท (bucket สาธารณะ "media" อ่านได้ทุกคน เขียนได้เฉพาะเจ้าของ)
-- Candidate photos and company logos in a public, image-only bucket.
--   media/avatars/{user_id}/{file}     รูปโปรไฟล์ผู้หางาน (บริษัทเห็นเมื่อผู้หางานกดสมัครเท่านั้น ผ่าน snapshot)
--   media/logos/{company_id}/{file}    โลโก้บริษัท (แสดงในประกาศงานสาธารณะ)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "media: public read" on storage.objects for select
  using (bucket_id = 'media');
create policy "media: own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media: own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media: company logo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'logos'
              and (public.is_company_owner(public.try_uuid((storage.foldername(name))[2]))
                   or public.perm_level(public.try_uuid((storage.foldername(name))[2]), 'members') = 2));
create policy "media: company logo delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'logos'
         and (public.is_company_owner(public.try_uuid((storage.foldername(name))[2]))
              or public.perm_level(public.try_uuid((storage.foldername(name))[2]), 'members') = 2));

alter table public.candidate_profiles add column photo_path text;
alter table public.candidate_profiles add constraint candidate_photo_own
  check (photo_path is null or (photo_path like 'avatars/' || user_id::text || '/%' and char_length(photo_path) <= 300));

alter table public.companies add column logo_path text;
alter table public.companies add constraint company_logo_own
  check (logo_path is null or (logo_path like 'logos/' || id::text || '/%' and char_length(logo_path) <= 300));

-- ตั้ง/ลบโลโก้ (สิทธิ์เดียวกับแก้ข้อมูลบริษัท)
create or replace function public.set_company_logo(p_company uuid, p_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_user();
  if not (public.is_company_owner(p_company) or public.perm_level(p_company, 'members') = 2) then
    raise exception 'เฉพาะเจ้าของกิจการหรือผู้ดูแลทีมทั้งบริษัทเปลี่ยนโลโก้ได้';
  end if;
  if p_path is not null and p_path not like 'logos/' || p_company::text || '/%' then
    raise exception 'ตำแหน่งไฟล์ไม่ถูกต้อง';
  end if;
  update public.companies set logo_path = nullif(p_path, '') where id = p_company;
  perform public.audit(p_company, 'company.logo', jsonb_build_object('set', p_path is not null));
end
$$;
revoke execute on function public.set_company_logo(uuid, text) from public, anon;
grant execute on function public.set_company_logo(uuid, text) to authenticated;

-- โลโก้ในประกาศงานและหน้าบริษัทสาธารณะ (เพิ่มคอลัมน์ท้ายสุด)
create or replace view public.public_companies as
select c.id, c.name, c.industry, c.province, c.size_range, c.about, c.website, c.created_at,
       s.response_rate, coalesce(s.sample_size, 0) as response_sample,
       c.logo_path
from public.companies c
left join public.company_response_stats s on s.company_id = c.id
where c.status = 'verified';

create or replace view public.job_board as
select j.id, j.company_id, c.name as company_name, c.industry as company_industry,
       j.title, j.job_type, j.description, j.responsibilities, j.requirements, j.skills,
       j.province, j.work_mode, j.salary_min, j.salary_max, j.pay_unit,
       j.gig_days, j.gig_start, j.gig_end, j.headcount, j.published_at, j.closes_at,
       (ch.job_id is not null) as has_challenge,
       ch.title as challenge_title, ch.time_limit_minutes, ch.due_days, ch.criteria as challenge_criteria,
       ch.ai_policy, ch.accept_reuse, ch.skill_key,
       s.response_rate, coalesce(s.sample_size, 0) as response_sample,
       c.logo_path as company_logo_path
from public.jobs j
join public.companies c on c.id = j.company_id and c.status = 'verified'
left join public.challenges ch on ch.job_id = j.id
left join public.company_response_stats s on s.company_id = j.company_id
where j.status = 'open' and (j.closes_at is null or j.closes_at > now());

-- รูปโปรไฟล์ไปกับใบสมัคร (บริษัทเห็นรูปเฉพาะใบสมัครที่ผู้หางานส่งเอง)
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
    'photo_path', cp.photo_path,
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

-- โลโก้บริษัทในฟีดงาน และรูปผู้สมัครในกระดานผู้สมัคร
create or replace function public.job_feed(p_q text default null, p_type text default null, p_province text default null,
                                           p_limit int default 30, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select b.id, b.title, b.company_id, b.company_name, b.job_type, b.province, b.work_mode,
           b.salary_min, b.salary_max, b.pay_unit, b.skills, b.published_at, b.closes_at,
           b.has_challenge, b.time_limit_minutes, b.response_rate, b.response_sample, b.gig_days, b.company_logo_path,
           case when auth.uid() is null then null else public.compute_match(b.id, auth.uid()) end as match_score,
           public.has_applied(b.id) as applied
    from public.job_board b
    where (nullif(trim(coalesce(p_q, '')), '') is null
           or b.title ilike '%' || trim(p_q) || '%' or b.company_name ilike '%' || trim(p_q) || '%'
           or array_to_string(b.skills, ' ') ilike '%' || trim(p_q) || '%')
      and (nullif(p_type, '') is null or b.job_type::text = p_type)
      and (nullif(p_province, '') is null or b.province = p_province or b.work_mode = 'remote')
      and (auth.uid() is null or not exists (
            select 1 from public.candidate_profiles cp where cp.user_id = auth.uid() and cp.hidden_company_ids @> array[b.company_id]))
    order by match_score desc nulls last, b.published_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100)) offset greatest(coalesce(p_offset, 0), 0)
  ) t;
$$;

create or replace function public.company_pipeline(p_company uuid, p_job uuid default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.match_score desc), '[]'::jsonb) from (
    select a.id, a.job_id, j.title as job_title, a.candidate_name, a.stage, a.verify_level, a.match_score,
           a.created_at, a.stage_entered_at, a.sla_due_at, a.candidate_due_at, a.closed_at, a.closed_by_system,
           public.reason_labels(a.reject_reasons) as reject_labels,
           (a.profile_snapshot is null) as access_revoked,
           (a.profile_snapshot -> 'educations' -> 0 ->> 'institution_name') as institution_name,
           (a.profile_snapshot ->> 'photo_path') as photo_path,
           s.submitted_at, sc.total as score_total, coalesce(sc.reused, false) as reused,
           (select jsonb_build_object('status', i.status, 'starts_at', i.starts_at) from public.interviews i
             where i.application_id = a.id order by i.created_at desc limit 1) as interview,
           (select o.status from public.offers o where o.application_id = a.id) as offer_status
    from public.applications a
    join public.jobs j on j.id = a.job_id
    left join public.challenge_submissions s on s.application_id = a.id and s.submitted_at is not null
    left join public.challenge_scores sc on sc.application_id = a.id
    where a.company_id = p_company
      and (p_job is null or a.job_id = p_job)
      and public.has_perm(j.company_id, 'screen', j.department_id)
      and (a.closed_at is null or a.closed_at > now() - interval '14 days')
  ) t;
$$;
