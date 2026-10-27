-- Step 3.4A: run on isolated local Supabase only. All fixtures roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'ls-revise-a@example.invalid'),
  ('d1000000-0000-4000-8000-000000000002', 'ls-revise-b@example.invalid');
INSERT INTO public.profiles (id) VALUES
  ('d1000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.tasks (id, user_id, title, status) VALUES
  ('d2000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'Revision fixture', 'todo');
INSERT INTO public.task_study_schedules
  (id, user_id, task_id, starts_on, ends_on, timezone) VALUES
  ('d3000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', '2030-01-07', '2030-01-14', 'UTC');
INSERT INTO public.task_study_schedule_slots
  (id, user_id, schedule_id, weekday, start_time, end_time) VALUES
  ('d4000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001',
   'd3000000-0000-4000-8000-000000000001', 1, '19:00', '20:30');
INSERT INTO public.task_study_schedule_revisions
  (user_id, schedule_id, revision, starts_on, ends_on, timezone, slots_snapshot)
VALUES ('d1000000-0000-4000-8000-000000000001',
        'd3000000-0000-4000-8000-000000000001', 1, '2030-01-07', '2030-01-14',
        'UTC', '[{"weekday":1,"startTime":"19:00","endTime":"20:30"}]');

-- Distinct identities: a completed session, a past scheduled session, and a
-- future scheduled session. Only the last is eligible for cancellation.
INSERT INTO public.task_study_sessions
  (id, user_id, task_id, schedule_id, schedule_revision, source_slot_id,
   logical_occurrence_key, local_date, local_start_time, local_end_time,
   timezone, scheduled_start_at, scheduled_end_at, status, completed_at)
SELECT fixture.id::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid,
       'd2000000-0000-4000-8000-000000000001'::uuid,
       'd3000000-0000-4000-8000-000000000001'::uuid, 1,
       'd4000000-0000-4000-8000-000000000001'::uuid,
       fixture.key, fixture.day, '19:00'::time, '20:30'::time, 'UTC',
       (fixture.day + time '19:00') AT TIME ZONE 'UTC',
       (fixture.day + time '20:30') AT TIME ZONE 'UTC',
       fixture.status, fixture.completed_at
FROM (VALUES
  ('d5000000-0000-4000-8000-000000000001', 'completed-fixture',
   date '2030-01-07', 'completed', now()),
  ('d5000000-0000-4000-8000-000000000002', 'past-fixture',
   (now() AT TIME ZONE 'UTC')::date - 1, 'scheduled', NULL::timestamptz),
  ('d5000000-0000-4000-8000-000000000003', 'future-fixture',
   date '2030-01-14', 'scheduled', NULL::timestamptz)
) AS fixture(id, key, day, status, completed_at);

-- Test helpers live only in this connection, use invoker privileges, and do
-- not alter production functions. Snapshot full rows to detect partial writes.
CREATE FUNCTION pg_temp.revision_state() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$
  SELECT jsonb_build_object(
    'schedules', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_schedules t),
    'slots', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_schedule_slots t),
    'sessions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_sessions t),
    'revisions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.task_study_schedule_revisions t)
  );
$$;
CREATE FUNCTION pg_temp.revise(expected integer, forged boolean DEFAULT false)
RETURNS integer LANGUAGE sql SECURITY INVOKER AS $$
  SELECT public.ls_revise_schedule(
    'd3000000-0000-4000-8000-000000000001', expected,
    '2030-01-07', '2030-01-07', 'UTC',
    '[{"weekday":1,"startTime":"20:00","endTime":"21:00"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'localDate', '2030-01-07', 'localStartTime', '20:00', 'localEndTime', '21:00',
      'timezone', 'UTC', 'slotIndex', 0,
      'scheduledStartAt', CASE WHEN forged THEN '2030-01-07T19:00:00Z' ELSE '2030-01-07T20:00:00Z' END,
      'scheduledEndAt', '2030-01-07T21:00:00Z',
      'occurrenceKey', '2030-01-07|1|20:00|21:00'
    ))
  );
