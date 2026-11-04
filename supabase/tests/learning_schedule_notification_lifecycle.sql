-- Local only: fixtures, fault injection and temporary helpers all roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES
 ('7b000000-0000-4000-8000-000000000001','nj-a@example.invalid'),('7b000000-0000-4000-8000-000000000002','nj-b@example.invalid');
INSERT INTO public.profiles(id) VALUES('7b000000-0000-4000-8000-000000000001'),('7b000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
CREATE TEMP TABLE nj_ctx(label text PRIMARY KEY,task_id uuid,schedule_id uuid,first_id uuid,second_id uuid);
GRANT ALL ON nj_ctx TO authenticated;
CREATE FUNCTION pg_temp.nj_create(p_label text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE t uuid; sc uuid; ids uuid[];
BEGIN
 INSERT INTO public.tasks(user_id,title,status) VALUES(auth.uid(),p_label,'todo') RETURNING id INTO t;
 sc:=public.ls_create_schedule(t,'2030-01-07','2030-01-14','UTC','[{"weekday":1,"startTime":"10:00","endTime":"11:00"}]',
 '[{"localDate":"2030-01-07","localStartTime":"10:00","localEndTime":"11:00","timezone":"UTC","slotIndex":0,"scheduledStartAt":"2030-01-07T10:00Z","scheduledEndAt":"2030-01-07T11:00Z","occurrenceKey":"2030-01-07|1|10:00|11:00"},
 {"localDate":"2030-01-14","localStartTime":"10:00","localEndTime":"11:00","timezone":"UTC","slotIndex":0,"scheduledStartAt":"2030-01-14T10:00Z","scheduledEndAt":"2030-01-14T11:00Z","occurrenceKey":"2030-01-14|1|10:00|11:00"}]');
 SELECT array_agg(id ORDER BY scheduled_start_at) INTO ids FROM public.task_study_sessions WHERE schedule_id=sc;
 INSERT INTO pg_temp.nj_ctx VALUES(p_label,t,sc,ids[1],ids[2]); RETURN t;
END;
$$;
CREATE FUNCTION pg_temp.nj_id(p_label text) RETURNS uuid LANGUAGE sql AS $$ SELECT first_id FROM pg_temp.nj_ctx WHERE label=p_label $$;
CREATE FUNCTION pg_temp.nj_move(p_label text,p_time time DEFAULT '18:00') RETURNS uuid LANGUAGE sql AS $$
 SELECT public.ls_reschedule_session(s.id,s.updated_at,'2030-01-08',p_time,(p_time+interval '1 hour')::time,
  (date '2030-01-08'+p_time) AT TIME ZONE 'UTC',(date '2030-01-08'+p_time+interval '1 hour') AT TIME ZONE 'UTC',gen_random_uuid()::text)
 FROM public.task_study_sessions s WHERE s.id=pg_temp.nj_id(p_label);
$$;
CREATE FUNCTION pg_temp.nj_snapshot(p_label text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
 SELECT jsonb_build_object('sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.task_study_sessions s WHERE s.task_id=c.task_id),
 'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id WHERE s.task_id=c.task_id),
 'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.task_study_session_events e JOIN public.task_study_sessions s ON s.id=e.session_id WHERE s.task_id=c.task_id))
 FROM pg_temp.nj_ctx c WHERE label=p_label;
$$;
CREATE FUNCTION pg_temp.nj_raw(p_label text,p_status text,p_historical boolean DEFAULT false,p_seed boolean DEFAULT true,p_offset interval DEFAULT interval '-10 minutes') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); starts timestamptz;
 z text; d date; st time; en time;
BEGIN
 z:=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;
 starts:=date_trunc('milliseconds',clock_timestamp()) + CASE WHEN p_historical THEN interval '-2 days' ELSE p_offset END;
 d:=(starts AT TIME ZONE z)::date; st:=(starts AT TIME ZONE z)::time; en:=((starts+interval '30 minutes') AT TIME ZONE z)::time;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(t,'7b000000-0000-4000-8000-000000000001',p_label,'todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES(sc,'7b000000-0000-4000-8000-000000000001',t,d,d,z);
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,status)
 VALUES(sid,'7b000000-0000-4000-8000-000000000001',t,sc,1,p_label,d,st,en,z,starts,starts+interval '30 minutes',p_status);
 IF p_seed THEN
   INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
   SELECT p.user_id,sid,1,p.due_at,p.due_at,'raw:'||sid::text,p.fingerprint FROM public.ls_notification_session_policy(sid) p;
 END IF;
 INSERT INTO pg_temp.nj_ctx VALUES(p_label,t,sc,sid,NULL); RETURN sid;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','7b000000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT pg_temp.nj_create('off')$$,'NJ-01: authenticated create with global OFF');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs),0,'NJ-01: no jobs without consent');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'NJ-02: opt-in reconciles existing future sessions');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),2,'NJ-02: one pending per existing eligible session');
