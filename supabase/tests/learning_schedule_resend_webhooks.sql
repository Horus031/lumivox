-- LOCAL ONLY. Simulated provider handoffs, no sends; every fixture rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES('8b000000-0000-4000-8000-000000000001','rw@example.invalid');
CREATE TEMP TABLE rw_ctx(label text PRIMARY KEY,delivery_id uuid,job_id uuid,token uuid);
CREATE FUNCTION pg_temp.rw_new(label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
 j uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid(); day date:=current_date+1;
BEGIN
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(t,'8b000000-0000-4000-8000-000000000001',label,'todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
 VALUES(sc,'8b000000-0000-4000-8000-000000000001',t,day,day,'UTC');
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
 local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(s,'8b000000-0000-4000-8000-000000000001',t,sc,1,label,day,'10:00','11:00','UTC',
 (day+time '10:00') AT TIME ZONE 'UTC',(day+time '11:00') AT TIME ZONE 'UTC');
 INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,idempotency_key,status,attempt_count)
 VALUES(j,'8b000000-0000-4000-8000-000000000001',s,1,clock_timestamp(),'rw:'||s,'failed',1);
 INSERT INTO public.study_notification_deliveries(id,job_id,user_id,attempt_number,provider,status,handoff_token,
 recipient_fingerprint,provider_payload_fingerprint,submission_locale,locale_policy)
 VALUES(d,j,'8b000000-0000-4000-8000-000000000001',1,'resend','submitting',tok,repeat('a',64),repeat('b',64),'vi','explicit-trusted-command-v1');
 INSERT INTO rw_ctx VALUES(label,d,j,tok); RETURN d;
END $$;
CREATE FUNCTION pg_temp.rw_out(label text,message text,kind text DEFAULT 'accepted') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_record_resend_outcome(delivery_id,token,repeat('b',64),kind,message) FROM rw_ctx WHERE rw_ctx.label=$1;
$$;
CREATE FUNCTION pg_temp.rw_event(id text,message text,kind text,recipient text DEFAULT repeat('a',64)) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_ingest_resend(id,message,kind,'2026-11-01T00:00:00Z',recipient,repeat('c',64));
$$;
SELECT pg_temp.rw_new('first');
SELECT is(pg_temp.rw_event('evt-first','message-first','email.delivered')->>'status','unmatched','RW-05: early receipt retained');
SELECT is(pg_temp.rw_out('first','message-first')->>'status','delivered','RW-06: API ID reconciles early event');
SELECT is((SELECT status FROM study_notification_jobs WHERE id=(SELECT job_id FROM rw_ctx WHERE label='first')),'sent','delivery evidence resolves outbox acceptance');
CREATE TEMP TABLE rw_snapshot AS SELECT to_jsonb(d) value FROM study_notification_deliveries d WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='first');
SELECT is(pg_temp.rw_event('evt-first','message-first','email.delivered')->>'replay','true','RW-03: identical duplicate no-op');
SELECT is((SELECT to_jsonb(d) FROM study_notification_deliveries d WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='first')),(SELECT value FROM rw_snapshot),'RW-03: duplicate does not touch status or timestamps');
SELECT is((SELECT count(*)::int FROM study_notification_webhook_receipts),1,'RW-03: one receipt');
SELECT throws_ok($$SELECT pg_temp.rw_event('evt-first','message-first','email.sent')$$,'22023','Provider event integrity conflict','RW-04: conflicting ID rejected');
SELECT is((SELECT event_type FROM study_notification_webhook_receipts),'email.delivered','RW-04: original evidence retained');
SELECT is(pg_temp.rw_event('evt-sent','message-first','email.sent')->>'status','processed','RW-07: late sent processed');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='first')),'delivered','RW-07: delivered does not regress');
SELECT pg_temp.rw_event('evt-bounce','message-first','email.bounced');
SELECT pg_temp.rw_event('evt-delivered-late','message-first','email.delivered');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='first')),'bounced','RW-08: bounce retained after delivery');
SELECT pg_temp.rw_event('evt-complaint','message-first','email.complained');
SELECT pg_temp.rw_event('evt-after-complaint','message-first','email.sent');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='first')),'complained','RW-08: complaint retained');
SELECT is((SELECT count(*)::int FROM study_notification_webhook_receipts WHERE event_type IN ('email.bounced','email.complained')),2,'RW-08: both independent facts retained');
SELECT is(pg_temp.rw_event('evt-unknown','unknown-message','email.delivered')->>'status','unmatched','RW-09: unknown ID retained');
SELECT is(pg_temp.rw_event('evt-other-recipient','message-first','email.bounced',repeat('d',64))->>'status','recipient_mismatch','per-recipient mismatch fenced');
SELECT is((SELECT count(*)::int FROM study_notification_deliveries WHERE status='complained'),1,'RW-09: unrelated recipient never modifies delivery');
SELECT pg_temp.rw_new('second');
SELECT throws_ok($$SELECT public.ls_notification_record_fake_outcome((SELECT job_id FROM rw_ctx WHERE label='second'),(SELECT token FROM rw_ctx WHERE label='second'),'{"kind":"accepted","messageId":"fake-contamination"}')$$,'PT409','Invalid handoff token','fake outcome cannot record real-provider attempt');
SELECT throws_ok($$SELECT pg_temp.rw_out('second','message-first')$$,'23505',NULL,'RW-11: provider ID unique across attempts');
SELECT is((SELECT provider_message_id FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='second')),NULL,'RW-11: conflicting assignment rolled back');
SELECT throws_ok($$UPDATE study_notification_deliveries SET submission_locale='en' WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='second')$$,'22023','Immutable submission context','immutable locale snapshot');
SELECT throws_ok($$SELECT ls_notification_record_resend_outcome((SELECT delivery_id FROM rw_ctx WHERE label='second'),gen_random_uuid(),repeat('b',64),'accepted','bad-token')$$,'PT409','Invalid Resend handoff','handoff token bound');
SELECT throws_ok($$SELECT ls_notification_record_resend_outcome((SELECT delivery_id FROM rw_ctx WHERE label='second'),(SELECT token FROM rw_ctx WHERE label='second'),repeat('d',64),'accepted','bad-payload')$$,'PT409','Invalid Resend handoff','immutable payload fingerprint bound');
SELECT is(pg_temp.rw_out('second',NULL,'uncertain')->>'status','uncertain','unknown outcome held without retry');
SELECT is(pg_temp.rw_out('second','message-second')->>'status','accepted','explicit provider evidence resolves uncertain without send');
SELECT ok((SELECT provider_accepted_at IS NOT NULL FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='second')),'accepted timestamp recorded');
SELECT is(pg_temp.rw_out('second','message-second')->>'replay','true','exact provider outcome replay');
SELECT throws_ok($$SELECT pg_temp.rw_out('second','changed-id')$$,'22023','Outcome replay mismatch','provider outcome mismatch rejected');
SELECT pg_temp.rw_event('evt-delayed','message-second','email.delivery_delayed');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='second')),'accepted','delay is not terminal failure');
SELECT pg_temp.rw_new('failure'); SELECT pg_temp.rw_out('failure','message-failure');
SELECT pg_temp.rw_event('evt-failure','message-failure','email.failed');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='failure')),'failed','verified failure persisted');
SELECT is((SELECT status FROM study_notification_jobs WHERE id=(SELECT job_id FROM rw_ctx WHERE label='failure')),'failed','verified failure cannot requeue uncertain attempt');
SELECT pg_temp.rw_new('suppression'); SELECT pg_temp.rw_out('suppression','message-suppression');
SELECT pg_temp.rw_event('evt-suppression','message-suppression','email.suppressed');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='suppression')),'suppressed','verified suppression persisted without changing consent');
CREATE FUNCTION pg_temp.rw_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected projection failure'; END $$;
CREATE TRIGGER rw_fault BEFORE UPDATE ON public.study_notification_deliveries FOR EACH ROW EXECUTE FUNCTION pg_temp.rw_fault();
SELECT throws_ok($$SELECT pg_temp.rw_event('evt-rollback','message-second','email.delivered')$$,'P0001','injected projection failure','RW-12: projection failure raised');
SELECT is((SELECT count(*)::int FROM study_notification_webhook_receipts WHERE provider_event_id='evt-rollback'),0,'RW-12: receipt insert rolled back too');
DROP TRIGGER rw_fault ON public.study_notification_deliveries;
SELECT pg_temp.rw_new('rollback');
CREATE TRIGGER rw_fault BEFORE UPDATE ON public.study_notification_jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.rw_fault();
SELECT throws_ok($$SELECT pg_temp.rw_out('rollback','message-rollback')$$,'P0001','injected projection failure','RW-12: outcome job fault raised');
SELECT is((SELECT provider_message_id FROM study_notification_deliveries WHERE id=(SELECT delivery_id FROM rw_ctx WHERE label='rollback')),NULL,'RW-12: provider assignment rolled back atomically');
DROP TRIGGER rw_fault ON public.study_notification_jobs;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','8b000000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT * FROM study_notification_webhook_receipts$$,'42501',NULL,'RW-10: Owner B cannot read receipts');
SELECT throws_ok($$DELETE FROM study_notification_webhook_receipts$$,'42501',NULL,'RW-10: Owner B cannot mutate receipts');
SELECT throws_ok($$SELECT public.ls_notification_ingest_resend('forged','forged','email.sent',now(),repeat('a',64),repeat('b',64))$$,'42501',NULL,'RW-10: browser cannot forge event RPC');
SELECT throws_ok($$SELECT recipient_fingerprint FROM study_notification_deliveries$$,'42501',NULL,'private context hidden from browser');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM study_notification_webhook_receipts$$,'42501',NULL,'anonymous receipt access denied');
RESET ROLE;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='study_notification_webhook_receipts'::regclass),'receipts RLS enabled');
SELECT ok(NOT (SELECT enabled FROM study_notification_dispatch_control),'dispatch stays OFF');
SELECT * FROM finish();
ROLLBACK;
