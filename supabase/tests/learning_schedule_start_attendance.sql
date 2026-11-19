-- LOCAL pgTAP acceptance. Fixtures, helpers and injected failures all roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
CREATE TEMP TABLE start_cases (
  name text PRIMARY KEY, task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid(), session_id uuid DEFAULT gen_random_uuid(),
  initial_version timestamptz DEFAULT now() - interval '5 minutes'
);
INSERT INTO start_cases(name) VALUES ('valid'),('future'),('expired'),('completed'),('cancelled'),
 ('missed'),('skipped'),('running'),('closed_completed'),('closed_cancelled'),('paused'),('stale'),('rollback'),('grace');
GRANT SELECT ON start_cases TO authenticated;
INSERT INTO auth.users(id,email) VALUES
 ('51000000-0000-4000-8000-000000000001','attendance-owner@example.invalid'),
 ('51000000-0000-4000-8000-000000000002','attendance-other@example.invalid');
INSERT INTO public.profiles(id) VALUES
 ('51000000-0000-4000-8000-000000000001'),('51000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.tasks(id,user_id,title,status)
 SELECT task_id,'51000000-0000-4000-8000-000000000001','Attendance fixture '||name,'todo' FROM start_cases;
-- Choose a fixed-offset zone putting the current local clock away from midnight,
-- so fixtures remain same-day at any UTC execution hour.
CREATE TEMP TABLE start_clock AS SELECT now() AS anchor,
 CASE WHEN EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC') BETWEEN 6 AND 17 THEN 'UTC' ELSE 'Etc/GMT+12' END AS zone;
INSERT INTO public.task_study_schedules(id,task_id,user_id,starts_on,ends_on,timezone)
 SELECT c.schedule_id,c.task_id,'51000000-0000-4000-8000-000000000001',
 (k.anchor AT TIME ZONE k.zone)::date-1,(k.anchor AT TIME ZONE k.zone)::date+1,k.zone
 FROM start_cases c CROSS JOIN start_clock k;
INSERT INTO public.task_study_sessions
 (id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,
  local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,status,completed_at,updated_at)
 SELECT c.session_id,'51000000-0000-4000-8000-000000000001',c.task_id,c.schedule_id,1,'attendance|'||c.name,
 (x.a AT TIME ZONE k.zone)::date,(x.a AT TIME ZONE k.zone)::time,(x.b AT TIME ZONE k.zone)::time,k.zone,x.a,x.b,
 CASE c.name WHEN 'running' THEN 'in_progress' WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled'
 WHEN 'missed' THEN 'missed' WHEN 'skipped' THEN 'skipped' ELSE 'scheduled' END,
 CASE WHEN c.name='completed' THEN k.anchor ELSE NULL END,c.initial_version
 FROM start_cases c CROSS JOIN start_clock k CROSS JOIN LATERAL (
 SELECT CASE WHEN c.name='future' THEN k.anchor+interval '1 hour'
             WHEN c.name='expired' THEN k.anchor-interval '3 hours'
             WHEN c.name='grace' THEN k.anchor-interval '30 minutes'
             ELSE k.anchor-interval '5 minutes' END AS a,
        CASE WHEN c.name='future' THEN k.anchor+interval '2 hours'
             WHEN c.name='expired' THEN k.anchor-interval '2 hours'
             WHEN c.name='grace' THEN k.anchor-interval '10 minutes'
             ELSE k.anchor+interval '25 minutes' END AS b
 ) x;
UPDATE public.tasks SET status='completed' WHERE id=(SELECT task_id FROM start_cases WHERE name='closed_completed');
UPDATE public.tasks SET status='cancelled' WHERE id=(SELECT task_id FROM start_cases WHERE name='closed_cancelled');
UPDATE public.task_study_schedules SET status='paused' WHERE id=(SELECT schedule_id FROM start_cases WHERE name='paused');
CREATE FUNCTION pg_temp.start_sql(case_name text,event_key text,stamp timestamptz DEFAULT NULL) RETURNS text
LANGUAGE sql SECURITY INVOKER AS $$
 SELECT format('SELECT public.ls_start_study_session(%L,%L,%L)',session_id,coalesce(stamp,initial_version),event_key)
 FROM start_cases WHERE name=case_name;
$$;
CREATE FUNCTION pg_temp.start_snapshot() RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
 SELECT jsonb_build_object(
 'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.task_study_sessions s JOIN start_cases c ON c.session_id=s.id),
 'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.task_study_session_events e JOIN start_cases c ON c.session_id=e.session_id));
$$;
CREATE TEMP TABLE start_before AS SELECT pg_temp.start_snapshot() AS data;
GRANT SELECT ON start_before TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role"='authenticated';
SELECT is(public.ls_start_study_session(session_id,initial_version,'start-valid'),session_id,'START-01: valid owner start retains ID') FROM start_cases WHERE name='valid';
SELECT is((SELECT status FROM public.task_study_sessions WHERE id=c.session_id),'in_progress','START-01: status becomes in_progress') FROM start_cases c WHERE name='valid';
SELECT is((SELECT count(*) FROM public.task_study_session_events WHERE session_id=c.session_id AND event_type='started'),1::bigint,'START-02: exactly one started event') FROM start_cases c WHERE name='valid';
SELECT ok((SELECT from_status='scheduled' AND to_status='in_progress' AND actor_id='51000000-0000-4000-8000-000000000001' AND payload->>'requestFingerprint' IS NOT NULL FROM public.task_study_session_events WHERE session_id=c.session_id),'START-02: audit actor, transition and fingerprint') FROM start_cases c WHERE name='valid';
SELECT ok((SELECT completed_at IS NULL AND actual_study_minutes IS NULL AND logical_occurrence_key='attendance|valid' FROM public.task_study_sessions WHERE id=c.session_id),'START-01: no fake completion/minutes or identity changes') FROM start_cases c WHERE name='valid';
SELECT is((SELECT status::text FROM public.tasks WHERE id=c.task_id),'todo','START-01: Task status is not changed') FROM start_cases c WHERE name='valid';
SELECT is(public.ls_start_study_session(session_id,initial_version,'start-valid'),session_id,'START-03: exact replay succeeds before stale/status checks') FROM start_cases WHERE name='valid';
SELECT is((SELECT count(*) FROM public.task_study_session_events WHERE session_id=c.session_id),1::bigint,'START-03: replay does not append event') FROM start_cases c WHERE name='valid';
SELECT throws_ok(pg_temp.start_sql('valid','start-valid',now()),'22023','Event key reused with different request','START-04: changed version under same key rejected');
SELECT throws_ok(pg_temp.start_sql('future','future'),'22023','Session is outside the start window','START-05: future session rejected');
SELECT throws_ok(pg_temp.start_sql('expired','expired'),'22023','Session is outside the start window','START-06: after end + 60 minutes rejected');
SELECT throws_ok(pg_temp.start_sql(name,'state-'||name),'22023','Session is not eligible for starting','START-07: reject '||name) FROM start_cases WHERE name IN ('completed','cancelled','missed','skipped','running');
SELECT throws_ok(pg_temp.start_sql(name,'closed-'||name),'22023','Session is not eligible for starting','START-08: reject '||name) FROM start_cases WHERE name IN ('closed_completed','closed_cancelled','paused');
SELECT throws_ok(pg_temp.start_sql('stale','stale',now()-interval '1 day'),'PT409','Stale session version','START-10: stale version uses explicit HTTP conflict contract');
SELECT ok((SELECT status='scheduled' AND updated_at=c.initial_version FROM public.task_study_sessions WHERE id=c.session_id),'START-10: stale command does not overwrite row') FROM start_cases c WHERE name='stale';
SELECT is(public.ls_start_study_session(session_id,initial_version,'grace'),session_id,'START-06: start after end but within grace is accepted') FROM start_cases WHERE name='grace';
SET LOCAL "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000002';
SELECT throws_ok(pg_temp.start_sql('stale','cross-owner'),'42501','Study session not found or not owned','START-09: another owner denied');
SELECT is((SELECT count(*) FROM public.task_study_sessions WHERE id=c.session_id),0::bigint,'START-09: RLS prevents cross-owner session read') FROM start_cases c WHERE name='stale';
SET LOCAL "request.jwt.claim.sub"='';
SELECT throws_ok(pg_temp.start_sql('stale','no-user'),'42501','Authentication required','Missing authenticated identity rejected');
SET LOCAL "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000001';
SELECT throws_ok(pg_temp.start_sql('stale',''),'22023','Invalid event key','Blank key rejected');
SELECT throws_ok(pg_temp.start_sql('stale',repeat('x',257)),'22023','Invalid event key','Oversized key rejected');
SELECT throws_ok(pg_temp.start_sql('stale','   '),'22023','Invalid event key','Whitespace key rejected');
SELECT throws_ok(format('SELECT public.ls_start_study_session(%L,NULL,%L)',session_id,'null-version'),'22023','Invalid session or expected version','Null version rejected') FROM start_cases WHERE name='stale';
RESET ROLE;
CREATE FUNCTION pg_temp.fail_start_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.event_type='started' AND NEW.event_key='fail-audit' THEN
 RAISE EXCEPTION 'Injected attendance audit failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER start_test_audit_failure BEFORE INSERT ON public.task_study_session_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_start_audit();
CREATE TEMP TABLE rollback_before AS SELECT pg_temp.start_snapshot() AS data;
GRANT SELECT ON rollback_before TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000001';
SELECT throws_ok(pg_temp.start_sql('rollback','fail-audit'),'P0001','Injected attendance audit failure','START-11: failed audit aborts Start');
SELECT is(pg_temp.start_snapshot(),(SELECT data FROM rollback_before),'START-11: entire session/event snapshot rolled back');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.ls_start_study_session(uuid,timestamptz,text)','EXECUTE'),'Anonymous role cannot execute Start RPC');
SELECT ok(has_function_privilege('authenticated','public.ls_start_study_session(uuid,timestamptz,text)','EXECUTE'),'Authenticated role can execute reviewed Start RPC');
SELECT finish();
ROLLBACK;
