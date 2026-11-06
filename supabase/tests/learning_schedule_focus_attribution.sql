-- LOCAL-only pgTAP fixtures. No implicit Focus creation or attendance completion.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES('9a000000-0000-4000-8000-000000000001','fa-a@example.invalid'),('9a000000-0000-4000-8000-000000000002','fa-b@example.invalid');
INSERT INTO profiles(id) VALUES('9a000000-0000-4000-8000-000000000001'),('9a000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO tasks(id,user_id,title,status) VALUES
 ('9a100000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001','FA task','todo'),
 ('9a100000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000001','Other task','todo');
INSERT INTO task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
 VALUES('9a200000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000001','2030-01-07','2030-01-14','UTC');
INSERT INTO task_study_schedule_slots(id,user_id,schedule_id,weekday,start_time,end_time)
 VALUES('9a300000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001','9a200000-0000-4000-8000-000000000001',1,'10:00','11:00');
INSERT INTO task_study_schedule_revisions(user_id,schedule_id,revision,starts_on,ends_on,timezone,slots_snapshot)
 VALUES('9a000000-0000-4000-8000-000000000001','9a200000-0000-4000-8000-000000000001',1,'2030-01-07','2030-01-14','UTC','[{"weekday":1,"startTime":"10:00","endTime":"11:00"}]');
INSERT INTO task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,source_slot_id,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 SELECT id::uuid,'9a000000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000001','9a200000-0000-4000-8000-000000000001',1,'9a300000-0000-4000-8000-000000000001',key,day,'10:00','11:00','UTC',(day+time '10:00') AT TIME ZONE 'UTC',(day+time '11:00') AT TIME ZONE 'UTC'
 FROM (VALUES('9a400000-0000-4000-8000-000000000001','first',date '2030-01-07'),('9a400000-0000-4000-8000-000000000002','second',date '2030-01-14')) x(id,key,day);
CREATE TEMP TABLE fa_ids(label text PRIMARY KEY,focus uuid,link uuid);
CREATE FUNCTION pg_temp.fa_focus(label text,task uuid DEFAULT '9a100000-0000-4000-8000-000000000001',owner uuid DEFAULT '9a000000-0000-4000-8000-000000000001') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE id uuid:=gen_random_uuid();BEGIN
 INSERT INTO public.focus_sessions(id,user_id,task_id,planned_minutes) VALUES(id,owner,task,25);
 INSERT INTO fa_ids VALUES(label,id,NULL);RETURN id;END $$;
CREATE FUNCTION pg_temp.fa_link(label text,session uuid DEFAULT '9a400000-0000-4000-8000-000000000001') RETURNS uuid LANGUAGE sql AS $$
 SELECT public.ls_link_study_focus(session,focus) FROM fa_ids WHERE fa_ids.label=$1;
$$;
SELECT set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.fa_focus('first');
SELECT is((SELECT count(*)::int FROM task_study_focus_attributions),0,'ordinary Focus creation has no automatic attribution');
UPDATE fa_ids SET link=pg_temp.fa_link('first') WHERE label='first';
SELECT ok((SELECT link IS NOT NULL FROM fa_ids WHERE label='first'),'FA-01: matching owner/Task linked');
CREATE TEMP TABLE fa_snapshot AS SELECT to_jsonb(a) value FROM task_study_focus_attributions a;
SELECT is(pg_temp.fa_link('first'),(SELECT link FROM fa_ids WHERE label='first'),'FA-05: exact pair retry returns same ID');
SELECT is((SELECT to_jsonb(a) FROM task_study_focus_attributions a),(SELECT value FROM fa_snapshot),'FA-05: replay does not change timestamps or source');
SELECT throws_ok($$SELECT pg_temp.fa_link('first','9a400000-0000-4000-8000-000000000002')$$,'23505','Focus session already attributed','FA-06: same Focus cannot be attributed twice');
SELECT throws_ok($$UPDATE focus_sessions SET task_id='9a100000-0000-4000-8000-000000000002' WHERE id=(SELECT focus FROM fa_ids WHERE label='first')$$,'23503',NULL,'composite FK preserves matching Task after link');
SELECT is((SELECT status FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'scheduled','link never starts/completes attendance');
UPDATE focus_sessions SET status='cancelled',ended_at=clock_timestamp(),actual_focus_minutes=7 WHERE id=(SELECT focus FROM fa_ids WHERE label='first');
SELECT is((SELECT status FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'scheduled','FA-10: cancelled Focus with persisted effort does not alter attendance');
SELECT is((SELECT actual_focus_minutes FROM focus_sessions WHERE id=(SELECT focus FROM fa_ids WHERE label='first')),7,'cancelled persisted effort is not rewritten to zero');
SELECT is(pg_temp.fa_link('first'),(SELECT link FROM fa_ids WHERE label='first'),'terminal Focus exact replay keeps historical link');
SELECT public.ls_reschedule_session('9a400000-0000-4000-8000-000000000001',(SELECT updated_at FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'2030-01-07','12:00','13:00','2030-01-07T12:00Z','2030-01-07T13:00Z','fa-reschedule');
SELECT is(pg_temp.fa_link('first'),(SELECT link FROM fa_ids WHERE label='first'),'FA-08: actual reschedule preserves stable attribution ID');
SELECT pg_temp.fa_focus('mismatch','9a100000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT pg_temp.fa_link('mismatch')$$,'22023','Invalid attribution target','FA-02: different Task denied');
UPDATE focus_sessions SET status='cancelled',ended_at=clock_timestamp() WHERE id=(SELECT focus FROM fa_ids WHERE label='mismatch');
SELECT pg_temp.fa_focus('no-task',NULL);
SELECT throws_ok($$SELECT pg_temp.fa_link('no-task')$$,'22023','Invalid attribution target','Focus without Task cannot be guessed into an occurrence');
UPDATE focus_sessions SET status='cancelled',ended_at=clock_timestamp() WHERE id=(SELECT focus FROM fa_ids WHERE label='no-task');
SELECT pg_temp.fa_focus('owner-b',NULL,'9a000000-0000-4000-8000-000000000002');
SELECT throws_ok($$INSERT INTO task_study_focus_attributions(user_id,task_id,study_session_id,focus_session_id) VALUES('9a000000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000001','9a400000-0000-4000-8000-000000000001',(SELECT focus FROM fa_ids WHERE label='owner-b'))$$,'23503',NULL,'composite ownership FK rejects cross-owner direct privileged insertion');
SELECT throws_ok($$SELECT pg_temp.fa_link('owner-b')$$,'22023','Invalid attribution target','FA-03: owner A cannot use owner B Focus');
SELECT set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT pg_temp.fa_link('first')$$,'22023','Invalid attribution target','FA-03: owner B cannot link owner A Study/Focus');
SELECT set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.fa_focus('terminal');UPDATE focus_sessions SET status='completed',ended_at=clock_timestamp() WHERE id=(SELECT focus FROM fa_ids WHERE label='terminal');
SELECT throws_ok($$SELECT pg_temp.fa_link('terminal')$$,'22023','Attribution target is not active','v1 rejects retrospective new links for terminal Focus');
SELECT pg_temp.fa_focus('v2-placeholder');DELETE FROM focus_sessions WHERE id=(SELECT focus FROM fa_ids WHERE label='v2-placeholder');DELETE FROM fa_ids WHERE label='v2-placeholder';
INSERT INTO fa_ids(label,focus) SELECT 'v2',public.focus_v2_create_session('9a000000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000001',5,1,15,1,4,false,false);
UPDATE fa_ids SET link=pg_temp.fa_link('v2') WHERE label='v2';
SELECT ok((SELECT link IS NOT NULL FROM fa_ids WHERE label='v2'),'Focus V2 linked through the same identity command');
UPDATE focus_session_segments SET started_at=clock_timestamp()-interval '90 seconds' WHERE session_id=(SELECT focus FROM fa_ids WHERE label='v2') AND status='running';
SELECT public.focus_v2_transition('9a000000-0000-4000-8000-000000000001',(SELECT focus FROM fa_ids WHERE label='v2'),'cancel',(SELECT id FROM focus_session_segments WHERE session_id=(SELECT focus FROM fa_ids WHERE label='v2') AND position=1));
SELECT ok((SELECT actual_seconds>0 AND segment_kind='focus' FROM focus_session_segments WHERE session_id=(SELECT focus FROM fa_ids WHERE label='v2') AND position=1),'actual V2 cancel retains persisted focus-segment effort');
SELECT is((SELECT status FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'scheduled','FA-10: actual V2 lifecycle cancel never completes attendance');
INSERT INTO fa_ids(label,focus) SELECT 'v2-complete',public.focus_v2_create_session('9a000000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000001',5,1,15,1,4,false,false);
UPDATE fa_ids SET link=pg_temp.fa_link('v2-complete') WHERE label='v2-complete';
UPDATE focus_session_segments SET started_at=clock_timestamp()-interval '6 minutes' WHERE session_id=(SELECT focus FROM fa_ids WHERE label='v2-complete') AND status='running';
SELECT public.focus_v2_transition('9a000000-0000-4000-8000-000000000001',(SELECT focus FROM fa_ids WHERE label='v2-complete'),'complete',(SELECT id FROM focus_session_segments WHERE session_id=(SELECT focus FROM fa_ids WHERE label='v2-complete') AND position=1));
SELECT is((SELECT status::text FROM focus_sessions WHERE id=(SELECT focus FROM fa_ids WHERE label='v2-complete')),'completed','actual V2 lifecycle completed');
SELECT is((SELECT status FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'scheduled','FA-10: completed V2 never completes attendance');
SELECT public.ls_revise_schedule('9a200000-0000-4000-8000-000000000001',1,'2030-01-07','2030-01-07','UTC',
 '[{"weekday":1,"startTime":"14:00","endTime":"15:00"}]',
 '[{"localDate":"2030-01-07","localStartTime":"14:00","localEndTime":"15:00","timezone":"UTC","slotIndex":0,"scheduledStartAt":"2030-01-07T14:00:00Z","scheduledEndAt":"2030-01-07T15:00:00Z","occurrenceKey":"2030-01-07|1|14:00|15:00"}]');
SELECT is((SELECT status FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'cancelled','actual revision cancels old occurrence');
SELECT is((SELECT count(*)::int FROM task_study_focus_attributions),3,'FA-09: revision preserves all prior attributions');
SELECT is(pg_temp.fa_link('first'),(SELECT link FROM fa_ids WHERE label='first'),'FA-09: cancelled historical exact retry still succeeds');
SELECT pg_temp.fa_focus('after-cancel');
SELECT throws_ok($$SELECT pg_temp.fa_link('after-cancel')$$,'22023','Attribution target is not active','FA-07: cancelled Study rejects new attribution');
UPDATE task_study_sessions SET status='completed',completed_at=clock_timestamp() WHERE schedule_revision=2;
SELECT throws_ok($$SELECT pg_temp.fa_link('after-cancel',(SELECT id FROM task_study_sessions WHERE schedule_revision=2))$$,'22023','Attribution target is not active','completed Study cannot receive new attribution');
UPDATE tasks SET status='completed' WHERE id='9a100000-0000-4000-8000-000000000001';
SELECT is(pg_temp.fa_link('first'),(SELECT link FROM fa_ids WHERE label='first'),'closed Task exact replay preserves attribution history');
SELECT is((SELECT status FROM task_study_sessions WHERE id='9a400000-0000-4000-8000-000000000001'),'cancelled','Task completion never upgrades cancelled occurrence to completed from Focus');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM task_study_focus_attributions),3,'owner can read own link history');
SELECT throws_ok($$DELETE FROM task_study_focus_attributions$$,'42501',NULL,'browser cannot delete attribution history');
SELECT set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*)::int FROM task_study_focus_attributions),0,'owner B cannot read owner A history');
RESET ROLE;SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.ls_link_study_focus(gen_random_uuid(),gen_random_uuid())$$,'42501',NULL,'FA-04: anonymous link denied');
SELECT throws_ok($$SELECT * FROM task_study_focus_attributions$$,'42501',NULL,'anonymous read denied');
RESET ROLE;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='task_study_focus_attributions'::regclass),'RLS enabled');
SELECT ok(NOT(SELECT enabled FROM study_notification_dispatch_control) AND NOT(SELECT enabled FROM ls_missed_sweep_control),'existing gates remain OFF');
SELECT lives_ok($$DELETE FROM tasks WHERE id='9a100000-0000-4000-8000-000000000001'$$,'physical Task deletion remains compatible with existing Focus SET NULL and attribution cascade');
SELECT is((SELECT count(*)::int FROM task_study_focus_attributions),0,'physical parent deletion cleans links (distinct from logical cancellation history)');
SELECT * FROM finish();ROLLBACK;
