-- WorkDee · 08 งานตามเวลา (กติกา 7 วัน สรุปประจำวัน) ผู้ดูแลแพลตฟอร์ม และสิทธิ์ของเจ้าของข้อมูล
-- Scheduled sweeps (7-day rule, digests), platform admin review, data-subject rights.

-- ---------------------------------------------------------------------------
-- กติกา 7 วัน: วันที่ 5 เตือนผู้ดูแล วันที่ 6 แจ้งเจ้าของ วันที่ 7 ระบบปิดใบสมัครแทน
create or replace function public.sla_sweep(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_uid uuid;
  v_closed int := 0;
  v_escalated int := 0;
  v_warned int := 0;
  v_expired int := 0;
  v_reminded int := 0;
  v_approvals int := 0;
  v_parent uuid;
begin
  -- 1) วันที่ 7: ปิดใบสมัครที่บริษัทไม่ได้ตอบ
  for r in
    select a.id, a.job_id, a.company_id, a.candidate_name, j.title
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.sla_due_at is not null and a.sla_due_at <= p_now
      and a.stage in ('applied', 'challenge_submitted', 'interview')
    for update of a skip locked
  loop
    perform public.do_reject(r.id, array['no_response'], null,
      'บริษัทไม่ได้ตอบภายใน 7 วัน ระบบจึงปิดใบสมัครนี้ให้ ผลนี้ไม่ใช่การประเมินตัวคุณ และไม่กระทบโปรไฟล์ของคุณ',
      null, now(), true);
    for v_uid in select * from public.job_screeners(r.job_id) loop
      perform public.notify(v_uid, r.company_id, 'hiring_update', 'ระบบปิดใบสมัครของ ' || r.candidate_name || ' เพราะเลย 7 วัน',
                            r.title || ' · นับในอัตราการตอบผู้สมัครที่แสดงในประกาศ', '/c/' || r.company_id || '/applications/' || r.id);
    end loop;
    v_closed := v_closed + 1;
  end loop;

  -- 2) วันที่ 6: แจ้งเจ้าของกิจการ
  for r in
    select a.id, a.company_id, a.candidate_name, j.title
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.sla_due_at is not null and a.sla_due_at > p_now and a.sla_due_at - interval '1 day' <= p_now
      and a.escalated_at is null and a.stage in ('applied', 'challenge_submitted', 'interview')
    for update of a skip locked
  loop
    update public.applications set escalated_at = p_now where id = r.id;
    for v_uid in select * from public.company_owner_ids(r.company_id) loop
      perform public.notify(v_uid, r.company_id, 'sla_warning', 'เหลือไม่ถึง 1 วัน: ตอบ ' || r.candidate_name,
                            r.title || ' · ถ้าไม่ตอบ ระบบจะปิดใบสมัครแทนและลดอัตราการตอบของบริษัท',
                            '/c/' || r.company_id || '/applications/' || r.id, true);
    end loop;
    v_escalated := v_escalated + 1;
  end loop;

  -- 3) วันที่ 5: เตือนคนดูแลประกาศ
  for r in
    select a.id, a.job_id, a.company_id, a.candidate_name, j.title
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.sla_due_at is not null and a.sla_due_at > p_now and a.sla_due_at - interval '2 days' <= p_now
      and a.warned_at is null and a.stage in ('applied', 'challenge_submitted', 'interview')
    for update of a skip locked
  loop
    update public.applications set warned_at = p_now where id = r.id;
    for v_uid in select * from public.job_screeners(r.job_id) loop
      perform public.notify(v_uid, r.company_id, 'sla_warning', 'เหลือ 2 วัน: ตอบ ' || r.candidate_name, r.title,
                            '/c/' || r.company_id || '/applications/' || r.id, true);
    end loop;
    v_warned := v_warned + 1;
  end loop;

  -- 4) ฝั่งผู้สมัครเลยกำหนด (ไม่ส่งโจทย์ ไม่เลือกเวลาสัมภาษณ์ ไม่ตอบข้อเสนอ)
  for r in
    select a.id, a.job_id, a.company_id, a.candidate_id, a.candidate_name, a.stage, j.title
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.candidate_due_at is not null and a.candidate_due_at <= p_now
      and a.stage in ('challenge_invited', 'interview', 'offer')
    for update of a skip locked
  loop
    if r.stage = 'offer' then
      update public.offers set status = 'expired' where application_id = r.id and status = 'sent';
    end if;
    if r.stage = 'interview' then
      update public.interviews set status = 'cancelled' where application_id = r.id and status = 'awaiting_candidate';
    end if;
    perform public.reset_stage(r.id, 'expired', null, null);
    perform public.add_app_event(r.id, 'expired', 'system',
      case r.stage when 'challenge_invited' then 'ไม่ได้ส่งโจทย์ภายในกำหนด'
                   when 'interview' then 'ไม่ได้เลือกเวลาสัมภาษณ์ภายในกำหนด'
                   else 'ข้อเสนองานหมดอายุ' end, '{}'::jsonb);
    perform public.notify(r.candidate_id, null, 'deadline', 'ใบสมัครหมดเวลา: ' || r.title,
                          'เลยกำหนดที่ต้องทำในขั้นนี้แล้ว ใบสมัครจึงปิดลง', '/me/applications/' || r.id);
    for v_uid in select * from public.job_screeners(r.job_id) loop
      perform public.notify(v_uid, r.company_id, 'hiring_update', r.candidate_name || ' ไม่ได้ทำตามกำหนด ใบสมัครปิดแล้ว', r.title,
                            '/c/' || r.company_id || '/applications/' || r.id);
    end loop;
    v_expired := v_expired + 1;
  end loop;

  -- 5) เตือนผู้สมัครล่วงหน้า 1 วัน
  for r in
    select a.id, a.candidate_id, a.stage, j.title
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.candidate_due_at is not null and a.candidate_due_at > p_now and a.candidate_due_at - interval '1 day' <= p_now
      and a.warned_at is null and a.stage in ('challenge_invited', 'interview', 'offer')
    for update of a skip locked
  loop
    update public.applications set warned_at = p_now where id = r.id;
    perform public.notify(r.candidate_id, null, 'deadline',
      case r.stage when 'challenge_invited' then 'เหลือไม่ถึง 1 วัน: ส่งโจทย์ ' when 'interview' then 'เหลือไม่ถึง 1 วัน: เลือกเวลาสัมภาษณ์ ' else 'เหลือไม่ถึง 1 วัน: ตอบข้อเสนองาน ' end || r.title,
      '', '/me/applications/' || r.id);
    v_reminded := v_reminded + 1;
  end loop;

  -- 6) คำขออนุมัติค้างเกิน 24 ชั่วโมง: ส่งต่อหัวหน้าถัดขึ้นไป
  for r in
    select q.id, q.company_id, q.approver_position_id
    from public.approval_requests q
    where q.status = 'pending' and q.escalated_at is null and q.created_at <= p_now - interval '24 hours'
      and public.rule_on(q.company_id, 'escalate_after_24h')
    for update of q skip locked
  loop
    select parent_id into v_parent from public.positions where id = r.approver_position_id;
    if v_parent is not null then
      update public.approval_requests set approver_position_id = v_parent, escalated_at = p_now where id = r.id;
      perform public.notify_approvers(r.id);
      v_approvals := v_approvals + 1;
    else
      update public.approval_requests set escalated_at = p_now where id = r.id;
    end if;
  end loop;

  return jsonb_build_object('auto_closed', v_closed, 'owner_escalations', v_escalated, 'warnings', v_warned,
                            'candidate_expired', v_expired, 'candidate_reminders', v_reminded, 'approvals_escalated', v_approvals);
