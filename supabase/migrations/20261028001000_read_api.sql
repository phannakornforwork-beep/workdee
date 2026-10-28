-- WorkDee · 10 ฟังก์ชันอ่านข้อมูลสำหรับหน้าเว็บ (ตรวจสิทธิ์ในตัวทุกฟังก์ชัน)
-- Read RPCs used by the web app. Each one checks permissions explicitly.

create or replace function public.reason_labels(p_codes text[])
returns text language sql stable set search_path = public, pg_temp as $$
  select string_agg(label, ' · ' order by sort) from public.reject_reasons where code = any (coalesce(p_codes, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- คนหางาน
create or replace function public.job_feed(p_q text default null, p_type text default null, p_province text default null,
                                           p_limit int default 30, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select b.id, b.title, b.company_id, b.company_name, b.job_type, b.province, b.work_mode,
           b.salary_min, b.salary_max, b.pay_unit, b.skills, b.published_at, b.closes_at,
           b.has_challenge, b.time_limit_minutes, b.response_rate, b.response_sample, b.gig_days,
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

create or replace function public.my_applications()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
    select a.id, a.job_id, j.title as job_title, j.job_type, c.name as company_name, a.stage, a.stage_entered_at,
           a.sla_due_at, a.candidate_due_at, a.created_at, a.closed_at, a.closed_by_system, a.access_revoked_at,
           (select s.total from public.challenge_scores s where s.application_id = a.id) as score_total,
           (select jsonb_build_object('status', i.status, 'starts_at', i.starts_at) from public.interviews i
             where i.application_id = a.id order by i.created_at desc limit 1) as interview,
           (select o.status from public.offers o where o.application_id = a.id and o.status in ('sent', 'accepted', 'declined', 'expired')) as offer_status
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.companies c on c.id = a.company_id
    where a.candidate_id = auth.uid()
  ) t;
$$;

create or replace function public.my_application(p_app uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  a public.applications;
  v_interview public.interviews;
  v_show_challenge boolean;
begin
  select * into a from public.applications where id = p_app and candidate_id = auth.uid();
  if a.id is null then
    return null;
  end if;
  v_show_challenge := a.challenge_invited_at is not null or exists (select 1 from public.challenge_submissions s where s.application_id = a.id);
  select * into v_interview from public.interviews where application_id = a.id order by created_at desc limit 1;
  return jsonb_build_object(
    'app', jsonb_build_object(
      'id', a.id, 'stage', a.stage, 'created_at', a.created_at, 'stage_entered_at', a.stage_entered_at,
      'sla_due_at', a.sla_due_at, 'candidate_due_at', a.candidate_due_at, 'intro_message', a.intro_message,
      'expected_salary', a.expected_salary, 'share_plan', a.share_plan, 'match_score', a.match_score,
      'verify_level', a.verify_level, 'reject_reasons', a.reject_reasons, 'reject_labels', public.reason_labels(a.reject_reasons),
      'reject_note', a.reject_note, 'closed_by_system', a.closed_by_system, 'closed_at', a.closed_at,
      'access_revoked_at', a.access_revoked_at, 'withdraw_reason', a.withdraw_reason, 'profile_snapshot', a.profile_snapshot),
    'job', (select jsonb_build_object('id', j.id, 'title', j.title, 'job_type', j.job_type, 'company_id', j.company_id,
                                      'company_name', c.name, 'province', j.province, 'work_mode', j.work_mode,
                                      'salary_min', j.salary_min, 'salary_max', j.salary_max, 'pay_unit', j.pay_unit, 'status', j.status)
            from public.jobs j join public.companies c on c.id = j.company_id where j.id = a.job_id),
    'challenge', case when v_show_challenge then (
            select jsonb_build_object('title', ch.title, 'brief', ch.brief, 'deliverable', ch.deliverable,
                                      'time_limit_minutes', ch.time_limit_minutes, 'due_days', ch.due_days,
                                      'criteria', ch.criteria, 'ai_policy', ch.ai_policy, 'accept_reuse', ch.accept_reuse)
            from public.challenges ch where ch.job_id = a.job_id)
          else (select jsonb_build_object('title', ch.title, 'time_limit_minutes', ch.time_limit_minutes, 'criteria', ch.criteria, 'preview', true)
                from public.challenges ch where ch.job_id = a.job_id) end,
    'submission', (select to_jsonb(s) from public.challenge_submissions s where s.application_id = a.id),
    'score', (select jsonb_build_object('scores', sc.scores, 'total', sc.total, 'feedback', sc.feedback, 'reused', sc.reused, 'graded_at', sc.graded_at)
              from public.challenge_scores sc where sc.application_id = a.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'actor_kind', e.actor_kind, 'actor_name', e.actor_name,
                                                             'message', e.message, 'data', e.data, 'at', e.visible_at) order by e.visible_at), '[]'::jsonb)
               from public.application_events e where e.application_id = a.id and e.visible_to_candidate and e.visible_at <= now()),
    'interview', case when v_interview.id is null then null else jsonb_build_object(
        'id', v_interview.id, 'status', v_interview.status, 'starts_at', v_interview.starts_at, 'ends_at', v_interview.ends_at,
        'mode', v_interview.mode, 'location', v_interview.location,
        'meeting_url', case when v_interview.status = 'confirmed' then v_interview.meeting_url end,
        'candidate_note', v_interview.candidate_note,
        'options', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from public.interview_options(v_interview.id) o)) end,
    'offer', (select jsonb_build_object('id', o.id, 'salary', o.salary, 'pay_unit', o.pay_unit, 'start_date', o.start_date,
                                        'note', o.note, 'expires_at', o.expires_at, 'status', o.status, 'sent_at', o.sent_at)
              from public.offers o where o.application_id = a.id and o.status in ('sent', 'accepted', 'declined', 'expired')),
    'reusable', case when a.stage = 'challenge_invited' then
                  (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reusable_results(a.id) r) end,
    'room_id', (select id from public.chat_rooms where application_id = a.id));