SELECT lives_ok($$SELECT pg_temp.nj_create('on')$$,'NJ-02: authenticated Schedule create with consent ON');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),4,'NJ-02: new Sessions enqueue atomically');
RESET ROLE;
SELECT ok((SELECT bool_and(j.due_at=s.scheduled_start_at-interval '15 minutes' AND j.next_attempt_at=j.due_at) FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id),'NJ-02: due and next attempt calculated from elapsed lead');
CREATE TEMP TABLE nj_before AS SELECT pg_temp.nj_snapshot('on') state;
SELECT public.ls_sync_study_notification_for_session(pg_temp.nj_id('on'));
SELECT public.ls_sync_study_notification_for_session(pg_temp.nj_id('on'));
SELECT is(pg_temp.nj_snapshot('on'),(SELECT state FROM nj_before),'NJ-03: duplicate sync preserves job ID and rows');
CREATE TEMP TABLE nj_job_before AS SELECT id,due_at FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('on');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.nj_move('on')$$,'NJ-04: actual single reschedule RPC');
RESET ROLE;
SELECT is((SELECT id FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('on')),(SELECT id FROM nj_job_before),'NJ-04: keeps job identity for same Session/revision');
SELECT is((SELECT due_at FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('on')),'2030-01-08T17:45Z'::timestamptz,'NJ-04: replans due, not a duplicate job');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('on')),1,'NJ-04: exactly one logical reminder');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_revise_schedule((SELECT schedule_id FROM nj_ctx WHERE label='on'),1,'2030-01-07','2030-01-14','UTC','[{"weekday":1,"startTime":"12:00","endTime":"13:00"}]',
 '[{"localDate":"2030-01-07","localStartTime":"12:00","localEndTime":"13:00","timezone":"UTC","slotIndex":0,"scheduledStartAt":"2030-01-07T12:00Z","scheduledEndAt":"2030-01-07T13:00Z","occurrenceKey":"2030-01-07|1|12:00|13:00"},
 {"localDate":"2030-01-14","localStartTime":"12:00","localEndTime":"13:00","timezone":"UTC","slotIndex":0,"scheduledStartAt":"2030-01-14T12:00Z","scheduledEndAt":"2030-01-14T13:00Z","occurrenceKey":"2030-01-14|1|12:00|13:00"}]')$$,'NJ-05: actual Schedule revision');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id JOIN nj_ctx c ON c.task_id=s.task_id WHERE c.label='on' AND j.schedule_revision=1 AND j.status='suppressed'),2,'NJ-05: old generation suppressed');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id JOIN nj_ctx c ON c.task_id=s.task_id WHERE c.label='on' AND j.schedule_revision=2 AND j.status='pending'),2,'NJ-05: new generation pending');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE public.tasks SET status='completed',completed_at=now() WHERE id=(SELECT task_id FROM nj_ctx WHERE label='on')$$,'NJ-06: authenticated Task-close transition');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id JOIN nj_ctx c ON c.task_id=s.task_id WHERE c.label='on' AND j.status='pending'),0,'NJ-06: no future pending job after closure');