$$;
CREATE TEMP TABLE revision_before AS SELECT pg_temp.revision_state() AS state;
CREATE TEMP TABLE history_before AS
  SELECT id, to_jsonb(t) AS state FROM public.task_study_sessions t
  WHERE id IN ('d5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002');
GRANT SELECT ON revision_before, history_before TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000002';
SELECT throws_ok('SELECT pg_temp.revise(1)', '22023', 'Schedule not found',
                 'Another owner cannot revise the schedule with an otherwise valid payload');
SET LOCAL "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000001';
SELECT is(pg_temp.revision_state(), (SELECT state FROM revision_before),
          'Cross-owner rejection leaves all four tables unchanged');

-- The invalid timestamp is detected after cancellation and slot replacement
-- have started, so this exercises rollback of intermediate writes.
SELECT throws_ok('SELECT pg_temp.revise(1, true)', '22023', 'Invalid occurrence instant',
                 'Forged occurrence causes revision failure after intermediate writes');
SELECT is(pg_temp.revision_state(), (SELECT state FROM revision_before),
          'Invalid occurrence rolls back schedule, slots, sessions and revisions');

SELECT is(pg_temp.revise(1), 2, 'Successful revision returns incremented revision 2');
SELECT is((SELECT revision FROM public.task_study_schedules
           WHERE id='d3000000-0000-4000-8000-000000000001'), 2,
          'Schedule stores revision 2');
SELECT is((SELECT count(*) FROM public.task_study_schedule_revisions), 2::bigint,
          'Revision history keeps both initial and edited revisions');

-- Replacing slots intentionally nulls historical source_slot_id via the FK.
-- Compare every other field, including completion and timestamp history.
SELECT is((SELECT to_jsonb(t) - 'source_slot_id' FROM public.task_study_sessions t
           WHERE id='d5000000-0000-4000-8000-000000000001'),
          (SELECT state - 'source_slot_id' FROM history_before
           WHERE id='d5000000-0000-4000-8000-000000000001'),
          'Completed session history is preserved apart from retired slot reference');
SELECT is((SELECT to_jsonb(t) - 'source_slot_id' FROM public.task_study_sessions t
           WHERE id='d5000000-0000-4000-8000-000000000002'),
          (SELECT state - 'source_slot_id' FROM history_before
           WHERE id='d5000000-0000-4000-8000-000000000002'),
          'Past scheduled session history is preserved apart from retired slot reference');
SELECT ok((SELECT status='cancelled' AND cancellation_reason='schedule_changed'
           FROM public.task_study_sessions
           WHERE id='d5000000-0000-4000-8000-000000000003'),
          'Future scheduled session is cancelled with schedule_changed reason');
SELECT is((SELECT count(*) FROM public.task_study_sessions WHERE schedule_revision=1),
          3::bigint, 'All three original sessions remain without hard deletion');
SELECT is((SELECT count(*) FROM public.task_study_sessions
           WHERE schedule_revision=2 AND status='scheduled'
             AND logical_occurrence_key='2030-01-07|1|20:00|21:00'
             AND scheduled_start_at='2030-01-07T20:00:00Z'::timestamptz),
          1::bigint, 'New occurrence persists with revision 2 and expected instant');
SELECT is((SELECT count(*) FROM public.task_study_schedule_slots
           WHERE start_time='20:00' AND end_time='21:00'),
          1::bigint, 'New weekly slot replaces the old slot');

RESET ROLE;
CREATE TEMP TABLE revision_after AS SELECT pg_temp.revision_state() AS state;
GRANT SELECT ON revision_after TO authenticated;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.revise(1)', '40001', 'Stale schedule revision',
                 'Stale expected revision is rejected by optimistic concurrency guard');
SELECT is(pg_temp.revision_state(), (SELECT state FROM revision_after),
          'Stale revision rejection leaves all four tables unchanged');
SELECT is((SELECT change_reason FROM public.task_study_schedule_revisions WHERE revision=2),
          'schedule_edited'::text, 'Edited revision records its change reason');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