end
$$;

-- ---------------------------------------------------------------------------
-- บริษัท
create or replace function public.company_jobs_overview(p_company uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_company_member(p_company) then null else coalesce(jsonb_agg(to_jsonb(t) order by t.status_order, t.created_at desc), '[]'::jsonb) end
  from (
    select j.id, j.title, j.job_type, j.status, j.department_id, p.title as department_title, j.salary_min, j.salary_max, j.pay_unit,
           j.challenge_seats, public.challenge_seats_used(j.id) as seats_used, j.headcount, j.created_at, j.published_at, j.closes_at, j.closed_at,
           j.approval_note, (ch.job_id is not null) as has_challenge,
           case j.status when 'open' then 0 when 'pending_approval' then 1 when 'draft' then 2 else 3 end as status_order,
           (select count(*)::int from public.applications a where a.job_id = j.id) as total,
           (select count(*)::int from public.applications a where a.job_id = j.id and a.stage = 'applied') as n_applied,
           (select count(*)::int from public.applications a where a.job_id = j.id and a.stage in ('challenge_invited', 'challenge_submitted')) as n_challenge,
           (select count(*)::int from public.applications a where a.job_id = j.id and a.stage = 'interview') as n_interview,
           (select count(*)::int from public.applications a where a.job_id = j.id and a.stage = 'offer') as n_offer,
           (select count(*)::int from public.applications a where a.job_id = j.id and a.stage = 'hired') as n_hired,
           (select count(*)::int from public.applications a where a.job_id = j.id and a.sla_due_at <= now() + interval '2 days') as n_urgent,
           public.has_perm(j.company_id, 'post', j.department_id) as can_edit,
           public.has_perm(j.company_id, 'screen', j.department_id) as can_screen
    from public.jobs j
    join public.positions p on p.id = j.department_id
    left join public.challenges ch on ch.job_id = j.id
    where j.company_id = p_company
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

create or replace function public.application_detail(p_app uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  a public.applications;
  j public.jobs;
begin
  select * into a from public.applications where id = p_app;
  if a.id is null or not public.can_screen_job(a.job_id) then
    return null;
  end if;
  select * into j from public.jobs where id = a.job_id;
  return jsonb_build_object(
    'app', to_jsonb(a) || jsonb_build_object('reject_labels', public.reason_labels(a.reject_reasons)),
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'job_type', j.job_type, 'department_id', j.department_id,
                              'salary_min', j.salary_min, 'salary_max', j.salary_max, 'pay_unit', j.pay_unit,
                              'challenge_seats', j.challenge_seats, 'seats_used', public.challenge_seats_used(j.id), 'status', j.status),
    'challenge', (select to_jsonb(ch) from public.challenges ch where ch.job_id = a.job_id),
    'submission', (select to_jsonb(s) from public.challenge_submissions s where s.application_id = a.id),
    'score', (select to_jsonb(sc) from public.challenge_scores sc where sc.application_id = a.id),
    'notes', (select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at), '[]'::jsonb) from public.application_notes n where n.application_id = a.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'actor_kind', e.actor_kind, 'actor_name', e.actor_name,
                                                             'message', e.message, 'data', e.data, 'at', e.created_at,
                                                             'visible_to_candidate', e.visible_to_candidate) order by e.created_at), '[]'::jsonb)
               from public.application_events e where e.application_id = a.id),
    'interviews', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc), '[]'::jsonb) from public.interviews i where i.application_id = a.id),
    'offer', (select to_jsonb(o) from public.offers o where o.application_id = a.id),
    'room_id', (select id from public.chat_rooms where application_id = a.id),
    'can_offer', public.has_perm(a.company_id, 'offer', j.department_id),
    'reject_after_interview_needs_head', public.rule_on(a.company_id, 'reject_after_interview_needs_head'));