SELECT is((SELECT count(*)::integer FROM public.task_study_sessions s JOIN nj_ctx c ON c.task_id=s.task_id WHERE c.label='on' AND s.status='cancelled'),4,'NJ-06: Session cancellation history retained');
SELECT pg_temp.nj_raw('start','scheduled');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_start_study_session(pg_temp.nj_id('start'),(SELECT updated_at FROM public.task_study_sessions WHERE id=pg_temp.nj_id('start')),gen_random_uuid()::text)$$,'NJ-07: real Start RPC');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('start')),'suppressed','NJ-07: Start invalidates queued reminder');
SELECT lives_ok($$SELECT public.ls_complete_study_session(pg_temp.nj_id('start'),(SELECT updated_at FROM public.task_study_sessions WHERE id=pg_temp.nj_id('start')),gen_random_uuid()::text)$$,'NJ-07: real Complete RPC');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('start')),'suppressed','NJ-07: Complete does not re-arm');
RESET ROLE;
SELECT pg_temp.nj_raw('complete','scheduled');
SELECT pg_temp.nj_raw('skip','scheduled');
SELECT pg_temp.nj_raw('missed','scheduled',true);
SELECT pg_temp.nj_raw('recover','missed',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_complete_study_session(pg_temp.nj_id('complete'),(SELECT updated_at FROM public.task_study_sessions WHERE id=pg_temp.nj_id('complete')),gen_random_uuid()::text)$$,'NJ-07: Complete directly from scheduled');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('complete')),'suppressed','NJ-07: direct completion invalidates reminder');
SELECT lives_ok($$SELECT public.ls_skip_study_session(pg_temp.nj_id('skip'),(SELECT updated_at FROM public.task_study_sessions WHERE id=pg_temp.nj_id('skip')),gen_random_uuid()::text,NULL)$$,'NJ-07: real Skip RPC');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('skip')),'suppressed','NJ-07: Skip invalidates pending');
SELECT lives_ok($$SELECT public.ls_recover_study_session(pg_temp.nj_id('recover'),(SELECT updated_at FROM public.task_study_sessions WHERE id=pg_temp.nj_id('recover')),gen_random_uuid()::text)$$,'NJ-08: real Recovery RPC');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('recover')),1,'NJ-08: Recovery adds no new reminder');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('recover')),'suppressed','NJ-08: Recovery invalidates legacy pending');
RESET ROLE;
SELECT lives_ok($$SELECT public.ls_mark_missed_batch(1)$$,'NJ-08: actual missed sweep batch');
SELECT is((SELECT status FROM public.task_study_sessions WHERE id=pg_temp.nj_id('missed')),'missed','NJ-08: sweep commits Missed');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('missed')),'suppressed','NJ-08: sweep invalidates reminder in same transaction');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_set_study_notification_task_override((SELECT task_id FROM nj_ctx WHERE label='off'),false)$$,'NJ-10: Task override OFF');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),0,'NJ-10: only remaining live Task jobs suppressed');
SELECT lives_ok($$SELECT public.ls_set_study_notification_task_override((SELECT task_id FROM nj_ctx WHERE label='off'),true)$$,'NJ-10: zero-attempt suppressed jobs may re-arm');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),2,'NJ-10: Task re-enable restores eligible unsent jobs');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true,30)$$,'NJ-11: lead change');
RESET ROLE;
SELECT ok((SELECT bool_and(j.due_at=s.scheduled_start_at-interval '30 minutes') FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id WHERE j.status='pending'),'NJ-11: future pending due times updated');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(false)$$,'NJ-09: global opt-out');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),0,'NJ-09: all pending jobs invalidated, no first-page-only success');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE public.ls_study_notification_job_is_current(id)),0,'NJ-09: no current eligible jobs independent of dispatch gate');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'NJ-03/09: explicit zero-attempt re-arm on opt-in');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'NJ-03: unchanged save');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),2,'NJ-03: unchanged save no duplicates');
SELECT pg_temp.nj_create('isolation');
SELECT public.ls_set_study_notification_task_override((SELECT task_id FROM nj_ctx WHERE label='off'),false);
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id JOIN nj_ctx c ON c.task_id=s.task_id WHERE c.label='isolation' AND j.status='pending'),2,'NJ-10: another Task retains its pending jobs');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs j JOIN public.task_study_sessions s ON s.id=j.session_id JOIN nj_ctx c ON c.task_id=s.task_id WHERE c.label='off' AND j.status='pending'),0,'NJ-10: disabled Task alone loses pending jobs');
SELECT public.ls_set_study_notification_task_override((SELECT task_id FROM nj_ctx WHERE label='off'),true);
SELECT pg_temp.nj_create('sent');
SELECT pg_temp.nj_create('leased');
SELECT pg_temp.nj_create('attempted');
RESET ROLE;
UPDATE public.study_notification_jobs SET status='sent',attempt_count=1 WHERE session_id=pg_temp.nj_id('sent');
INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,status,provider_message_id)
 SELECT id,user_id,1,'accepted','fake-sent' FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('sent');
