
-- Lumivox Phase 05 / Step 5.5
-- Late recovery pgTAP acceptance.
-- Run against Supabase local only.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE recovery_cases (
  name text PRIMARY KEY,
  task_id uuid DEFAULT gen_random_uuid(),
  schedule_id uuid DEFAULT gen_random_uuid(),
  session_id uuid DEFAULT gen_random_uuid(),
  initial_version timestamptz
    DEFAULT now() - interval '10 minutes'
);

INSERT INTO recovery_cases(name) VALUES
  ('missed'),
  ('skipped'),
  ('expired_missed'),
  ('expired_skipped'),
  ('scheduled'),
  ('running'),
  ('completed'),
  ('cancelled'),
  ('future_missed'),
  ('stale'),
  ('closed_task'),
  ('paused'),
  ('rollback');

GRANT SELECT ON recovery_cases TO authenticated;

INSERT INTO auth.users(id, email) VALUES
  (
    '55000000-0000-4000-8000-000000000001',
    'recovery-owner@example.invalid'
  ),
  (
    '55000000-0000-4000-8000-000000000002',
    'recovery-other@example.invalid'
  );

INSERT INTO public.profiles(id) VALUES
  ('55000000-0000-4000-8000-000000000001'),
  ('55000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.tasks(id, user_id, title, status)
SELECT
  task_id,
  '55000000-0000-4000-8000-000000000001',
  'Recovery fixture ' || name,
  'todo'
FROM recovery_cases;

-- Keep generated local fixture times away from midnight.
CREATE TEMP TABLE recovery_clock AS
SELECT now() AS anchor,
  CASE
    WHEN EXTRACT(
      HOUR FROM now() AT TIME ZONE 'UTC'
    ) BETWEEN 6 AND 17
    THEN 'UTC'
    ELSE 'Etc/GMT+12'
  END AS zone;

INSERT INTO public.task_study_schedules (
  id, task_id, user_id,
  starts_on, ends_on, timezone
)
SELECT
  c.schedule_id,
  c.task_id,
  '55000000-0000-4000-8000-000000000001',
  (k.anchor AT TIME ZONE k.zone)::date - 15,
  (k.anchor AT TIME ZONE k.zone)::date + 2,
  k.zone
FROM recovery_cases c
CROSS JOIN recovery_clock k;

INSERT INTO public.task_study_sessions (
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
  '55000000-0000-4000-8000-000000000001',
  c.task_id,
  c.schedule_id,
  1,
  'recovery|' || c.name,
  (x.starts_at AT TIME ZONE k.zone)::date,
  (x.starts_at AT TIME ZONE k.zone)::time,
  (x.ends_at AT TIME ZONE k.zone)::time,
  k.zone,
  x.starts_at,
  x.ends_at,
  CASE c.name
    WHEN 'skipped' THEN 'skipped'
    WHEN 'expired_skipped' THEN 'skipped'
    WHEN 'scheduled' THEN 'scheduled'
    WHEN 'running' THEN 'in_progress'
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'missed'
  END,
  CASE
    WHEN c.name = 'completed'
      THEN k.anchor - interval '1 day'
    ELSE NULL
  END,
  c.initial_version
FROM recovery_cases c
CROSS JOIN recovery_clock k
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN c.name IN (
        'expired_missed', 'expired_skipped'
      ) THEN k.anchor - interval '10 days'
      WHEN c.name = 'future_missed'
        THEN k.anchor + interval '1 hour'
      ELSE k.anchor - interval '2 days'
    END AS starts_at,
    CASE
      WHEN c.name IN (
        'expired_missed', 'expired_skipped'
      ) THEN k.anchor - interval '10 days'
             + interval '30 minutes'
      WHEN c.name = 'future_missed'
        THEN k.anchor + interval '2 hours'
      ELSE k.anchor - interval '2 days'
             + interval '30 minutes'
    END AS ends_at
) x;

UPDATE public.tasks
SET status = 'completed'
WHERE id = (
  SELECT task_id
  FROM recovery_cases
  WHERE name = 'closed_task'
);

UPDATE public.task_study_schedules
SET status = 'paused'
WHERE id = (
  SELECT schedule_id
  FROM recovery_cases
  WHERE name = 'paused'
);

-- Execute the requested case under current JWT claims.
CREATE FUNCTION pg_temp.recovery_sql(
  case_name text,
  command_key text,
  version_override timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT format(
    'SELECT public.ls_recover_study_session(%L,%L,%L)',
    session_id,
    coalesce(version_override, initial_version),
    command_key
  )
  FROM recovery_cases
  WHERE name = case_name;
$$;

CREATE FUNCTION pg_temp.recovery_snapshot()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    'sessions', (
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
      FROM public.task_study_sessions s
      JOIN recovery_cases c ON c.session_id = s.id
    ),
    'events', (
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM public.task_study_session_events e
      JOIN recovery_cases c ON c.session_id = e.session_id
    )
  );
$$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '55000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- REC-01: missed -> completed.
SELECT is(
  public.ls_recover_study_session(
    session_id,
    initial_version,
    'recover-missed'
  ),
  session_id,
  'REC-01 missed session is recovered'
)
FROM recovery_cases WHERE name = 'missed';

SELECT ok(
  (
    SELECT s.status = 'completed'
       AND s.completed_at IS NOT NULL
       AND s.actual_study_minutes IS NULL
       AND s.logical_occurrence_key = 'recovery|missed'
    FROM public.task_study_sessions s
    WHERE s.id = c.session_id
  ),
  'REC-01 completion and identity are persisted'
)
FROM recovery_cases c WHERE name = 'missed';

-- REC-02: skipped -> completed.
SELECT is(
  public.ls_recover_study_session(
    session_id,
    initial_version,
    'recover-skipped'
  ),
  session_id,
  'REC-02 skipped session is recovered'
)
FROM recovery_cases WHERE name = 'skipped';

-- REC-03: Authoritative recovery audit.
SELECT ok(
  (
    SELECT e.event_type = 'recovered'
       AND e.from_status = 'missed'
       AND e.to_status = 'completed'
       AND e.actor_id =
         '55000000-0000-4000-8000-000000000001'
       AND e.payload->>'requestFingerprint'
           IS NOT NULL
       AND (e.payload->>'wasLate')::boolean
    FROM public.task_study_session_events e
    WHERE e.session_id = c.session_id
      AND e.event_key = 'recover-missed'
  ),
  'REC-03 audit records missed recovery and actor'
)
FROM recovery_cases c WHERE name = 'missed';

SELECT is(
  (
    SELECT e.from_status
    FROM public.task_study_session_events e
    WHERE e.session_id = c.session_id
      AND e.event_key = 'recover-skipped'
  ),
  'skipped',
  'REC-03 skipped recovery retains source status'
)
FROM recovery_cases c WHERE name = 'skipped';

SELECT ok(
  (
    SELECT s.completed_at =
      (e.payload->>'recoveredAt')::timestamptz
    FROM public.task_study_sessions s
    JOIN public.task_study_session_events e
      ON e.session_id = s.id
    WHERE s.id = c.session_id
      AND e.event_key = 'recover-missed'
  ),
  'REC-03 persisted completion matches audit timestamp'
)
FROM recovery_cases c WHERE name = 'missed';

-- REC-04: Exact retry after completed status.
SELECT is(
  public.ls_recover_study_session(
    session_id,
    initial_version,
    'recover-missed'
  ),
  session_id,
  'REC-04 exact retry returns original ID'
)
FROM recovery_cases WHERE name = 'missed';

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events
    WHERE session_id = c.session_id
      AND event_type = 'recovered'
  ),
  1::bigint,
  'REC-04 exact retry does not duplicate events'
)
FROM recovery_cases c WHERE name = 'missed';

