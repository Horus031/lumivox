-- LOCAL ONLY. Helpers, failure trigger and fixtures are all rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE rs_cases (
  zone text PRIMARY KEY,
  task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid(),
  session_id uuid DEFAULT gen_random_uuid(),
  neighbor_id uuid DEFAULT gen_random_uuid(),
  completed_id uuid DEFAULT gen_random_uuid(),
  missed_id uuid DEFAULT gen_random_uuid(),
  past_id uuid DEFAULT gen_random_uuid(),
  slot_id uuid DEFAULT gen_random_uuid(),
  old_stamp timestamptz DEFAULT now() - interval '1 hour'
);
INSERT INTO rs_cases(zone) VALUES ('UTC'), ('Asia/Ho_Chi_Minh'), ('America/New_York');
GRANT SELECT ON rs_cases TO authenticated;
INSERT INTO auth.users(id,email) VALUES
 ('e1000000-0000-4000-8000-000000000001','rs-a@example.invalid'),
 ('e1000000-0000-4000-8000-000000000002','rs-b@example.invalid');
INSERT INTO public.profiles(id) VALUES
 ('e1000000-0000-4000-8000-000000000001'),
 ('e1000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.tasks(id,user_id,title,status)
 SELECT task_id,'e1000000-0000-4000-8000-000000000001',zone,'todo' FROM rs_cases;
INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
 SELECT schedule_id,'e1000000-0000-4000-8000-000000000001',task_id,
        '2030-01-01','2030-12-31',zone FROM rs_cases;
INSERT INTO public.task_study_schedule_slots(id,user_id,schedule_id,weekday,start_time,end_time)
 SELECT slot_id,'e1000000-0000-4000-8000-000000000001',schedule_id,1,'10:00','11:00' FROM rs_cases;
INSERT INTO public.task_study_schedule_revisions
 (user_id,schedule_id,revision,starts_on,ends_on,timezone,slots_snapshot)
 SELECT 'e1000000-0000-4000-8000-000000000001',schedule_id,1,
        '2030-01-01','2030-12-31',zone,
        '[{"weekday":1,"startTime":"10:00","endTime":"11:00"}]'::jsonb FROM rs_cases;
INSERT INTO public.task_study_sessions
 (id,user_id,task_id,schedule_id,schedule_revision,source_slot_id,logical_occurrence_key,
  local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,
  status,completed_at,updated_at)
 SELECT x.id,'e1000000-0000-4000-8000-000000000001',c.task_id,c.schedule_id,1,c.slot_id,
        x.key,x.day,x.starts,x.ends,c.zone,
        (x.day+x.starts) AT TIME ZONE c.zone,(x.day+x.ends) AT TIME ZONE c.zone,
        x.status,CASE WHEN x.status='completed' THEN now() ELSE NULL END,c.old_stamp
 FROM rs_cases c CROSS JOIN LATERAL (VALUES
   (c.session_id,'original-obligation',date '2030-01-07',time '10:00',time '11:00','scheduled'),
   (c.neighbor_id,'neighbor',date '2030-01-07',time '12:00',time '13:00','scheduled'),
   (c.completed_id,'completed',date '2030-01-08',time '10:00',time '11:00','completed'),
   (c.missed_id,'missed',date '2030-01-09',time '10:00',time '11:00','missed'),
   (c.past_id,'past',(now() AT TIME ZONE c.zone)::date-1,time '10:00',time '11:00','scheduled')
 ) x(id,key,day,starts,ends,status);

-- Invoker helpers retain the authenticated role and RLS. No privileged wrapper.
CREATE FUNCTION pg_temp.rs_change(
 zone text, day date, starts time, ends time, key text,
 expected timestamptz DEFAULT NULL, start_at timestamptz DEFAULT NULL,
 end_at timestamptz DEFAULT NULL, target uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c record; sid uuid; version timestamptz;
BEGIN
 SELECT * INTO c FROM rs_cases WHERE rs_cases.zone=rs_change.zone;
 sid := coalesce(target,c.session_id);
 SELECT updated_at INTO version FROM public.task_study_sessions WHERE id=sid;
 RETURN public.ls_reschedule_session(sid,coalesce(expected,version),day,starts,ends,
   coalesce(start_at,(day+starts) AT TIME ZONE zone),
   coalesce(end_at,(day+ends) AT TIME ZONE zone),key);
END $$;
CREATE FUNCTION pg_temp.rs_state(sid uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$
 SELECT jsonb_build_object(
   'session',(SELECT to_jsonb(s) FROM public.task_study_sessions s WHERE id=sid),
   'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id)
             FROM public.task_study_session_events e WHERE session_id=sid));
$$;
CREATE FUNCTION pg_temp.rs_fail_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 IF NEW.event_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' THEN
   RAISE EXCEPTION 'Injected audit insert failure' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rs_test_failure BEFORE INSERT ON public.task_study_session_events
 FOR EACH ROW EXECUTE FUNCTION pg_temp.rs_fail_event();

CREATE FUNCTION pg_temp.rs_suite(z text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c record; k text := md5(z||'first')::uuid::text; before_state jsonb; n integer;
        args jsonb; changed jsonb; field text;
BEGIN
 SELECT * INTO c FROM rs_cases WHERE zone=z;
 RETURN NEXT is(pg_temp.rs_change(z,'2030-01-07','09:00','10:00',k,c.old_stamp),
                c.session_id,z||': valid change preserves session ID');
 RETURN NEXT ok((SELECT logical_occurrence_key='original-obligation' AND schedule_revision=1
                 AND source_slot_id IS NULL AND local_start_time='09:00'
                 AND scheduled_start_at=('2030-01-07 09:00'::timestamp AT TIME ZONE z)
                 FROM public.task_study_sessions WHERE id=c.session_id),
                z||': override preserves identity/revision and stores new instant');
 RETURN NEXT is((SELECT count(*) FROM public.task_study_session_events WHERE session_id=c.session_id),
                1::bigint,z||': exactly one audit event');
 RETURN NEXT ok((SELECT event_type='rescheduled' AND actor_id=auth.uid()
                 AND from_status='scheduled' AND to_status='scheduled'
                 AND payload->'previous'->>'startTime'='10:00:00'
                 AND payload->'new'->>'startTime'='09:00:00'
                 FROM public.task_study_session_events WHERE session_id=c.session_id),
                z||': audit event records actor and previous/new times');
 before_state:=pg_temp.rs_state(c.session_id);
 RETURN NEXT is(pg_temp.rs_change(z,'2030-01-07','09:00','10:00',k,c.old_stamp),
                c.session_id,z||': same-key retry accepts original expected timestamp');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,
                z||': retry changes neither session nor the single audit event');
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,%L)',
   z,'2030-01-07','16:00','17:00',k,c.old_stamp),
   '22023','Event key reused with different request',z||': same key rejects different payload');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,
                z||': changed-payload replay leaves prior times/event intact');
 -- Mutate each request field independently, retaining the successful event key.
 -- Session ID/key scope is per session; changing session ID is a different command.
 args:=jsonb_build_object('version',c.old_stamp,'day','2030-01-07','starts','09:00',
   'ends','10:00','startAt',('2030-01-07 09:00'::timestamp AT TIME ZONE z),
   'endAt',('2030-01-07 10:00'::timestamp AT TIME ZONE z));
 FOREACH field IN ARRAY ARRAY['version','day','starts','ends','startAt','endAt'] LOOP
   changed:=args || CASE field
     WHEN 'version' THEN jsonb_build_object(field,c.old_stamp+interval '1 second')
     WHEN 'day' THEN jsonb_build_object(field,'2030-01-08')
     WHEN 'starts' THEN jsonb_build_object(field,'09:15')
     WHEN 'ends' THEN jsonb_build_object(field,'10:15')
     WHEN 'startAt' THEN jsonb_build_object(field,('2030-01-07 09:01'::timestamp AT TIME ZONE z))
     ELSE jsonb_build_object(field,('2030-01-07 10:01'::timestamp AT TIME ZONE z)) END;
   RETURN NEXT throws_ok(format('SELECT public.ls_reschedule_session(%L,%L,%L,%L,%L,%L,%L,%L)',
     c.session_id,changed->>'version',changed->>'day',changed->>'starts',changed->>'ends',
     changed->>'startAt',changed->>'endAt',k),
     '22023','Event key reused with different request',z||': fingerprint rejects changed '||field);
   RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,z||': changed '||field||' has no effects');
 END LOOP;
 RETURN NEXT ok((SELECT payload->>'requestFingerprint' ~ '^[0-9a-f]{64}$'
   FROM public.task_study_session_events WHERE session_id=c.session_id AND event_key=k),
   z||': successful event stores SHA-256 fingerprint');
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,%L)',
   z,'2030-01-07','09:30','10:30',md5(z||'stale')::uuid::text,c.old_stamp),
   '40001','Stale session version',z||': stale update rejected');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,z||': stale request has no effects');
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L)',
   z,'2031-01-01','09:00','10:00',md5(z||'range')::uuid::text),
   '22023','Invalid new study time',z||': date outside schedule rejected');
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,%L)',
   z,'2030-01-07','09:00','10:00',md5(z||'instant')::uuid::text,
   ('2030-01-07 08:00'::timestamp AT TIME ZONE z)),
   '22023','Local time/UTC mismatch',z||': invalid local-to-UTC rejected');
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L)',
   z,'2030-01-07','12:30','13:30',md5(z||'overlap')::uuid::text),
   '23P01','Study session overlaps another obligation',z||': overlap rejected');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,z||': rejected time changes leave no effects');
 RETURN NEXT lives_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L)',
   z,'2030-01-07','11:00','12:00',md5(z||'adjacent')::uuid::text),
   z||': adjacent occurrence ending at neighbor start is allowed');
 before_state:=pg_temp.rs_state(c.session_id);
 RETURN NEXT is(pg_temp.rs_change(z,'2030-01-07','09:00','10:00',k,c.old_stamp),
   c.session_id,z||': identical old event replays after a later successful command');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,
   z||': replay of old command does not undo newer times or duplicate events');
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L)',
   z,'2030-01-07','15:00','16:00','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
   'P0001','Injected audit insert failure',z||': audit insert failure propagates');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,
   z||': audit insert failure rolls back time, version, identity and events');
 FOR n IN 1..3 LOOP
   RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,NULL,NULL,%L)',
     z,'2030-01-07','15:00','16:00',md5(z||'status'||n)::uuid::text,
     CASE n WHEN 1 THEN c.completed_id WHEN 2 THEN c.missed_id ELSE c.past_id END),
     '22023','Session is not eligible for rescheduling',
     z||': rejects '||CASE n WHEN 1 THEN 'completed' WHEN 2 THEN 'missed' ELSE 'past' END||' session');
 END LOOP;
 RETURN NEXT is(public.ls_revise_schedule(c.schedule_id,1,'2030-01-07','2030-01-07',z,
   '[{"weekday":1,"startTime":"14:00","endTime":"15:00"}]'::jsonb,
   jsonb_build_array(jsonb_build_object('localDate','2030-01-07','localStartTime','14:00',
    'localEndTime','15:00','timezone',z,'slotIndex',0,'occurrenceKey','2030-01-07|1|14:00|15:00',
    'scheduledStartAt',('2030-01-07 14:00'::timestamp AT TIME ZONE z),
    'scheduledEndAt',('2030-01-07 15:00'::timestamp AT TIME ZONE z)))),
   2,z||': whole-schedule revision succeeds after override');
 RETURN NEXT ok((SELECT status='cancelled' AND cancellation_reason='schedule_changed'
   AND logical_occurrence_key='original-obligation' AND schedule_revision=1
   FROM public.task_study_sessions WHERE id=c.session_id),
   z||': whole revision supersedes override without deleting its identity');
 RETURN NEXT is((SELECT count(*) FROM public.task_study_session_events WHERE session_id=c.session_id
                AND event_type='rescheduled'),
   2::bigint,z||': whole revision preserves both prior reschedule events');
 RETURN NEXT is((SELECT count(*) FROM public.task_study_session_events WHERE session_id=c.session_id
                AND event_type='cancelled'),
   1::bigint,z||': whole revision adds exactly one cancellation audit event');
 RETURN NEXT ok((SELECT from_status='scheduled' AND to_status='cancelled'
   AND actor_id=auth.uid() AND payload->>'reason'='schedule_changed'
   AND payload->>'scheduleId'=c.schedule_id::text
   FROM public.task_study_session_events WHERE session_id=c.session_id AND event_type='cancelled'),
   z||': cancellation event has expected status, actor and reason');
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000002';
-- Valid payload, exact authorization message: cannot pass via payload validation.
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L)',zone,
 '2030-01-07','09:00','10:00',md5(zone||'foreign')::uuid::text),
 '22023','Session not found',zone||': cross-user denied') FROM rs_cases;
