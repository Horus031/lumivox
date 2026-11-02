
-- Learning Schedule Phase 03 / Step 3.3
-- Run only against isolated local Supabase.
-- Fixtures are rolled back after the test.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(8);

-- Prepare two users and three Tasks.
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at
)
VALUES
(
  'c1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'ls-rpc-a@example.invalid', '', now(), now(), now()
),
(
  'c1000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'ls-rpc-b@example.invalid', '', now(), now(), now()
);

INSERT INTO public.profiles (id)
VALUES
('c1000000-0000-4000-8000-000000000001'),
('c1000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tasks (id, user_id, title, status)
VALUES
(
  'c2000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'Valid Schedule Task', 'todo'
),
(
  'c2000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000002',
  'Other User Task', 'todo'
),
(
  'c2000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  'Invalid Schedule Task', 'todo'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" =
  'c1000000-0000-4000-8000-000000000001';

SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- 2030-01-07 is Monday.
-- 19:00 Vietnam local = 12:00 UTC.

-- 1. Creating a valid schedule succeeds.
SELECT lives_ok(
  $$
    SELECT public.ls_create_schedule(
      'c2000000-0000-4000-8000-000000000001',
      '2030-01-07',
      '2030-01-07',
      'Asia/Ho_Chi_Minh',
      '[{
        "weekday": 1,
        "startTime": "19:00",
        "endTime": "20:30"
      }]'::jsonb,
      '[{
        "localDate": "2030-01-07",
        "localStartTime": "19:00",
        "localEndTime": "20:30",
        "timezone": "Asia/Ho_Chi_Minh",
        "scheduledStartAt": "2030-01-07T12:00:00Z",
        "scheduledEndAt": "2030-01-07T13:30:00Z",
        "slotIndex": 0,
        "occurrenceKey": "2030-01-07|1|19:00|20:30"
      }]'::jsonb
    );
  $$,
  'Authenticated owner can create a valid schedule'
);

-- 2. Exactly one schedule was committed.
SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_schedules
    WHERE task_id =
      'c2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Exactly one schedule created'
);

-- 3. Exactly one weekly slot exists.
SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_schedule_slots
    WHERE schedule_id = (
      SELECT id FROM public.task_study_schedules
      WHERE task_id =
        'c2000000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'Exactly one schedule slot created'
);

-- 4. Exactly one occurrence exists.
SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_sessions
    WHERE task_id =
      'c2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Exactly one study session created'
);

-- 5. Initial revision exists.
SELECT is(
  (
    SELECT count(*)
    FROM public.task_study_schedule_revisions
    WHERE schedule_id = (
      SELECT id FROM public.task_study_schedules
      WHERE task_id =
        'c2000000-0000-4000-8000-000000000001'
    )
    AND revision = 1
  ),
  1::bigint,
  'Initial revision created atomically'
);

-- 6. Recreating the same schedule fails.
SELECT throws_ok(
  $$
    SELECT public.ls_create_schedule(
      'c2000000-0000-4000-8000-000000000001',
      '2030-01-07', '2030-01-07',
      'Asia/Ho_Chi_Minh',
      '[{"weekday":1,"startTime":"19:00","endTime":"20:30"}]'::jsonb,
      '[{
        "localDate":"2030-01-07",
        "localStartTime":"19:00",
        "localEndTime":"20:30",
        "timezone":"Asia/Ho_Chi_Minh",
        "scheduledStartAt":"2030-01-07T12:00:00Z",
        "scheduledEndAt":"2030-01-07T13:30:00Z",
        "slotIndex":0,
        "occurrenceKey":"2030-01-07|1|19:00|20:30"
      }]'::jsonb
    );
  $$,
  '23505',
  NULL,
  'Duplicate schedule creation is rejected'
);

-- 7. A cannot schedule B's Task.
SELECT throws_ok(
  $$
    SELECT public.ls_create_schedule(
      'c2000000-0000-4000-8000-000000000002',
      '2030-01-07', '2030-01-07',
      'Asia/Ho_Chi_Minh',
      '[{"weekday":1,"startTime":"19:00","endTime":"20:30"}]'::jsonb,
      '[]'::jsonb
    );
  $$,
  '22023',
  NULL,
  'Cross-owner Task scheduling is rejected'
);

-- 8. Forged UTC instant must be rejected.
SELECT throws_ok(
  $$
    SELECT public.ls_create_schedule(
      'c2000000-0000-4000-8000-000000000003',
      '2030-01-07', '2030-01-07',
      'Asia/Ho_Chi_Minh',
      '[{"weekday":1,"startTime":"19:00","endTime":"20:30"}]'::jsonb,
      '[{
        "localDate":"2030-01-07",
        "localStartTime":"19:00",
        "localEndTime":"20:30",
        "timezone":"Asia/Ho_Chi_Minh",
        "scheduledStartAt":"2030-01-07T13:00:00Z",
        "scheduledEndAt":"2030-01-07T13:30:00Z",
        "slotIndex":0,
        "occurrenceKey":"2030-01-07|1|19:00|20:30"
      }]'::jsonb
    );
  $$,
  '22023',
  NULL,
  'Forged UTC instant is rejected'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
