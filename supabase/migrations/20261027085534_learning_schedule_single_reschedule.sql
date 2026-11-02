-- Phase 03 Step 3.4B. One-occurrence reschedule, preserving session identity.
-- No notification jobs exist yet; Phase 07 must invalidate/replan unsent jobs.
create or replace function public.ls_reschedule_session(
  p_session_id uuid,
  p_expected_updated_at timestamptz,
  p_new_local_date date,
  p_new_start_time time,
  p_new_end_time time,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_event_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_schedule public.task_study_schedules%rowtype;
  v_session public.task_study_sessions%rowtype;
  v_task_status text;
  v_old jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_event_key is null or length(btrim(p_event_key)) not between 1 and 256 then
    raise exception 'Invalid event key' using errcode='22023';
  end if;

  -- Use the same lock ordering as schedule revision: task -> schedule -> session.
  select t.status::text into v_task_status
  from public.task_study_sessions x
  join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
  where x.id=p_session_id and x.user_id=v_uid
  for update of t;
  if not found then raise exception 'Session not found' using errcode='22023'; end if;

  select s.* into v_schedule
  from public.task_study_schedules s
  join public.task_study_sessions x on x.schedule_id=s.id and x.user_id=s.user_id
  where x.id=p_session_id and x.user_id=v_uid
  for update of s;
  if not found then raise exception 'Schedule not found' using errcode='22023'; end if;

  select * into v_session
  from public.task_study_sessions
  where id=p_session_id and user_id=v_uid
  for update;
  if not found then raise exception 'Session not found' using errcode='22023'; end if;

  -- Retried command: the audit event proves this exact request already committed.
  if exists (
    select 1 from public.task_study_session_events
    where session_id=p_session_id and event_key=p_event_key and event_type='rescheduled'
  ) then return p_session_id; end if;

  if v_task_status not in ('todo','in_progress') or v_schedule.status <> 'active' or
     v_session.status <> 'scheduled' or v_session.scheduled_start_at <= now() then
    raise exception 'Session is not eligible for rescheduling' using errcode='22023';
  end if;
  if p_expected_updated_at is distinct from v_session.updated_at then
    raise exception 'Stale session version' using errcode='40001';
  end if;
  if p_new_local_date is null or p_new_start_time is null or p_new_end_time is null or
     p_new_start_at is null or p_new_end_at is null or
     p_new_start_time >= p_new_end_time or p_new_start_at <= now() or
     p_new_end_at <= p_new_start_at or
     p_new_local_date not between v_schedule.starts_on and v_schedule.ends_on then
    raise exception 'Invalid new study time' using errcode='22023';
  end if;
  -- Round-trip wall clock. DST fold policy requires further hardening in 3.5.
  if (p_new_start_at at time zone v_schedule.timezone)::date <> p_new_local_date or
     (p_new_end_at at time zone v_schedule.timezone)::date <> p_new_local_date or
     (p_new_start_at at time zone v_schedule.timezone)::time <> p_new_start_time or
     (p_new_end_at at time zone v_schedule.timezone)::time <> p_new_end_time then
    raise exception 'Local time/UTC mismatch' using errcode='22023';
  end if;
  if exists (
    select 1 from public.task_study_sessions other
    where other.schedule_id=v_schedule.id and other.id<>v_session.id
      and other.status in ('scheduled','in_progress','completed','missed','skipped')
      and pg_catalog.tstzrange(other.scheduled_start_at, other.scheduled_end_at, '[)') &&
          pg_catalog.tstzrange(p_new_start_at, p_new_end_at, '[)')
  ) then raise exception 'Study session overlaps another obligation' using errcode='23P01'; end if;

  v_old := pg_catalog.jsonb_build_object(
    'localDate',v_session.local_date,'startAt',v_session.scheduled_start_at,
    'endAt',v_session.scheduled_end_at,'startTime',v_session.local_start_time,
    'endTime',v_session.local_end_time);
  -- Keep logical_occurrence_key and ID: identity of the original obligation.
  -- Clear the slot link: this is now a one-off override, not the recurring slot.
  update public.task_study_sessions set
    source_slot_id=null,
    local_date=p_new_local_date,
    local_start_time=p_new_start_time,
    local_end_time=p_new_end_time,
    scheduled_start_at=p_new_start_at,
    scheduled_end_at=p_new_end_at
  where id=v_session.id;

  insert into public.task_study_session_events
    (user_id,session_id,event_type,from_status,to_status,actor_id,event_key,payload)
  values (v_uid,v_session.id,'rescheduled','scheduled','scheduled',v_uid,p_event_key,
    pg_catalog.jsonb_build_object('previous',v_old,'new',pg_catalog.jsonb_build_object(
      'localDate',p_new_local_date,'startAt',p_new_start_at,'endAt',p_new_end_at,
      'startTime',p_new_start_time,'endTime',p_new_end_time)));
  return v_session.id;
end $$;
revoke all on function public.ls_reschedule_session(uuid,timestamptz,date,time,time,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.ls_reschedule_session(uuid,timestamptz,date,time,time,timestamptz,timestamptz,text) to authenticated;
