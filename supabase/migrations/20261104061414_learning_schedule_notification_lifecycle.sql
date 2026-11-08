-- Phase 07B. No provider/network/Cron. Existing parent lock order is preserved.
-- Session/Task/Schedule mutations hold their original parent locks, then the
-- owner advisory gate, then Job locks. Consent holds its preference row + gate,
-- but NEVER waits for Task/Session row locks. New FK locks are KEY SHARE NOWAIT.
ALTER TABLE public.study_notification_jobs
  ADD COLUMN lifecycle_fingerprint text,
  ADD COLUMN cancel_requested_at timestamptz;
CREATE INDEX study_notification_jobs_active_owner_idx ON public.study_notification_jobs(user_id,session_id)
  WHERE status IN ('pending','leased');
CREATE INDEX ls_notification_future_sessions_idx ON public.task_study_sessions(user_id,scheduled_start_at,id)
  WHERE status='scheduled';
COMMENT ON COLUMN public.study_notification_jobs.cancel_requested_at IS
  'Cancellation fence. Leased status/token remain intact; this is NOT proof that a provider submission was recalled.';

CREATE FUNCTION public.ls_notification_lock_owner(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ls-notification:'||p_user_id::text,0));
  END IF;
END;
$$;
CREATE FUNCTION public.ls_notification_session_policy(p_session_id uuid)
RETURNS TABLE(user_id uuid, generation integer, starts_at timestamptz, due_at timestamptz, eligible boolean, fingerprint text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.user_id,s.schedule_revision,s.scheduled_start_at,
   s.scheduled_start_at - pg_catalog.make_interval(mins=>coalesce(p.lead_minutes,15)),
   coalesce(p.study_email_enabled AND p.consented_at IS NOT NULL AND p.lead_minutes IN(5,15,30,60)
    AND coalesce(o.enabled,true) AND t.status::text IN('todo','in_progress') AND t.parent_task_id IS NULL
    AND sc.status='active' AND sc.revision=s.schedule_revision AND s.status='scheduled',false),
   pg_catalog.md5(pg_catalog.jsonb_build_array(s.id,s.user_id,s.schedule_id,s.schedule_revision,
    extract(epoch FROM s.scheduled_start_at),extract(epoch FROM s.scheduled_end_at),p.lead_minutes,
    extract(epoch FROM p.consented_at))::text)
 FROM public.task_study_sessions s
 JOIN public.tasks t ON t.id=s.task_id AND t.user_id=s.user_id
 JOIN public.task_study_schedules sc ON sc.id=s.schedule_id AND sc.task_id=s.task_id AND sc.user_id=s.user_id
 LEFT JOIN public.study_notification_preferences p ON p.user_id=s.user_id
 LEFT JOIN public.study_notification_task_overrides o ON o.user_id=s.user_id AND o.task_id=s.task_id
 WHERE s.id=p_session_id;
$$;
CREATE FUNCTION public.ls_sync_study_notification_for_session(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid; v_policy record; v_job public.study_notification_jobs; v_now timestamptz;
  v_attempted boolean; v_count integer;
BEGIN
  SELECT user_id INTO v_uid FROM public.task_study_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.ls_notification_lock_owner(v_uid);
  -- VOLATILE PL/pgSQL: fresh READ COMMITTED reads after a gate wait.
  SELECT * INTO v_policy FROM public.ls_notification_session_policy(p_session_id);
  IF NOT FOUND THEN RETURN; END IF;
  v_now := pg_catalog.clock_timestamp();
  SELECT * INTO v_job FROM public.study_notification_jobs
    WHERE session_id=p_session_id AND schedule_revision=v_policy.generation AND notification_type='study_reminder'
    FOR UPDATE;
  IF FOUND THEN
    IF v_job.status IN('sent','failed') THEN RETURN; END IF;
    IF v_job.status='leased' THEN
      IF NOT v_policy.eligible OR v_policy.starts_at<=v_now OR
         v_job.lifecycle_fingerprint IS DISTINCT FROM v_policy.fingerprint OR v_job.due_at<>v_policy.due_at THEN
        UPDATE public.study_notification_jobs SET cancel_requested_at=coalesce(cancel_requested_at,v_now) WHERE id=v_job.id;
      END IF;
      RETURN;
    END IF;
    -- A due-but-not-started reminder already queued under the same policy can
    -- remain pending. The future-due restriction applies to NEW/replanned jobs.
    IF v_job.status='pending' AND v_policy.eligible AND v_policy.starts_at>v_now
       AND v_job.lifecycle_fingerprint=v_policy.fingerprint AND v_job.due_at=v_policy.due_at
       AND v_job.cancel_requested_at IS NULL THEN RETURN; END IF;
    SELECT v_job.attempt_count>0 OR EXISTS(SELECT 1 FROM public.study_notification_deliveries WHERE job_id=v_job.id) INTO v_attempted;
    IF v_policy.eligible AND v_policy.starts_at>v_now AND v_policy.due_at>v_now AND NOT v_attempted THEN
      -- Explicit re-arm policy: zero attempts AND zero delivery records only.
      IF v_job.status<>'pending' THEN
        SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.study_notification_jobs
          WHERE user_id=v_uid AND status IN('pending','leased') LIMIT 5001) bounded;
        IF v_count>=5000 THEN RAISE EXCEPTION 'Notification active job limit 5000 reached; opt out or reduce active schedules and retry' USING ERRCODE='54000'; END IF;
      END IF;
      UPDATE public.study_notification_jobs SET status='pending',due_at=v_policy.due_at,next_attempt_at=v_policy.due_at,
        lifecycle_fingerprint=v_policy.fingerprint,cancel_requested_at=NULL WHERE id=v_job.id;
    ELSE
      UPDATE public.study_notification_jobs SET
        status=CASE WHEN v_policy.eligible AND (v_policy.starts_at<=v_now OR v_policy.due_at<=v_now) THEN 'expired' ELSE 'suppressed' END,
        cancel_requested_at=coalesce(cancel_requested_at,v_now) WHERE id=v_job.id;
    END IF;
    RETURN;
  END IF;
  IF NOT v_policy.eligible OR v_policy.starts_at<=v_now OR v_policy.due_at<=v_now THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.study_notification_jobs
    WHERE user_id=v_uid AND status IN('pending','leased') LIMIT 5001) bounded;
  IF v_count>=5000 THEN
    RAISE EXCEPTION 'Notification active job limit 5000 reached; opt out or reduce active schedules and retry' USING ERRCODE='54000';
  END IF;
  -- FK checks may otherwise wait for a Session FOR UPDATE held by a transaction
  -- waiting for our gate. Fail-fast + whole-transaction rollback breaks the cycle.
  PERFORM 1 FROM auth.users WHERE id=v_uid FOR KEY SHARE NOWAIT;
  PERFORM 1 FROM public.task_study_sessions WHERE id=p_session_id AND user_id=v_uid
    AND schedule_revision=v_policy.generation FOR KEY SHARE NOWAIT;
  INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,notification_type,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
  VALUES(v_uid,p_session_id,v_policy.generation,'study_reminder',v_policy.due_at,v_policy.due_at,
    'study-reminder:v1:'||p_session_id::text||':'||v_policy.generation::text,v_policy.fingerprint);
END;
$$;
CREATE FUNCTION public.ls_notification_candidates(p_user_id uuid,p_task_id uuid,p_now timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id FROM public.task_study_sessions s
 JOIN public.tasks t ON t.id=s.task_id AND t.user_id=s.user_id
 JOIN public.task_study_schedules sc ON sc.id=s.schedule_id AND sc.task_id=t.id AND sc.user_id=s.user_id
 JOIN public.study_notification_preferences p ON p.user_id=s.user_id
 LEFT JOIN public.study_notification_task_overrides o ON o.user_id=s.user_id AND o.task_id=s.task_id
 WHERE s.user_id=p_user_id AND (p_task_id IS NULL OR s.task_id=p_task_id)
   AND s.status='scheduled' AND s.scheduled_start_at>p_now
   AND s.scheduled_start_at-pg_catalog.make_interval(mins=>p.lead_minutes)>p_now
   AND p.study_email_enabled AND p.consented_at IS NOT NULL AND coalesce(o.enabled,true)
   AND t.status::text IN('todo','in_progress') AND t.parent_task_id IS NULL
   AND sc.status='active' AND sc.revision=s.schedule_revision;
$$;
CREATE FUNCTION public.ls_reconcile_study_notifications(p_user_id uuid,p_task_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_count integer; v_now timestamptz;
BEGIN
  PERFORM public.ls_notification_lock_owner(p_user_id);
  v_now:=pg_catalog.clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM public.study_notification_preferences WHERE user_id=p_user_id AND study_email_enabled AND consented_at IS NOT NULL)
    OR (p_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks t JOIN public.task_study_schedules sc ON sc.task_id=t.id AND sc.user_id=t.user_id
      LEFT JOIN public.study_notification_task_overrides o ON o.task_id=t.id AND o.user_id=t.user_id
      WHERE t.id=p_task_id AND t.user_id=p_user_id AND t.status::text IN('todo','in_progress') AND t.parent_task_id IS NULL
      AND sc.status='active' AND coalesce(o.enabled,true))) THEN
    -- OFF is never a partial first-page update. No Session/Task row locks and
    -- no history scan: suppress ALL active jobs, including cancellation fences
    -- for existing leases, in this transaction. Sent/failed/history stay intact.
    UPDATE public.study_notification_jobs j SET status=CASE WHEN j.status='leased' THEN 'leased' ELSE 'suppressed' END,
      cancel_requested_at=coalesce(j.cancel_requested_at,v_now)
    WHERE j.user_id=p_user_id AND j.status IN('pending','leased')
      AND (p_task_id IS NULL OR EXISTS(SELECT 1 FROM public.task_study_sessions s WHERE s.id=j.session_id AND s.task_id=p_task_id));
    RETURN;
  END IF;
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.ls_notification_candidates(p_user_id,p_task_id,v_now) LIMIT 5001) bounded;
  IF v_count>5000 THEN RAISE EXCEPTION 'Notification reconciliation exceeds 5000 future sessions; reduce active schedules and retry' USING ERRCODE='54000'; END IF;
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.study_notification_jobs j WHERE j.user_id=p_user_id AND j.status IN('pending','leased')
    AND (p_task_id IS NULL OR EXISTS(SELECT 1 FROM public.task_study_sessions s WHERE s.id=j.session_id AND s.task_id=p_task_id)) LIMIT 5001) bounded;
  IF v_count>5000 THEN RAISE EXCEPTION 'Notification reconciliation exceeds 5000 active jobs; opt out or reduce scope and retry' USING ERRCODE='54000'; END IF;
  -- At most 5000 future candidates + 5000 active jobs, no silent cursor/backlog.
  FOR v_id IN SELECT id FROM public.ls_notification_candidates(p_user_id,p_task_id,v_now) id
    UNION SELECT j.session_id FROM public.study_notification_jobs j WHERE j.user_id=p_user_id AND j.status IN('pending','leased')
      AND (p_task_id IS NULL OR EXISTS(SELECT 1 FROM public.task_study_sessions s WHERE s.id=j.session_id AND s.task_id=p_task_id))
  LOOP PERFORM public.ls_sync_study_notification_for_session(v_id); END LOOP;
