-- Phase 07A: local-only fixtures, every write rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES
 ('7a000000-0000-4000-8000-000000000001','np-a@example.invalid'),
 ('7a000000-0000-4000-8000-000000000002','np-b@example.invalid');
INSERT INTO public.profiles(id) VALUES ('7a000000-0000-4000-8000-000000000001'),('7a000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.tasks(id,user_id,title,status) VALUES
 ('7a100000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001','Notification A','todo'),
 ('7a100000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000002','Notification B','todo');
INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES
 ('7a200000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001','7a100000-0000-4000-8000-000000000001','2030-01-07','2030-01-08','UTC');
INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
 local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at) VALUES
 ('7a300000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001','7a100000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000001',1,'np-1','2030-01-07','10:00','11:00','UTC','2030-01-07T10:00Z','2030-01-07T11:00Z'),
 ('7a300000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001','7a100000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000001',1,'np-2','2030-01-08','10:00','11:00','UTC','2030-01-08T10:00Z','2030-01-08T11:00Z');
SELECT is((SELECT count(*)::integer FROM public.study_notification_preferences),0,'NP-01/11: new/existing auth users have no implicit preference rows');
SELECT is((SELECT enabled FROM public.study_notification_dispatch_control WHERE singleton),false,'NP-10: new independent dispatch gate OFF');
SELECT is((SELECT enabled FROM public.ls_missed_sweep_control WHERE singleton),false,'NP-10: Attendance gate remains independently OFF');
SELECT is((SELECT count(*)::integer FROM cron.job WHERE jobname LIKE '%study_notification%' OR jobname LIKE '%study-reminder%'),0,'NP-10: no reminder Cron registered');
SELECT is((SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
 ('study_notification_preferences','study_notification_task_overrides','study_notification_jobs','study_notification_deliveries','study_notification_dispatch_control') AND c.relrowsecurity),5,'all five tables have RLS');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','7a000000-0000-4000-8000-000000000001',true);
SELECT is(public.ls_study_notification_task_enabled('7a100000-0000-4000-8000-000000000001'),false,'NP-01: missing preference is effective opt-out');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(false)$$,'NP-01: explicit default row creation');
SELECT is((SELECT study_email_enabled FROM public.study_notification_preferences),false,'NP-01: default disabled');
SELECT is((SELECT lead_minutes::integer FROM public.study_notification_preferences),15,'NP-01: default lead 15');
SELECT ok((SELECT consented_at IS NULL FROM public.study_notification_preferences),'NP-01: no fabricated consent');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'NP-02: explicit opt-in RPC');
SELECT ok((SELECT consented_at >= now() AND consented_at <= clock_timestamp() FROM public.study_notification_preferences),'NP-02: authoritative DB consent timestamp');
SELECT set_config('np.first_consent',(SELECT consented_at::text FROM public.study_notification_preferences),true);
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'NP-02: repeated affirmative save');
SELECT is((SELECT consented_at::text FROM public.study_notification_preferences),current_setting('np.first_consent'),'NP-02: repeat save preserves original opt-in timestamp');
SELECT is(public.ls_study_notification_task_enabled('7a100000-0000-4000-8000-000000000001'),true,'NP-02: global consent permits future scheduling checks');
SELECT lives_ok(format('SELECT public.ls_set_study_notification_preferences(true,%s)',lead),'NP-04: accepts lead '||lead) FROM unnest(ARRAY[5,15,30,60]) AS lead;
SELECT throws_ok(format('SELECT public.ls_set_study_notification_preferences(true,%s)',lead),'22023','Invalid study notification preferences','NP-04: rejects lead '||lead) FROM unnest(ARRAY[-1,0,10,61]) AS lead;
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,NULL)$$,'22023','Invalid study notification preferences','NP-04: rejects null lead');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(NULL)$$,'22023','Invalid study notification preferences','NP-02: rejects null consent command');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,'22:00','07:00','Asia/Ho_Chi_Minh')$$,'NP-05: wrap-around midnight quiet hours accepted');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,'09:00','17:00','America/New_York')$$,'NP-05: daytime quiet hours accepted');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,'09:00','09:00','UTC')$$,'22023','Invalid quiet hours','NP-05: equal endpoints rejected');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,NULL,'07:00','UTC')$$,'22023','Invalid quiet hours','NP-05: missing start rejected');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,'22:00','07:00',NULL)$$,'22023','Invalid quiet hours','NP-05: missing zone rejected');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,'24:00','07:00','UTC')$$,'22023','Invalid quiet hours','NP-05: 24:00 is not a canonical local clock');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,true,'22:00','07:00','Not/AZone')$$,'22023','Invalid notification timezone','NP-05: unknown IANA zone rejected');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,false,NULL,NULL,'')$$,'22023','Invalid notification timezone','NP-05: blank supplied zone rejected even with quiet hours OFF');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true,15,false,NULL,NULL,'+07:00')$$,'22023','Invalid notification timezone','NP-05: numeric offset is not IANA zone');
SELECT lives_ok($$SELECT public.ls_set_study_notification_task_override('7a100000-0000-4000-8000-000000000001',false)$$,'NP-06: owner can disable Task reminders');
SELECT is(public.ls_study_notification_task_enabled('7a100000-0000-4000-8000-000000000001'),false,'NP-06: Task disable wins over global ON');
SELECT lives_ok($$SELECT public.ls_set_study_notification_task_override('7a100000-0000-4000-8000-000000000001',true)$$,'NP-06: owner can restore Task default');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(false)$$,'NP-03: explicit opt-out');
SELECT is(public.ls_study_notification_task_enabled('7a100000-0000-4000-8000-000000000001'),false,'NP-03/06: Task true never bypasses global OFF');
SELECT ok((SELECT consented_at IS NOT NULL FROM public.study_notification_preferences),'NP-03: opt-out retains latest consent record, not effective permission');
SELECT throws_ok($$UPDATE public.study_notification_preferences SET study_email_enabled=true$$,'42501',NULL,'NP-02: own direct preference update denied');
SELECT throws_ok($$INSERT INTO public.study_notification_preferences(user_id,study_email_enabled,consented_at) VALUES ('7a000000-0000-4000-8000-000000000001',true,now())$$,'42501',NULL,'NP-02: direct consent forgery denied');
SELECT throws_ok($$UPDATE public.study_notification_task_overrides SET enabled=true$$,'42501',NULL,'NP-06: direct override writes denied');
RESET ROLE;
INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,idempotency_key) VALUES
 ('7a400000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000001',1,'2030-01-07T09:45Z','np-job-1');
