-- Step 3.5D-A. Isolated LOCAL database only; fixtures/helpers roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
CREATE TEMP TABLE close_cases (
  target text PRIMARY KEY, task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid()
);
INSERT INTO close_cases(target) VALUES ('completed'),('cancelled');
GRANT SELECT ON close_cases TO authenticated;
INSERT INTO auth.users(id,email) VALUES
 ('f1000000-0000-4000-8000-000000000001','task-close@example.invalid');
INSERT INTO public.profiles(id) VALUES
 ('f1000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.tasks(id,user_id,title,status)
 SELECT task_id,'f1000000-0000-4000-8000-000000000001',target,'in_progress' FROM close_cases;
INSERT INTO public.tasks(id,user_id,title,status) VALUES
 ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
  'Task without schedule','todo');
INSERT INTO public.task_study_schedules(id,task_id,user_id,starts_on,ends_on,timezone)
 SELECT schedule_id,task_id,'f1000000-0000-4000-8000-000000000001',
        '2030-01-01','2030-01-31','UTC' FROM close_cases;
INSERT INTO public.task_study_sessions
 (user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,
  local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,status,completed_at)
 SELECT 'f1000000-0000-4000-8000-000000000001',c.task_id,c.schedule_id,1,x.key,x.day,
        '10:00','11:00','UTC',(x.day+time '10:00') AT TIME ZONE 'UTC',
        (x.day+time '11:00') AT TIME ZONE 'UTC',x.status,
        CASE WHEN x.status='completed' THEN now() ELSE NULL END
 FROM close_cases c CROSS JOIN (VALUES
   ('future',date '2030-01-07','scheduled'),
   ('running',date '2030-01-08','in_progress'),
   ('completed',date '2030-01-09','completed'),
   ('missed',date '2030-01-10','missed'),
   ('skipped',date '2030-01-11','skipped'),
   ('past',(now() AT TIME ZONE 'UTC')::date-1,'scheduled')
 ) x(key,day,status);
CREATE TEMP TABLE close_history AS
 SELECT schedule_id,jsonb_agg(to_jsonb(s) ORDER BY id) AS rows
 FROM public.task_study_sessions s WHERE logical_occurrence_key<>'future' GROUP BY schedule_id;
GRANT SELECT ON close_history TO authenticated;
CREATE FUNCTION pg_temp.close_state() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$
 SELECT jsonb_build_object(
   'tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t),
   'schedules',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_schedules t),
   'sessions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_sessions t),
   'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_session_events t));
