-- LOCAL fixtures and temporary dispatch gate roll back. No provider/network.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('8c000000-0000-4000-8000-000000000001','us@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claim.sub','8c000000-0000-4000-8000-000000000001',true);
SELECT public.ls_set_study_notification_preferences(true);
CREATE TEMP TABLE us_ctx(label text PRIMARY KEY,job uuid,token uuid,delivery uuid);
CREATE FUNCTION pg_temp.us_new(p_label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t uuid:=gen_random_uuid();sc uuid:=gen_random_uuid();s uuid:=gen_random_uuid();j uuid:=gen_random_uuid();
 starts timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes';z text;day date;
BEGIN
 z:=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;day:=(starts AT TIME ZONE z)::date;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(t,'8c000000-0000-4000-8000-000000000001',p_label,'todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
 VALUES(sc,'8c000000-0000-4000-8000-000000000001',t,day,day,z);
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
 local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(s,'8c000000-0000-4000-8000-000000000001',t,sc,1,p_label,day,(starts AT TIME ZONE z)::time,
 ((starts+interval '30 minutes') AT TIME ZONE z)::time,z,starts,starts+interval '30 minutes');
 INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
 SELECT j,user_id,s,1,due_at,due_at,'us:'||s,fingerprint FROM public.ls_notification_session_policy(s);
 INSERT INTO us_ctx VALUES(p_label,j,NULL,NULL);RETURN j;
END $$;
CREATE FUNCTION pg_temp.us_lease(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE tok uuid:=gen_random_uuid(); BEGIN
 UPDATE public.study_notification_jobs SET status='leased',attempt_count=attempt_count+1,lease_token=tok,lease_until=clock_timestamp()+interval '60 seconds'
 WHERE id=(SELECT job FROM us_ctx WHERE label=p_label);
 UPDATE us_ctx SET token=tok WHERE label=p_label;
END $$;
CREATE FUNCTION pg_temp.us_auth(p_label text,email text DEFAULT 'us@example.invalid',fp text DEFAULT repeat('a',64),allowlisted boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;BEGIN
 SELECT public.ls_notification_authorize_resend_attempt(job,token,email,fp,repeat('b',64),'vi',allowlisted) INTO result FROM us_ctx WHERE label=p_label;
 UPDATE us_ctx SET delivery=(result->>'deliveryId')::uuid WHERE label=p_label;RETURN result;
END $$;
CREATE FUNCTION pg_temp.us_accept(p_label text,message text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_record_resend_outcome(delivery,token,repeat('b',64),'accepted',message) FROM us_ctx WHERE label=p_label;
$$;
CREATE FUNCTION pg_temp.us_event(id text,message text,kind text,bounce text DEFAULT NULL,fp text DEFAULT repeat('a',64)) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_ingest_resend(id,message,kind,'2026-11-06T00:00:00Z',fp,repeat('c',64),bounce);
$$;
SELECT public.ls_notification_issue_unsubscribe_token('8c000000-0000-4000-8000-000000000001','us@example.invalid',repeat('a',64),repeat('1',64));
SELECT ok((SELECT expires_at>clock_timestamp()+interval '89 days' AND expires_at<clock_timestamp()+interval '91 days' FROM study_notification_unsubscribe_tokens),'90-day expiry policy');
SELECT pg_temp.us_new('pending'); SELECT pg_temp.us_new('lease'); SELECT pg_temp.us_lease('lease');
SELECT ok(public.ls_notification_consume_unsubscribe_token(repeat('1',64)),'US-02: valid token consumed');
SELECT ok(NOT(SELECT study_email_enabled FROM study_notification_preferences),'US-02: global opt-out persisted');
SELECT is((SELECT status FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='pending')),'suppressed','US-02: pending atomically suppressed');
SELECT ok((SELECT cancel_requested_at IS NOT NULL AND status='leased' FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='lease')),'US-02: lease fenced without recalling handoff');
SELECT ok(public.ls_notification_consume_unsubscribe_token(repeat('1',64)),'US-03: replay succeeds harmlessly');
SELECT ok(NOT(SELECT study_email_enabled FROM study_notification_preferences),'US-03: replay never opts in');
SELECT ok(NOT public.ls_notification_consume_unsubscribe_token(repeat('f',64)),'US-04: forged hash denied');
SELECT public.ls_notification_issue_unsubscribe_token('8c000000-0000-4000-8000-000000000001','us@example.invalid',repeat('a',64),repeat('2',64));
UPDATE study_notification_unsubscribe_tokens SET expires_at=created_at+interval '1 microsecond' WHERE token_hash=repeat('2',64);
SELECT ok(NOT public.ls_notification_consume_unsubscribe_token(repeat('2',64)),'US-04: expired denied');
SELECT public.ls_notification_issue_unsubscribe_token('8c000000-0000-4000-8000-000000000001','us@example.invalid',repeat('a',64),repeat('3',64));
SELECT public.ls_notification_issue_unsubscribe_token('8c000000-0000-4000-8000-000000000001','us@example.invalid',repeat('a',64),repeat('4',64),true);
SELECT ok(NOT public.ls_notification_consume_unsubscribe_token(repeat('3',64)),'US-04: replacement revokes older token');
SELECT public.ls_set_study_notification_preferences(true);
UPDATE study_notification_jobs SET status='suppressed',lease_token=NULL,lease_until=NULL WHERE status='leased';
UPDATE study_notification_dispatch_control SET enabled=true;
SELECT pg_temp.us_new('provider');SELECT pg_temp.us_lease('provider');
SELECT is(pg_temp.us_auth('provider',allowlisted=>false)->>'reason','not_allowlisted','real handoff requires explicit trusted allowlist attestation');
SELECT is(pg_temp.us_auth('provider')->>'authorized','true','verified consented unsuppressed destination authorized');
SELECT is((SELECT provider FROM study_notification_deliveries WHERE id=(SELECT delivery FROM us_ctx WHERE label='provider')),'resend','explicit provider identity');
SELECT pg_temp.us_accept('provider','us-message');
SELECT pg_temp.us_new('blocked-pending');SELECT pg_temp.us_new('blocked-lease');SELECT pg_temp.us_lease('blocked-lease');
SELECT pg_temp.us_event('us-hard','us-message','email.bounced','Permanent');
SELECT is((SELECT reason FROM study_notification_suppressions),'hard_bounce','US-07: confirmed Permanent bounce suppresses correct identity');
SELECT is((SELECT status FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='blocked-pending')),'suppressed','US-07: pending fenced');
SELECT ok((SELECT cancel_requested_at IS NOT NULL FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='blocked-lease')),'US-07: leased fenced');
SELECT pg_temp.us_event('us-complaint','us-message','email.complained');
SELECT pg_temp.us_event('us-late','us-message','email.delivered');
SELECT is((SELECT count(*)::int FROM study_notification_suppressions WHERE revoked_at IS NULL),2,'US-08: hard bounce and complaint facts both retained');
SELECT is(pg_temp.us_event('us-hard','us-message','email.bounced','Permanent')->>'replay','true','suppression event replay no-op');
SELECT is((SELECT count(*)::int FROM study_notification_suppressions),2,'one suppression fact per receipt');
SELECT public.ls_set_study_notification_preferences(false);SELECT public.ls_set_study_notification_preferences(true);
SELECT pg_temp.us_new('reoptin');SELECT pg_temp.us_lease('reoptin');
SELECT is(pg_temp.us_auth('reoptin')->>'reason','recipient_suppressed','US-12: re-opt-in cannot bypass active suppression at final handoff');
SELECT pg_temp.us_event('us-delayed','us-message','email.delivery_delayed');
SELECT is((SELECT count(*)::int FROM study_notification_suppressions),2,'US-09: delayed adds no suppression');
SELECT is(pg_temp.us_event('us-unmatched','unknown-us-message','email.bounced','Permanent')->>'status','unmatched','US-10: unknown Email ID unmatched');
SELECT is((SELECT count(*)::int FROM study_notification_suppressions),2,'US-10: no guessed owner');
SELECT pg_temp.us_event('us-wrong','us-message','email.complained',NULL,repeat('d',64));
SELECT is((SELECT count(*)::int FROM study_notification_suppressions),2,'wrong recipient does not suppress another identity');
SELECT public.ls_set_study_notification_preferences(false);
UPDATE auth.users SET email='new@example.invalid' WHERE id='8c000000-0000-4000-8000-000000000001';
SELECT pg_temp.us_new('changed-off');SELECT pg_temp.us_lease('changed-off');
SELECT is(pg_temp.us_auth('changed-off','new@example.invalid',repeat('d',64))->>'authorized','false','US-13: changed verified email cannot bypass global opt-out');
SELECT ok(NOT(SELECT study_email_enabled FROM study_notification_preferences),'US-13: email change does not grant consent');
SELECT public.ls_set_study_notification_preferences(true);
SELECT pg_temp.us_new('new-address');SELECT pg_temp.us_lease('new-address');
SELECT is(pg_temp.us_auth('new-address','new@example.invalid',repeat('d',64))->>'authorized','true','old address suppression not inherited by new identity after explicit opt-in');
SELECT pg_temp.us_accept('new-address','new-us-message');
SELECT pg_temp.us_event('us-early-new','late-us-message','email.complained',NULL,repeat('d',64));
SELECT is((SELECT count(*)::int FROM study_notification_suppressions),2,'US-11: early complaint remains unassigned');
SELECT pg_temp.us_new('late-correlation');SELECT pg_temp.us_lease('late-correlation');
SELECT pg_temp.us_auth('late-correlation','new@example.invalid',repeat('d',64));
SELECT pg_temp.us_accept('late-correlation','late-us-message');
SELECT is((SELECT count(*)::int FROM study_notification_suppressions WHERE recipient_fingerprint=repeat('d',64) AND reason='complaint'),1,'US-11: late correlation suppresses exact owner/identity');
CREATE FUNCTION pg_temp.us_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected 8C failure';END $$;
CREATE TRIGGER us_fault BEFORE INSERT ON study_notification_suppressions FOR EACH ROW EXECUTE FUNCTION pg_temp.us_fault();
SELECT throws_ok($$SELECT pg_temp.us_event('us-atomic','new-us-message','email.suppressed',NULL,repeat('d',64))$$,'P0001','injected 8C failure','suppression fault aborts ingestion');
SELECT is((SELECT count(*)::int FROM study_notification_webhook_receipts WHERE provider_event_id='us-atomic'),0,'receipt rolled back with suppression failure');
SELECT is((SELECT status FROM study_notification_deliveries WHERE id=(SELECT delivery FROM us_ctx WHERE label='new-address')),'accepted','delivery projection rolled back with suppression failure');
DROP TRIGGER us_fault ON study_notification_suppressions;
SELECT public.ls_notification_issue_unsubscribe_token('8c000000-0000-4000-8000-000000000001','new@example.invalid',repeat('d',64),repeat('5',64));
SELECT pg_temp.us_new('rollback-pending');
CREATE TRIGGER us_fault BEFORE UPDATE ON study_notification_unsubscribe_tokens FOR EACH ROW EXECUTE FUNCTION pg_temp.us_fault();
SELECT throws_ok($$SELECT public.ls_notification_consume_unsubscribe_token(repeat('5',64))$$,'P0001','injected 8C failure','token mark failure rolls back opt-out');
SELECT ok((SELECT study_email_enabled FROM study_notification_preferences),'consent unchanged on token transaction failure');
SELECT is((SELECT status FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='rollback-pending')),'pending','pending invalidation rolled back with token failure');
DROP TRIGGER us_fault ON study_notification_unsubscribe_tokens;
SELECT throws_ok($$SELECT public.ls_notification_issue_unsubscribe_token('8c000000-0000-4000-8000-000000000001','old@example.invalid',repeat('a',64),repeat('6',64))$$,'PT409','Recipient changed or unverified','issuance rejects stale Auth email');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','8c000000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT * FROM study_notification_unsubscribe_tokens$$,'42501',NULL,'US-15: Owner B cannot read token hashes');
SELECT throws_ok($$DELETE FROM study_notification_suppressions$$,'42501',NULL,'US-15: Owner B cannot revoke suppressions');
SELECT throws_ok($$SELECT public.ls_notification_consume_unsubscribe_token(repeat('5',64))$$,'42501',NULL,'browser cannot invoke trusted token RPC');
SELECT throws_ok($$SELECT public.ls_notification_authorize_resend_attempt(gen_random_uuid(),gen_random_uuid(),'forged@example.invalid',repeat('a',64),repeat('b',64),'en',true)$$,'42501',NULL,'browser cannot invoke final Resend authorization');
RESET ROLE;SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM study_notification_suppressions$$,'42501',NULL,'US-15: anon cannot access suppressions');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$DELETE FROM study_notification_unsubscribe_tokens$$,'42501',NULL,'service role token writes require trusted commands');
RESET ROLE;
SELECT pg_temp.us_event('us-soft','new-us-message','email.bounced','Transient',repeat('d',64));
SELECT is((SELECT reason FROM study_notification_suppressions s JOIN study_notification_webhook_receipts r ON r.id=s.source_event_id WHERE r.provider_event_id='us-soft'),'provider_suppressed','soft bounce is conservatively blocked without inventing hard-bounce proof');
SELECT pg_temp.us_event('us-unknown-bounce','new-us-message','email.bounced',NULL,repeat('d',64));
SELECT is((SELECT reason FROM study_notification_suppressions s JOIN study_notification_webhook_receipts r ON r.id=s.source_event_id WHERE r.provider_event_id='us-unknown-bounce'),'provider_suppressed','missing bounce proof is never classified hard bounce');
SELECT is(pg_temp.us_event('us-unknown-bounce','new-us-message','email.bounced','Permanent',repeat('d',64))->>'replay','true','legacy exact payload hash remains idempotent across typed metadata upgrade');
SELECT is((SELECT count(*)::int FROM pg_class WHERE oid IN ('study_notification_suppressions'::regclass,'study_notification_unsubscribe_tokens'::regclass,'study_notification_recipient_identities'::regclass) AND relrowsecurity),3,'all three private tables have RLS');
UPDATE study_notification_dispatch_control SET enabled=false;
SELECT pg_temp.us_new('gate-off');SELECT pg_temp.us_lease('gate-off');
SELECT is(pg_temp.us_auth('gate-off','new@example.invalid',repeat('d',64))->>'reason','dispatch_off','US-16: dispatch OFF denies handoff');
SELECT ok(NOT (SELECT enabled FROM ls_missed_sweep_control),'US-16: Sweep remains OFF');
SELECT * FROM finish();ROLLBACK;