END;
$$;
CREATE FUNCTION public.ls_notification_session_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.ls_sync_study_notification_for_session(NEW.id); RETURN NEW; END;
$$;
CREATE TRIGGER ls_notification_session_lifecycle AFTER INSERT OR UPDATE OF status,scheduled_start_at,scheduled_end_at,schedule_revision,user_id,task_id,schedule_id
  ON public.task_study_sessions FOR EACH ROW EXECUTE FUNCTION public.ls_notification_session_changed();
CREATE FUNCTION public.ls_notification_preferences_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.study_email_enabled AND ROW(OLD.study_email_enabled,OLD.lead_minutes,OLD.consented_at) IS NOT DISTINCT FROM ROW(NEW.study_email_enabled,NEW.lead_minutes,NEW.consented_at) THEN RETURN NEW; END IF;
  PERFORM public.ls_reconcile_study_notifications(NEW.user_id); RETURN NEW;
END;
$$;
CREATE TRIGGER ls_notification_preferences_lifecycle AFTER INSERT OR UPDATE ON public.study_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.ls_notification_preferences_changed();
CREATE FUNCTION public.ls_notification_override_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.enabled IS NOT DISTINCT FROM NEW.enabled THEN RETURN NEW; END IF;
  PERFORM public.ls_reconcile_study_notifications(NEW.user_id,NEW.task_id); RETURN NEW;
