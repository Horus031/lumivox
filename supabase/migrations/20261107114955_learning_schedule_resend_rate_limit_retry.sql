BEGIN;

-- This command represents confirmed non-acceptance for the one allowlisted
-- transient outcome. All other outcomes retain the existing contract.
CREATE FUNCTION public.ls_notification_record_resend_rate_limit(
  p_delivery_id uuid, p_handoff_token uuid, p_payload_fingerprint text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  d public.study_notification_deliveries;
  j public.study_notification_jobs;
  retry_at timestamptz;
  starts_at timestamptz;
  job_status text;
BEGIN
  SELECT * INTO d FROM public.study_notification_deliveries WHERE id = p_delivery_id AND provider = 'resend';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Resend handoff' USING ERRCODE = 'PT409'; END IF;

  PERFORM public.ls_notification_lock_owner(d.user_id);
  SELECT * INTO j FROM public.study_notification_jobs WHERE id = d.job_id FOR UPDATE;
  SELECT * INTO d FROM public.study_notification_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR p_handoff_token IS NULL OR d.handoff_token IS DISTINCT FROM p_handoff_token
    OR p_payload_fingerprint IS NULL OR d.provider_payload_fingerprint IS DISTINCT FROM p_payload_fingerprint THEN
    RAISE EXCEPTION 'Invalid Resend handoff' USING ERRCODE = 'PT409';
  END IF;
  IF d.outcome_fingerprint = 'rate_limited:' THEN RETURN; END IF;
  IF d.status <> 'submitting' OR d.outcome_fingerprint IS NOT NULL
    OR j.status IS DISTINCT FROM 'leased' OR j.lease_token IS DISTINCT FROM p_handoff_token
    OR j.attempt_count <> d.attempt_number THEN
    RAISE EXCEPTION 'Resend handoff is no longer submitting' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.study_notification_deliveries
    SET status = 'failed', error_code = 'rate_limited', outcome_fingerprint = 'rate_limited:'
    WHERE id = d.id;

  retry_at := clock_timestamp() + interval '30 seconds';
  SELECT scheduled_start_at INTO starts_at FROM public.task_study_sessions WHERE id = j.session_id;
  IF starts_at IS NULL OR retry_at >= starts_at THEN
    job_status := 'expired';
  ELSIF NOT public.ls_study_notification_job_is_current(j.id) THEN
    job_status := 'suppressed';
  ELSIF j.attempt_count >= 3 THEN
    job_status := 'failed';
  ELSE
    job_status := 'pending';
  END IF;
  UPDATE public.study_notification_jobs SET status = job_status, lease_token = NULL, lease_until = NULL,
    next_attempt_at = CASE WHEN job_status = 'pending' THEN retry_at ELSE next_attempt_at END
    WHERE id = j.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ls_notification_record_resend_rate_limit(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ls_notification_record_resend_rate_limit(uuid, uuid, text) TO service_role;
COMMIT;
