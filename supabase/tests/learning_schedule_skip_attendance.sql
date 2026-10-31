
-- Lumivox Phase 05 / Step 5.3 — Skip acceptance
-- Local only. All fixtures roll back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE TEMP TABLE skip_cases (
  name text PRIMARY KEY,
  task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid(),
  session_id uuid DEFAULT gen_random_uuid(),
  initial_version timestamptz
    DEFAULT now() - interval '5 minutes'
);

INSERT INTO skip_cases(name) VALUES
  ('future'),
  ('scheduled'),
  ('missed'),
  ('missed_expired'),
  ('scheduled_expired'),
  ('running'),
  ('completed'),
  ('cancelled'),
  ('skipped'),
  ('stale'),
  ('rollback'),
  ('closed_task'),
  ('paused');

GRANT SELECT ON skip_cases TO authenticated;

INSERT INTO auth.users(id, email) VALUES
  (
    '53000000-0000-4000-8000-000000000001',
    'skip-owner@example.invalid'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    'skip-other@example.invalid'
  );

INSERT INTO public.profiles(id) VALUES
  ('53000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.tasks(id, user_id, title, status)
SELECT
  task_id,
  '53000000-0000-4000-8000-000000000001',
  'Skip fixture ' || name,
  'todo'
FROM skip_cases;

-- Keep wall-clock fixture times away from midnight.
CREATE TEMP TABLE skip_clock AS
SELECT
  now() AS anchor,
  CASE
    WHEN EXTRACT(
      HOUR FROM now() AT TIME ZONE 'UTC'
    ) BETWEEN 6 AND 17
    THEN 'UTC'
    ELSE 'Etc/GMT+12'
  END AS zone;

INSERT INTO public.task_study_schedules(
  id, task_id, user_id, starts_on, ends_on, timezone
)
SELECT
  c.schedule_id,
  c.task_id,
  '53000000-0000-4000-8000-000000000001',
  (k.anchor AT TIME ZONE k.zone)::date - 15,
  (k.anchor AT TIME ZONE k.zone)::date + 2,
  k.zone
FROM skip_cases c
CROSS JOIN skip_clock k;

INSERT INTO public.task_study_sessions(
  id,
  user_id,
  task_id,
  schedule_id,
  schedule_revision,
  logical_occurrence_key,
  local_date,
  local_start_time,
  local_end_time,
  timezone,
  scheduled_start_at,
  scheduled_end_at,
  status,
  completed_at,
  updated_at
)
SELECT
  c.session_id,
  '53000000-0000-4000-8000-000000000001',
  c.task_id,
  c.schedule_id,
  1,
  'skip|' || c.name,
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
    WHEN 'skipped' THEN 'skipped'
    WHEN 'missed' THEN 'missed'
    WHEN 'missed_expired' THEN 'missed'
    WHEN 'closed_task' THEN 'missed'
    ELSE 'scheduled'
  END,
  CASE
    WHEN c.name = 'completed' THEN k.anchor
    ELSE NULL
  END,
  c.initial_version
FROM skip_cases c
CROSS JOIN skip_clock k
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN c.name = 'future'
        THEN k.anchor + interval '1 hour'
      WHEN c.name IN ('missed', 'closed_task')
        THEN k.anchor - interval '2 days'
      WHEN c.name = 'missed_expired'
        THEN k.anchor - interval '10 days'
      WHEN c.name = 'scheduled_expired'
        THEN k.anchor - interval '3 hours'
      ELSE k.anchor - interval '20 minutes'
    END AS starts_at,

    CASE
      WHEN c.name = 'future'
        THEN k.anchor + interval '2 hours'
      WHEN c.name IN ('missed', 'closed_task')
        THEN k.anchor - interval '2 days'
             + interval '30 minutes'
      WHEN c.name = 'missed_expired'
        THEN k.anchor - interval '10 days'
             + interval '30 minutes'
      WHEN c.name = 'scheduled_expired'
        THEN k.anchor - interval '2 hours'
      ELSE k.anchor + interval '40 minutes'
    END AS ends_at
) x;

-- Closing a Task must not silently turn
-- historical missed sessions into completed.
UPDATE public.tasks
SET status = 'completed'
WHERE id = (
  SELECT task_id
  FROM skip_cases
  WHERE name = 'closed_task'
);

