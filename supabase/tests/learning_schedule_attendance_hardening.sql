
-- Lumivox Phase 05 / Step 5.6B-2A
-- Multi-row rollback, privileges and historical timezone.
-- LOCAL ONLY. All changes are rolled back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

-- ---------------------------------------------------------
-- 1. Isolated fixtures
-- ---------------------------------------------------------

CREATE TEMP TABLE hardening_cases (
  name text PRIMARY KEY,
  task_id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  initial_version timestamptz
    NOT NULL DEFAULT now() - interval '10 minutes'
);

INSERT INTO hardening_cases(name) VALUES
  ('batch_first'),
  ('batch_second'),
  ('recovery');

GRANT SELECT ON hardening_cases TO authenticated;

INSERT INTO auth.users(id, email) VALUES
(
  '56000000-0000-4000-8000-000000000001',
  'attendance-hardening-owner@example.invalid'
);

INSERT INTO public.profiles(id) VALUES
(
  '56000000-0000-4000-8000-000000000001'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.tasks(
  id, user_id, title, status
)
SELECT
  task_id,
  '56000000-0000-4000-8000-000000000001',
  'Attendance hardening ' || name,
  'todo'
FROM hardening_cases;

-- All three sessions are originally in New York.
INSERT INTO public.task_study_schedules(
  id, task_id, user_id,
  starts_on, ends_on, timezone
)
SELECT
  c.schedule_id,
  c.task_id,
  '56000000-0000-4000-8000-000000000001',
  (now() AT TIME ZONE 'America/New_York')::date - 10,
  (now() AT TIME ZONE 'America/New_York')::date + 2,
  'America/New_York'
FROM hardening_cases c;

-- Construct valid study occurrences at local noon.
-- No midnight-crossing fixture or invented UTC offset.
WITH instants AS (
  SELECT
    c.*,
    (
      (
        (now() AT TIME ZONE 'America/New_York')::date
        - CASE c.name
            WHEN 'batch_first' THEN 4
            WHEN 'batch_second' THEN 3
            ELSE 2
          END
      ) + time '12:00'
    ) AT TIME ZONE 'America/New_York' AS starts_at,

    (
      (
        (now() AT TIME ZONE 'America/New_York')::date
        - CASE c.name
            WHEN 'batch_first' THEN 4
            WHEN 'batch_second' THEN 3
            ELSE 2
          END
      ) + time '13:00'
    ) AT TIME ZONE 'America/New_York' AS ends_at
  FROM hardening_cases c
)
INSERT INTO public.task_study_sessions(
  id, user_id, task_id, schedule_id,
  schedule_revision, logical_occurrence_key,
  local_date, local_start_time, local_end_time,
  timezone, scheduled_start_at, scheduled_end_at,
  status, updated_at
)
SELECT
  i.session_id,
  '56000000-0000-4000-8000-000000000001',
  i.task_id,
  i.schedule_id,
  1,
  'hardening|' || i.name,
  (i.starts_at AT TIME ZONE 'America/New_York')::date,
  (i.starts_at AT TIME ZONE 'America/New_York')::time,
  (i.ends_at AT TIME ZONE 'America/New_York')::time,
  'America/New_York',
  i.starts_at,
  i.ends_at,
  CASE
    WHEN i.name = 'recovery' THEN 'missed'
    ELSE 'scheduled'
  END,
  i.initial_version
FROM instants i;

-- Simulate a Schedule timezone change after the historical
-- occurrence already exists. Session timezone stays New York.
UPDATE public.task_study_schedules
SET timezone = 'Asia/Tokyo'
WHERE id = (
  SELECT schedule_id
  FROM hardening_cases
  WHERE name = 'recovery'
);

-- ---------------------------------------------------------
-- 2. Multi-row atomic rollback
-- ---------------------------------------------------------

-- Snapshot both overdue sessions AND their audit history.
CREATE TEMP TABLE hardening_before AS
SELECT jsonb_build_object(
  'sessions', (
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
    FROM public.task_study_sessions s
    JOIN hardening_cases c ON c.session_id = s.id
    WHERE c.name IN ('batch_first', 'batch_second')
  ),
  'events', (
    SELECT coalesce(
      jsonb_agg(to_jsonb(e) ORDER BY e.id),
      '[]'::jsonb
    )
    FROM public.task_study_session_events e
    JOIN hardening_cases c ON c.session_id = e.session_id
    WHERE c.name IN ('batch_first', 'batch_second')
  )
) AS snapshot;

-- Inject failure ONLY when processing the second candidate.
CREATE FUNCTION pg_temp.fail_second_missed_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'marked_missed'
     AND NEW.session_id = (
       SELECT session_id
       FROM pg_temp.hardening_cases
       WHERE name = 'batch_second'
     )
  THEN
    -- Prove this failure happens after an earlier row and its audit were
    -- written in the same batch, not before any work was performed.
    IF NOT EXISTS (
      SELECT 1
      FROM public.task_study_sessions s
      JOIN pg_temp.hardening_cases c ON c.session_id = s.id
      JOIN public.task_study_session_events e ON e.session_id = s.id
      WHERE c.name = 'batch_first'
        AND s.status = 'missed'
        AND e.event_type = 'marked_missed'
        AND e.event_key = 'ls:missed:' || s.id::text
    ) THEN
      RAISE EXCEPTION 'First row and audit were not processed before failure'
        USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION
      'Injected second-row missed audit failure'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER hardening_second_audit_failure
BEFORE INSERT ON public.task_study_session_events
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_second_missed_event();

-- The first eligible row must be updated before the
-- second audit insertion raises an exception.
SELECT throws_ok(
  'SELECT public.ls_mark_missed_batch(100)',
  'P0001',
  'Injected second-row missed audit failure',
  'HARD-01 later audit failure aborts entire batch'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'sessions', (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
        FROM public.task_study_sessions s
        JOIN hardening_cases c ON c.session_id = s.id
        WHERE c.name IN ('batch_first', 'batch_second')
      ),
      'events', (
        SELECT coalesce(
          jsonb_agg(to_jsonb(e) ORDER BY e.id),
          '[]'::jsonb
        )
        FROM public.task_study_session_events e
        JOIN hardening_cases c ON c.session_id = e.session_id
        WHERE c.name IN ('batch_first', 'batch_second')
      )
    )
  ),
  (SELECT snapshot FROM hardening_before),
  'HARD-02 both rows and all events roll back'
);