UPDATE public.study_notification_jobs SET status='leased',attempt_count=1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' WHERE session_id=pg_temp.nj_id('leased');
CREATE TEMP TABLE nj_lease AS SELECT lease_token,lease_until,due_at FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('leased');
INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,status)
 SELECT id,user_id,1,'uncertain' FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('attempted');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.nj_move('sent')$$,'NJ-14: reschedule already-sent reminder');
SELECT lives_ok($$SELECT pg_temp.nj_move('leased')$$,'leased reminder reschedule records a cancellation fence');
SELECT lives_ok($$SELECT pg_temp.nj_move('attempted')$$,'uncertain prior submission is not blindly replanned');
RESET ROLE;
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('sent')),'sent','NJ-14: sent is never re-armed');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries WHERE provider_message_id='fake-sent'),1,'NJ-14: accepted delivery record preserved');
SELECT ok((SELECT j.status='leased' AND j.cancel_requested_at IS NOT NULL AND j.lease_token=l.lease_token AND j.lease_until=l.lease_until AND j.due_at=l.due_at FROM public.study_notification_jobs j CROSS JOIN nj_lease l WHERE j.session_id=pg_temp.nj_id('leased')),'leased job retains token/expiry/due; cancellation is not claimed recalled');
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('attempted')),'suppressed','uncertain delivery prevents re-arm even with attempt_count zero');
SELECT ok(NOT public.ls_study_notification_job_is_current((SELECT id FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('leased'))),'leased cancellation fence blocks current eligibility');
UPDATE public.study_notification_jobs SET status='failed' WHERE session_id=pg_temp.nj_id('sent');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.nj_move('sent','17:00')$$,'failed job source can reschedule without retrying delivery');
RESET ROLE;
SELECT is((SELECT status FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('sent')),'failed','failed is not automatically pending');
SET LOCAL ROLE authenticated;
SELECT pg_temp.nj_create('rollback');
RESET ROLE;
CREATE TEMP TABLE nj_rollback AS SELECT pg_temp.nj_snapshot('rollback') state;
CREATE FUNCTION pg_temp.nj_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.session_id=pg_temp.nj_id('rollback') AND NEW.event_type='rescheduled' THEN RAISE EXCEPTION 'injected event failure'; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER nj_event_fault BEFORE INSERT ON public.task_study_session_events FOR EACH ROW EXECUTE FUNCTION pg_temp.nj_fail_event();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.nj_move('rollback')$$,'P0001','injected event failure','NJ-12: audit insertion failure rolls back job replan');
RESET ROLE;
SELECT is(pg_temp.nj_snapshot('rollback'),(SELECT state FROM nj_rollback),'NJ-12: Session, jobs and events unchanged after audit failure');
DROP TRIGGER nj_event_fault ON public.task_study_session_events;
SELECT pg_temp.nj_raw('job-fault','scheduled');
CREATE TEMP TABLE nj_jobfault AS SELECT pg_temp.nj_snapshot('job-fault') state;
CREATE FUNCTION pg_temp.nj_fail_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.session_id=pg_temp.nj_id('job-fault') THEN RAISE EXCEPTION 'injected job failure'; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER nj_job_fault BEFORE UPDATE ON public.study_notification_jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.nj_fail_job();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.ls_complete_study_session(pg_temp.nj_id('job-fault'),(SELECT updated_at FROM public.task_study_sessions WHERE id=pg_temp.nj_id('job-fault')),gen_random_uuid()::text)$$,'P0001','injected job failure','NJ-12: outbox failure rolls back Attendance');
RESET ROLE;
SELECT is(pg_temp.nj_snapshot('job-fault'),(SELECT state FROM nj_jobfault),'NJ-12: Attendance/job/audit atomic rollback');
DROP TRIGGER nj_job_fault ON public.study_notification_jobs;
SELECT pg_temp.nj_raw('near-due','scheduled',false,false,interval '5 minutes');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('near-due')),0,'future Session whose lead deadline passed is not enqueued late');
SET LOCAL ROLE authenticated;
SELECT public.ls_set_study_notification_preferences(false);
RESET ROLE;
-- Privileged cardinality fixture tests the per-user budget, not the Schedule
-- engine's separate 1000-occurrence input cap. No jobs exist for these OFF rows.
INSERT INTO public.tasks(id,user_id,title,status) VALUES('7b100000-0000-4000-8000-000000000099','7b000000-0000-4000-8000-000000000001','budget fixture','todo');
INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES('7b200000-0000-4000-8000-000000000099','7b000000-0000-4000-8000-000000000001','7b100000-0000-4000-8000-000000000099','2030-01-01','2045-01-01','UTC');
INSERT INTO public.task_study_sessions(user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
SELECT '7b000000-0000-4000-8000-000000000001'::uuid,'7b100000-0000-4000-8000-000000000099'::uuid,'7b200000-0000-4000-8000-000000000099'::uuid,1,'budget-'||n,
 date '2030-01-01'+n,'10:00'::time,'11:00'::time,'UTC',(date '2030-01-01'+n+time '10:00') AT TIME ZONE 'UTC',(date '2030-01-01'+n+time '11:00') AT TIME ZONE 'UTC' FROM generate_series(0,5000) n;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'54000','Notification reconciliation exceeds 5000 future sessions; reduce active schedules and retry','budget overflow fails atomically instead of silently skipping a backlog');