END;
$$;
CREATE TRIGGER ls_notification_override_lifecycle AFTER INSERT OR UPDATE ON public.study_notification_task_overrides
  FOR EACH ROW EXECUTE FUNCTION public.ls_notification_override_changed();
CREATE FUNCTION public.ls_notification_parent_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='tasks' THEN PERFORM public.ls_reconcile_study_notifications(NEW.user_id,NEW.id);
  ELSE PERFORM public.ls_reconcile_study_notifications(NEW.user_id,NEW.task_id); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ls_notification_task_lifecycle AFTER UPDATE OF status,parent_task_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.ls_notification_parent_changed();
CREATE TRIGGER ls_notification_schedule_lifecycle AFTER UPDATE OF status,revision ON public.task_study_schedules
  FOR EACH ROW EXECUTE FUNCTION public.ls_notification_parent_changed();

-- Current-record fence, NOT dispatch authorization (7C must additionally check
-- gate, verified destination, quiet hours and submission protocol). A worker must
-- keep the coordinator/Job transaction through its final submission decision.
CREATE FUNCTION public.ls_study_notification_job_is_current(p_job_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid; v_ok boolean;
BEGIN
 SELECT user_id INTO v_uid FROM public.study_notification_jobs WHERE id=p_job_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.ls_notification_lock_owner(v_uid);
 SELECT j.status IN('pending','leased') AND j.cancel_requested_at IS NULL AND p.eligible
   AND p.starts_at>pg_catalog.clock_timestamp() AND j.due_at=p.due_at AND j.lifecycle_fingerprint=p.fingerprint
   AND NOT EXISTS(SELECT 1 FROM public.study_notification_deliveries d WHERE d.job_id=j.id AND d.status IN('submitting','accepted','delivered','uncertain','bounced','complained'))
 INTO v_ok FROM public.study_notification_jobs j CROSS JOIN LATERAL public.ls_notification_session_policy(j.session_id) p WHERE j.id=p_job_id;
 RETURN coalesce(v_ok,false);
END;
$$;
REVOKE ALL ON FUNCTION public.ls_notification_lock_owner(uuid),public.ls_notification_session_policy(uuid),
 public.ls_sync_study_notification_for_session(uuid),public.ls_notification_candidates(uuid,uuid,timestamptz),
 public.ls_reconcile_study_notifications(uuid,uuid),public.ls_study_notification_job_is_current(uuid),
 public.ls_notification_session_changed(),public.ls_notification_preferences_changed(),public.ls_notification_override_changed(),public.ls_notification_parent_changed()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_sync_study_notification_for_session(uuid),public.ls_reconcile_study_notifications(uuid,uuid),
 public.ls_study_notification_job_is_current(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
