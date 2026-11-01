
-- Lumivox Phase 05 / Step 5.6B-2B.2E
-- Recovery/Skip across historical timezones.
--
-- Uses the ACTUAL authenticated RPCs.
-- No production clock override.
-- All fixtures roll back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE TEMP TABLE recovery_zone_cases (
  name text PRIMARY KEY,
  zone text NOT NULL,
  old_days integer NOT NULL,
  initial_status text NOT NULL,
  task_id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_at timestamptz NOT NULL
    DEFAULT now() - interval '10 minutes'
);

INSERT INTO recovery_zone_cases(
  name, zone, old_days, initial_status
)
VALUES
  ('ny_missed', 'America/New_York', 2, 'missed'),
  ('tokyo_skipped', 'Asia/Tokyo', 2, 'skipped'),
  ('hcm_missed', 'Asia/Ho_Chi_Minh', 2, 'missed'),
  ('ny_expired', 'America/New_York', 10, 'missed'),
  ('tokyo_expired', 'Asia/Tokyo', 10, 'missed');

GRANT SELECT ON recovery_zone_cases TO authenticated;

INSERT INTO auth.users(id, email) VALUES (
  '57000000-0000-4000-8000-000000000001',
  'recovery-zone-owner@example.invalid'
);

INSERT INTO public.profiles(id) VALUES (
  '57000000-0000-4000-8000-000000000001'
) ON CONFLICT DO NOTHING;

INSERT INTO public.tasks(
  id, user_id, title, status
)
SELECT
  task_id,
  '57000000-0000-4000-8000-000000000001',
  'Recovery timezone ' || name,
  'todo'
FROM recovery_zone_cases;

INSERT INTO public.task_study_schedules(
  id, task_id, user_id,
  starts_on, ends_on, timezone
)
SELECT
  c.schedule_id,
  c.task_id,
  '57000000-0000-4000-8000-000000000001',
  (now() AT TIME ZONE c.zone)::date - 14,
  (now() AT TIME ZONE c.zone)::date + 2,
  c.zone
FROM recovery_zone_cases c;

-- Construct valid historical local-noon occurrences.
-- Local noon avoids ambiguous/nonexistent DST hour.
WITH times AS (
  SELECT
    c.*,
    (
      (
        (now() AT TIME ZONE c.zone)::date
        - c.old_days
      ) + time '12:00'
    ) AT TIME ZONE c.zone AS begins_at,
    (
      (
        (now() AT TIME ZONE c.zone)::date
        - c.old_days
      ) + time '13:00'
    ) AT TIME ZONE c.zone AS ends_at
  FROM recovery_zone_cases c
)
INSERT INTO public.task_study_sessions(
  id, user_id, task_id, schedule_id,
  schedule_revision, logical_occurrence_key,
  local_date, local_start_time, local_end_time,
  timezone, scheduled_start_at, scheduled_end_at,
  status, updated_at
)
SELECT
  t.session_id,
  '57000000-0000-4000-8000-000000000001',
  t.task_id,
  t.schedule_id,
  1,
  'recovery-zone|' || t.name,
  (t.begins_at AT TIME ZONE t.zone)::date,
  (t.begins_at AT TIME ZONE t.zone)::time,
  (t.ends_at AT TIME ZONE t.zone)::time,
  t.zone,
  t.begins_at,
  t.ends_at,
  t.initial_status,
  t.version_at
FROM times t;

-- Change the CURRENT Schedule timezone for one historical
-- Session. Its own timezone must remain New York.
UPDATE public.task_study_schedules
SET timezone = 'Asia/Tokyo'
WHERE id = (
  SELECT schedule_id
  FROM recovery_zone_cases
  WHERE name = 'ny_missed'
);

SELECT is(
  (
    SELECT s.timezone
    FROM public.task_study_sessions s
    JOIN recovery_zone_cases c ON c.session_id = s.id
    WHERE c.name = 'ny_missed'
  ),
  'America/New_York',
  'ZONE-01 historical Session timezone retained'
);

