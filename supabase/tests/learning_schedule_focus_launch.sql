BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
 ('9b000000-0000-4000-8000-000000000001', 'launch-owner@example.invalid'),
 ('9b000000-0000-4000-8000-000000000002', 'launch-other@example.invalid');
INSERT INTO profiles (id) SELECT id FROM auth.users WHERE email LIKE 'launch-%@example.invalid' ON CONFLICT DO NOTHING;
INSERT INTO tasks (id, user_id, title, status) VALUES
 ('9b100000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001', 'Launch Task', 'todo');

CREATE TEMP TABLE launch_times AS
 SELECT zone, date_trunc('minute', clock_timestamp() AT TIME ZONE zone) AS local_now
 FROM (SELECT CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 21
              THEN 'UTC' ELSE 'Etc/GMT+12' END AS zone) z;

INSERT INTO task_study_schedules (id, user_id, task_id, starts_on, ends_on, timezone)
 SELECT '9b200000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001',
 '9b100000-0000-4000-8000-000000000001', local_now::date - 1, local_now::date + 2, zone FROM launch_times;
INSERT INTO task_study_sessions (id, user_id, task_id, schedule_id, schedule_revision, logical_occurrence_key,
 local_date, local_start_time, local_end_time, timezone, scheduled_start_at, scheduled_end_at)
 SELECT id::uuid, '9b000000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001',
 '9b200000-0000-4000-8000-000000000001', 1, id, local_now::date + day_offset,
 (local_now + interval '5 minutes')::time, (local_now + interval '55 minutes')::time, zone,
 (local_now + make_interval(days => day_offset) + interval '5 minutes') AT TIME ZONE zone,
 (local_now + make_interval(days => day_offset) + interval '55 minutes') AT TIME ZONE zone
 FROM launch_times CROSS JOIN (VALUES
 ('9b400000-0000-4000-8000-000000000001', 0),
 ('9b400000-0000-4000-8000-000000000002', 1),
 ('9b400000-0000-4000-8000-000000000003', -1)) rows(id, day_offset);

CREATE FUNCTION pg_temp.launch(
 request uuid DEFAULT '9b500000-0000-4000-8000-000000000001',
 study uuid DEFAULT '9b400000-0000-4000-8000-000000000001',
 owner uuid DEFAULT '9b000000-0000-4000-8000-000000000001',
 minutes integer DEFAULT 5
) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ls_create_attributed_focus_v2(owner, study, request, minutes, 1, 15, 1, 4, false, false);
$$;

SELECT throws_ok($$SELECT pg_temp.launch(owner => '9b000000-0000-4000-8000-000000000002')$$,
 'PT403', 'Study session is unavailable', 'FL-02 cross-owner launch denied');
SELECT throws_ok($$SELECT pg_temp.launch(study => '9b400000-0000-4000-8000-000000000002')$$,
 'PT422', NULL, 'outside window before start minus 15 minutes');
SELECT throws_ok($$SELECT pg_temp.launch(study => '9b400000-0000-4000-8000-000000000003')$$,
 'PT422', NULL, 'outside window after scheduled end');
SELECT throws_ok($$SELECT pg_temp.launch(minutes => 4)$$, '22023', NULL, 'Focus config validated in PostgreSQL');

CREATE FUNCTION pg_temp.fail_link() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'test link failure' USING ERRCODE = 'P0001'; END;
$$;
CREATE TRIGGER test_fail_link BEFORE INSERT ON task_study_focus_attributions
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_link();
SELECT throws_ok($$SELECT pg_temp.launch()$$, 'P0001', 'test link failure', 'FL-09 injected link failure');
SELECT is((SELECT count(*) FROM focus_sessions), 0::bigint, 'no orphan Focus after rollback');
SELECT is((SELECT count(*) FROM focus_session_plans), 0::bigint, 'no orphan plan after rollback');
SELECT is((SELECT count(*) FROM focus_session_segments), 0::bigint, 'no orphan segments after rollback');
SELECT is((SELECT count(*) FROM task_study_focus_launches), 0::bigint, 'no replay record after rollback');
DROP TRIGGER test_fail_link ON task_study_focus_attributions;

