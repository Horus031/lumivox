-- LOCAL pgTAP: all fixtures, gate changes and fault injection roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('7c000000-0000-4000-8000-000000000001','nd-a@example.invalid',clock_timestamp()),
 ('7c000000-0000-4000-8000-000000000002','nd-b@example.invalid',clock_timestamp());
INSERT INTO public.profiles(id) SELECT id FROM auth.users WHERE id::text LIKE '7c000000-%' ON CONFLICT DO NOTHING;
INSERT INTO public.study_notification_preferences(user_id,study_email_enabled,consented_at)
 VALUES('7c000000-0000-4000-8000-000000000001',true,clock_timestamp());
CREATE TEMP TABLE nd_ctx(label text PRIMARY KEY,job_id uuid,session_id uuid,task_id uuid,token uuid);
GRANT SELECT ON nd_ctx TO authenticated;
CREATE FUNCTION pg_temp.nd_new(p_label text,p_offset interval DEFAULT interval '5 minutes') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE t uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); j uuid:=gen_random_uuid();
  starts timestamptz:=date_trunc('milliseconds',clock_timestamp())+p_offset; z text; d date;
BEGIN
 z:=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;
 d:=(starts AT TIME ZONE z)::date;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(t,'7c000000-0000-4000-8000-000000000001',p_label,'todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
 VALUES(sc,'7c000000-0000-4000-8000-000000000001',t,d,d,z);
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
 local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(s,'7c000000-0000-4000-8000-000000000001',t,sc,1,p_label,d,(starts AT TIME ZONE z)::time,
 ((starts+interval '30 minutes') AT TIME ZONE z)::time,z,starts,starts+interval '30 minutes');
 -- Trusted legacy queue fixture: due passed, start still future. Lifecycle
 -- intentionally never backfills a late job; production rows would preexist.
 INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
 SELECT j,user_id,s,1,due_at,due_at,'nd:'||s::text,fingerprint FROM public.ls_notification_session_policy(s);
 INSERT INTO nd_ctx VALUES(p_label,j,s,t,NULL); RETURN j;
END;
$$;
CREATE FUNCTION pg_temp.nd_claim(p_label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE tok uuid;
BEGIN
 PERFORM public.ls_notification_claim_batch(25);
 SELECT lease_token INTO tok FROM public.study_notification_jobs WHERE id=(SELECT job_id FROM nd_ctx WHERE label=p_label);
 UPDATE nd_ctx SET token=tok WHERE label=p_label; RETURN tok;
END;
$$;
CREATE FUNCTION pg_temp.nd_auth(p_label text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_authorize_attempt(job_id,token) FROM nd_ctx WHERE label=p_label;
$$;
CREATE FUNCTION pg_temp.nd_result(p_label text,p_outcome jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_record_fake_outcome(job_id,token,p_outcome) FROM nd_ctx WHERE label=p_label;
$$;
CREATE FUNCTION pg_temp.nd_status(p_label text) RETURNS text LANGUAGE sql AS $$
 SELECT status FROM public.study_notification_jobs WHERE id=(SELECT job_id FROM nd_ctx WHERE label=p_label);
$$;
SELECT pg_temp.nd_new('accepted');
SELECT is(public.ls_notification_claim_batch(),'[]'::jsonb,'ND-01: gate OFF claims nothing');
SELECT is((SELECT attempt_count FROM public.study_notification_jobs),0,'ND-01: no consumed claim');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries),0,'ND-01: no provider handoff');
UPDATE public.study_notification_dispatch_control SET enabled=true;
SELECT ok(pg_temp.nd_claim('accepted') IS NOT NULL,'ND-02: due job gets lease');
SELECT ok((SELECT status='leased' AND lease_until>clock_timestamp()+interval '58 seconds' AND lease_until<=clock_timestamp()+interval '60 seconds' AND attempt_count=1 FROM public.study_notification_jobs),'ND-02/20: 60s lease with claim counter');
SELECT throws_ok($$SELECT public.ls_notification_authorize_attempt((SELECT job_id FROM nd_ctx WHERE label='accepted'),gen_random_uuid())$$,'PT409','Invalid or expired lease','ND-04: wrong authorize token');
SELECT is(pg_temp.nd_auth('accepted')->>'authorized','true','ND-02: verified current due job authorizes');
SELECT is((SELECT status FROM public.study_notification_deliveries),'submitting','ND-02: durable submitting before provider');
SELECT is(pg_temp.nd_auth('accepted')->>'reason','handoff_already_started','ND-02: authorize replay never duplicates handoff');
SELECT throws_ok($$SELECT public.ls_notification_record_fake_outcome((SELECT job_id FROM nd_ctx WHERE label='accepted'),gen_random_uuid(),'{"kind":"accepted","messageId":"fake-wrong"}')$$,'PT409','Invalid handoff token','ND-04: wrong outcome token');
SELECT is(pg_temp.nd_result('accepted','{"kind":"accepted","messageId":"fake-accepted"}')->>'status','sent','ND-06: accepted maps to sent');
SELECT is((SELECT status FROM public.study_notification_deliveries),'accepted','ND-06: accepted is not delivered');
SELECT is(pg_temp.nd_result('accepted','{"kind":"accepted","messageId":"fake-accepted"}')->>'replay','true','ND-06/19: exact outcome replay is idempotent');
SELECT throws_ok($$SELECT pg_temp.nd_result('accepted','{"kind":"accepted","messageId":"other"}')$$,'22023','Outcome replay mismatch','ND-06: different replay rejected');

SELECT pg_temp.nd_new('transient'); SELECT pg_temp.nd_claim('transient'); SELECT pg_temp.nd_auth('transient');
SELECT is(pg_temp.nd_result('transient','{"kind":"transient","code":"rate_limited","retryAfterMs":30000}')->>'status','pending','ND-07: known nonacceptance schedules retry');
SELECT ok((SELECT next_attempt_at>=clock_timestamp()+interval '29 seconds' AND next_attempt_at<=clock_timestamp()+interval '31 seconds' AND lease_token IS NULL FROM public.study_notification_jobs WHERE id=(SELECT job_id FROM nd_ctx WHERE label='transient')),'ND-07: retry-after bounded and ownership cleared');
UPDATE public.study_notification_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT job_id FROM nd_ctx WHERE label='transient');
SELECT pg_temp.nd_claim('transient'); SELECT pg_temp.nd_auth('transient');
SELECT is(pg_temp.nd_result('transient','{"kind":"transient","code":"server_error"}')->>'status','pending','ND-07: second transient retry');
SELECT ok((SELECT next_attempt_at BETWEEN clock_timestamp()+interval '29 seconds' AND clock_timestamp()+interval '34 seconds' FROM public.study_notification_jobs WHERE id=(SELECT job_id FROM nd_ctx WHERE label='transient')),'ND-07: exponential backoff plus bounded jitter');
UPDATE public.study_notification_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT job_id FROM nd_ctx WHERE label='transient');
SELECT pg_temp.nd_claim('transient'); SELECT pg_temp.nd_auth('transient');
SELECT is(pg_temp.nd_result('transient','{"kind":"transient","code":"server_error"}')->>'status','failed','ND-07/20: third claim exhausts max attempts');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='transient')),3,'ND-07: three distinct handoffs, no fourth claim');