SELECT is(
  (
    SELECT s.timezone
    FROM public.task_study_schedules s
    JOIN recovery_zone_cases c ON c.schedule_id = s.id
    WHERE c.name = 'ny_missed'
  ),
  'Asia/Tokyo',
  'ZONE-02 current Schedule timezone changed'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  '57000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- Three real successful recoveries.
SELECT is(
  public.ls_recover_study_session(
    session_id,
    version_at,
    'zone-recover-' || name
  ),
  session_id,
  'ZONE-03 Recovery succeeds: ' || name
)
FROM recovery_zone_cases
WHERE name IN (
  'ny_missed', 'tokyo_skipped', 'hcm_missed'
);

-- Compare audit cutoff to independently computed
-- midnight in each HISTORICAL Session timezone.
SELECT ok(
  (
    SELECT
      s.status = 'completed'
      AND s.completed_at IS NOT NULL
      AND s.actual_study_minutes IS NULL
      AND e.event_type = 'recovered'
      AND e.from_status = c.initial_status
      AND e.to_status = 'completed'
      AND e.actor_id = s.user_id
      AND e.payload->>'originalTimezone' = c.zone
      AND (e.payload->>'recoveryCutoff')::timestamptz =
        ((s.local_date + 8)::timestamp
          AT TIME ZONE c.zone)
    FROM public.task_study_sessions s
    JOIN public.task_study_session_events e
      ON e.session_id = s.id
    WHERE s.id = c.session_id
      AND e.event_key = 'zone-recover-' || c.name
  ),
  'ZONE-04 persisted completion and cutoff: ' || c.name
)
FROM recovery_zone_cases c
WHERE name IN (
  'ny_missed', 'tokyo_skipped', 'hcm_missed'
);

-- Exact retries after the original completion.
SELECT is(
  public.ls_recover_study_session(
    session_id,
    version_at,
    'zone-recover-' || name
  ),
  session_id,
  'ZONE-05 exact Recovery retry: ' || name
)
FROM recovery_zone_cases
WHERE name IN (
  'ny_missed', 'tokyo_skipped', 'hcm_missed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM recovery_zone_cases c
    JOIN public.task_study_session_events e
      ON e.session_id = c.session_id
    WHERE c.name IN (
      'ny_missed', 'tokyo_skipped', 'hcm_missed'
    )
    GROUP BY c.session_id
    HAVING count(*) <> 1
  ),
  'ZONE-06 each recovered Session has one event'
);

-- Expired Skip uses missed: skipped is already terminal for the Skip RPC
-- and would reject on eligibility before checking its recovery cutoff.
-- Real expired windows must reject, independently
-- of which IANA timezone the Session used.
SELECT throws_ok(
  format(
    'SELECT public.ls_recover_study_session(%L,%L,%L)',
    session_id,
    version_at,
    'zone-expired-recover'
  ),
  '22023',
  'Session is outside the recovery window',
  'ZONE-07 expired Recovery denied: ' || name
)
FROM recovery_zone_cases
WHERE name = 'ny_expired';

SELECT throws_ok(
  format(
    'SELECT public.ls_skip_study_session(%L,%L,%L,NULL)',
    session_id,
    version_at,
    'zone-expired-skip'
  ),
  '22023',
  'Session is outside the recovery window',
  'ZONE-08 expired missed/skipped correction denied'
)
FROM recovery_zone_cases
WHERE name = 'tokyo_expired';

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM recovery_zone_cases c
    JOIN public.task_study_sessions s
      ON s.id = c.session_id
    WHERE c.name IN ('ny_expired', 'tokyo_expired')
      AND (
        s.status IS DISTINCT FROM c.initial_status
        OR s.completed_at IS NOT NULL
      )
  ),
  'ZONE-09 rejected expired Sessions unchanged'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_session_events e
    JOIN recovery_zone_cases c
      ON c.session_id = e.session_id
    WHERE c.name IN ('ny_expired', 'tokyo_expired')
  ),
  0::bigint,
  'ZONE-10 expired requests append no audit'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