$$;
CREATE FUNCTION pg_temp.fail_task_close_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 IF NEW.event_key LIKE 'ls:task-close:%' THEN
   RAISE EXCEPTION 'Injected Task-close audit failure' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_close_test_failure BEFORE INSERT ON public.task_study_session_events
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_task_close_audit();
CREATE FUNCTION pg_temp.close_rollback_suite(target_status text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c record; before_state jsonb;
BEGIN
 SELECT * INTO c FROM close_cases WHERE target=target_status;
 before_state:=pg_temp.close_state();
 RETURN NEXT throws_ok(format('UPDATE public.tasks SET status=%L WHERE id=%L',target_status,c.task_id),
   'P0001','Injected Task-close audit failure',target_status||': audit INSERT failure aborts Task update');
 RETURN NEXT is(pg_temp.close_state(),before_state,
   target_status||': audit failure restores Task, schedule, sessions and audit rows');
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='f1000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role"='authenticated';
SELECT tests.* FROM close_cases c CROSS JOIN LATERAL pg_temp.close_rollback_suite(c.target) tests;
RESET ROLE;
DROP TRIGGER task_close_test_failure ON public.task_study_session_events;

CREATE FUNCTION pg_temp.close_lifecycle_suite(target_status text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c record; sid uuid; before_events jsonb;
BEGIN
 SELECT * INTO c FROM close_cases WHERE target=target_status;
 SELECT id INTO sid FROM public.task_study_sessions
 WHERE schedule_id=c.schedule_id AND logical_occurrence_key='future';
 RETURN NEXT lives_ok(format('UPDATE public.tasks SET status=%L WHERE id=%L',target_status,c.task_id),
   target_status||': authenticated owner closes Task');
 RETURN NEXT is((SELECT status::text FROM public.tasks WHERE id=c.task_id),target_status,
   target_status||': Task stores closed status');
 RETURN NEXT is((SELECT status FROM public.task_study_schedules WHERE id=c.schedule_id),'closed'::text,
   target_status||': owning schedule closes');
 RETURN NEXT ok((SELECT status='cancelled' AND cancellation_reason='task_closed'
   FROM public.task_study_sessions WHERE id=sid),target_status||': future obligation cancelled with task_closed');
 RETURN NEXT is((SELECT count(*) FROM public.task_study_sessions WHERE schedule_id=c.schedule_id),6::bigint,
   target_status||': no session history is deleted');
 RETURN NEXT is((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_study_sessions s
   WHERE schedule_id=c.schedule_id AND logical_occurrence_key<>'future'),
   (SELECT rows FROM close_history WHERE schedule_id=c.schedule_id),
   target_status||': running, completed, missed, skipped and past sessions remain exactly unchanged');
 RETURN NEXT is((SELECT count(*) FROM public.task_study_session_events WHERE session_id=sid),1::bigint,
   target_status||': exactly one cancellation event, without schedule-change duplicate');
 RETURN NEXT ok((SELECT user_id=auth.uid() AND actor_id=auth.uid() AND event_type='cancelled'
   AND from_status='scheduled' AND to_status='cancelled' AND event_key='ls:task-close:'||sid::text
   AND payload->>'reason'='task_closed' AND payload->>'taskId'=c.task_id::text
   AND payload->>'taskStatus'=target_status AND payload->>'scheduleId'=c.schedule_id::text
   AND (payload->>'scheduledStartAt')::timestamptz='2030-01-07T10:00:00Z'::timestamptz
   AND (payload->>'scheduledEndAt')::timestamptz='2030-01-07T11:00:00Z'::timestamptz
   FROM public.task_study_session_events WHERE session_id=sid),
   target_status||': audit owner, actor, statuses, key, reason and old times are correct');
 RETURN NEXT is((SELECT count(*) FROM public.task_study_session_events
   WHERE session_id IN (SELECT id FROM public.task_study_sessions
     WHERE schedule_id=c.schedule_id AND id<>sid)),0::bigint,
   target_status||': unaffected history receives no cancellation events');
 SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO before_events
 FROM public.task_study_session_events e WHERE session_id=sid;
 UPDATE public.tasks SET status=target_status::public.task_status WHERE id=c.task_id;
 RETURN NEXT is((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.task_study_session_events e
   WHERE session_id=sid),before_events,target_status||': same-status update does not duplicate audit');
 UPDATE public.tasks SET status='in_progress' WHERE id=c.task_id;
 RETURN NEXT is((SELECT status FROM public.task_study_schedules WHERE id=c.schedule_id),'closed'::text,
   target_status||': Task reopen does not silently reopen schedule');
 RETURN NEXT is((SELECT status FROM public.task_study_sessions WHERE id=sid),'cancelled'::text,
   target_status||': Task reopen does not resurrect cancelled session');
 UPDATE public.tasks SET status=target_status::public.task_status WHERE id=c.task_id;
 RETURN NEXT is((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.task_study_session_events e
   WHERE session_id=sid),before_events,target_status||': re-close creates no duplicate cancellation');
END $$;
SET LOCAL ROLE authenticated;
SELECT tests.* FROM close_cases c CROSS JOIN LATERAL pg_temp.close_lifecycle_suite(c.target) tests;
SELECT lives_ok($$UPDATE public.tasks SET status='completed'
 WHERE id='f2000000-0000-4000-8000-000000000001'$$,
 'Ordinary Task without a study schedule can still close');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