-- REC-05: Same key / different expected version.
SELECT throws_ok(
  pg_temp.recovery_sql(
    'missed',
    'recover-missed',
    now()
  ),
  '22023',
  'Event key reused with different request',
  'REC-05 changed payload under same key rejected'
);

-- REC-06: Expired window.
SELECT throws_ok(
  pg_temp.recovery_sql(
    'expired_missed',
    'recover-expired-missed'
  ),
  '22023',
  'Session is outside the recovery window',
  'REC-06 old missed session cannot recover'
);

SELECT throws_ok(
  pg_temp.recovery_sql(
    'expired_skipped',
    'recover-expired-skipped'
  ),
  '22023',
  'Session is outside the recovery window',
  'REC-06 old skipped session cannot recover'
);

-- REC-07: Disallowed status.
SELECT throws_ok(
  pg_temp.recovery_sql(name, 'invalid-' || name),
  '22023',
  'Session is not eligible for recovery',
  'REC-07 rejected state: ' || name
)
FROM recovery_cases
WHERE name IN (
  'scheduled', 'running', 'completed', 'cancelled'
);

-- REC-08: Future obligation cannot be recovered.
SELECT throws_ok(
  pg_temp.recovery_sql(
    'future_missed',
    'recover-future'
  ),
  '22023',
  'Session has not started',
  'REC-08 future attendance cannot be recovered'
);

