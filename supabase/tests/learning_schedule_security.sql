-- Run only against an isolated LOCAL Supabase database:
-- psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f this-file.sql
-- All fixtures are rolled back even when assertions pass.
\set ON_ERROR_STOP on
BEGIN;

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
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.task_study_sessions'::regclass) THEN
    RAISE EXCEPTION 'RLS not enabled on task_study_sessions';
  END IF;
  BEGIN
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES ('a1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',1,'08:00','09:00');
    RAISE EXCEPTION 'Cross-owner slot insert unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES ('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'20:00','19:00');
    RAISE EXCEPTION 'Invalid time range unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES ('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',1,'19:00','20:30');
    RAISE EXCEPTION 'Duplicate slot unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- Test as a real authenticated SQL role with a signed-in user's claim.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE own_rows int; other_rows int;
BEGIN
  SELECT count(*) INTO own_rows FROM public.task_study_sessions WHERE user_id='a1000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO other_rows FROM public.task_study_sessions WHERE user_id='b1000000-0000-4000-8000-000000000002';
  IF own_rows<>1 OR other_rows<>0 THEN RAISE EXCEPTION 'RLS isolation failed: own %, other %',own_rows,other_rows; END IF;
  BEGIN
    UPDATE public.task_study_sessions SET status='missed' WHERE id='a5000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Direct authenticated write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'PASS: ownership FK, constraints, RLS read isolation and write revocation'; END $$;
ROLLBACK;
