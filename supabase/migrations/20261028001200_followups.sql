-- WorkDee · 12 ส่วนเสริมหลังใช้งานจริง
--   1) แจ้งเตือนเมื่องานติดปัญหาหรือเสร็จ ให้คนที่มอบหมายและคนที่กดติดตาม (ต้องยังเห็นงานนั้นได้)
--   2) ยกเลิกคำขออนุมัติการลา แล้วการลาต้องถูกยกเลิกตาม
-- 1) Notify the task creator and followers when a task becomes blocked or done.
-- 2) Cancelling a leave approval request also cancels the leave request.

drop policy if exists "task_follows: own" on public.task_follows;
create policy "task_follows: own read" on public.task_follows for select using (user_id = auth.uid());
create policy "task_follows: follow visible tasks" on public.task_follows for insert
  with check (user_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy "task_follows: unfollow" on public.task_follows for delete using (user_id = auth.uid());

create or replace function public.after_task_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_uid uuid;
  v_title text;
  v_body text;
  v_assignee_pos uuid;
begin
  if new.status is not distinct from old.status or new.status not in ('blocked', 'done') then
    return new;
  end if;
  select display_name into v_actor_name from public.company_members
   where company_id = new.company_id and user_id = coalesce(v_actor, new.assignee_id);
  v_title := case when new.status = 'blocked' then 'งานติดปัญหา: ' else 'งานเสร็จแล้ว: ' end || new.title;
  v_body := coalesce(v_actor_name, '')
            || case when new.status = 'blocked' and new.blocked_note is not null then ' · ติดที่: ' || new.blocked_note else '' end;
  v_assignee_pos := public.member_position(new.company_id, new.assignee_id);
  for v_uid in
    select distinct x.u from (
      select new.created_by as u
      union
      select f.user_id from public.task_follows f where f.task_id = new.id
    ) x
    where x.u is not null and x.u is distinct from v_actor
  loop
    -- แจ้งเฉพาะคนที่ยังอยู่ในบริษัทและยังเห็นงานนี้ได้
    continue when public.member_position(new.company_id, v_uid) is null;
    continue when not (v_uid = new.created_by or v_uid = new.assignee_id
                       or (v_assignee_pos is not null and public.user_has_perm(v_uid, new.company_id, 'team', v_assignee_pos)));
    perform public.notify(v_uid, new.company_id, 'team_update', v_title, v_body, '/c/' || new.company_id || '/work');
  end loop;
  return new;
end
$$;
revoke execute on function public.after_task_status() from public, anon, authenticated;

create trigger tasks_status_notify after update of status on public.tasks
  for each row execute function public.after_task_status();

-- ---------------------------------------------------------------------------
-- 2) ยกเลิกคำขออนุมัติ: รองรับการลาด้วย
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
  elsif r.kind = 'leave' then
    update public.leave_requests set status = 'cancelled' where id = r.ref_id and status = 'pending';
  end if;
end
$$;
