-- LOCAL fixtures and temporary dispatch gate roll back. No provider/network.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('8c000000-0000-4000-8000-000000000001','us@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claim.sub','8c000000-0000-4000-8000-000000000001',true);
SELECT public.ls_set_study_notification_preferences(true);
CREATE TEMP TABLE us_ctx(label text PRIMARY KEY,job uuid,token uuid,delivery uuid);
CREATE FUNCTION pg_temp.us_new(p_label text,p_offset interval DEFAULT interval '5 minutes') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t uuid:=gen_random_uuid();sc uuid:=gen_random_uuid();s uuid:=gen_random_uuid();j uuid:=gen_random_uuid();
 starts timestamptz:=date_trunc('milliseconds',clock_timestamp())+p_offset;z text;day date;
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
-- Metadata fixtures use inert envelope text. Actual AES-GCM/transport integration
-- is exercised by the Node worker harness, not claimed by these pgTAP fixtures.
UPDATE study_notification_dispatch_control SET enabled=true;
SELECT pg_temp.us_new('first');SELECT pg_temp.us_lease('first');
SELECT is((SELECT reminder_locale FROM study_notification_preferences),NULL,'RI-06: existing preference has no implicit English locale');
CREATE FUNCTION pg_temp.pd_context(label text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_resolve_resend_context(job,token) FROM us_ctx WHERE us_ctx.label=$1;
$$;
CREATE FUNCTION pg_temp.pd_prepare(label text,hash text DEFAULT repeat('1',64),body text DEFAULT 'v1.inert-not-real-crypto-envelope-fixture') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_prepare_resend_payload(job,token,pg_temp.pd_context(label)->>'contextHash','us@example.invalid',repeat('a',64),repeat('b',64),body,hash,pg_temp.pd_context(label)->>'locale') FROM us_ctx WHERE us_ctx.label=$1;
$$;
CREATE FUNCTION pg_temp.pd_auth(label text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_notification_authorize_resend_payload(job,token,'us@example.invalid',repeat('a',64)) FROM us_ctx WHERE us_ctx.label=$1;
$$;
SELECT throws_ok($$SELECT pg_temp.pd_prepare('first')$$,'PT409','Stale or incomplete submission context','RI-06: no locale confirmation means no preparation');
SELECT public.ls_set_study_reminder_locale('vi');
SELECT is((SELECT reminder_locale FROM study_notification_preferences),'vi','explicit VI choice persisted');
SELECT ok((SELECT locale_confirmed_at IS NOT NULL AND study_email_enabled FROM study_notification_preferences),'locale confirmed without changing existing consent');
SELECT throws_ok($$SELECT public.ls_set_study_reminder_locale('fr')$$,'22023','Invalid reminder locale','unsupported locale rejected');
SELECT ok((pg_temp.pd_context('first')->>'verified')::boolean,'Auth identity resolved server-side');
SELECT is(pg_temp.pd_context('first')->>'recipient','us@example.invalid','recipient comes from Auth');
SELECT is(pg_temp.pd_context('first')->>'idempotencyKey',(SELECT idempotency_key FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='first')),'key comes from persisted Job');
CREATE TEMP TABLE pd_snapshot AS SELECT pg_temp.pd_prepare('first') value;
SELECT is((SELECT count(*)::int FROM study_notification_resend_payloads),1,'RI-08: one snapshot persisted');
SELECT is((SELECT count(*)::int FROM study_notification_unsubscribe_tokens),1,'RI-07/08: one hash-only capability persisted atomically');
SELECT is(pg_temp.pd_prepare('first',repeat('2',64),'new-inert-candidate-envelope'),(SELECT value FROM pd_snapshot),'RI-08: racing/repeated preparation reuses first snapshot verbatim');
SELECT is((SELECT count(*)::int FROM study_notification_unsubscribe_tokens),1,'RI-08: ignored candidate creates no new token');
SELECT throws_ok($$UPDATE study_notification_resend_payloads SET encrypted_payload='replacement'$$,'22023','Immutable provider payload','snapshot cannot mutate');
UPDATE study_notification_dispatch_control SET enabled=false;
SELECT is(pg_temp.pd_auth('first')->>'reason','dispatch_off','RI-02: database gate OFF denies handoff');
UPDATE study_notification_dispatch_control SET enabled=true;
SELECT is(pg_temp.pd_auth('first')->>'authorized','true','RI-09: handoff authorized from prepared snapshot');
SELECT is(pg_temp.pd_auth('first')->>'reason','handoff_already_started','RI-14: replay cannot get second submission capability');
SELECT is((SELECT count(*)::int FROM study_notification_deliveries),1,'RI-14: one durable attempt');
SELECT is((SELECT provider_payload_fingerprint FROM study_notification_deliveries),repeat('b',64),'snapshot fingerprint bound at handoff');
SELECT is((SELECT submission_locale FROM study_notification_deliveries),'vi','RI-06: actual delivery snapshots locale');
SELECT public.ls_notification_consume_unsubscribe_token(repeat('1',64));
SELECT ok((SELECT cancel_requested_at IS NOT NULL FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='first')),'RI-13: post-handoff opt-out preserves fence');
SELECT public.ls_notification_record_resend_outcome((SELECT id FROM study_notification_deliveries),(SELECT token FROM us_ctx WHERE label='first'),repeat('b',64),'accepted','pd-accepted');
SELECT is((SELECT provider_message_id FROM study_notification_deliveries),'pd-accepted','RI-09/13: accepted Email ID recorded after opt-out');
SELECT ok(NOT (SELECT study_email_enabled FROM study_notification_preferences),'outcome cannot re-enable consent');
SELECT public.ls_set_study_notification_preferences(true);
SELECT pg_temp.us_new('stale');SELECT pg_temp.us_lease('stale');SELECT pg_temp.pd_prepare('stale',repeat('3',64));
UPDATE public.tasks SET title='changed after prepare' WHERE id=(SELECT task_id FROM task_study_sessions WHERE id=(SELECT session_id FROM study_notification_jobs WHERE id=(SELECT job FROM us_ctx WHERE label='stale')));
SELECT is(pg_temp.pd_auth('stale')->>'reason','stale_payload','changed context cannot send stale immutable payload');
SELECT pg_temp.us_new('before');SELECT pg_temp.us_lease('before');SELECT pg_temp.pd_prepare('before',repeat('4',64));
SELECT public.ls_notification_consume_unsubscribe_token(repeat('4',64));
SELECT is(pg_temp.pd_auth('before')->>'authorized','false','RI-12: opt-out before handoff denies provider capability');
SELECT is((SELECT count(*)::int FROM study_notification_deliveries),1,'RI-12: no extra attempt');
SELECT public.ls_set_study_notification_preferences(true);
SELECT pg_temp.us_new('rollback');SELECT pg_temp.us_lease('rollback');
CREATE FUNCTION pg_temp.pd_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected snapshot fault';END $$;
CREATE TRIGGER pd_fault BEFORE INSERT ON study_notification_resend_payloads FOR EACH ROW EXECUTE FUNCTION pg_temp.pd_fault();
SELECT throws_ok($$SELECT pg_temp.pd_prepare('rollback',repeat('5',64))$$,'P0001','injected snapshot fault','snapshot fault aborts preparation');
SELECT is((SELECT count(*)::int FROM study_notification_unsubscribe_tokens WHERE token_hash=repeat('5',64)),0,'token issuance rolled back with snapshot failure');
DROP TRIGGER pd_fault ON study_notification_resend_payloads;

