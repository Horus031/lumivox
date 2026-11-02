-- LOCAL ONLY: persistent fixture for independent, multi-connection tests.
-- Opt in explicitly so automatic pgTAP discovery cannot commit fixtures.
-- psql "$DB_URL" -v ON_ERROR_STOP=1 -v LS_CONCURRENCY_SETUP=1 -f this-file.sql
\if :{?LS_CONCURRENCY_SETUP}
BEGIN;
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) VALUES (
  'd1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ls-concurrency@example.invalid',
  '', now(), now(), now()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id)
VALUES ('d1000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.tasks(id,user_id,title,status) VALUES (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'Concurrency create-versus-close', 'todo'
);
COMMIT;
\else
SELECT '1..0 # SKIP persistent concurrency fixture; run the local Node harness';
\endif