SELECT pg_temp.nd_new('permanent'); SELECT pg_temp.nd_claim('permanent'); SELECT pg_temp.nd_auth('permanent');
SELECT is(pg_temp.nd_result('permanent','{"kind":"permanent","code":"invalid_recipient"}')->>'status','failed','permanent rejection is not retried');
SELECT pg_temp.nd_new('uncertain'); SELECT pg_temp.nd_claim('uncertain'); SELECT pg_temp.nd_auth('uncertain');
SELECT is(pg_temp.nd_result('uncertain','{"kind":"uncertain","code":"response_lost"}')->>'status','failed','ND-08: unknown acceptance held terminal for review');
SELECT is((SELECT status FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='uncertain')),'uncertain','ND-08: uncertainty retained separately');
SELECT is(public.ls_notification_claim_batch(),'[]'::jsonb,'ND-08: uncertain never blindly reclaimed');

SELECT pg_temp.nd_new('pre-crash'); SELECT pg_temp.nd_claim('pre-crash');
UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=(SELECT job_id FROM nd_ctx WHERE label='pre-crash');
SELECT is(public.ls_notification_reconcile_expired_leases(),1,'ND-09: expired lease without handoff reconciled');
SELECT is(pg_temp.nd_status('pre-crash'),'pending','ND-09: eligible no-handoff crash can retry');
SELECT pg_temp.nd_claim('pre-crash');
SELECT is((SELECT attempt_count FROM public.study_notification_jobs WHERE id=(SELECT job_id FROM nd_ctx WHERE label='pre-crash')),2,'ND-09: claim crash consumes claim, not delivery');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='pre-crash')),0,'ND-09: no fabricated submission attempts');
SELECT pg_temp.nd_auth('pre-crash');
UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=(SELECT job_id FROM nd_ctx WHERE label='pre-crash');
SELECT is(public.ls_notification_reconcile_expired_leases(),1,'ND-10/19: expired submitting lease reconciled');
SELECT is(pg_temp.nd_status('pre-crash'),'failed','ND-10: submitting crash cannot requeue');
SELECT is((SELECT status FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='pre-crash')),'uncertain','ND-10: crash after handoff persists uncertainty');
SELECT throws_ok($$SELECT pg_temp.nd_result('pre-crash','{"kind":"accepted","messageId":"late"}')$$,'PT409','Handoff requires reconciliation','ND-19: cleared owner cannot overwrite uncertain result');

