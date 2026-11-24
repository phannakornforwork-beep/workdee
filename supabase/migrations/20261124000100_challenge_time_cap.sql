-- เวลาทำโจทย์ไม่เกิน 120 นาที (เดิมยอมถึง 480) กันโจทย์กลายเป็นการทำงานฟรี
-- ปรับโจทย์เดิมที่เกินให้เป็น 120 ก่อน แล้วค่อยตั้งกติกาใหม่
update public.challenges set time_limit_minutes = 120 where time_limit_minutes > 120;
update public.challenges set time_limit_minutes = 15 where time_limit_minutes < 15;
alter table public.challenges drop constraint if exists challenges_time_limit_minutes_check;
alter table public.challenges add constraint challenges_time_limit_minutes_check check (time_limit_minutes between 15 and 120);