-- Remove the injected failure to prove that the same
-- two candidates can subsequently be processed.
DROP TRIGGER hardening_second_audit_failure
ON public.task_study_session_events;

SELECT is(
  (public.ls_mark_missed_batch(100)->>'marked')::integer,
  2,
  'HARD-03 successful retry marks both overdue rows'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events e
    JOIN hardening_cases c ON c.session_id = e.session_id
    WHERE c.name IN ('batch_first', 'batch_second')
      AND e.event_type = 'marked_missed'
  ),
  2::bigint,
  'HARD-04 exactly two authoritative audit events'
);

SELECT is(
  (public.ls_mark_missed_batch(100)->>'marked')::integer,
  0,
  'HARD-05 repeated batch creates no new transition'
);

-- ---------------------------------------------------------
-- 3. Historical timezone through the real Recovery RPC
-- ---------------------------------------------------------

SELECT is(
  (
    SELECT s.timezone
    FROM public.task_study_sessions s
    JOIN hardening_cases c ON c.session_id = s.id
    WHERE c.name = 'recovery'
  ),
  'America/New_York',
  'HARD-06 historical session timezone retained'
);

SELECT is(
  (
    SELECT s.timezone
    FROM public.task_study_schedules s
    JOIN hardening_cases c ON c.schedule_id = s.id
    WHERE c.name = 'recovery'
  ),
  'Asia/Tokyo',
  'HARD-07 current Schedule timezone differs'
);

SET LOCAL ROLE authenticated;

SET LOCAL "request.jwt.claim.sub" =
  '56000000-0000-4000-8000-000000000001';

SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  public.ls_recover_study_session(
    session_id,
    initial_version,
    'hardening-recover-ny'
  ),
  session_id,
  'HARD-08 real authenticated Recovery succeeds'
)
FROM hardening_cases
WHERE name = 'recovery';

SELECT ok(
  (
    SELECT
      e.payload->>'originalTimezone' = 'America/New_York'
      AND
      (e.payload->>'recoveryCutoff')::timestamptz =
      (
        ((s.local_date + 8)::timestamp)
          AT TIME ZONE 'America/New_York'
      )
      AND
      s.status = 'completed'
      AND
      s.completed_at IS NOT NULL
      AND
      s.actual_study_minutes IS NULL
    FROM public.task_study_sessions s
    JOIN public.task_study_session_events e
      ON e.session_id = s.id
    JOIN hardening_cases c
      ON c.session_id = s.id
    WHERE c.name = 'recovery'
      AND e.event_key = 'hardening-recover-ny'
  ),
  'HARD-09 real RPC uses historical timezone cutoff'
);

-- Reuse the original command and expected version.
SELECT is(
  public.ls_recover_study_session(
    session_id,
    initial_version,
    'hardening-recover-ny'
  ),
  session_id,
  'HARD-10 exact recovery replay retains result'
)
FROM hardening_cases
WHERE name = 'recovery';

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events e
    JOIN hardening_cases c ON c.session_id = e.session_id
    WHERE c.name = 'recovery'
      AND e.event_type = 'recovered'
  ),
  1::bigint,
  'HARD-11 replay does not append another event'
);

RESET ROLE;

-- ---------------------------------------------------------
-- 4. Database privilege and activation gate checks
-- ---------------------------------------------------------

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ls_mark_missed_batch(integer)',
    'EXECUTE'
  ),
  'HARD-12 anon cannot execute trusted batch'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.ls_mark_missed_batch(integer)',
    'EXECUTE'
  ),
  'HARD-13 authenticated cannot execute trusted batch'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.ls_mark_missed_batch(integer)',
    'EXECUTE'
  ),
  'HARD-14 service_role can execute trusted batch'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ls_run_missed_sweep_if_enabled()',
    'EXECUTE'
  ),
  'HARD-15 anon cannot execute Cron wrapper'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.ls_run_missed_sweep_if_enabled()',
    'EXECUTE'
  ),
  'HARD-16 authenticated cannot execute Cron wrapper'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.ls_run_missed_sweep_if_enabled()',
    'EXECUTE'
  ),
  'HARD-17 service_role can execute Cron wrapper'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.ls_missed_sweep_control',
    'UPDATE'
  ),
  'HARD-18 user cannot activate sweep'
);

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'public.ls_missed_sweep_control',
    'UPDATE'
  ),
  'HARD-19 anon cannot activate sweep'
);

SELECT is(
  (SELECT enabled
   FROM public.ls_missed_sweep_control
   WHERE singleton = true),
  false,
  'HARD-20 Cron processing gate remains OFF'
);

SELECT ok(
  (
    SELECT count(*) = 1
    FROM cron.job
    WHERE jobname = 'lumivox-learning-schedule-missed-5m'
      AND schedule = '*/5 * * * *'
      AND active = true
  ),
  'HARD-21 Cron has exactly one unchanged job'
);

SELECT * FROM finish();

ROLLBACK;