INSERT INTO public.study_notification_deliveries(id,job_id,user_id,attempt_number,status,provider_message_id) VALUES
 ('7a500000-0000-4000-8000-000000000001','7a400000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001',1,'accepted','fake-1');
SELECT throws_ok($$INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,idempotency_key) VALUES ('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000001',1,now(),'different-key')$$,'23505',NULL,'NP-09: duplicate logical occurrence/revision rejected');
SELECT throws_ok($$INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,idempotency_key) VALUES ('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000002',1,now(),'np-job-1')$$,'23505',NULL,'NP-09: global idempotency key uniqueness');
SELECT throws_ok($$INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,idempotency_key) VALUES ('7a000000-0000-4000-8000-000000000002','7a300000-0000-4000-8000-000000000002',1,now(),'cross-owner')$$,'23503',NULL,'NP-07: privileged job cannot reference another owner Session');
SELECT throws_ok($$INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,idempotency_key) VALUES ('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000002',2,now(),'wrong-revision')$$,'23503',NULL,'job must reference actual generation revision');
SELECT throws_ok($$INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number) VALUES ('7a400000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000002',2)$$,'23503',NULL,'NP-07: delivery owner must match job');
SELECT throws_ok($$INSERT INTO public.study_notification_task_overrides(user_id,task_id,enabled) VALUES ('7a000000-0000-4000-8000-000000000002','7a100000-0000-4000-8000-000000000001',true)$$,'23503',NULL,'NP-07: override composite ownership FK');
SELECT throws_ok($$UPDATE public.study_notification_jobs SET attempt_count=-1$$,'23514',NULL,'negative attempt count rejected');
SELECT throws_ok($$UPDATE public.study_notification_jobs SET status='delivered'$$,'23514',NULL,'job status cannot pretend inbox delivery');
SELECT throws_ok($$UPDATE public.study_notification_jobs SET lease_token=gen_random_uuid()$$,'23514',NULL,'orphan lease token rejected');
SELECT throws_ok($$UPDATE public.study_notification_jobs SET status='leased'$$,'23514',NULL,'leased status needs lease pair');
SELECT throws_ok($$UPDATE public.study_notification_jobs SET status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute'$$,'23514',NULL,'leased status needs positive attempt count');
SELECT lives_ok($$UPDATE public.study_notification_jobs SET status='leased',attempt_count=1,lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute'$$,'trusted caller can store valid lease');
UPDATE public.study_notification_jobs SET status='pending',lease_token=NULL,lease_until=NULL;
SELECT throws_ok($$INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number) VALUES ('7a400000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001',1)$$,'23505',NULL,'delivery attempt uniqueness');
SELECT throws_ok($$UPDATE public.study_notification_deliveries SET attempt_number=0$$,'23514',NULL,'delivery attempts start at 1');
SELECT throws_ok($$UPDATE public.study_notification_deliveries SET provider='resend'$$,'23514',NULL,'NP-10: only fake provider represented in Phase 07');
SELECT is((SELECT status FROM public.study_notification_deliveries),'accepted','accepted submission does not imply delivered');
SELECT throws_ok($$INSERT INTO public.study_notification_dispatch_control(singleton,enabled) VALUES(false,true)$$,'23514',NULL,'operational singleton constraint');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','7a000000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs),1,'owner may read own job state');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries),1,'owner may read own delivery state');
SELECT throws_ok($$SELECT lease_token FROM public.study_notification_jobs$$,'42501',NULL,'worker lease capability is not browser-readable');
SELECT throws_ok($$SELECT provider_message_id FROM public.study_notification_deliveries$$,'42501',NULL,'provider internals are not browser-readable');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(false)$$,'NP-03: opt-out with existing pending job stores effective OFF');
SELECT is((SELECT status FROM public.study_notification_jobs),'pending','7A limit: pending-job invalidation intentionally deferred to 7B');
SELECT throws_ok($$UPDATE public.study_notification_jobs SET status='sent'$$,'42501',NULL,'NP-08: authenticated cannot forge job status');
SELECT throws_ok($$DELETE FROM public.study_notification_jobs$$,'42501',NULL,'NP-08: authenticated cannot delete jobs');
SELECT throws_ok($$INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,idempotency_key) VALUES ('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000002',1,now(),'forged')$$,'42501',NULL,'NP-08: authenticated cannot enqueue arbitrary jobs');
SELECT throws_ok($$UPDATE public.study_notification_deliveries SET status='delivered'$$,'42501',NULL,'NP-08: authenticated cannot forge provider delivery');
SELECT throws_ok($$UPDATE public.study_notification_dispatch_control SET enabled=true$$,'42501',NULL,'NP-10: browser cannot enable dispatch');
SELECT throws_ok($$SELECT * FROM public.study_notification_dispatch_control$$,'42501',NULL,'operational control is not browser-readable');
SELECT set_config('request.jwt.claim.sub','7a000000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.study_notification_preferences),0,'NP-07: B cannot read A preferences');
SELECT is((SELECT count(*)::integer FROM public.study_notification_task_overrides),0,'NP-07: B cannot read A override');
SELECT is((SELECT count(*)::integer FROM public.study_notification_jobs),0,'NP-07: B cannot read A jobs');
SELECT is((SELECT count(*)::integer FROM public.study_notification_deliveries),0,'NP-07: B cannot read A deliveries');
SELECT is(public.ls_study_notification_task_enabled('7a100000-0000-4000-8000-000000000001'),false,'NP-07: effective permission cannot reveal another owner Task');
SELECT throws_ok($$SELECT public.ls_set_study_notification_task_override('7a100000-0000-4000-8000-000000000001',false)$$,'22023','Task not found','NP-07: B cannot modify A override via RPC');
SELECT throws_ok($$UPDATE public.study_notification_preferences SET study_email_enabled=true WHERE user_id='7a000000-0000-4000-8000-000000000001'$$,'42501',NULL,'NP-07: B cannot modify A consent');
SELECT lives_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'NP-07: B RPC targets only B');
SELECT is((SELECT user_id::text FROM public.study_notification_preferences),'7a000000-0000-4000-8000-000000000002','NP-07: B can only see its own newly opted-in row');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'42501','Authentication required','null JWT subject cannot write consent');
RESET ROLE;
SELECT is((SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id='7a000000-0000-4000-8000-000000000001'),false,'NP-07: B did not alter A opt-out');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.study_notification_preferences$$,'42501',NULL,'anonymous preference read denied');
SELECT throws_ok($$SELECT public.ls_set_study_notification_preferences(true)$$,'42501',NULL,'anonymous consent execution denied');
SELECT throws_ok($$SELECT public.ls_set_study_notification_task_override('7a100000-0000-4000-8000-000000000001',true)$$,'42501',NULL,'anonymous override execution denied');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.ls_set_study_notification_preferences(boolean,integer,boolean,time,time,text)','EXECUTE'),'consent EXECUTE not public/anon');
SELECT ok(has_function_privilege('authenticated','public.ls_set_study_notification_preferences(boolean,integer,boolean,time,time,text)','EXECUTE'),'consent EXECUTE authenticated');
SELECT ok((SELECT prosecdef AND array_to_string(proconfig,',') LIKE 'search_path=%' FROM pg_proc WHERE oid='public.ls_set_study_notification_preferences(boolean,integer,boolean,time,time,text)'::regprocedure),'consent command has explicit definer/search_path boundary');
SELECT is((SELECT enabled FROM public.study_notification_dispatch_control),false,'NP-10: dispatch gate still OFF after all tests');
SELECT * FROM finish();
ROLLBACK;