end
$$;

create or replace function public.company_home(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  c public.companies;
begin
  if not public.is_company_member(p_company) then
    return null;
  end if;
  select * into c from public.companies where id = p_company;
  return jsonb_build_object(
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'review_note', c.review_note,
                                  'has_certificate', c.cert_path is not null, 'plan', c.plan),
    'members', (select count(*)::int from public.company_members where company_id = p_company and status = 'active'),
    'jobs_open', (select count(*)::int from public.jobs where company_id = p_company and status = 'open'),
    'jobs_total', (select count(*)::int from public.jobs where company_id = p_company),
    'needs_response', (select count(*)::int from public.applications a join public.jobs j on j.id = a.job_id
                        where a.company_id = p_company and a.sla_due_at is not null and public.has_perm(p_company, 'screen', j.department_id)),
    'due_soon', (select count(*)::int from public.applications a join public.jobs j on j.id = a.job_id
                  where a.company_id = p_company and a.sla_due_at <= now() + interval '2 days' and public.has_perm(p_company, 'screen', j.department_id)),
    'ungraded', (select count(*)::int from public.applications a join public.jobs j on j.id = a.job_id
                  where a.company_id = p_company and a.stage = 'challenge_submitted'
                    and not exists (select 1 from public.challenge_scores s where s.application_id = a.id)
                    and public.has_perm(p_company, 'screen', j.department_id)),
    'interviews_week', (select count(*)::int from public.interviews i join public.applications a on a.id = i.application_id join public.jobs j on j.id = a.job_id
                         where a.company_id = p_company and i.status = 'confirmed' and i.starts_at between now() and now() + interval '7 days'
                           and public.has_perm(p_company, 'screen', j.department_id)),
    'approvals_for_me', (select count(*)::int from public.approval_requests q where q.company_id = p_company and q.status = 'pending'
                          and public.can_decide_approval(q.id)),
    'my_pending_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'created_at', q.created_at,
                              'approver', (select title from public.positions where id = q.approver_position_id)) order by q.created_at desc), '[]'::jsonb)
                             from public.approval_requests q where q.company_id = p_company and q.status = 'pending' and q.requested_by = v_user),
    'urgent', (select coalesce(jsonb_agg(x order by x ->> 'sla_due_at'), '[]'::jsonb) from (
                 select jsonb_build_object('id', a.id, 'candidate_name', a.candidate_name, 'job_title', j.title, 'stage', a.stage, 'sla_due_at', a.sla_due_at) as x
                 from public.applications a join public.jobs j on j.id = a.job_id
                 where a.company_id = p_company and a.sla_due_at <= now() + interval '2 days' and public.has_perm(p_company, 'screen', j.department_id)
                 order by a.sla_due_at limit 8) u),
    'setup', jsonb_build_object(
      'verified', c.status = 'verified',
      'team_invited', (select count(*) from public.company_members where company_id = p_company and status = 'active') > 1
                      or exists (select 1 from public.company_invites where company_id = p_company),
      'line_linked', exists (select 1 from public.line_links where user_id = v_user and line_user_id is not null),
      'job_posted', exists (select 1 from public.jobs where company_id = p_company and status in ('open', 'closed', 'pending_approval')),
      'graded_once', exists (select 1 from public.challenge_scores s join public.applications a on a.id = s.application_id where a.company_id = p_company and not s.reused)));
