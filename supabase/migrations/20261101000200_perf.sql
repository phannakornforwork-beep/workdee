-- ความเร็ว: ลดจำนวนคำขอต่อหน้า และลดงานซ้ำในฐานข้อมูล
-- Performance: fewer round trips per page and less repeated work per call.

-- 1) my_company_access อ่านตำแหน่งครั้งเดียว (เดิมวนถาม 9 ครั้งต่อสิทธิ์)
--    และส่งโลโก้ + จำนวนแจ้งเตือนที่ยังไม่อ่านมาด้วย แถบหัวของพื้นที่บริษัทจึงใช้คำขอเดียว
create or replace function public.my_company_access(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_pos public.positions;
  v_owner boolean;
  result jsonb := '{}'::jsonb;
  k text;
begin
  if v_user is null then
    return null;
  end if;
  select p.* into v_pos
  from public.company_members m join public.positions p on p.id = m.position_id
  where m.company_id = p_company and m.user_id = v_user and m.status = 'active';
  if v_pos.id is null then
    return null;
  end if;
  v_owner := v_pos.parent_id is null;
  foreach k in array public.perm_keys() loop
    result := result || jsonb_build_object(k, case when v_owner then 2 else coalesce((v_pos.grants ->> k)::int, 0) end);
  end loop;
  return jsonb_build_object(
    'position_id', v_pos.id,
    'position_title', v_pos.title,
    'department_id', public.dept_of(v_pos.id),
    'is_owner', v_owner,
    'perms', result,
    'unread', public.unread_count(p_company),
    'company', (select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'quiet_start', c.quiet_start,
                                          'quiet_end', c.quiet_end, 'logo_path', c.logo_path)
                from public.companies c where c.id = p_company));
end
$$;

-- 2) สถานะการอ่านประกาศหลายข้อความในคำขอเดียว (เดิมหน้าแชตยิงทีละข้อความ)
create or replace function public.announcement_statuses(p_messages bigint[])
returns table (message_id bigint, status jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select m, public.announcement_status(m) from unnest(coalesce(p_messages, '{}'::bigint[])) as m
  where array_length(p_messages, 1) <= 20;
$$;
revoke execute on function public.announcement_statuses(bigint[]) from public, anon;
grant execute on function public.announcement_statuses(bigint[]) to authenticated;

-- 3) รายการห้องแชต: หาข้อความล่าสุดครั้งเดียวต่อห้อง (เดิมค้นซ้ำ 2 ครั้ง)
create or replace function public.chat_room_list(p_company uuid)
returns table (room_id uuid, kind text, title text, last_message_at timestamptz, last_body text, last_sender text, unread int)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.kind, r.title, r.last_message_at, lm.body, lm.sender_name,
         (select count(*)::int from public.chat_messages m
           where m.room_id = r.id and m.visible_at <= now() and m.sender_id is distinct from auth.uid()
             and m.created_at > coalesce((select cr.last_read_at from public.chat_reads cr where cr.room_id = r.id and cr.user_id = auth.uid()), '-infinity'))
  from public.chat_rooms r
  left join lateral (
    select m.body, m.sender_name from public.chat_messages m
    where m.room_id = r.id and m.visible_at <= now() order by m.id desc limit 1
  ) lm on true
  where r.company_id = p_company and not r.archived and public.can_access_room(r.id)
  order by case r.kind when 'company' then 0 when 'department' then 1 else 2 end, r.last_message_at desc nulls last;
$$;

-- 4) ดัชนีที่ยังขาด
create index if not exists chat_rooms_company_idx on public.chat_rooms (company_id) where not archived;
create index if not exists notifications_unread_idx on public.notifications (user_id, company_id) where read_at is null;
create index if not exists company_members_company_idx on public.company_members (company_id, user_id) where status = 'active';