SELECT pg_temp.nd_new('cancel'); SELECT pg_temp.nd_claim('cancel');
SELECT public.ls_set_study_notification_task_override((SELECT task_id FROM nd_ctx WHERE label='cancel'),false)
 FROM (SELECT set_config('request.jwt.claim.sub','7c000000-0000-4000-8000-000000000001',true)) claims;
SELECT is(pg_temp.nd_auth('cancel')->>'authorized','false','ND-05/16: cancellation before handoff blocks submission');
SELECT is(pg_temp.nd_status('cancel'),'suppressed','ND-05: cancellation clears lease to terminal');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='cancel')),0,'ND-05: no delivery created');
SELECT pg_temp.nd_new('unverified'); SELECT pg_temp.nd_claim('unverified');
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='7c000000-0000-4000-8000-000000000001';
SELECT is(pg_temp.nd_auth('unverified')->>'reason','unverified_destination','ND-12: actual Auth verification checked');
UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id='7c000000-0000-4000-8000-000000000001';

-- Pure policy at controlled instants: start inclusive/end exclusive, midnight,
-- DST gap and both fold instants. DB dispatch itself always uses DB clock.
SELECT ok(NOT public.ls_notification_in_quiet_hours(true,'22:00','07:00','UTC','2030-01-01T21:30Z'),'ND-11: before quiet interval');
SELECT ok(public.ls_notification_in_quiet_hours(true,'22:00','07:00','UTC','2030-01-01T22:00Z'),'ND-11: quiet start inclusive');
SELECT ok(public.ls_notification_in_quiet_hours(true,'22:00','07:00','UTC','2030-01-02T06:45Z'),'ND-11: overnight quiet');
SELECT ok(NOT public.ls_notification_in_quiet_hours(true,'22:00','07:00','UTC','2030-01-02T07:00Z'),'ND-11: end exclusive');
SELECT ok(public.ls_notification_in_quiet_hours(true,'09:00','17:00','Asia/Ho_Chi_Minh','2030-01-01T03:00Z'),'ND-11: daytime IANA timezone');
SELECT ok(public.ls_notification_in_quiet_hours(true,'01:00','02:00','America/New_York','2030-11-03T05:30Z'),'ND-11: earlier fold quiet');
SELECT ok(public.ls_notification_in_quiet_hours(true,'01:00','02:00','America/New_York','2030-11-03T06:30Z'),'ND-11: later fold quiet');
SELECT ok(NOT public.ls_notification_in_quiet_hours(true,'02:00','03:00','America/New_York','2030-03-10T07:00Z'),'ND-11: spring gap jumps to quiet end');
SELECT ok(NOT public.ls_notification_in_quiet_hours(false,NULL,NULL,NULL,'2030-01-01T23:00Z'),'ND-11: OFF bypasses quiet policy');
SELECT pg_temp.nd_new('quiet'); SELECT pg_temp.nd_claim('quiet');
UPDATE public.study_notification_preferences SET quiet_hours_enabled=true,timezone='UTC',
 quiet_start_local=((clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute')::time,
 quiet_end_local=((clock_timestamp() AT TIME ZONE 'UTC')+interval '1 minute')::time WHERE user_id='7c000000-0000-4000-8000-000000000001';
SELECT is(pg_temp.nd_auth('quiet')->>'reason','quiet_hours','ND-11: real authorization suppresses quiet hours, no morning delay');
UPDATE public.study_notification_preferences SET quiet_hours_enabled=false WHERE user_id='7c000000-0000-4000-8000-000000000001';

SELECT pg_temp.nd_new('completed'); SELECT pg_temp.nd_claim('completed');
UPDATE public.task_study_sessions SET status='completed',completed_at=clock_timestamp() WHERE id=(SELECT session_id FROM nd_ctx WHERE label='completed');
SELECT is(pg_temp.nd_auth('completed')->>'authorized','false','ND-13: completed Session cannot handoff');
SELECT pg_temp.nd_new('skipped'); SELECT pg_temp.nd_claim('skipped');
UPDATE public.task_study_sessions SET status='skipped' WHERE id=(SELECT session_id FROM nd_ctx WHERE label='skipped');
SELECT is(pg_temp.nd_auth('skipped')->>'authorized','false','ND-13: skipped Session cannot handoff');
SELECT pg_temp.nd_new('cancelled'); SELECT pg_temp.nd_claim('cancelled');
UPDATE public.task_study_sessions SET status='cancelled' WHERE id=(SELECT session_id FROM nd_ctx WHERE label='cancelled');
SELECT is(pg_temp.nd_auth('cancelled')->>'authorized','false','ND-13: cancelled Session cannot handoff');
SELECT pg_temp.nd_new('revision'); SELECT pg_temp.nd_claim('revision');
UPDATE public.task_study_schedules SET revision=2 WHERE task_id=(SELECT task_id FROM nd_ctx WHERE label='revision');
SELECT is(pg_temp.nd_auth('revision')->>'authorized','false','ND-14: old generation cannot handoff');
SELECT pg_temp.nd_new('late',interval '-1 minute');
SELECT is(public.ls_notification_claim_batch(),'[]'::jsonb,'ND-15: Session already started yields no claim');
SELECT is(pg_temp.nd_status('late'),'expired','ND-15: relevance expired');
SELECT pg_temp.nd_new('retry-cutoff',interval '5 seconds'); SELECT pg_temp.nd_claim('retry-cutoff'); SELECT pg_temp.nd_auth('retry-cutoff');
SELECT is(pg_temp.nd_result('retry-cutoff','{"kind":"transient","code":"server_error"}')->>'status','expired','ND-15: backoff beyond Session start expires');

SELECT pg_temp.nd_new('gate-after-claim'); SELECT pg_temp.nd_claim('gate-after-claim');
UPDATE public.study_notification_dispatch_control SET enabled=false;
SELECT is(pg_temp.nd_auth('gate-after-claim')->>'reason','dispatch_off','ND-01: gate OFF blocks an already-leased worker');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='gate-after-claim')),0,'ND-01: no handoff while OFF');
UPDATE public.study_notification_dispatch_control SET enabled=true;
UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=(SELECT job_id FROM nd_ctx WHERE label='gate-after-claim');
SELECT throws_ok($$SELECT pg_temp.nd_auth('gate-after-claim')$$,'PT409','Invalid or expired lease','ND-04: expired token cannot authorize');
SELECT public.ls_notification_reconcile_expired_leases();
SELECT pg_temp.nd_claim('gate-after-claim'); SELECT pg_temp.nd_auth('gate-after-claim');
CREATE FUNCTION pg_temp.nd_fail_outcome() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.id=(SELECT job_id FROM nd_ctx WHERE label='gate-after-claim') AND NEW.status='sent' THEN
 RAISE EXCEPTION 'injected outcome failure'; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER nd_outcome_fault BEFORE UPDATE ON public.study_notification_jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.nd_fail_outcome();