UPDATE public.task_study_schedules
SET status = 'paused'
WHERE id = (
  SELECT schedule_id
  FROM skip_cases
  WHERE name = 'paused'
);

CREATE FUNCTION pg_temp.skip_sql(
  case_name text,
  command_key text,
  reason text DEFAULT NULL,
  version_override timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT format(
    'SELECT public.ls_skip_study_session(%L,%L,%L,%L)',
    session_id,
    coalesce(version_override, initial_version),
    command_key,
    reason
  )
  FROM skip_cases
  WHERE name = case_name;
$$;

CREATE FUNCTION pg_temp.skip_snapshot()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    'sessions', (
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
      FROM public.task_study_sessions s
      JOIN skip_cases c ON c.session_id = s.id
    ),
    'events', (
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM public.task_study_session_events e
      JOIN skip_cases c ON c.session_id = e.session_id
    )
  );
$$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '53000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- SKIP-01: Future scheduled session.
SELECT is(
  public.ls_skip_study_session(
    session_id,
    initial_version,
    'skip-future',
    'Personal appointment'
  ),
  session_id,
  'SKIP-01 future scheduled session can be skipped'
)
FROM skip_cases WHERE name = 'future';

SELECT ok(
  (
    SELECT s.status = 'skipped'
       AND s.completed_at IS NULL
       AND s.actual_study_minutes IS NULL
       AND s.logical_occurrence_key = 'skip|future'
    FROM public.task_study_sessions s
    WHERE s.id = c.session_id
  ),
  'SKIP-01 preserves identity and no completion'
)
FROM skip_cases c WHERE name = 'future';

-- SKIP-02: Scheduled session currently due.
SELECT is(
  public.ls_skip_study_session(
    session_id,
    initial_version,
    'skip-scheduled',
    NULL
  ),
  session_id,
  'SKIP-02 current scheduled session can be skipped'
)
FROM skip_cases WHERE name = 'scheduled';

-- SKIP-03: Missed -> skipped within 7 local days.
SELECT is(
  public.ls_skip_study_session(
    session_id,
    initial_version,
    'skip-missed',
    'Could not attend'
  ),
  session_id,
  'SKIP-03 recent missed session can be reclassified'
)
FROM skip_cases WHERE name = 'missed';

SELECT is(
  (
    SELECT e.from_status
    FROM public.task_study_session_events e
    WHERE e.session_id = c.session_id
      AND e.event_key = 'skip-missed'
  ),
  'missed',
  'SKIP-03 audit records missed -> skipped'
)
FROM skip_cases c WHERE name = 'missed';

-- SKIP-04: Audit contains normalized reason.
SELECT ok(
  (
    SELECT e.event_type = 'skipped'
       AND e.from_status = 'scheduled'
       AND e.to_status = 'skipped'
       AND e.actor_id =
         '53000000-0000-4000-8000-000000000001'
       AND e.payload->>'reason'
         = 'Personal appointment'
       AND length(
         e.payload->>'requestFingerprint'
       ) = 64
    FROM public.task_study_session_events e
    WHERE e.session_id = c.session_id
      AND e.event_key = 'skip-future'
  ),
  'SKIP-04 audit actor, reason and fingerprint'
)
FROM skip_cases c WHERE name = 'future';

-- SKIP-05: Exact retry.
SELECT is(
  public.ls_skip_study_session(
    session_id,
    initial_version,
    'skip-future',
    'Personal appointment'
  ),
  session_id,
  'SKIP-05 exact replay returns original ID'
)
FROM skip_cases WHERE name = 'future';

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events e
    WHERE e.session_id = c.session_id
  ),
  1::bigint,
  'SKIP-05 replay does not duplicate audit'
)
FROM skip_cases c WHERE name = 'future';

-- SKIP-06: Same event key, different reason.
SELECT throws_ok(
  pg_temp.skip_sql(
    'future',
    'skip-future',
    'Changed reason'
  ),
  '22023',
  'Event key reused with different request',
  'SKIP-06 changed reason under same key rejected'
);

-- SKIP-07: Expired windows.
SELECT throws_ok(
  pg_temp.skip_sql(
    'scheduled_expired',
    'skip-expired'
  ),
  '22023',
  'Session is outside the skip window',
  'SKIP-07 scheduled session after grace rejected'
);

