BEGIN;

-- Keep diagnostic reads off historical rows where the existing claim and
-- correlation indexes cannot satisfy the snapshot predicates/order.
CREATE INDEX ls_ops_pending_due_idx ON public.study_notification_jobs(due_at)
  INCLUDE (next_attempt_at) WHERE status = 'pending';
CREATE INDEX ls_ops_unmatched_age_idx ON public.study_notification_webhook_receipts(created_at)
  WHERE processing_status = 'unmatched';
CREATE INDEX ls_ops_uncertain_idx ON public.study_notification_deliveries(id)
  WHERE status = 'uncertain';
CREATE INDEX ls_ops_accepted_idx ON public.study_notification_deliveries(provider_accepted_at)
  WHERE provider = 'resend' AND provider_accepted_at IS NOT NULL;
CREATE INDEX ls_ops_failure_idx ON public.study_notification_deliveries(updated_at)
  WHERE provider = 'resend' AND status IN ('failed', 'bounced', 'complained');

-- PostgREST hoists statement_timeout before executing the RPC. The existing
-- authenticator timeout remains a fallback for installations without hoisting.
CREATE FUNCTION public.ls_learning_schedule_operational_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = '' SET statement_timeout = '2s' SET lock_timeout = '500ms'
AS $$
DECLARE
  at_time timestamptz := statement_timestamp();
  dispatch_enabled boolean;
  sweep_enabled boolean;
  result jsonb;
BEGIN
  SELECT enabled INTO STRICT dispatch_enabled FROM public.study_notification_dispatch_control WHERE singleton;
  SELECT enabled INTO STRICT sweep_enabled FROM public.ls_missed_sweep_control WHERE singleton;

  WITH due AS (
    SELECT count(*) AS n, min(due_at) AS oldest FROM (
      SELECT due_at FROM public.study_notification_jobs
      WHERE status = 'pending' AND due_at <= at_time AND next_attempt_at <= at_time
      ORDER BY due_at LIMIT 1001
    ) jobs
  ), unmatched AS (
    SELECT count(*) AS n, min(created_at) AS oldest FROM (
      SELECT created_at FROM public.study_notification_webhook_receipts
      WHERE processing_status = 'unmatched' AND created_at <= at_time
      ORDER BY created_at LIMIT 1001
    ) receipts
  ), counts AS (
    SELECT
      (SELECT count(*) FROM (SELECT 1 FROM public.study_notification_jobs
        WHERE status = 'leased' AND lease_until > at_time LIMIT 1001) x) AS active,
      (SELECT count(*) FROM (SELECT 1 FROM public.study_notification_jobs
        WHERE status = 'leased' AND lease_until <= at_time LIMIT 1001) x) AS expired,
      (SELECT count(*) FROM (SELECT 1 FROM public.study_notification_deliveries
        WHERE status = 'uncertain' LIMIT 1001) x) AS uncertain,
      (SELECT count(*) FROM (SELECT 1 FROM public.study_notification_deliveries
        WHERE provider = 'resend' AND provider_accepted_at > at_time - interval '24 hours'
          AND provider_accepted_at <= at_time LIMIT 1001) x) AS accepted,
      (SELECT count(*) FROM (SELECT 1 FROM public.study_notification_deliveries
        WHERE provider = 'resend' AND status IN ('failed', 'bounced', 'complained')
          AND updated_at > at_time - interval '24 hours' AND updated_at <= at_time LIMIT 1001) x) AS failures,
      (SELECT count(*) FROM (
        SELECT 1 FROM public.task_study_sessions s
        JOIN public.tasks t ON t.id = s.task_id AND t.user_id = s.user_id
        JOIN public.task_study_schedules sc ON sc.id = s.schedule_id AND sc.user_id = s.user_id
        WHERE s.status = 'scheduled' AND s.scheduled_end_at <= at_time - interval '60 minutes'
          AND t.parent_task_id IS NULL AND t.status IN ('todo', 'in_progress') AND sc.status = 'active'
        LIMIT 1001
      ) x) AS sweep,
      (SELECT count(*) FROM (SELECT 1 FROM public.focus_sessions
        WHERE status IN ('ongoing', 'paused') LIMIT 1001) x) AS focus
  )
  SELECT jsonb_build_object(
    'generatedAt', at_time,
    'dispatch', jsonb_build_object(
      'enabled', dispatch_enabled, 'pendingDue', due.n,
      'oldestDueAgeSeconds', floor(extract(epoch FROM at_time - due.oldest)),
      'activeLeases', c.active, 'expiredLeases', c.expired, 'uncertainAttempts', c.uncertain,
      'unmatchedWebhooks', unmatched.n,
      'oldestUnmatchedAgeSeconds', floor(extract(epoch FROM at_time - unmatched.oldest)),
      'acceptedSubmissions24h', c.accepted, 'deliveryFailures24h', c.failures
    ),
    'missedSweep', jsonb_build_object('enabled', sweep_enabled, 'eligibleBacklog', c.sweep),
    'focus', jsonb_build_object('activeSessions', c.focus),
    'capped', to_jsonb(array_remove(ARRAY[
      CASE WHEN due.n = 1001 THEN 'pendingDue' END,
      CASE WHEN c.active = 1001 THEN 'activeLeases' END,
      CASE WHEN c.expired = 1001 THEN 'expiredLeases' END,
      CASE WHEN c.uncertain = 1001 THEN 'uncertainAttempts' END,
      CASE WHEN unmatched.n = 1001 THEN 'unmatchedWebhooks' END,
      CASE WHEN c.accepted = 1001 THEN 'acceptedSubmissions24h' END,
      CASE WHEN c.failures = 1001 THEN 'deliveryFailures24h' END,
      CASE WHEN c.sweep = 1001 THEN 'eligibleBacklog' END,
      CASE WHEN c.focus = 1001 THEN 'activeSessions' END
    ], NULL))
  ) INTO result FROM due CROSS JOIN unmatched CROSS JOIN counts c;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.ls_learning_schedule_operational_snapshot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ls_learning_schedule_operational_snapshot() TO service_role;
COMMIT;
