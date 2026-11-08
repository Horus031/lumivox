-- Local fixture only. The clock replacement and all mutations roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

DO $$
DECLARE definition text := pg_get_functiondef('public.ls_learning_schedule_operational_snapshot()'::regprocedure);
BEGIN
  IF array_length(string_to_array(definition, 'at_time timestamptz := statement_timestamp();'), 1) <> 2 THEN
    RAISE EXCEPTION 'Snapshot fixture must replace exactly one clock expression';
  END IF;
  EXECUTE replace(definition, 'at_time timestamptz := statement_timestamp();',
    'at_time timestamptz := ''2030-01-07 12:00:00+00''::timestamptz;');
END $$;

INSERT INTO auth.users(id,email) VALUES ('100a0000-0000-4000-8000-000000000001','ops@example.invalid');
INSERT INTO profiles(id) VALUES ('100a0000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
CREATE TEMP TABLE ops_ids(label text PRIMARY KEY, session_id uuid, job_id uuid, schedule_id uuid);
CREATE FUNCTION pg_temp.fixture(label text, start_at timestamptz, finish_at timestamptz, queue_status text DEFAULT NULL,
  due timestamptz DEFAULT NULL, next_at timestamptz DEFAULT NULL, lease timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  owner constant uuid := '100a0000-0000-4000-8000-000000000001';
  task uuid := gen_random_uuid();
  schedule uuid := gen_random_uuid();
  study uuid := gen_random_uuid();
  job uuid := gen_random_uuid();
  local_day date := (start_at AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.tasks(id,user_id,title,status) VALUES(task,owner,label,'todo');
  INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
    VALUES(schedule,owner,task,local_day,local_day,'UTC');
  INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
    local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
  VALUES(study,owner,task,schedule,1,label,local_day,(start_at AT TIME ZONE 'UTC')::time,
    (finish_at AT TIME ZONE 'UTC')::time,'UTC',start_at,finish_at);
  IF queue_status IS NOT NULL THEN
    INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,status,
      lease_token,lease_until,attempt_count,idempotency_key)
    VALUES(job,owner,study,1,due,next_at,queue_status,CASE WHEN lease IS NOT NULL THEN gen_random_uuid() END,lease,
      CASE WHEN lease IS NOT NULL THEN 1 ELSE 0 END,label);
  END IF;
  INSERT INTO ops_ids VALUES(label,study,job,schedule);
END $$;

SELECT pg_temp.fixture('future', '2030-01-07 15:00Z','2030-01-07 16:00Z','pending','2030-01-07 12:00:00.001Z','2030-01-07 11:30Z');
SELECT pg_temp.fixture('retry', '2030-01-07 15:00Z','2030-01-07 16:00Z','pending','2030-01-07 10:00Z','2030-01-07 12:01Z');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'pendingDue','0','OP-02 future and delayed retry excluded');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->'oldestDueAgeSeconds','null'::jsonb,'empty due queue has no age');
SELECT pg_temp.fixture('due', '2030-01-07 15:00Z','2030-01-07 16:00Z','pending','2030-01-07 11:50Z','2030-01-07 11:55Z');
SELECT pg_temp.fixture('exact-due', '2030-01-07 15:00Z','2030-01-07 16:00Z','pending','2030-01-07 12:00Z','2030-01-07 12:00Z');
SELECT pg_temp.fixture('active', '2030-01-07 15:00Z','2030-01-07 16:00Z','leased','2030-01-07 11:00Z','2030-01-07 11:00Z','2030-01-07 12:00:00.001Z');
SELECT pg_temp.fixture('expired', '2030-01-07 15:00Z','2030-01-07 16:00Z','leased','2030-01-07 11:00Z','2030-01-07 11:00Z','2030-01-07 12:00Z');
SELECT pg_temp.fixture('exact-grace','2030-01-07 10:30Z','2030-01-07 11:00Z');
SELECT pg_temp.fixture('grace-not-due','2030-01-07 10:30Z','2030-01-07 11:00:00.001Z');
SELECT pg_temp.fixture('closed-schedule','2030-01-07 10:00Z','2030-01-07 10:30Z');
UPDATE public.task_study_schedules SET status='closed' WHERE id=(SELECT schedule_id FROM ops_ids WHERE label='closed-schedule');

INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,provider,status,created_at,updated_at,
 provider_accepted_at,recipient_fingerprint,provider_payload_fingerprint,submission_locale,locale_policy,handoff_token)
SELECT j.id,j.user_id,x.n,'resend',x.status,x.recorded,x.recorded,x.accepted,repeat('a',64),repeat('b',64),
 'en','explicit-trusted-command-v1',j.lease_token