SELECT is((SELECT study_email_enabled FROM public.study_notification_preferences),false,'failed oversized opt-in leaves consent OFF');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE status='pending'),0,'oversized reconcile leaves no partial pending jobs');
RESET ROLE;
DELETE FROM public.tasks WHERE id='7b100000-0000-4000-8000-000000000099';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'reduce scope then retry completes reconciliation');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs WHERE session_id=pg_temp.nj_id('near-due')),0,'late opt-in does not enqueue an already-due reminder');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','7b000000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.ls_sync_study_notification_for_session(pg_temp.nj_id('off'))$$,'42501',NULL,'NJ-15: owner B cannot invoke internal sync');
SELECT throws_ok($$SELECT public.ls_reconcile_study_notifications('7b000000-0000-4000-8000-000000000001')$$,'42501',NULL,'NJ-15: owner B cannot invoke owner reconciliation');
SELECT throws_ok($$SELECT public.ls_study_notification_job_is_current(NULL)$$,'42501',NULL,'NJ-15: trusted fence is not a browser RPC');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.ls_sync_study_notification_for_session(NULL)$$,'42501',NULL,'NJ-15: anonymous internal sync denied');
RESET ROLE;
SELECT is((SELECT enabled FROM public.study_notification_dispatch_control),false,'NJ-16: dispatch stays OFF');
SELECT is((SELECT enabled FROM public.ls_missed_sweep_control),false,'NJ-16: Sweep gate stays OFF');
SELECT is((SELECT count(*)::integer FROM cron.job WHERE jobname LIKE '%notification%' OR jobname LIKE '%reminder%'),0,'NJ-16: no reminder Cron/network provider added');
SELECT * FROM finish();
ROLLBACK;