SET LOCAL "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.task_study_session_events),0::bigint,
          'Cross-user attempts created no audit events');
SELECT tests.* FROM rs_cases c CROSS JOIN LATERAL pg_temp.rs_suite(c.zone) tests;

-- New revision occurrence is used for explicit DST fold/gap probes.
-- The generic suite revised the range to one day; reopen the fixture range
-- as postgres so the following probes isolate DST rather than range checks.
RESET ROLE;
UPDATE public.task_study_schedules SET starts_on='2030-01-01',ends_on='2030-12-31'
 WHERE id=(SELECT schedule_id FROM rs_cases WHERE zone='America/New_York');
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,%L,%L,%L)',
 'America/New_York','2030-03-10','02:30','03:30',md5('gap')::uuid::text,
 '2030-03-10 07:30Z','2030-03-10 07:30Z',
 (SELECT s.id FROM public.task_study_sessions s JOIN rs_cases c ON c.schedule_id=s.schedule_id
  WHERE c.zone='America/New_York' AND s.schedule_revision=2)),
 '22023','Invalid new study time','DST gap cannot form a positive-duration occurrence');
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,%L,%L,%L)',
 'America/New_York','2030-03-10','02:30','04:00',md5('gap-roundtrip')::uuid::text,
 '2030-03-10 07:30Z','2030-03-10 08:00Z',
 (SELECT s.id FROM public.task_study_sessions s JOIN rs_cases c ON c.schedule_id=s.schedule_id
  WHERE c.zone='America/New_York' AND s.schedule_revision=2)),
 '22023','Local time/UTC mismatch','DST gap fails wall-clock round-trip with positive UTC duration');
