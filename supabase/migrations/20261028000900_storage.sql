-- WorkDee · 09 ไฟล์แนบ (Supabase Storage) ทุก bucket เป็นแบบส่วนตัว เข้าถึงผ่านลิงก์ชั่วคราวเท่านั้น
-- Private buckets + policies. Paths:
--   company-docs/{company_id}/{file}                หนังสือรับรองบริษัท
--   education-docs/{user_id}/{education_id}/{file}  ใบรับรองผลการศึกษา
--   submissions/{application_id}/{file}             ไฟล์คำตอบโจทย์

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('company-docs', 'company-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('education-docs', 'education-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('submissions', 'submissions', false, 26214400, null)
on conflict (id) do nothing;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end
$$;

create or replace function public.can_upload_submission(p_app uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications
                 where id = p_app and candidate_id = auth.uid() and stage = 'challenge_invited');
$$;

create or replace function public.can_review_education_doc(p_education uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_platform_admin()
      or exists (select 1 from public.educations e
                 where e.id = p_education and e.institution_id is not null and public.is_institution_staff(e.institution_id));
$$;

create policy "company-docs: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-docs' and public.is_company_owner(public.try_uuid((storage.foldername(name))[1])));
create policy "company-docs: owner or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'company-docs' and (public.is_company_owner(public.try_uuid((storage.foldername(name))[1])) or public.is_platform_admin()));

create policy "education-docs: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'education-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "education-docs: own or reviewer read" on storage.objects for select to authenticated
  using (bucket_id = 'education-docs' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.can_review_education_doc(public.try_uuid((storage.foldername(name))[2]))));
create policy "education-docs: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'education-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "submissions: candidate upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.can_upload_submission(public.try_uuid((storage.foldername(name))[1])));
create policy "submissions: candidate or screener read" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (public.is_app_candidate(public.try_uuid((storage.foldername(name))[1]))
         or public.can_screen_app(public.try_uuid((storage.foldername(name))[1]))));
create policy "submissions: candidate delete before submit" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and public.can_upload_submission(public.try_uuid((storage.foldername(name))[1])));
