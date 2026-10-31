
-- Phase 05 / Step 5.4 — Automatic missed sweep.
-- Local pgTAP only; all fixtures roll back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE TEMP TABLE missed_cases (
  name text PRIMARY KEY,
  task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid(),
  session_id uuid DEFAULT gen_random_uuid()
);

INSERT INTO missed_cases(name) VALUES
  ('eligible_a'),
  ('eligible_b'),
  ('before_grace'),
  ('running'),
  ('completed'),
  ('skipped'),
  ('cancelled'),
  ('closed_task'),
  ('paused_schedule'),
  ('rollback');

INSERT INTO auth.users(id, email) VALUES (
  '54000000-0000-4000-8000-000000000001',
  'missed-sweep-owner@example.invalid'
);

INSERT INTO public.profiles(id) VALUES (
  '54000000-0000-4000-8000-000000000001'
) ON CONFLICT DO NOTHING;

INSERT INTO public.tasks (
  id, user_id, title, status
)
SELECT
  task_id,
  '54000000-0000-4000-8000-000000000001',
  'Missed sweep fixture ' || name,
  'todo'
FROM missed_cases;

-- Choose a timezone keeping fixture times away
-- from the midnight boundary.
CREATE TEMP TABLE missed_clock AS
SELECT now() AS anchor,
  CASE
    WHEN EXTRACT(
      HOUR FROM now() AT TIME ZONE 'UTC'
    ) BETWEEN 6 AND 17
    THEN 'UTC'
    ELSE 'Etc/GMT+12'
  END AS zone;

INSERT INTO public.task_study_schedules(
  id, task_id, user_id,
  starts_on, ends_on, timezone
)
SELECT
  c.schedule_id,
  c.task_id,
  '54000000-0000-4000-8000-000000000001',
  (k.anchor AT TIME ZONE k.zone)::date - 2,
  (k.anchor AT TIME ZONE k.zone)::date + 1,
  k.zone
FROM missed_cases c CROSS JOIN missed_clock k;

INSERT INTO public.task_study_sessions(
  id, user_id, task_id, schedule_id,
  schedule_revision, logical_occurrence_key,
  local_date, local_start_time, local_end_time,
  timezone, scheduled_start_at, scheduled_end_at,
  status, completed_at
)
SELECT
  c.session_id,
  '54000000-0000-4000-8000-000000000001',
  c.task_id,
  c.schedule_id,
  1,
  'missed|' || c.name,
  (x.starts_at AT TIME ZONE k.zone)::date,
  (x.starts_at AT TIME ZONE k.zone)::time,
  (x.ends_at AT TIME ZONE k.zone)::time,
  k.zone,
  x.starts_at,
  x.ends_at,
  CASE c.name
    WHEN 'running' THEN 'in_progress'
    WHEN 'completed' THEN 'completed'
    WHEN 'skipped' THEN 'skipped'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'rollback' THEN 'cancelled'
    ELSE 'scheduled'
  END,
  CASE
    WHEN c.name = 'completed'
    THEN k.anchor - interval '1 hour'
    ELSE NULL
  END
FROM missed_cases c
CROSS JOIN missed_clock k
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN c.name = 'before_grace'
      THEN k.anchor - interval '45 minutes'
      ELSE k.anchor - interval '4 hours'
    END AS starts_at,
    CASE
      WHEN c.name = 'before_grace'
      THEN k.anchor - interval '15 minutes'
      ELSE k.anchor - interval '3 hours'
    END AS ends_at
) x;

UPDATE public.tasks
SET status = 'completed'
WHERE id = (
  SELECT task_id FROM missed_cases
  WHERE name = 'closed_task'
);

UPDATE public.task_study_schedules
SET status = 'paused'
WHERE id = (
  SELECT schedule_id FROM missed_cases
  WHERE name = 'paused_schedule'
);

-- A disabled Cron entrypoint must do nothing.
SELECT is(
  (SELECT enabled
   FROM public.ls_missed_sweep_control
   WHERE singleton = true),
  false,
  'MISSED-01 activation gate defaults OFF'
);

SELECT is(
  public.ls_run_missed_sweep_if_enabled(),
  0,
  'MISSED-02 disabled Cron entrypoint returns zero'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_sessions s
   JOIN missed_cases c ON c.session_id = s.id
   WHERE c.name IN ('eligible_a', 'eligible_b')
     AND s.status = 'scheduled'),
  2::bigint,
  'MISSED-02 disabled Cron does not change candidates'
);

-- First batch processes only one eligible session.
SELECT is(
  (
    public.ls_mark_missed_batch(1)->>'marked'
  )::integer,
  1,
  'MISSED-03 batch size 1 marks one session'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_sessions s
   JOIN missed_cases c ON c.session_id = s.id
   WHERE c.name IN ('eligible_a', 'eligible_b')
     AND s.status = 'missed'),
  1::bigint,
  'MISSED-03 exactly one eligible row changes'
);

-- Remaining candidate.
SELECT is(
  (
    public.ls_mark_missed_batch(20)->>'marked'
  )::integer,
  1,
  'MISSED-04 second batch marks remaining row'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_sessions s
   JOIN missed_cases c ON c.session_id = s.id
   WHERE c.name IN ('eligible_a', 'eligible_b')
     AND s.status = 'missed'),
  2::bigint,
  'MISSED-04 both eligible rows become missed'
);