end
$$;
revoke execute on function public.sla_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.sla_sweep(timestamptz) to service_role;

-- สรุปประจำวันสำหรับคนที่ดูแลผู้สมัคร
create or replace function public.build_digests(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m record;
  v_due int;
  v_ungraded int;
  v_interviews int;
  v_approvals int;
  v_count int := 0;
  v_day date := (p_now at time zone 'Asia/Bangkok')::date;
begin
  for m in
    select cm.company_id, cm.user_id from public.company_members cm
    join public.companies c on c.id = cm.company_id and c.status = 'verified'
    left join public.user_settings us on us.user_id = cm.user_id
    where cm.status = 'active' and coalesce(us.digest_enabled, true)
  loop
    if not public.user_has_perm(m.user_id, m.company_id, 'screen') then
      continue;
    end if;
    if exists (select 1 from public.notifications n where n.user_id = m.user_id and n.company_id = m.company_id and n.kind = 'digest'
               and (n.created_at at time zone 'Asia/Bangkok')::date = v_day) then
      continue;
    end if;
    select count(*) filter (where a.sla_due_at <= p_now + interval '2 days'),
           count(*) filter (where a.stage = 'challenge_submitted' and not exists (select 1 from public.challenge_scores s where s.application_id = a.id))
      into v_due, v_ungraded
      from public.applications a join public.jobs j on j.id = a.job_id
     where a.company_id = m.company_id and a.sla_due_at is not null
       and public.user_has_perm(m.user_id, m.company_id, 'screen', j.department_id);
    select count(*) into v_interviews
      from public.interviews i join public.applications a on a.id = i.application_id join public.jobs j on j.id = a.job_id
     where a.company_id = m.company_id and i.status = 'confirmed' and i.starts_at between p_now and p_now + interval '7 days'
       and public.user_has_perm(m.user_id, m.company_id, 'screen', j.department_id);
    select count(*) into v_approvals from public.approval_requests q
     where q.company_id = m.company_id and q.status = 'pending' and q.approver_position_id is not null
       and public.is_ancestor_or_self(public.member_position(m.company_id, m.user_id), q.approver_position_id);
    if v_due + v_ungraded + v_interviews + v_approvals = 0 then
      continue;
    end if;
    perform public.notify(m.user_id, m.company_id, 'digest', 'สรุปวันนี้',
      'ต้องตอบภายใน 2 วัน ' || v_due || ' คน · รอให้คะแนนโจทย์ ' || v_ungraded || ' คน · นัดสัมภาษณ์ 7 วันนี้ '
        || v_interviews || ' นัด · รออนุมัติ ' || v_approvals || ' เรื่อง',
      '/c/' || m.company_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;
revoke execute on function public.build_digests(timestamptz) from public, anon, authenticated;
grant execute on function public.build_digests(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- ผู้ดูแลแพลตฟอร์ม
create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v uuid := public.require_user();
begin
  if not public.is_platform_admin() then
    raise exception 'เฉพาะผู้ดูแลแพลตฟอร์ม';
  end if;
  return v;
end
$$;

create or replace function public.admin_review_company(p_company uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
  c public.companies;
  v_uid uuid;
begin
  select * into c from public.companies where id = p_company for update;
  if c.id is null then
    raise exception 'ไม่พบบริษัท';
  end if;
  if not p_approve and char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'ระบุเหตุผลที่ยืนยันไม่ผ่าน บริษัทจะเห็นข้อความนี้';
  end if;
  update public.companies set status = case when p_approve then 'verified'::public.company_status else 'rejected'::public.company_status end,
    review_note = nullif(trim(coalesce(p_note, '')), ''), reviewed_by = v_admin, reviewed_at = now()
  where id = p_company;
  perform public.audit(p_company, case when p_approve then 'company.verified' else 'company.rejected' end, jsonb_build_object('note', p_note));
  for v_uid in select * from public.company_owner_ids(p_company) loop
    perform public.notify(v_uid, p_company, 'company_review',
      case when p_approve then 'ยืนยันบริษัทแล้ว เผยแพร่ประกาศได้เลย' else 'ยืนยันบริษัทไม่ผ่าน' end,
      coalesce(nullif(trim(coalesce(p_note, '')), ''), ''), '/c/' || p_company);
  end loop;
end
$$;

create or replace function public.admin_set_company_status(p_company uuid, p_status public.company_status, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_admin uuid := public.require_admin();
begin
  update public.companies set status = p_status, review_note = p_note, reviewed_by = v_admin, reviewed_at = now() where id = p_company;
  if p_status = 'suspended' then
    update public.jobs set status = 'closed', closed_at = now() where company_id = p_company and status in ('open', 'pending_approval');
  end if;
  perform public.audit(p_company, 'company.status', jsonb_build_object('status', p_status, 'note', p_note));
end
$$;

create or replace function public.admin_review_education(p_education uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.require_admin();
  e public.educations;
begin
  select * into e from public.educations where id = p_education for update;
  if e.id is null then
    raise exception 'ไม่พบข้อมูลการศึกษา';
  end if;
  perform public.enable_privileged();
  update public.educations set
    verify_level = case when p_approve then 'doc'::public.verify_level else 'none'::public.verify_level end,
    verified_at = case when p_approve then now() else null end,
    verified_by = case when p_approve then v_admin else null end,
    verify_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_education;
  perform set_config('workdee.privileged', 'off', true);
  perform public.notify(e.user_id, null, 'verification',
    case when p_approve then 'ตรวจเอกสารวุฒิแล้ว: ' || e.institution_name else 'ตรวจเอกสารวุฒิไม่ผ่าน: ' || e.institution_name end,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), ''), '/me/profile');
end
$$;

-- เจ้าหน้าที่สถาบันยืนยันนักศึกษาของตัวเอง (ระดับสูงสุด "ยืนยันโดยสถาบัน")
create or replace function public.institution_review_education(p_education uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.require_user();
  e public.educations;
begin
  select * into e from public.educations where id = p_education for update;
  if e.id is null or e.institution_id is null or not public.is_institution_staff(e.institution_id) then
    raise exception 'ไม่พบข้อมูลนักศึกษาของสถาบันคุณ';
  end if;
  perform public.enable_privileged();
  update public.educations set
    verify_level = case when p_approve then 'inst'::public.verify_level else 'none'::public.verify_level end,
    verified_at = case when p_approve then now() else null end,
    verified_by = case when p_approve then v_user else null end,
    verify_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_education;
  perform set_config('workdee.privileged', 'off', true);
  perform public.notify(e.user_id, null, 'verification',
    case when p_approve then 'สถาบันยืนยันวุฒิแล้ว: ' || e.institution_name else 'สถาบันยังยืนยันวุฒิไม่ได้: ' || e.institution_name end,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), ''), '/me/profile');
end
$$;

create or replace function public.admin_queue()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'reg_no', c.reg_no, 'size_range', c.size_range, 'industry', c.industry, 'province', c.province,
        'cert_path', c.cert_path, 'status', c.status, 'review_note', c.review_note, 'created_at', c.created_at,
        'owner_email', (select u.email from auth.users u where u.id = c.created_by)) order by c.created_at)
      from public.companies c where c.status = 'pending'), '[]'::jsonb),
    'educations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'user_id', e.user_id, 'full_name', cp.full_name, 'institution_name', e.institution_name, 'level', e.level,
        'major', e.major, 'status', e.status, 'year_label', e.year_label, 'gpa', e.gpa, 'doc_path', e.doc_path, 'updated_at', e.updated_at)
        order by e.updated_at)
      from public.educations e left join public.candidate_profiles cp on cp.user_id = e.user_id
      where e.verify_level = 'doc_pending'), '[]'::jsonb),
    'stats', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'companies_verified', (select count(*) from public.companies where status = 'verified'),
      'jobs_open', (select count(*) from public.jobs where status = 'open'),
      'applications_30d', (select count(*) from public.applications where created_at > now() - interval '30 days'),
      'auto_closed_30d', (select count(*) from public.applications where closed_by_system and closed_at > now() - interval '30 days')));