SELECT throws_ok(
  pg_temp.skip_sql(
    'missed_expired',
    'skip-old-missed'
  ),
  '22023',
  'Session is outside the recovery window',
  'SKIP-07 missed session after recovery rejected'
);

-- SKIP-08: Invalid states.
SELECT throws_ok(
  pg_temp.skip_sql(name, 'invalid-' || name),
  '22023',
  'Session is not eligible for skipping',
  'SKIP-08 invalid state: ' || name
)
FROM skip_cases
WHERE name IN (
  'running', 'completed', 'cancelled', 'skipped'
);

-- SKIP-09: Closed Task and paused Schedule.
SELECT throws_ok(
  pg_temp.skip_sql(name, 'parent-' || name),
  '22023',
  'Session is not eligible for skipping',
  'SKIP-09 parent restriction: ' || name
)
FROM skip_cases
WHERE name IN ('closed_task', 'paused');

-- SKIP-10: Stale updated_at.
SELECT throws_ok(
  pg_temp.skip_sql(
    'stale',
    'skip-stale',
    NULL,
    now() - interval '1 day'
  ),
  'PT409',
  'Stale session version',
  'SKIP-10 stale version uses PT409'
);

SELECT ok(
  (
    SELECT s.status = 'scheduled'
       AND s.updated_at = c.initial_version
    FROM public.task_study_sessions s
    WHERE s.id = c.session_id
  ),
  'SKIP-10 stale command performs no mutation'
)
FROM skip_cases c WHERE name = 'stale';

-- SKIP-11: Ownership isolation.
SET LOCAL "request.jwt.claim.sub" =
  '53000000-0000-4000-8000-000000000002';

SELECT throws_ok(
  pg_temp.skip_sql('stale', 'cross-owner'),
  '42501',
  'Study session not found or not owned',
  'SKIP-11 cross-owner command denied'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_sessions s
    JOIN skip_cases c ON c.session_id = s.id
    WHERE c.name = 'stale'
  ),
  0::bigint,
  'SKIP-11 RLS hides other owner session'
);

SET LOCAL "request.jwt.claim.sub" =
  '53000000-0000-4000-8000-000000000001';

-- SKIP-12: Input validation.
SELECT throws_ok(
  pg_temp.skip_sql(
    'stale',
    'reason-too-long',
    repeat('x', 501)
  ),
  '22023',
  'Skip reason exceeds 500 characters',
  'SKIP-12 overly long reason rejected'
);

SELECT throws_ok(
  pg_temp.skip_sql('stale', '   '),
  '22023',
  'Invalid event key',
  'SKIP-12 whitespace event key rejected'
);

-- SKIP-13: Task status remains independent.
SELECT is(
  (
    SELECT t.status::text
    FROM public.tasks t
    JOIN skip_cases c ON c.task_id = t.id
    WHERE c.name = 'future'
  ),
  'todo',
  'SKIP-13 Skip does not complete parent Task'
);

RESET ROLE;

-- SKIP-14: Audit INSERT failure must roll back.
CREATE FUNCTION pg_temp.fail_skip_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'skipped'
     AND NEW.event_key = 'fail-skip' THEN
    RAISE EXCEPTION 'Injected skip audit failure'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER skip_test_audit_failure
BEFORE INSERT ON public.task_study_session_events
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_skip_audit();

CREATE TEMP TABLE skip_before AS
SELECT pg_temp.skip_snapshot() AS data;

GRANT SELECT ON skip_before TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '53000000-0000-4000-8000-000000000001';

SELECT throws_ok(
  pg_temp.skip_sql(
    'rollback',
    'fail-skip',
    'Failure injection'
  ),
  'P0001',
  'Injected skip audit failure',
  'SKIP-14 failed audit aborts Skip'
);

SELECT is(
  pg_temp.skip_snapshot(),
  (SELECT data FROM skip_before),
  'SKIP-14 session/event snapshots restored'
);

RESET ROLE;

-- SKIP-15: Execution privileges.
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ls_skip_study_session(uuid,timestamptz,text,text)',
    'EXECUTE'
  ),
  'SKIP-15 anonymous role cannot call Skip'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.ls_skip_study_session(uuid,timestamptz,text,text)',
    'EXECUTE'
  ),
  'SKIP-15 authenticated may call reviewed RPC'
);

SELECT * FROM finish();

ROLLBACK;
