
-- Phase 05 / Step 5.2 acceptance tests.
-- Local database only. All fixtures roll back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE TEMP TABLE complete_cases (
  name text PRIMARY KEY,
  task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid(),
  session_id uuid DEFAULT gen_random_uuid(),
  initial_version timestamptz DEFAULT now() - interval '5 minutes'
);

INSERT INTO complete_cases(name) VALUES
  ('scheduled'),
  ('running'),
  ('grace'),
  ('future'),
  ('expired'),
  ('completed'),
  ('cancelled'),
  ('missed'),
  ('skipped'),
  ('stale'),
  ('rollback'),
  ('closed_task'),
  ('paused');

GRANT SELECT ON complete_cases TO authenticated;

INSERT INTO auth.users(id, email) VALUES
  ('52000000-0000-4000-8000-000000000001',
   'completion-owner@example.invalid'),
  ('52000000-0000-4000-8000-000000000002',
   'completion-other@example.invalid');

INSERT INTO public.profiles(id) VALUES
  ('52000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.tasks(id, user_id, title, status)
SELECT
  task_id,
  '52000000-0000-4000-8000-000000000001',
  'Complete fixture ' || name,
  'todo'
FROM complete_cases;

-- Keep local times away from midnight.
CREATE TEMP TABLE complete_clock AS
SELECT
  now() AS anchor,
  CASE
    WHEN EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')
      BETWEEN 6 AND 17
    THEN 'UTC'
    ELSE 'Etc/GMT+12'
  END AS zone;

INSERT INTO public.task_study_schedules(
  id, task_id, user_id, starts_on, ends_on, timezone
)
SELECT
  c.schedule_id,
  c.task_id,
  '52000000-0000-4000-8000-000000000001',
  (k.anchor AT TIME ZONE k.zone)::date - 1,
  (k.anchor AT TIME ZONE k.zone)::date + 1,
  k.zone
FROM complete_cases c
CROSS JOIN complete_clock k;

INSERT INTO public.task_study_sessions(
  id, user_id, task_id, schedule_id,
  schedule_revision, logical_occurrence_key,
  local_date, local_start_time, local_end_time,
  timezone, scheduled_start_at, scheduled_end_at,
  status, completed_at, updated_at
)
SELECT
  c.session_id,
  '52000000-0000-4000-8000-000000000001',
  c.task_id,
  c.schedule_id,
  1,
  'complete|' || c.name,
  (x.starts_at AT TIME ZONE k.zone)::date,
  (x.starts_at AT TIME ZONE k.zone)::time,
  (x.ends_at AT TIME ZONE k.zone)::time,
  k.zone,
  x.starts_at,
  x.ends_at,
  CASE c.name
    WHEN 'running' THEN 'in_progress'
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'missed' THEN 'missed'
    WHEN 'skipped' THEN 'skipped'
    WHEN 'closed_task' THEN 'in_progress'
    ELSE 'scheduled'
  END,
  CASE WHEN c.name = 'completed'
    THEN k.anchor - interval '10 minutes'
    ELSE NULL
  END,
  c.initial_version
FROM complete_cases c
CROSS JOIN complete_clock k
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN c.name = 'future'
        THEN k.anchor + interval '1 hour'
      WHEN c.name = 'expired'
        THEN k.anchor - interval '3 hours'
      WHEN c.name = 'grace'
        THEN k.anchor - interval '90 minutes'
      ELSE k.anchor - interval '35 minutes'
    END AS starts_at,
    CASE
      WHEN c.name = 'future'
        THEN k.anchor + interval '2 hours'
      WHEN c.name = 'expired'
        THEN k.anchor - interval '2 hours'
      WHEN c.name = 'grace'
        THEN k.anchor - interval '10 minutes'
      ELSE k.anchor + interval '25 minutes'
    END AS ends_at
) x;

UPDATE public.tasks
SET status = 'completed'
WHERE id = (
  SELECT task_id FROM complete_cases
  WHERE name = 'closed_task'
);

UPDATE public.task_study_schedules
SET status = 'paused'
WHERE id = (
  SELECT schedule_id FROM complete_cases
  WHERE name = 'paused'
);

CREATE FUNCTION pg_temp.complete_sql(
  case_name text,
  command_key text,
  version_override timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT format(
    'SELECT public.ls_complete_study_session(%L,%L,%L)',
    session_id,
    coalesce(version_override, initial_version),
    command_key
  )
  FROM complete_cases
  WHERE name = case_name;
$$;

CREATE FUNCTION pg_temp.completion_snapshot()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    'sessions', (
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
      FROM public.task_study_sessions s
      JOIN complete_cases c ON c.session_id = s.id
    ),
    'events', (
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM public.task_study_session_events e
      JOIN complete_cases c ON c.session_id = e.session_id
    )
  );
$$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '52000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- COMPLETE-01: Direct completion.
SELECT is(
  public.ls_complete_study_session(
    session_id, initial_version, 'complete-scheduled'
  ),
  session_id,
  'Scheduled session completes and retains its ID'
)
FROM complete_cases WHERE name = 'scheduled';

SELECT ok(
  (
    SELECT status = 'completed'
       AND completed_at IS NOT NULL
       AND actual_study_minutes IS NULL
    FROM public.task_study_sessions
    WHERE id = c.session_id
  ),
  'Completed status and timestamp are persisted; minutes stay null'
)
FROM complete_cases c WHERE name = 'scheduled';

-- COMPLETE-02: Running session.
SELECT is(
  public.ls_complete_study_session(
    session_id, initial_version, 'complete-running'
  ),
  session_id,
  'In-progress session completes'
)
FROM complete_cases WHERE name = 'running';