CREATE FUNCTION pg_temp.pd_rate(label text) RETURNS void LANGUAGE sql AS $$
 SELECT public.ls_notification_record_resend_rate_limit(d.id,c.token,repeat('b',64))
 FROM us_ctx c JOIN study_notification_deliveries d ON d.job_id=c.job AND d.handoff_token=c.token WHERE c.label=$1;
$$;
SELECT pg_temp.us_new('rate');SELECT pg_temp.us_lease('rate');
SELECT pg_temp.pd_prepare('rate',repeat('6',64));SELECT pg_temp.pd_auth('rate');
SELECT throws_ok($$SELECT public.ls_notification_record_resend_rate_limit(d.id,c.token,repeat('c',64))
 FROM us_ctx c JOIN study_notification_deliveries d ON d.job_id=c.job WHERE c.label='rate'$$,
 'PT409','Invalid Resend handoff','rate-limit outcome must match immutable payload fingerprint');
SELECT pg_temp.pd_rate('rate');
SELECT ok((SELECT j.status='pending' AND j.attempt_count=1 AND j.lease_token IS NULL
 AND j.next_attempt_at > clock_timestamp()+interval '25 seconds'
 FROM study_notification_jobs j JOIN us_ctx c ON c.job=j.id WHERE c.label='rate'),'PE-05 confirmed 429 commits backoff and releases lease');