SELECT throws_ok($$SELECT pg_temp.nd_result('gate-after-claim','{"kind":"accepted","messageId":"fake-fault"}')$$,'P0001','injected outcome failure','ND-19: failed result commit rolls back delivery and job');
SELECT is((SELECT status FROM public.study_notification_deliveries WHERE job_id=(SELECT job_id FROM nd_ctx WHERE label='gate-after-claim')),'submitting','ND-19: durable handoff survives rolled-back outcome');
SELECT is(pg_temp.nd_status('gate-after-claim'),'leased','ND-19: failed result never claims sent success');
DROP TRIGGER nd_outcome_fault ON public.study_notification_jobs;
SELECT pg_temp.nd_result('gate-after-claim','{"kind":"accepted","messageId":"fake-fault"}');

DO $$ BEGIN FOR i IN 1..26 LOOP PERFORM pg_temp.nd_new('batch-'||i); END LOOP; END $$;
SELECT is(jsonb_array_length(public.ls_notification_claim_batch()),25,'ND-20: actual default batch leases exactly 25 of 26 jobs');
SELECT is(jsonb_array_length(public.ls_notification_claim_batch()),1,'ND-20: next batch only claims remaining occurrence');

SELECT throws_ok($$SELECT public.ls_notification_claim_batch(26)$$,'22023','Batch size must be 1..25','ND-20: batch max enforced');
SELECT throws_ok($$SELECT public.ls_notification_claim_batch(0)$$,'22023','Batch size must be 1..25','ND-20: empty batch invalid');
SELECT throws_ok($$SELECT public.ls_notification_reconcile_expired_leases(NULL)$$,'22023','Batch size must be 1..25','ND-20: null expiry batch invalid');
SELECT throws_ok($$SELECT pg_temp.nd_result('accepted','{"kind":"transient","code":"server_error","retryAfterMs":-1}')$$,'22023','Invalid retry delay','ND-20: negative delay denied');
SELECT throws_ok($$SELECT pg_temp.nd_result('accepted','{"kind":"transient","code":"server_error","retryAfterMs":120001}')$$,'22023','Invalid retry delay','ND-20: max delay enforced');
SELECT throws_ok($$SELECT pg_temp.nd_result('accepted','{"kind":"accepted","messageId":"x","email":"arbitrary@example.invalid"}')$$,'22023','Invalid fake outcome','ND-18: no arbitrary destination/provider payload');
SELECT ok((SELECT bool_and(lease_token IS NULL AND lease_until IS NULL) FROM public.study_notification_jobs WHERE status IN('sent','suppressed','expired','failed')),'terminal jobs never retain lease ownership');
SELECT ok(public.ls_notification_dispatch_stats() ? 'uncertainAttempts','trusted aggregate metrics available without email data');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','7c000000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.ls_notification_claim_batch()$$,'42501',NULL,'ND-17: owner B cannot claim');
SELECT throws_ok($$SELECT public.ls_notification_authorize_attempt(NULL,NULL)$$,'42501',NULL,'ND-17: owner B cannot authorize');
SELECT throws_ok($$SELECT public.ls_notification_record_fake_outcome(NULL,NULL,'{}')$$,'42501',NULL,'ND-17: owner B cannot forge outcome');
SELECT throws_ok($$SELECT public.ls_notification_reconcile_expired_leases()$$,'42501',NULL,'ND-17: owner B cannot reconcile');
SELECT throws_ok($$SELECT public.ls_notification_dispatch_stats()$$,'42501',NULL,'ND-17: owner B cannot read worker metrics');
SELECT throws_ok($$SELECT handoff_token FROM public.study_notification_deliveries$$,'42501',NULL,'ND-17: handoff capability hidden from browser');
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.ls_notification_claim_batch()$$,'42501',NULL,'ND-17: anon cannot claim');
SELECT throws_ok($$SELECT public.ls_notification_authorize_attempt(NULL,NULL)$$,'42501',NULL,'ND-17: anon cannot authorize');
SELECT throws_ok($$SELECT public.ls_notification_record_fake_outcome(NULL,NULL,'{}')$$,'42501',NULL,'ND-17: anon cannot forge outcome');
SELECT throws_ok($$SELECT public.ls_notification_reconcile_expired_leases()$$,'42501',NULL,'ND-17: anon cannot reconcile');
RESET ROLE;
UPDATE public.study_notification_dispatch_control SET enabled=false;
SELECT is((SELECT enabled FROM public.study_notification_dispatch_control),false,'dispatch gate OFF before rollback');
SELECT is((SELECT enabled FROM public.ls_missed_sweep_control),false,'Sweep independent and OFF');
SELECT is((SELECT count(*)::integer FROM cron.job WHERE jobname LIKE '%notification%' OR jobname LIKE '%reminder%'),0,'ND-18: no reminder Cron');
SELECT * FROM finish();
ROLLBACK;