-- REC-09: Task/Schedule eligibility.
SELECT throws_ok(
  pg_temp.recovery_sql(
    name,
    'parent-' || name
  ),
  '22023',
  'Session is not eligible for recovery',
  'REC-09 disallowed parent: ' || name
)
FROM recovery_cases
WHERE name IN ('closed_task', 'paused');

-- REC-10: Stale optimistic version.
SELECT throws_ok(
  pg_temp.recovery_sql(
    'stale',
    'recover-stale',
    now() - interval '1 day'
  ),
  'PT409',
  'Stale session version',
  'REC-10 stale version returns PT409'
);

SELECT ok(
  (
    SELECT s.status = 'missed'
       AND s.completed_at IS NULL
       AND s.updated_at = c.initial_version
    FROM public.task_study_sessions s
    WHERE s.id = c.session_id
  ),
  'REC-10 stale request cannot mutate session'
)
FROM recovery_cases c WHERE name = 'stale';

-- REC-11: Owner isolation.
SET LOCAL "request.jwt.claim.sub" =
  '55000000-0000-4000-8000-000000000002';

SELECT throws_ok(
  pg_temp.recovery_sql(
    'stale',
    'other-owner'
  ),
  '42501',
  'Study session not found or not owned',
  'REC-11 user B cannot recover user A session'
);

SET LOCAL "request.jwt.claim.sub" =
  '55000000-0000-4000-8000-000000000001';

-- REC-12: Parent Task unchanged.
SELECT is(
  (
    SELECT t.status::text
    FROM public.tasks t
    JOIN recovery_cases c ON c.task_id = t.id
    WHERE c.name = 'missed'
  ),
  'todo',
  'REC-12 recovery does not complete the Task'
);

RESET ROLE;

-- REC-13: Audit failure injection.
CREATE FUNCTION pg_temp.fail_recovery_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'recovered'
     AND NEW.event_key = 'fail-recovery' THEN
    RAISE EXCEPTION 'Injected recovery audit failure'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recovery_test_audit_failure
BEFORE INSERT ON public.task_study_session_events
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_recovery_audit();

CREATE TEMP TABLE recovery_before AS
SELECT pg_temp.recovery_snapshot() AS data;

GRANT SELECT ON recovery_before TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '55000000-0000-4000-8000-000000000001';

SELECT throws_ok(
  pg_temp.recovery_sql(
    'rollback',
    'fail-recovery'
  ),
  'P0001',
  'Injected recovery audit failure',
  'REC-13 failed audit aborts recovery'
);

SELECT is(
  pg_temp.recovery_snapshot(),
  (SELECT data FROM recovery_before),
  'REC-13 session and audit snapshots roll back'
);

RESET ROLE;

-- REC-14: Permissions.
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ls_recover_study_session(uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'REC-14 anonymous cannot execute recovery'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.ls_recover_study_session(uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'REC-14 authenticated can call the reviewed RPC'
);

SELECT * FROM finish();

ROLLBACK;
