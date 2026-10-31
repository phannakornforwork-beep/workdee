-- ใช้ชื่อจากบัญชี Google (full_name / name) เป็นชื่อที่แสดง เมื่อสมัครด้วย Google
-- Use the Google account name as the display name for OAuth sign-ups.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 80)
  )
  on conflict (id) do nothing;
  return new;
end
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