SELECT lives_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,%L,%L,%L)',
 'America/New_York','2030-11-03','01:30','02:30',md5('fold-earlier')::uuid::text,
 '2030-11-03 05:30Z','2030-11-03 07:30Z',
 (SELECT s.id FROM public.task_study_sessions s JOIN rs_cases c ON c.schedule_id=s.schedule_id
  WHERE c.zone='America/New_York' AND s.schedule_revision=2)),
 'DST fold accepts earlier valid instant');
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,%L,%L,%L)',
 'America/New_York','2030-11-03','01:30','02:30',md5('fold-later')::uuid::text,
 '2030-11-03 06:30Z','2030-11-03 07:30Z',
 (SELECT s.id FROM public.task_study_sessions s JOIN rs_cases c ON c.schedule_id=s.schedule_id
  WHERE c.zone='America/New_York' AND s.schedule_revision=2)),
 '22023','Noncanonical or nonexistent local study time',
 'DST canonicalization rejects later fold instant through direct RPC');

-- Privileged fixture changes, then test with a real authenticated role.
RESET ROLE;
UPDATE public.tasks SET status='in_progress' WHERE id IN (SELECT task_id FROM rs_cases);
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,NULL,NULL,%L)',c.zone,
 '2030-01-07','16:00','17:00',md5(c.zone||'active-task')::uuid::text,s.id),
 c.zone||': in_progress Task allows rescheduling')
 FROM rs_cases c JOIN public.task_study_sessions s ON s.schedule_id=c.schedule_id AND s.schedule_revision=2;
