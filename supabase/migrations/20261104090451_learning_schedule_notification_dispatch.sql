-- Phase 7C: trusted fake dispatcher only. No network, Cron or default gate change.
-- attempt_count counts successful CLAIMS (including pre-handoff crashes).
-- Delivery rows count durable handoffs; gaps in attempt_number are intentional.
ALTER TABLE public.study_notification_deliveries
  ADD COLUMN handoff_token uuid,
  ADD COLUMN outcome_fingerprint text;
CREATE INDEX study_notification_expired_leases_idx
  ON public.study_notification_jobs(lease_until,user_id) WHERE status='leased';
COMMENT ON COLUMN public.study_notification_deliveries.handoff_token IS
  'Internal claim token at durable handoff. Never exposed by browser column grants.';
COMMENT ON COLUMN public.study_notification_jobs.attempt_count IS
  'Claim count, capped at 3 by dispatcher. Delivery rows count actual handoffs; pre-handoff crashes consume a claim.';

-- Even a quiet-hours-only save must serialize against the handoff decision.
-- It does not need to scan/replan jobs, but cannot bypass the owner gate.
CREATE OR REPLACE FUNCTION public.ls_notification_preferences_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.ls_notification_lock_owner(NEW.user_id);
  IF TG_OP='UPDATE' AND NEW.study_email_enabled AND
    ROW(OLD.study_email_enabled,OLD.lead_minutes,OLD.consented_at) IS NOT DISTINCT FROM
    ROW(NEW.study_email_enabled,NEW.lead_minutes,NEW.consented_at) THEN RETURN NEW; END IF;
  PERFORM public.ls_reconcile_study_notifications(NEW.user_id); RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ls_notification_preferences_changed() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ls_notification_in_quiet_hours(
  p_enabled boolean,p_start time,p_end time,p_timezone text,p_as_of timestamptz
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_time time;
BEGIN
  IF NOT coalesce(p_enabled,false) THEN RETURN false; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start=p_end OR p_as_of IS NULL OR NOT isfinite(p_as_of)
    OR p_timezone IS NULL THEN RAISE EXCEPTION 'Invalid quiet-hours policy' USING ERRCODE='22023'; END IF;
  v_time:=(p_as_of AT TIME ZONE p_timezone)::time;
  RETURN CASE WHEN p_start<p_end THEN v_time>=p_start AND v_time<p_end
    ELSE v_time>=p_start OR v_time<p_end END;
END;
$$;

CREATE FUNCTION public.ls_notification_claim_batch(p_batch_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; j public.study_notification_jobs; v_now timestamptz; v_start timestamptz;
  v_token uuid; v_result jsonb:='[]';
BEGIN
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Batch size must be 1..25' USING ERRCODE='22023'; END IF;
  -- Short shared control lock serializes gate-OFF against claim/handoff commits.
  PERFORM 1 FROM public.study_notification_dispatch_control WHERE singleton AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN v_result; END IF;
  -- Bounded discovery without Job locks. Never wait for an owner while holding
  -- a Job lock; try owner gates in stable order, then SKIP LOCKED Jobs.
  FOR v_owner IN SELECT DISTINCT c.user_id FROM (
    SELECT user_id FROM public.study_notification_jobs
    WHERE status='pending' AND due_at<=clock_timestamp() AND next_attempt_at<=clock_timestamp()
    ORDER BY next_attempt_at,due_at,id LIMIT 250) c ORDER BY c.user_id
  LOOP
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ls-notification:'||v_owner::text,0)) THEN CONTINUE; END IF;
    FOR j IN SELECT * FROM public.study_notification_jobs
      WHERE user_id=v_owner AND status='pending' AND due_at<=clock_timestamp() AND next_attempt_at<=clock_timestamp()
      ORDER BY next_attempt_at,due_at,id LIMIT 25 FOR UPDATE SKIP LOCKED
    LOOP
      v_now:=clock_timestamp();
      SELECT scheduled_start_at INTO v_start FROM public.task_study_sessions WHERE id=j.session_id;
      IF v_start IS NULL OR v_start<=v_now THEN
        UPDATE public.study_notification_jobs SET status='expired' WHERE id=j.id; CONTINUE;
      END IF;
      IF NOT public.ls_study_notification_job_is_current(j.id) THEN
        UPDATE public.study_notification_jobs SET status='suppressed' WHERE id=j.id; CONTINUE;
      END IF;
      IF j.attempt_count>=3 THEN
        UPDATE public.study_notification_jobs SET status='failed' WHERE id=j.id; CONTINUE;
      END IF;
      v_token:=gen_random_uuid();
      UPDATE public.study_notification_jobs SET status='leased',lease_token=v_token,
        lease_until=v_now+interval '60 seconds',attempt_count=attempt_count+1 WHERE id=j.id;
      v_result:=v_result||jsonb_build_array(jsonb_build_object('jobId',j.id,'leaseToken',v_token));
      IF jsonb_array_length(v_result)>=p_batch_size THEN RETURN v_result; END IF;
    END LOOP;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.ls_notification_authorize_attempt(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; j public.study_notification_jobs; p public.study_notification_preferences;
  v_now timestamptz; v_start timestamptz; v_verified boolean; v_reason text;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL THEN RAISE EXCEPTION 'Job and token required' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.study_notification_dispatch_control WHERE singleton AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('authorized',false,'reason','dispatch_off'); END IF;
  SELECT user_id INTO v_owner FROM public.study_notification_jobs WHERE id=p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired lease' USING ERRCODE='PT409'; END IF;
  PERFORM public.ls_notification_lock_owner(v_owner);
  SELECT * INTO j FROM public.study_notification_jobs WHERE id=p_job_id FOR UPDATE;
  v_now:=clock_timestamp();
  IF j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_until<=v_now THEN
    RAISE EXCEPTION 'Invalid or expired lease' USING ERRCODE='PT409'; END IF;
  -- An authorization replay must NOT return a second submission capability.
  IF EXISTS(SELECT 1 FROM public.study_notification_deliveries WHERE job_id=j.id AND attempt_number=j.attempt_count) THEN
    RETURN jsonb_build_object('authorized',false,'reason','handoff_already_started'); END IF;
  SELECT scheduled_start_at INTO v_start FROM public.task_study_sessions WHERE id=j.session_id;
  SELECT * INTO p FROM public.study_notification_preferences WHERE user_id=v_owner;
  -- SHARE (not KEY SHARE) also fences non-key verification/email updates until
  -- handoff commit. NOWAIT avoids reverse waits against Auth account changes.
  PERFORM 1 FROM auth.users WHERE id=v_owner FOR SHARE NOWAIT;
  SELECT email IS NOT NULL AND btrim(email)<>'' AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until<=v_now) INTO v_verified FROM auth.users WHERE id=v_owner;
  IF v_start IS NULL OR v_start<=v_now THEN v_reason:='expired';
  ELSIF j.due_at>v_now OR NOT public.ls_study_notification_job_is_current(j.id) THEN v_reason:='stale_or_cancelled';
  ELSIF NOT coalesce(v_verified,false) THEN v_reason:='unverified_destination';
  ELSIF public.ls_notification_in_quiet_hours(p.quiet_hours_enabled,p.quiet_start_local,p.quiet_end_local,p.timezone,v_now) THEN v_reason:='quiet_hours';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.study_notification_jobs SET status=CASE WHEN v_reason='expired' THEN 'expired' ELSE 'suppressed' END,
      lease_token=NULL,lease_until=NULL WHERE id=j.id;
    RETURN jsonb_build_object('authorized',false,'reason',v_reason);
  END IF;
  INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,status,handoff_token)
    VALUES(j.id,j.user_id,j.attempt_count,'submitting',p_lease_token);
  -- COMMIT of this function's transaction is the durable handoff boundary.
  -- Provider is called AFTER commit. Cancellation after this boundary cannot
  -- promise recall; record the real outcome even if consent/gate changes later.
  RETURN jsonb_build_object('authorized',true,'request',jsonb_build_object('jobId',j.id,
    'attemptNumber',j.attempt_count,'idempotencyKey',j.idempotency_key,'locale','en','sessionStartAt',v_start));
END;
$$;

CREATE FUNCTION public.ls_notification_record_fake_outcome(p_job_id uuid,p_lease_token uuid,p_outcome jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; j public.study_notification_jobs; d public.study_notification_deliveries;
  v_kind text:=p_outcome->>'kind'; v_code text:=p_outcome->>'code'; v_fingerprint text;
  v_status text; v_now timestamptz; v_start timestamptz; v_delay integer; v_retry integer;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL OR jsonb_typeof(p_outcome) IS DISTINCT FROM 'object'
    OR v_kind IS NULL OR v_kind NOT IN('accepted','transient','permanent','uncertain') THEN
    RAISE EXCEPTION 'Invalid fake outcome' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_outcome) k WHERE k NOT IN('kind','messageId','code','retryAfterMs'))
    OR (v_kind='accepted' AND (jsonb_typeof(p_outcome->'messageId') IS DISTINCT FROM 'string'
      OR length(btrim(p_outcome->>'messageId')) NOT BETWEEN 1 AND 256 OR p_outcome ? 'code' OR p_outcome ? 'retryAfterMs'))
    OR (v_kind<>'accepted' AND (jsonb_typeof(p_outcome->'code') IS DISTINCT FROM 'string' OR p_outcome ? 'messageId'))
    OR (v_kind='transient' AND v_code NOT IN('rate_limited','server_error'))
    OR (v_kind='permanent' AND v_code NOT IN('invalid_recipient','rejected'))
    OR (v_kind='uncertain' AND v_code NOT IN('response_lost','timeout'))
    OR (v_kind<>'transient' AND p_outcome ? 'retryAfterMs') THEN
    RAISE EXCEPTION 'Invalid fake outcome' USING ERRCODE='22023'; END IF;
  IF p_outcome ? 'retryAfterMs' THEN
    IF jsonb_typeof(p_outcome->'retryAfterMs') IS DISTINCT FROM 'number'
      OR (p_outcome->>'retryAfterMs')::numeric NOT BETWEEN 0 AND 120000
      OR trunc((p_outcome->>'retryAfterMs')::numeric)<>(p_outcome->>'retryAfterMs')::numeric THEN
      RAISE EXCEPTION 'Invalid retry delay' USING ERRCODE='22023'; END IF;
    v_retry:=(p_outcome->>'retryAfterMs')::integer;
  END IF;
  v_fingerprint:=md5(p_outcome::text);
  SELECT user_id INTO v_owner FROM public.study_notification_jobs WHERE id=p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid handoff token' USING ERRCODE='PT409'; END IF;
  PERFORM public.ls_notification_lock_owner(v_owner);
  SELECT * INTO j FROM public.study_notification_jobs WHERE id=p_job_id FOR UPDATE;
  SELECT * INTO d FROM public.study_notification_deliveries WHERE job_id=j.id AND handoff_token=p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid handoff token' USING ERRCODE='PT409'; END IF;
  IF d.outcome_fingerprint IS NOT NULL THEN
    IF d.outcome_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'Outcome replay mismatch' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('status',j.status,'replay',true);
  END IF;
  IF j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_lease_token OR d.status<>'submitting' THEN
    RAISE EXCEPTION 'Handoff requires reconciliation' USING ERRCODE='PT409'; END IF;
  -- An expired but unreconciled owner can still report its durable outcome;
  -- reconciliation clears ownership, after which late results require review.
  v_now:=clock_timestamp();
  SELECT scheduled_start_at INTO v_start FROM public.task_study_sessions WHERE id=j.session_id;
  IF v_kind='accepted' THEN v_status:='sent';
  ELSIF v_kind IN('permanent','uncertain') THEN v_status:='failed';
  ELSIF v_start IS NULL OR v_start<=v_now THEN v_status:='expired';
  ELSIF NOT (SELECT coalesce(p.eligible,false) AND j.cancel_requested_at IS NULL
     AND j.lifecycle_fingerprint=p.fingerprint AND j.due_at=p.due_at
     FROM public.ls_notification_session_policy(j.session_id) p) THEN v_status:='suppressed';
  ELSIF j.attempt_count>=3 THEN v_status:='failed';
  ELSE
    v_delay:=least(120000,greatest(coalesce(v_retry,0),15000*(2^(j.attempt_count-1))::integer
      + ((hashtextextended(j.id::text||':'||j.attempt_count::text,0)&2147483647)%3001)::integer));
    IF v_now+v_delay*interval '1 millisecond'>=v_start THEN v_status:='expired'; ELSE v_status:='pending'; END IF;
  END IF;
  UPDATE public.study_notification_deliveries SET status=CASE WHEN v_kind='accepted' THEN 'accepted'
    WHEN v_kind='uncertain' THEN 'uncertain' ELSE 'failed' END,
    provider_message_id=CASE WHEN v_kind='accepted' THEN p_outcome->>'messageId' END,
    error_code=CASE WHEN v_kind<>'accepted' THEN v_kind||':'||v_code END,outcome_fingerprint=v_fingerprint WHERE id=d.id;
  UPDATE public.study_notification_jobs SET status=v_status,lease_token=NULL,lease_until=NULL,
    next_attempt_at=CASE WHEN v_status='pending' THEN v_now+v_delay*interval '1 millisecond' ELSE next_attempt_at END WHERE id=j.id;
  RETURN jsonb_build_object('status',v_status,'replay',false);