CREATE TEMP TABLE launched AS SELECT pg_temp.launch() AS result;
SELECT is((SELECT result->>'replay' FROM launched), 'false', 'FL-01 first launch succeeds after rollback with same key');
SELECT is((SELECT focus_session_id::text FROM task_study_focus_attributions),
 (SELECT result->>'session_id' FROM launched), 'attribution references the returned Focus');
SELECT is((SELECT task_id::text FROM focus_sessions), '9b100000-0000-4000-8000-000000000001', 'Focus Task is derived from Study Session');
SELECT is(pg_temp.launch(), (SELECT result || '{"replay":true}'::jsonb FROM launched), 'FL-06 exact replay');
SELECT throws_ok($$SELECT pg_temp.launch(minutes => 6)$$, 'PT409', NULL, 'FL-07 changed Focus config conflicts');
SELECT throws_ok($$SELECT pg_temp.launch(study => '9b400000-0000-4000-8000-000000000002')$$,
 'PT409', NULL, 'FL-07 changed Study Session conflicts');
SELECT throws_ok($$SELECT pg_temp.launch('9b500000-0000-4000-8000-000000000002')$$,
 'PT423', NULL, 'FL-11 active Focus blocks a new launch key');
SELECT is((SELECT count(*) FROM focus_sessions), 1::bigint, 'one Focus after replay and conflicts');
SELECT is((SELECT count(*) FROM task_study_focus_attributions), 1::bigint, 'one attribution after replay and conflicts');
SELECT is((SELECT count(*) FROM task_study_focus_launches), 1::bigint, 'one launch record after replay and conflicts');

UPDATE focus_session_segments SET started_at = clock_timestamp() - interval '6 minutes' WHERE position = 1;
SELECT is(public.focus_v2_transition('9b000000-0000-4000-8000-000000000001',
 (SELECT (result->>'session_id')::uuid FROM launched), 'complete',
 (SELECT id FROM focus_session_segments WHERE position = 1))->>'parentStatus',
 'completed', 'FL-16 attributed Focus completes through ordinary lifecycle');
SELECT is((SELECT status FROM task_study_sessions WHERE id = '9b400000-0000-4000-8000-000000000001'),
 'scheduled', 'FL-13 launching and completing Focus leaves attendance scheduled');
SELECT is((SELECT count(*) FROM task_study_session_events), 0::bigint, 'no attendance audit emitted');
UPDATE task_study_sessions SET status = 'completed', completed_at = clock_timestamp()
 WHERE id = '9b400000-0000-4000-8000-000000000001';
SELECT is(pg_temp.launch(), (SELECT result || '{"replay":true}'::jsonb FROM launched), 'replay works after Focus and Study complete');
SELECT throws_ok($$SELECT pg_temp.launch('9b500000-0000-4000-8000-000000000002')$$,
 'PT422', NULL, 'FL-04 terminal Study rejects a new launch');
SELECT lives_ok($$SELECT focus_v2_create_session('9b000000-0000-4000-8000-000000000001', NULL, 5, 1, 15, 1, 4, false, false)$$,
 'FL-12 ordinary Focus creation still works');
SELECT is((SELECT count(*) FROM task_study_focus_attributions), 1::bigint, 'ordinary Focus has no attribution');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.ls_create_attributed_focus_v2(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 5, 1, 15, 1, 4, false, false)$$,
 '42501', NULL, 'authenticated browser cannot supply trusted identity');
SELECT throws_ok($$SELECT * FROM task_study_focus_launches$$, '42501', NULL, 'browser cannot read launch records');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.ls_create_attributed_focus_v2(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 5, 1, 15, 1, 4, false, false)$$,
 '42501', NULL, 'anonymous browser cannot launch');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