RESET ROLE;
UPDATE public.tasks SET status='completed' WHERE id IN (SELECT task_id FROM rs_cases);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,NULL,NULL,%L)',c.zone,
 '2030-01-07','16:00','17:00',md5(c.zone||'closed-task')::uuid::text,s.id),
 '22023','Session is not eligible for rescheduling',c.zone||': completed Task rejected')
 FROM rs_cases c JOIN public.task_study_sessions s ON s.schedule_id=c.schedule_id AND s.schedule_revision=2;
RESET ROLE;
UPDATE public.tasks SET status='cancelled' WHERE id IN (SELECT task_id FROM rs_cases);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,NULL,NULL,%L)',c.zone,
 '2030-01-07','17:00','18:00',md5(c.zone||'cancelled-task')::uuid::text,s.id),
 '22023','Session is not eligible for rescheduling',c.zone||': cancelled Task rejected')
 FROM rs_cases c JOIN public.task_study_sessions s ON s.schedule_id=c.schedule_id AND s.schedule_revision=2;
RESET ROLE;
UPDATE public.tasks SET status='todo' WHERE id IN (SELECT task_id FROM rs_cases);
UPDATE public.task_study_schedules SET status='closed' WHERE id IN (SELECT schedule_id FROM rs_cases);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,NULL,NULL,NULL,%L)',c.zone,
 '2030-01-07','16:00','17:00',md5(c.zone||'closed-schedule')::uuid::text,s.id),
 '22023','Session is not eligible for rescheduling',c.zone||': closed schedule rejected')
 FROM rs_cases c JOIN public.task_study_sessions s ON s.schedule_id=c.schedule_id AND s.schedule_revision=2;