END;
$$;

CREATE FUNCTION public.ls_notification_reconcile_expired_leases(p_batch_size integer DEFAULT 25)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; j public.study_notification_jobs; v_status text; v_start timestamptz;
  v_now timestamptz; v_count integer:=0; v_delivery text;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Batch size must be 1..25' USING ERRCODE='22023'; END IF;
  FOR v_owner IN SELECT DISTINCT c.user_id FROM (SELECT user_id FROM public.study_notification_jobs
    WHERE status='leased' AND lease_until<=clock_timestamp() ORDER BY lease_until,id LIMIT 250) c ORDER BY c.user_id
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('ls-notification:'||v_owner::text,0)) THEN CONTINUE; END IF;
    FOR j IN SELECT * FROM public.study_notification_jobs WHERE user_id=v_owner AND status='leased'
      AND lease_until<=clock_timestamp() ORDER BY lease_until,id LIMIT 25 FOR UPDATE SKIP LOCKED
    LOOP
      v_now:=clock_timestamp();
      SELECT status INTO v_delivery FROM public.study_notification_deliveries
        WHERE job_id=j.id AND attempt_number=j.attempt_count FOR UPDATE;
      IF v_delivery IN('submitting','uncertain') THEN
        UPDATE public.study_notification_deliveries SET status='uncertain',error_code=coalesce(error_code,'lease_expired_after_handoff')
          WHERE job_id=j.id AND attempt_number=j.attempt_count;
        v_status:='failed'; -- controlled/manual reconciliation, never blind retry
      ELSIF v_delivery IN('accepted','delivered','bounced','complained') THEN v_status:='sent';
      ELSE
        SELECT scheduled_start_at INTO v_start FROM public.task_study_sessions WHERE id=j.session_id;
        IF v_start IS NULL OR v_start<=v_now THEN v_status:='expired';
        ELSIF NOT public.ls_study_notification_job_is_current(j.id) THEN v_status:='suppressed';
        ELSIF j.attempt_count>=3 THEN v_status:='failed'; ELSE v_status:='pending'; END IF;
      END IF;
      UPDATE public.study_notification_jobs SET status=v_status,lease_token=NULL,lease_until=NULL,
        next_attempt_at=CASE WHEN v_status='pending' THEN v_now ELSE next_attempt_at END WHERE id=j.id;
      v_count:=v_count+1;
      IF v_count>=p_batch_size THEN RETURN v_count; END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.ls_notification_dispatch_stats() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('gateEnabled',(SELECT enabled FROM public.study_notification_dispatch_control WHERE singleton),
   'jobs',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.study_notification_jobs GROUP BY status) x),'{}'),
   'uncertainAttempts',(SELECT count(*) FROM public.study_notification_deliveries WHERE status='uncertain'),
   'expiredLeases',(SELECT count(*) FROM public.study_notification_jobs WHERE status='leased' AND lease_until<=statement_timestamp()));
$$;
REVOKE ALL ON FUNCTION public.ls_notification_in_quiet_hours(boolean,time,time,text,timestamptz),
 public.ls_notification_claim_batch(integer),public.ls_notification_authorize_attempt(uuid,uuid),
 public.ls_notification_record_fake_outcome(uuid,uuid,jsonb),public.ls_notification_reconcile_expired_leases(integer),
 public.ls_notification_dispatch_stats() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_in_quiet_hours(boolean,time,time,text,timestamptz),
 public.ls_notification_claim_batch(integer),public.ls_notification_authorize_attempt(uuid,uuid),
 public.ls_notification_record_fake_outcome(uuid,uuid,jsonb),public.ls_notification_reconcile_expired_leases(integer),
 public.ls_notification_dispatch_stats() TO service_role;
NOTIFY pgrst,'reload schema';