-- Audit must be authoritative and unique.
SELECT is(
  (SELECT count(*)
   FROM public.task_study_session_events e
   JOIN missed_cases c ON c.session_id = e.session_id
   WHERE c.name IN ('eligible_a', 'eligible_b')
     AND e.event_type = 'marked_missed'),
  2::bigint,
  'MISSED-05 one missed event per transitioned row'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.task_study_session_events e
    JOIN missed_cases c ON c.session_id = e.session_id
    WHERE c.name IN ('eligible_a', 'eligible_b')
      AND NOT (
        e.from_status = 'scheduled'
        AND e.to_status = 'missed'
        AND e.actor_id IS NULL
        AND e.payload->>'source'
            = 'attendance_sweep'
        AND e.payload->>'reason'
            = 'grace_expired'
        AND e.payload->>'graceMinutes' = '60'
      )
  ),
  'MISSED-05 events contain correct system attribution'
);

-- Repeated batches are idempotent for processed sessions.
SELECT is(
  (
    public.ls_mark_missed_batch(20)->>'marked'
  )::integer,
  0,
  'MISSED-06 repeated scan creates no new misses'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_session_events e
   JOIN missed_cases c ON c.session_id = e.session_id
   WHERE c.name IN ('eligible_a', 'eligible_b')),
  2::bigint,
  'MISSED-06 no duplicate audit events'
);

-- Ineligible sessions must stay unchanged.
SELECT is(
  (SELECT status
   FROM public.task_study_sessions
   WHERE id = (
     SELECT session_id FROM missed_cases
     WHERE name = 'before_grace'
   )),
  'scheduled',
  'MISSED-07 before grace remains scheduled'
);

SELECT is(
  (SELECT status
   FROM public.task_study_sessions
   WHERE id = (
     SELECT session_id FROM missed_cases
     WHERE name = 'running'
   )),
  'in_progress',
  'MISSED-08 in-progress session is deferred'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.task_study_session_events e
    JOIN missed_cases c ON c.session_id = e.session_id
    WHERE c.name IN (
      'running', 'completed', 'skipped', 'cancelled',
      'closed_task', 'paused_schedule', 'before_grace'
    )
      AND e.event_type = 'marked_missed'
  ),
  'MISSED-09 no audit for ineligible sessions'
);

-- Batch input validation.
SELECT throws_ok(
  'SELECT public.ls_mark_missed_batch(0)',
  '22023',
  'Invalid missed sweep batch size',
  'MISSED-10 batch size zero rejected'
);

SELECT throws_ok(
  'SELECT public.ls_mark_missed_batch(501)',
  '22023',
  'Invalid missed sweep batch size',
  'MISSED-10 batch over maximum rejected'
);

-- Enable the gate inside the rolled-back test transaction.
UPDATE public.ls_missed_sweep_control
SET enabled = true
WHERE singleton = true;

-- Prepare one overdue candidate for failure injection.
UPDATE public.task_study_sessions
SET status = 'scheduled'
WHERE id = (
  SELECT session_id FROM missed_cases
  WHERE name = 'rollback'
);

CREATE FUNCTION pg_temp.fail_missed_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'marked_missed'
     AND NEW.event_key LIKE 'ls:missed:%' THEN
    RAISE EXCEPTION 'Injected missed audit failure'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER missed_test_audit_failure
BEFORE INSERT ON public.task_study_session_events
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_missed_audit();

CREATE TEMP TABLE missed_before AS
SELECT jsonb_build_object(
  'session', (
    SELECT to_jsonb(s)
    FROM public.task_study_sessions s
    JOIN missed_cases c ON c.session_id = s.id
    WHERE c.name = 'rollback'
  ),
  'events', (
    SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
    FROM public.task_study_session_events e
    JOIN missed_cases c ON c.session_id = e.session_id
    WHERE c.name = 'rollback'
  )
) AS snapshot;

SELECT throws_ok(
  'SELECT public.ls_mark_missed_batch(20)',
  'P0001',
  'Injected missed audit failure',
  'MISSED-11 audit failure aborts batch transaction'
);

SELECT is(
  (
    SELECT to_jsonb(s)
    FROM public.task_study_sessions s
    JOIN missed_cases c ON c.session_id = s.id
    WHERE c.name = 'rollback'
  ),
  (
    SELECT snapshot->'session'
    FROM missed_before
  ),
  'MISSED-11 failed transition restores full session row'
);

SELECT is(
  (SELECT count(*)
   FROM public.task_study_session_events e
   JOIN missed_cases c ON c.session_id = e.session_id
   WHERE c.name = 'rollback'),
  0::bigint,
  'MISSED-11 failed transition creates no audit'
);

-- Privileges.
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.ls_mark_missed_batch(integer)',
    'EXECUTE'
  ),
  'MISSED-12 authenticated cannot run trusted sweep'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ls_mark_missed_batch(integer)',
    'EXECUTE'
  ),
  'MISSED-12 anonymous cannot run trusted sweep'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.ls_mark_missed_batch(integer)',
    'EXECUTE'
  ),
  'MISSED-12 service_role can run trusted sweep'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.ls_missed_sweep_control',
    'UPDATE'
  ),
  'MISSED-13 user cannot activate Cron'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname =
      'lumivox-learning-schedule-missed-5m'
  ),
  'MISSED-14 Cron job is registered'
);

SELECT * FROM finish();

ROLLBACK;