RESET ROLE;
-- Legacy audit rows have no fingerprint: fail closed, even when supplied times
-- match the old command. Insert fixtures as postgres, then exercise real RLS.
INSERT INTO public.task_study_session_events
 (user_id,session_id,event_type,from_status,to_status,actor_id,event_key,payload)
 SELECT 'e1000000-0000-4000-8000-000000000001',session_id,'rescheduled','scheduled','scheduled',
        'e1000000-0000-4000-8000-000000000001',md5(zone||'legacy')::uuid::text,
        '{"new":{"localDate":"2030-01-07","startTime":"09:00","endTime":"10:00"}}'::jsonb
 FROM rs_cases;
CREATE FUNCTION pg_temp.rs_legacy_suite(z text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c record; before_state jsonb;
BEGIN
 SELECT * INTO c FROM rs_cases WHERE zone=z;
 before_state:=pg_temp.rs_state(c.session_id);
 RETURN NEXT throws_ok(format('SELECT pg_temp.rs_change(%L,%L,%L,%L,%L,%L)',
   z,'2030-01-07','09:00','10:00',md5(z||'legacy')::uuid::text,c.old_stamp),
   '22023','Event key reused with different request',z||': legacy event without fingerprint fails closed');
 RETURN NEXT is(pg_temp.rs_state(c.session_id),before_state,
   z||': legacy replay leaves session and audit rows unchanged');
END $$;
SET LOCAL ROLE authenticated;
SELECT tests.* FROM rs_cases c CROSS JOIN LATERAL pg_temp.rs_legacy_suite(c.zone) tests;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