-- COMPLETE-03: Grace window.
SELECT is(
  public.ls_complete_study_session(
    session_id, initial_version, 'complete-grace'
  ),
  session_id,
  'Completion after planned end but within grace is accepted'
)
FROM complete_cases WHERE name = 'grace';

SELECT ok(
  (
    SELECT (payload->>'wasLate')::boolean
    FROM public.task_study_session_events
    WHERE session_id = c.session_id
      AND event_key = 'complete-grace'
  ),
  'Grace completion records wasLate=true'
)
FROM complete_cases c WHERE name = 'grace';

-- COMPLETE-04: Audit.
SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events
    WHERE session_id = c.session_id
      AND event_type = 'completed'
  ),
  1::bigint,
  'Exactly one completed audit event'
)
FROM complete_cases c WHERE name = 'scheduled';

SELECT ok(
  (
    SELECT from_status = 'scheduled'
       AND to_status = 'completed'
       AND actor_id =
         '52000000-0000-4000-8000-000000000001'
       AND payload->>'requestFingerprint' IS NOT NULL
    FROM public.task_study_session_events
    WHERE session_id = c.session_id
      AND event_key = 'complete-scheduled'
  ),
  'Audit contains transition, actor and fingerprint'
)
FROM complete_cases c WHERE name = 'scheduled';

-- COMPLETE-05: Exact replay.
SELECT is(
  public.ls_complete_study_session(
    session_id, initial_version, 'complete-scheduled'
  ),
  session_id,
  'Exact replay returns original ID'
)
FROM complete_cases WHERE name = 'scheduled';

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events
    WHERE session_id = c.session_id
  ),
  1::bigint,
  'Exact replay does not create another event'
)
FROM complete_cases c WHERE name = 'scheduled';

-- COMPLETE-06: Same key, different request.
SELECT throws_ok(
  pg_temp.complete_sql(
    'scheduled', 'complete-scheduled', now()
  ),
  '22023',
  'Event key reused with different request',
  'Changed payload under used key is rejected'
);

-- COMPLETE-07: Invalid timing.
SELECT throws_ok(
  pg_temp.complete_sql('future', 'complete-future'),
  '22023',
  'Session is outside the completion window',
  'Future session cannot be completed early'
);

SELECT throws_ok(
  pg_temp.complete_sql('expired', 'complete-expired'),
  '22023',
  'Session is outside the completion window',
  'Expired completion window is rejected'
);

-- COMPLETE-08: Invalid states.
SELECT throws_ok(
  pg_temp.complete_sql(name, 'state-' || name),
  '22023',
  'Session is not eligible for completion',
  'State rejected: ' || name
)
FROM complete_cases
WHERE name IN ('completed', 'cancelled', 'missed', 'skipped');

-- COMPLETE-09: Closed Task / paused Schedule.
SELECT throws_ok(
  pg_temp.complete_sql(name, 'eligibility-' || name),
  '22023',
  'Session is not eligible for completion',
  'Eligibility rejected: ' || name
)
FROM complete_cases
WHERE name IN ('closed_task', 'paused');

-- COMPLETE-10: Stale version.
SELECT throws_ok(
  pg_temp.complete_sql(
    'stale',
    'complete-stale',
    now() - interval '1 day'
  ),
  'PT409',
  'Stale session version',
  'Stale version returns explicit HTTP conflict SQLSTATE'
);

SELECT ok(
  (
    SELECT status = 'scheduled'
       AND completed_at IS NULL
       AND updated_at = c.initial_version
    FROM public.task_study_sessions
    WHERE id = c.session_id
  ),
  'Stale request changes no session fields'
)
FROM complete_cases c WHERE name = 'stale';

-- COMPLETE-11: Cross-owner access.
SET LOCAL "request.jwt.claim.sub" =
  '52000000-0000-4000-8000-000000000002';

SELECT throws_ok(
  pg_temp.complete_sql('stale', 'other-owner'),
  '42501',
  'Study session not found or not owned',
  'Another user cannot complete this session'
);

SET LOCAL "request.jwt.claim.sub" =
  '52000000-0000-4000-8000-000000000001';

-- COMPLETE-12: Parent Task remains untouched.
SELECT is(
  (
    SELECT status::text
    FROM public.tasks
    WHERE id = c.task_id
  ),
  'todo',
  'Completing a Study Session does not complete its Task'
)
FROM complete_cases c WHERE name = 'scheduled';

RESET ROLE;

-- COMPLETE-13: Inject audit failure.
CREATE FUNCTION pg_temp.fail_complete_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'completed'
     AND NEW.event_key = 'fail-complete' THEN
    RAISE EXCEPTION 'Injected completion audit failure'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER complete_test_audit_failure
BEFORE INSERT ON public.task_study_session_events
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_complete_audit();

CREATE TEMP TABLE complete_before AS
SELECT pg_temp.completion_snapshot() AS data;

GRANT SELECT ON complete_before TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '52000000-0000-4000-8000-000000000001';

SELECT throws_ok(
  pg_temp.complete_sql('rollback', 'fail-complete'),
  'P0001',
  'Injected completion audit failure',
  'Audit failure aborts completion'
);

SELECT is(
  pg_temp.completion_snapshot(),
  (SELECT data FROM complete_before),
  'Audit failure restores session and audit snapshots'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ls_complete_study_session(uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute Complete RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.ls_complete_study_session(uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'Authenticated role can execute Complete RPC'
);

SELECT * FROM finish();

ROLLBACK;