CREATE TEMP TABLE rate_replay AS SELECT j.next_attempt_at FROM study_notification_jobs j JOIN us_ctx c ON c.job=j.id WHERE c.label='rate';
SELECT pg_temp.pd_rate('rate');
SELECT is((SELECT j.next_attempt_at FROM study_notification_jobs j JOIN us_ctx c ON c.job=j.id WHERE c.label='rate'),
 (SELECT next_attempt_at FROM rate_replay),'429 replay does not extend the backoff');
SELECT is((SELECT count(*)::int FROM study_notification_resend_payloads p JOIN us_ctx c ON c.job=p.job_id WHERE c.label='rate'),1,
 '429 preserves one payload');
SELECT ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.ls_notification_claim_batch(25)) x
 WHERE (x->>'jobId')::uuid=(SELECT job FROM us_ctx WHERE label='rate')),'no claim during backoff');

SELECT pg_temp.us_new('short-window',interval '20 seconds');SELECT pg_temp.us_lease('short-window');
SELECT pg_temp.pd_prepare('short-window',repeat('7',64));SELECT pg_temp.pd_auth('short-window');SELECT pg_temp.pd_rate('short-window');
SELECT is((SELECT j.status FROM study_notification_jobs j JOIN us_ctx c ON c.job=j.id WHERE c.label='short-window'),
 'expired','429 backoff outside relevance window is terminal');
SELECT pg_temp.us_new('budget');
UPDATE study_notification_jobs SET attempt_count=2 WHERE id=(SELECT job FROM us_ctx WHERE label='budget');
SELECT pg_temp.us_lease('budget');SELECT pg_temp.pd_prepare('budget',repeat('8',64));SELECT pg_temp.pd_auth('budget');SELECT pg_temp.pd_rate('budget');
SELECT is((SELECT j.status FROM study_notification_jobs j JOIN us_ctx c ON c.job=j.id WHERE c.label='budget'),
 'failed','429 does not exceed three claims');

SELECT pg_temp.us_new('unknown');SELECT pg_temp.us_lease('unknown');
SELECT pg_temp.pd_prepare('unknown',repeat('9',64));SELECT pg_temp.pd_auth('unknown');
SELECT public.ls_notification_record_resend_outcome(d.id,c.token,repeat('b',64),'uncertain')
 FROM us_ctx c JOIN study_notification_deliveries d ON d.job_id=c.job WHERE c.label='unknown';
SELECT throws_ok($$SELECT pg_temp.pd_rate('unknown')$$,'PT409','Resend handoff is no longer submitting',
 'PE-07 uncertain result cannot be converted into a retry');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.ls_notification_record_resend_rate_limit(gen_random_uuid(),gen_random_uuid(),repeat('a',64))$$,'42501',NULL,
 'browser cannot record trusted rate-limit outcome');
SELECT throws_ok($$SELECT * FROM study_notification_resend_payloads$$,'42501',NULL,'browser cannot read encrypted capability');
SELECT throws_ok($$SELECT public.ls_notification_resolve_resend_context(gen_random_uuid())$$,'42501',NULL,'browser cannot resolve trusted Auth context');
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('8d000000-0000-4000-8000-000000000002','locale-only@example.invalid',clock_timestamp());
SELECT set_config('request.jwt.claim.sub','8d000000-0000-4000-8000-000000000002',true);
SELECT public.ls_set_study_reminder_locale('en');
SELECT ok(NOT(SELECT study_email_enabled FROM study_notification_preferences WHERE user_id='8d000000-0000-4000-8000-000000000002'),'locale-only save never grants opt-in');
SELECT * FROM finish();ROLLBACK;