end
$$;

create or replace function public.team_overview(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if not public.is_company_member(p_company) then
    return null;
  end if;
  return jsonb_build_object(
    'me', public.my_company_access(p_company),
    'positions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'parent_id', p.parent_id, 'title', p.title, 'is_owner', p.is_owner, 'is_department', p.is_department,
        'grants', p.grants, 'depth', public.position_depth(p.id),
        'can_manage', public.can_manage_position(p_company, p.id),
        'can_add_child', public.is_company_owner(p_company) or p.id = public.member_position(p_company, v_user) or public.can_manage_position(p_company, p.id),
        'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name, 'joined_at', m.joined_at,
                                                                'is_me', m.user_id = v_user) order by m.joined_at), '[]'::jsonb)
                    from public.company_members m where m.position_id = p.id and m.status = 'active')
      ) order by public.position_depth(p.id), p.created_at), '[]'::jsonb)
      from public.positions p where p.company_id = p_company),
    'invites', case when public.has_perm(p_company, 'members') then
      (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'email', i.email, 'position_id', i.position_id,
                                                    'position_title', p.title, 'expires_at', i.expires_at, 'uses', i.uses, 'max_uses', i.max_uses,
                                                    'revoked', i.revoked_at is not null, 'created_at', i.created_at) order by i.created_at desc), '[]'::jsonb)
       from public.company_invites i join public.positions p on p.id = i.position_id
       where i.company_id = p_company and i.created_at > now() - interval '60 days') end,
    'rules', (select coalesce(jsonb_object_agg(rule, enabled), '{}'::jsonb) from public.approval_rules where company_id = p_company),
    'approvals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'title', q.title, 'status', q.status, 'requested_by_name', q.requested_by_name,
        'approver_title', (select title from public.positions where id = q.approver_position_id),
        'created_at', q.created_at, 'decided_by_name', q.decided_by_name, 'decided_at', q.decided_at, 'decision_note', q.decision_note,
        'escalated', q.escalated_at is not null, 'can_decide', public.can_decide_approval(q.id), 'mine', q.requested_by = v_user
      ) order by (q.status = 'pending') desc, q.created_at desc), '[]'::jsonb)
      from public.approval_requests q
      where q.company_id = p_company and q.created_at > now() - interval '90 days'
        and (q.requested_by = v_user or public.is_company_owner(p_company) or public.perm_level(p_company, 'members') = 2
             or (q.approver_position_id is not null and public.is_ancestor_or_self(public.member_position(p_company, v_user), q.approver_position_id)))));
end
$$;
