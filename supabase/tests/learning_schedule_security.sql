-- Run only against an isolated LOCAL Supabase database:
-- npx supabase test db
-- All fixtures are rolled back even when assertions pass.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

-- Two test accounts (the local auth.users schema supports these columns).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ls-phase02-a@example.invalid','',now(),now(),now()),
('b1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ls-phase02-b@example.invalid','',now(),now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id)
VALUES ('a1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tasks (id,user_id,title,status)
VALUES
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Test task A','todo'),
('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','Test task B','todo');

INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
VALUES
('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','2026-11-01','2026-11-30','Asia/Ho_Chi_Minh'),
('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','2026-11-01','2026-11-30','Asia/Ho_Chi_Minh');

INSERT INTO public.task_study_schedule_slots(id,user_id,schedule_id,weekday,start_time,end_time)
VALUES
('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'19:00','20:30'),
('b4000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002',1,'19:00','20:30');

INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,source_slot_id,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
VALUES
('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'a4000000-0000-4000-8000-000000000001','monday-2026-11-02','2026-11-02','19:00','20:30','Asia/Ho_Chi_Minh','2026-11-02 12:00:00+00','2026-11-02 13:30:00+00'),
('b5000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002',1,'b4000000-0000-4000-8000-000000000002','monday-2026-11-02','2026-11-02','19:00','20:30','Asia/Ho_Chi_Minh','2026-11-02 12:00:00+00','2026-11-02 13:30:00+00');

-- Structural invariant checks using privileged local role.
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.task_study_sessions'::regclass),
  'RLS is enabled on task_study_sessions'
);
SELECT throws_ok($$
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES ('a1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',1,'08:00','09:00');
$$, '23503', NULL, 'Ownership FK rejects a cross-owner slot');
SELECT throws_ok($$
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES ('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'20:00','19:00');
$$, '23514', NULL, 'Slot end time must be after start time');
SELECT throws_ok($$
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES ('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'19:00','20:30');
$$, '23505', NULL, 'Duplicate slots are rejected');

-- Phase 02 final hardening tests.
-- These assertions run as the privileged local test role.

SELECT throws_ok(
  $$
    INSERT INTO public.task_study_schedule_slots
      (user_id, schedule_id, weekday, start_time, end_time)
    VALUES (
      'a1000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      1, '20:00', '21:00'
    );
  $$,
  '23P01',
  NULL,
  'Overlapping weekly slots are rejected'
);

-- Mark the original occurrence completed before attempting
-- to recreate the same logical obligation.
UPDATE public.task_study_sessions
SET status = 'completed',
    completed_at = now()
WHERE id = 'a5000000-0000-4000-8000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.task_study_sessions (
      user_id, task_id, schedule_id, schedule_revision,
      logical_occurrence_key, local_date,
      local_start_time, local_end_time, timezone,
      scheduled_start_at, scheduled_end_at
    )
    VALUES (
      'a1000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      1,
      'monday-2026-11-02',
      '2026-11-02',
      '19:00',
      '20:30',
      'Asia/Ho_Chi_Minh',
      '2026-11-02 12:00:00+00',
      '2026-11-02 13:30:00+00'
    );
  $$,
  '23505',
  NULL,
  'Completed occurrence identity cannot be recreated'
);

-- Test as a real authenticated SQL role with a signed-in user's claim.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a1000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  (SELECT count(*) FROM public.task_study_sessions WHERE user_id='a1000000-0000-4000-8000-000000000001'),
  1::bigint, 'Authenticated user can read their own session'
);
SELECT is(
  (SELECT count(*) FROM public.task_study_sessions WHERE user_id='b1000000-0000-4000-8000-000000000002'),
  0::bigint, 'Authenticated user cannot read another user session'
);
SELECT throws_ok($$
    UPDATE public.task_study_sessions SET status='missed' WHERE id='a5000000-0000-4000-8000-000000000001';
$$, '42501', NULL, 'Authenticated direct session writes are denied');

-- User A must be able to read their own data,
-- and the other four tables must obey RLS.

SELECT is(
  (SELECT count(*)
   FROM public.task_study_schedules
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'User A can read own schedule'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_schedule_slots
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'User A can read own slots'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_schedule_revisions
   WHERE user_id = 'b1000000-0000-4000-8000-000000000002'),
  0::bigint,
  'User A cannot read user B revisions'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_session_events
   WHERE user_id = 'b1000000-0000-4000-8000-000000000002'),
  0::bigint,
  'User A cannot read user B events'
);

-- No direct mutations on protected schedule-related tables.

SELECT throws_ok(
  $$
    UPDATE public.task_study_schedules
    SET status = 'paused';
  $$,
  '42501', NULL,
  'Authenticated user cannot directly update schedules'
);

SELECT throws_ok(
  $$
    DELETE FROM public.task_study_schedule_slots;
  $$,
  '42501', NULL,
  'Authenticated user cannot directly delete slots'
);

SELECT throws_ok(
  $$
    INSERT INTO public.task_study_schedule_revisions
      (user_id, schedule_id, revision, starts_on, ends_on, timezone)
    VALUES (
      'a1000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      2, '2026-11-01', '2026-11-30',
      'Asia/Ho_Chi_Minh'
    );
  $$,
  '42501', NULL,
  'Authenticated user cannot directly insert revisions'
);

SELECT throws_ok(
  $$
    DELETE FROM public.task_study_session_events;
  $$,
  '42501', NULL,
  'Authenticated user cannot directly delete audit events'
);

-- Reciprocal ownership check: switch claim to B.

SELECT set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000002',
  true
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_sessions
   WHERE user_id = 'b1000000-0000-4000-8000-000000000002'),
  1::bigint,
  'User B can read own session'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_sessions
   WHERE user_id = 'a1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'User B cannot read user A session'
);

RESET ROLE;

-- Anonymous access must not expose protected data.
-- Table-level SELECT is granted to anon by the local database defaults.
-- RLS has no anon policy, so SELECT must return no rows, not raise 42501.

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claims" = '{}';

SELECT is(
  (SELECT count(*) FROM public.task_study_sessions),
  0::bigint,
  'Anonymous role cannot see any study sessions'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
