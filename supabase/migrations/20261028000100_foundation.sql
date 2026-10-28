-- WorkDee · 01 พื้นฐาน: ชนิดข้อมูล โปรไฟล์ ผู้ดูแลแพลตฟอร์ม สถาบันการศึกษา
-- Foundation: enums, profiles, platform admins, institutions, lookup tables.

create extension if not exists pgcrypto with schema extensions;

create type public.job_type as enum ('full_time', 'contract', 'part_time', 'internship', 'gig');
create type public.job_status as enum ('draft', 'pending_approval', 'open', 'closed');
create type public.app_stage as enum (
  'applied',              -- สมัครแล้ว รอบริษัทคัด (บริษัทต้องตอบใน 7 วัน)
  'challenge_invited',    -- เชิญทำโจทย์ รอผู้สมัครส่ง
  'challenge_submitted',  -- ส่งโจทย์แล้ว รอบริษัทให้คะแนนและตัดสินใจ (7 วัน)
  'interview',            -- รอบสัมภาษณ์
  'offer',                -- เสนองาน รอผู้สมัครตอบ
  'hired',                -- รับเข้าทำงาน
  'rejected',             -- ไม่ผ่าน (มีเหตุผลแบบมีโครงสร้างเสมอ)
  'withdrawn',            -- ผู้สมัครถอนเอง
  'declined',             -- ผู้สมัครปฏิเสธข้อเสนอ
  'expired'               -- ผู้สมัครไม่ได้ทำตามกำหนด (เช่น ไม่ส่งโจทย์)
);
create type public.verify_level as enum ('none', 'doc_pending', 'doc', 'inst');
create type public.company_status as enum ('pending', 'verified', 'rejected', 'suspended');

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ขอให้ผู้เรียกเข้าสู่ระบบก่อน คืน user id
create or replace function public.require_user()
returns uuid language plpgsql stable set search_path = public, pg_temp as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '28000';
  end if;
  return v;
end
$$;

-- ใช้ภายในฟังก์ชันที่ได้รับสิทธิ์พิเศษ (เช่น ผู้ดูแลยืนยันวุฒิ) เพื่อให้ trigger ป้องกันยอมให้แก้
create or replace function public.is_privileged()
returns boolean language sql stable as $$
  select coalesce(current_setting('workdee.privileged', true), '') = 'on'
      or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.enable_privileged()
returns void language sql as $$
  select set_config('workdee.privileged', 'on', true);
$$;
revoke execute on function public.enable_privileged() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- โปรไฟล์บัญชี (พื้นที่ส่วนตัว)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  phone text check (phone is null or phone ~ '^[0-9+\- ]{6,20}$'),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1)), 80)
  )
  on conflict (id) do nothing;
  return new;
end
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- ผู้ดูแลแพลตฟอร์ม (ทีม WorkDee) เพิ่มด้วย SQL เท่านั้น
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy "platform_admins: read self" on public.platform_admins for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- สถาบันการศึกษา
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 200),
  short_name text,
  is_partner boolean not null default false,
  email_domain text,
  created_at timestamptz not null default now()
);
alter table public.institutions enable row level security;
create policy "institutions: public read" on public.institutions for select using (true);
create policy "institutions: admin write" on public.institutions for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create table public.institution_staff (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (institution_id, user_id)
);
alter table public.institution_staff enable row level security;
create policy "institution_staff: read own" on public.institution_staff for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "institution_staff: admin write" on public.institution_staff for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.is_institution_staff(p_institution uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.institution_staff where institution_id = p_institution and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- เหตุผลที่ไม่ผ่าน (มีโครงสร้าง ตามกติกาข้อ 3)
create table public.reject_reasons (
  code text primary key,
  label text not null,
  system_only boolean not null default false,
  needs_note boolean not null default false,
  sort int not null default 0
);
alter table public.reject_reasons enable row level security;
create policy "reject_reasons: public read" on public.reject_reasons for select using (true);

insert into public.reject_reasons (code, label, system_only, needs_note, sort) values
  ('missing_core_skill', 'ขาดสกิลที่ตำแหน่งนี้ใช้ทุกวัน', false, false, 10),
  ('challenge_below_bar', 'ผลโจทย์ยังไม่ถึงเกณฑ์', false, false, 20),
  ('stronger_candidate', 'เลือกผู้สมัครที่ตรงกว่าแล้ว', false, false, 30),
  ('type_or_location_mismatch', 'ประเภทงานหรือพื้นที่ไม่ตรงกัน', false, false, 40),
  ('salary_mismatch', 'เงินเดือนที่คาดหวังไม่ตรงกับช่วงของตำแหน่ง', false, false, 50),
  ('position_closed', 'ปิดรับตำแหน่งแล้ว', false, false, 60),
  ('other', 'อื่นๆ (ระบุ)', false, true, 90),
  ('no_response', 'บริษัทไม่ได้ตอบภายใน 7 วัน ระบบจึงปิดใบสมัครให้', true, false, 100);