FROM public.study_notification_jobs j CROSS JOIN (VALUES
 (1,'uncertain','2030-01-07 11:00Z'::timestamptz,NULL::timestamptz),
 (2,'accepted','2030-01-07 11:00Z','2030-01-07 11:00Z'),
 (3,'bounced','2030-01-07 11:15Z','2030-01-07 11:10Z'),
 (4,'failed','2030-01-06 12:00Z',NULL)
) x(n,status,recorded,accepted) WHERE j.id=(SELECT job_id FROM ops_ids WHERE label='expired');
INSERT INTO public.study_notification_webhook_receipts(provider,provider_event_id,provider_message_id,event_type,provider_event_at,
 recipient_fingerprint,payload_fingerprint,payload_subset,processing_status,created_at)
VALUES ('resend','ops-unmatched','test-message','email.sent','2030-01-07 11:00Z',repeat('a',64),repeat('b',64),'{}','unmatched','2030-01-07 11:40Z'),
 ('resend','ops-matched','test-message','email.sent','2030-01-07 11:00Z',repeat('a',64),repeat('b',64),'{}','processed','2030-01-07 11:30Z');
INSERT INTO public.focus_sessions(user_id,planned_minutes) VALUES('100a0000-0000-4000-8000-000000000001',25);

CREATE FUNCTION pg_temp.fixture_state() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('jobs',(SELECT jsonb_agg(j ORDER BY id) FROM public.study_notification_jobs j),
 'deliveries',(SELECT jsonb_agg(d ORDER BY id) FROM public.study_notification_deliveries d),
 'receipts',(SELECT jsonb_agg(r ORDER BY id) FROM public.study_notification_webhook_receipts r),
 'sessions',(SELECT jsonb_agg(s ORDER BY id) FROM public.task_study_sessions s),
 'events',(SELECT jsonb_agg(e ORDER BY id) FROM public.task_study_session_events e),
 'focus',(SELECT jsonb_agg(f ORDER BY id) FROM public.focus_sessions f),
 'gates',ARRAY[(SELECT enabled FROM public.study_notification_dispatch_control),
   (SELECT enabled FROM public.ls_missed_sweep_control)]);
$$;
CREATE TEMP TABLE ops_before AS SELECT pg_temp.fixture_state() AS state;
SET LOCAL ROLE service_role;
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'enabled','false','OP-01 dispatch gate OFF');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'missedSweep'->>'enabled','false','OP-01 sweep gate OFF');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'pendingDue','2','OP-03 due and retry both inclusive');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'oldestDueAgeSeconds','600','OP-03 age from oldest due, not creation or delayed retry');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'activeLeases','1','OP-04 active lease above the cutoff');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'expiredLeases','1','OP-04 lease expires at equality');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'uncertainAttempts','1','OP-05 uncertain outcome');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'unmatchedWebhooks','1','OP-06 unmatched only');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'oldestUnmatchedAgeSeconds','1200','OP-06 age from receipt ingestion');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'acceptedSubmissions24h','2','acceptance includes later bounce');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'deliveryFailures24h','1','delivery failures exclude 24-hour lower endpoint');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'missedSweep'->>'eligibleBacklog','1','OP-07 exact 60 minutes, exclude closed schedule');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'focus'->>'activeSessions','1','active Focus gauge');
RESET ROLE;
SELECT is(pg_temp.fixture_state(),(SELECT state FROM ops_before),'OP-11 snapshot leaves operational rows unchanged');

INSERT INTO public.study_notification_webhook_receipts(provider,provider_event_id,provider_message_id,event_type,provider_event_at,
 recipient_fingerprint,payload_fingerprint,payload_subset,created_at)
SELECT 'resend','ops-cap-'||i,'test-message','email.sent','2030-01-07 11:00Z',repeat('a',64),repeat('b',64),'{}','2030-01-07 11:45Z'
 FROM generate_series(1,1001) i;
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'unmatchedWebhooks','1001','bounded count reports lower bound');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'capped','["unmatchedWebhooks"]'::jsonb,'cap is explicit');
SELECT is(public.ls_learning_schedule_operational_snapshot()->'dispatch'->>'oldestUnmatchedAgeSeconds','1200','oldest remains exact at cap');

SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.ls_learning_schedule_operational_snapshot()','42501',NULL,'OP-08 owner cannot query global metrics');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.ls_learning_schedule_operational_snapshot()','42501',NULL,'OP-08 anonymous cannot query global metrics');
RESET ROLE;
DELETE FROM public.ls_missed_sweep_control WHERE singleton;
SELECT throws_ok('SELECT public.ls_learning_schedule_operational_snapshot()','P0002',NULL,'missing gate raises instead of reporting zero');
SELECT * FROM finish();
ROLLBACK;
