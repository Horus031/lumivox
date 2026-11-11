BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(18);

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('11c40000-0000-4000-8000-000000000001', 'reconsent-a@example.invalid', clock_timestamp()),
  ('11c40000-0000-4000-8000-000000000002', 'reconsent-b@example.invalid', clock_timestamp());
CREATE FUNCTION pg_temp.set_reminders(p_enabled boolean) RETURNS boolean
LANGUAGE sql AS $$
  SELECT (public.ls_set_study_notification_preferences(p_enabled)).study_email_enabled;
$$;

SELECT set_config('request.jwt.claim.sub', '11c40000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.set_reminders(true), 'owner opts in through the Settings RPC');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.ls_notification_issue_unsubscribe_token(
  '11c40000-0000-4000-8000-000000000001', 'reconsent-a@example.invalid', repeat('a', 64), repeat('1', 64));
SELECT public.ls_notification_issue_unsubscribe_token(
  '11c40000-0000-4000-8000-000000000002', 'reconsent-b@example.invalid', repeat('b', 64), repeat('2', 64));
RESET ROLE;

INSERT INTO public.tasks (id, user_id, title, status)
VALUES ('11c40000-0000-4000-8000-000000000010', auth.uid(), 'Re-consent fixture', 'todo');
INSERT INTO public.task_study_schedules (id, user_id, task_id, starts_on, ends_on, timezone)
VALUES ('11c40000-0000-4000-8000-000000000020', auth.uid(), '11c40000-0000-4000-8000-000000000010',
  current_date + 2, current_date + 2, 'UTC');
INSERT INTO public.task_study_sessions (id, user_id, task_id, schedule_id, schedule_revision,
  logical_occurrence_key, local_date, local_start_time, local_end_time, timezone, scheduled_start_at, scheduled_end_at)
VALUES ('11c40000-0000-4000-8000-000000000030', auth.uid(), '11c40000-0000-4000-8000-000000000010',
  '11c40000-0000-4000-8000-000000000020', 1, 'reconsent', current_date + 2, '10:00', '11:00', 'UTC',
  (current_date + 2 + time '10:00') AT TIME ZONE 'UTC', (current_date + 2 + time '11:00') AT TIME ZONE 'UTC');
CREATE TEMP TABLE reconsent_original_job AS SELECT id FROM study_notification_jobs WHERE user_id = auth.uid();

SET LOCAL ROLE authenticated;
SELECT ok(NOT pg_temp.set_reminders(false), 'owner opts out through Settings');
RESET ROLE;
SELECT is((SELECT status FROM study_notification_jobs WHERE user_id = auth.uid()), 'suppressed', 'opt-out suppresses the job');
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.set_reminders(true), 'owner opts in again through Settings');
RESET ROLE;
CREATE TEMP TABLE reconsent_preferences AS
SELECT study_email_enabled, consented_at, updated_at FROM study_notification_preferences WHERE user_id = auth.uid();

SET LOCAL ROLE service_role;
SELECT ok(NOT public.ls_notification_consume_unsubscribe_token(repeat('1', 64)), 'unused token from previous consent cannot opt out');
RESET ROLE;
SELECT results_eq(
  $$SELECT study_email_enabled, consented_at, updated_at FROM study_notification_preferences WHERE user_id = auth.uid()$$,
  $$SELECT * FROM reconsent_preferences$$, 'old token leaves new consent and its timestamps unchanged');
SELECT results_eq(
  $$SELECT id, status, attempt_count FROM study_notification_jobs WHERE user_id = auth.uid()$$,
  $$SELECT id, 'pending'::text, 0 FROM reconsent_original_job$$, 'the same job stays pending with zero attempts');
SELECT ok((SELECT used_at IS NULL AND revoked_at IS NOT NULL FROM study_notification_unsubscribe_tokens WHERE token_hash = repeat('1', 64)),
  'old token is revoked without being marked used');
SELECT ok((SELECT revoked_at IS NULL FROM study_notification_unsubscribe_tokens WHERE token_hash = repeat('2', 64)),
  're-consent does not revoke another owner token');

SET LOCAL ROLE service_role;
SELECT public.ls_notification_issue_unsubscribe_token(
  '11c40000-0000-4000-8000-000000000001', 'reconsent-a@example.invalid', repeat('a', 64), repeat('3', 64));
SELECT public.ls_notification_issue_unsubscribe_token(
  '11c40000-0000-4000-8000-000000000001', 'reconsent-a@example.invalid', repeat('a', 64), repeat('4', 64));
RESET ROLE;
UPDATE study_notification_unsubscribe_tokens SET created_at = clock_timestamp() - interval '1 day'
WHERE token_hash = repeat('3', 64);
SET LOCAL ROLE service_role;
SELECT ok(NOT public.ls_notification_consume_unsubscribe_token(repeat('3', 64)), 'pre-migration stale token is denied');
RESET ROLE;
SELECT ok((SELECT used_at IS NULL AND revoked_at IS NOT NULL FROM study_notification_unsubscribe_tokens WHERE token_hash = repeat('3', 64)),
  'historical stale token is revoked on use');

SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.set_reminders(true), 'saving already-enabled preferences succeeds');
RESET ROLE;
SELECT ok((SELECT revoked_at IS NULL FROM study_notification_unsubscribe_tokens WHERE token_hash = repeat('4', 64)),
  'saving already-enabled preferences keeps the current token');
SET LOCAL ROLE service_role;
SELECT ok(public.ls_notification_consume_unsubscribe_token(repeat('4', 64)), 'current token can still opt out');
RESET ROLE;
SELECT ok(NOT (SELECT study_email_enabled FROM study_notification_preferences WHERE user_id = auth.uid()),
  'current token disables email reminders');
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.set_reminders(true), 'owner can re-consent after using a current token');
RESET ROLE;
TRUNCATE reconsent_preferences;
INSERT INTO reconsent_preferences
SELECT study_email_enabled, consented_at, updated_at FROM study_notification_preferences WHERE user_id = auth.uid();
SET LOCAL ROLE service_role;
SELECT ok(public.ls_notification_consume_unsubscribe_token(repeat('4', 64)), 'used token replay remains idempotent');
RESET ROLE;
SELECT results_eq(
  $$SELECT study_email_enabled, consented_at, updated_at FROM study_notification_preferences WHERE user_id = auth.uid()$$,
  $$SELECT * FROM reconsent_preferences$$, 'used replay leaves later consent and timestamps intact');

SELECT * FROM finish();
ROLLBACK;
