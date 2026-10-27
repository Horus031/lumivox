-- Run only against an isolated LOCAL Supabase database:
-- npx supabase test db
-- All fixtures are rolled back even when assertions pass.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(7);

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
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