end
$$;

-- ---------------------------------------------------------------------------
-- สิทธิ์ของเจ้าของข้อมูล (PDPA): ดาวน์โหลดข้อมูลของฉัน และตรวจก่อนลบบัญชี
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_user uuid := public.require_user();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_user),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'candidate_profile', (select to_jsonb(c) from public.candidate_profiles c where c.user_id = v_user),
    'educations', coalesce((select jsonb_agg(to_jsonb(e) - 'verified_by') from public.educations e where e.user_id = v_user), '[]'::jsonb),
    'career_plan', (select to_jsonb(cp) from public.career_plans cp where cp.user_id = v_user),
    'career_private_notes', (select to_jsonb(n) from public.career_private_notes n where n.user_id = v_user),
    'applications', coalesce((select jsonb_agg(jsonb_build_object(
        'job_title', j.title, 'company', c.name, 'stage', a.stage, 'created_at', a.created_at, 'closed_at', a.closed_at,
        'shared_profile', a.profile_snapshot, 'intro_message', a.intro_message, 'expected_salary', a.expected_salary,
        'reject_reasons', a.reject_reasons,
        'submission', (select to_jsonb(s) from public.challenge_submissions s where s.application_id = a.id),
        'score', (select jsonb_build_object('total', sc.total, 'scores', sc.scores, 'feedback', sc.feedback) from public.challenge_scores sc where sc.application_id = a.id),
        'events', (select coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'message', ev.message, 'at', ev.created_at) order by ev.created_at), '[]'::jsonb)
                   from public.application_events ev where ev.application_id = a.id and ev.visible_to_candidate and ev.visible_at <= now())))
      from public.applications a join public.jobs j on j.id = a.job_id join public.companies c on c.id = a.company_id
      where a.candidate_id = v_user), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(x)) from public.consents x where x.user_id = v_user), '[]'::jsonb),
    'company_memberships', coalesce((select jsonb_agg(jsonb_build_object('company', c.name, 'status', m.status, 'joined_at', m.joined_at))
      from public.company_members m join public.companies c on c.id = m.company_id where m.user_id = v_user), '[]'::jsonb),
    'notification_prefs', coalesce((select jsonb_agg(to_jsonb(np)) from public.notification_prefs np where np.user_id = v_user), '[]'::jsonb));
end
$$;

create or replace function public.account_deletion_blockers()
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(c.name), '{}')
  from public.companies c
  where c.status <> 'rejected' and public.user_is_owner(auth.uid(), c.id)
    and (select count(*) from public.company_owner_ids(c.id)) <= 1
    and exists (select 1 from public.company_members m where m.company_id = c.id and m.status = 'active' and m.user_id <> auth.uid());
$$;

-- เมื่อบัญชีถูกลบ: บริษัทที่ไม่มีสมาชิกเหลือ ปิดประกาศทั้งหมด
create or replace function public.cleanup_orphan_companies()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.jobs set status = 'closed', closed_at = now()
   where status in ('open', 'pending_approval')
     and not exists (select 1 from public.company_members m where m.company_id = jobs.company_id and m.status = 'active');
  return null;
end
$$;
revoke execute on function public.cleanup_orphan_companies() from public, anon, authenticated;
create trigger company_members_cleanup after delete on public.company_members
  for each statement execute function public.cleanup_orphan_companies();
