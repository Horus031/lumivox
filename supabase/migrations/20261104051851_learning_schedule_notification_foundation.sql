-- Phase 07A: foundation only. No enqueue/claim/Cron/provider or implicit opt-in.
CREATE TABLE public.study_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  study_email_enabled boolean NOT NULL DEFAULT false,
  lead_minutes smallint NOT NULL DEFAULT 15 CHECK (lead_minutes IN (5,15,30,60)),
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_start_local time, quiet_end_local time, timezone text,
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_notification_quiet_hours_check CHECK (NOT quiet_hours_enabled OR
    (quiet_start_local IS NOT NULL AND quiet_end_local IS NOT NULL AND quiet_start_local <> quiet_end_local
     AND timezone IS NOT NULL AND length(btrim(timezone)) > 0)),
  CONSTRAINT study_notification_clock_check CHECK (
    (quiet_start_local IS NULL OR quiet_start_local < time '24:00') AND
    (quiet_end_local IS NULL OR quiet_end_local < time '24:00')),
  CONSTRAINT study_notification_consent_check CHECK (NOT study_email_enabled OR consented_at IS NOT NULL),
  CONSTRAINT study_notification_consent_finite CHECK (consented_at IS NULL OR isfinite(consented_at))
);
CREATE TABLE public.study_notification_task_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,task_id),
  FOREIGN KEY (task_id,user_id) REFERENCES public.tasks(id,user_id) ON DELETE CASCADE
);
-- Preserve the occurrence's generation revision, including single overrides.
ALTER TABLE public.task_study_sessions ADD CONSTRAINT ls_session_id_owner_revision_unique
  UNIQUE (id,user_id,schedule_revision);
CREATE TABLE public.study_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL, schedule_revision integer NOT NULL CHECK (schedule_revision > 0),
  notification_type text NOT NULL DEFAULT 'study_reminder' CHECK (notification_type = 'study_reminder'),
  due_at timestamptz NOT NULL CHECK (isfinite(due_at)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','sent','suppressed','expired','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(next_attempt_at)),
  lease_token uuid, lease_until timestamptz,
  idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_notification_job_owner_fk FOREIGN KEY (session_id,user_id,schedule_revision)
    REFERENCES public.task_study_sessions(id,user_id,schedule_revision) ON DELETE CASCADE,
  CONSTRAINT study_notification_job_logical_unique UNIQUE (session_id,notification_type,schedule_revision),
  CONSTRAINT study_notification_job_id_owner_unique UNIQUE (id,user_id),
  CONSTRAINT study_notification_lease_pair CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CONSTRAINT study_notification_lease_status CHECK ((status = 'leased') = (lease_token IS NOT NULL)),
  CONSTRAINT study_notification_lease_attempt CHECK (status <> 'leased' OR attempt_count > 0),
  CONSTRAINT study_notification_lease_finite CHECK (lease_until IS NULL OR isfinite(lease_until))
);
CREATE INDEX study_notification_jobs_claim_idx ON public.study_notification_jobs(status,next_attempt_at,due_at);
CREATE INDEX study_notification_jobs_owner_idx ON public.study_notification_jobs(user_id,created_at);
CREATE TABLE public.study_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  provider text NOT NULL DEFAULT 'fake' CHECK (provider = 'fake'),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(btrim(provider_message_id)) BETWEEN 1 AND 256),
  status text NOT NULL DEFAULT 'submitting' CHECK (status IN
    ('submitting','accepted','delivered','failed','uncertain','suppressed','bounced','complained')),
  error_code text CHECK (error_code IS NULL OR length(btrim(error_code)) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_notification_delivery_owner_fk FOREIGN KEY (job_id,user_id)
    REFERENCES public.study_notification_jobs(id,user_id) ON DELETE CASCADE,
  UNIQUE (job_id,attempt_number)
);
CREATE INDEX study_notification_deliveries_owner_idx ON public.study_notification_deliveries(user_id,created_at);
CREATE TABLE public.study_notification_dispatch_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.study_notification_dispatch_control(singleton,enabled) VALUES (true,false);
COMMENT ON COLUMN public.study_notification_jobs.status IS 'sent means provider accepted submission, never inbox delivery';
COMMENT ON COLUMN public.study_notification_preferences.consented_at IS 'Latest affirmative consent, set by DB. Retained on opt-out; not an append-only consent history.';
COMMENT ON TABLE public.study_notification_jobs IS 'No destination or raw email content. Enqueue/cancellation belongs to 7B; final eligibility/dispatch to 7C.';

CREATE FUNCTION public.ls_validate_notification_preferences() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.timezone IS NOT NULL AND (NEW.timezone LIKE 'posix/%' OR NEW.timezone LIKE 'right/%' OR
      NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone)) THEN
    RAISE EXCEPTION 'Invalid notification timezone' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ls_validate_notification_preferences() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_study_notification_preferences BEFORE INSERT OR UPDATE ON public.study_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.ls_validate_notification_preferences();
CREATE TRIGGER set_study_notification_preferences_updated_at BEFORE UPDATE ON public.study_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_study_notification_overrides_updated_at BEFORE UPDATE ON public.study_notification_task_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_study_notification_jobs_updated_at BEFORE UPDATE ON public.study_notification_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_study_notification_deliveries_updated_at BEFORE UPDATE ON public.study_notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_study_notification_control_updated_at BEFORE UPDATE ON public.study_notification_dispatch_control
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.study_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notification_task_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notification_dispatch_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY study_notification_preferences_select ON public.study_notification_preferences
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY study_notification_overrides_select ON public.study_notification_task_overrides
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY study_notification_jobs_select ON public.study_notification_jobs
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY study_notification_deliveries_select ON public.study_notification_deliveries
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.study_notification_preferences, public.study_notification_task_overrides,
  public.study_notification_jobs, public.study_notification_deliveries, public.study_notification_dispatch_control
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.study_notification_preferences, public.study_notification_task_overrides TO authenticated;
-- Browser status reads exclude worker lease capabilities/provider diagnostics.
GRANT SELECT(id,user_id,session_id,schedule_revision,notification_type,due_at,status,attempt_count,next_attempt_at,created_at,updated_at)
  ON public.study_notification_jobs TO authenticated;
GRANT SELECT(id,job_id,user_id,attempt_number,provider,status,created_at,updated_at)
  ON public.study_notification_deliveries TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.study_notification_preferences, public.study_notification_task_overrides,
  public.study_notification_jobs, public.study_notification_deliveries, public.study_notification_dispatch_control TO service_role;

-- Explicit consent boundary: no userId or client consent timestamp arguments.
CREATE FUNCTION public.ls_set_study_notification_preferences(
  p_study_email_enabled boolean, p_lead_minutes integer DEFAULT 15,
  p_quiet_hours_enabled boolean DEFAULT false, p_quiet_start_local time DEFAULT NULL,
  p_quiet_end_local time DEFAULT NULL, p_timezone text DEFAULT NULL
) RETURNS public.study_notification_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_result public.study_notification_preferences;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_study_email_enabled IS NULL OR p_quiet_hours_enabled IS NULL OR p_lead_minutes IS NULL
     OR p_lead_minutes NOT IN (5,15,30,60) THEN
    RAISE EXCEPTION 'Invalid study notification preferences' USING ERRCODE = '22023';
  END IF;
  IF (p_quiet_start_local IS NOT NULL AND p_quiet_start_local >= time '24:00') OR
     (p_quiet_end_local IS NOT NULL AND p_quiet_end_local >= time '24:00') OR
     (p_quiet_hours_enabled AND (p_quiet_start_local IS NULL OR p_quiet_end_local IS NULL OR
       p_quiet_start_local = p_quiet_end_local OR p_timezone IS NULL)) THEN
    RAISE EXCEPTION 'Invalid quiet hours' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.study_notification_preferences AS existing
    (user_id,study_email_enabled,lead_minutes,quiet_hours_enabled,quiet_start_local,quiet_end_local,timezone,consented_at)
  VALUES (v_uid,p_study_email_enabled,p_lead_minutes,p_quiet_hours_enabled,p_quiet_start_local,p_quiet_end_local,p_timezone,
    CASE WHEN p_study_email_enabled THEN pg_catalog.clock_timestamp() ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE SET study_email_enabled = excluded.study_email_enabled,
    lead_minutes = excluded.lead_minutes, quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_start_local = excluded.quiet_start_local, quiet_end_local = excluded.quiet_end_local, timezone = excluded.timezone,
    consented_at = CASE WHEN excluded.study_email_enabled AND NOT existing.study_email_enabled
      THEN pg_catalog.clock_timestamp() ELSE existing.consented_at END
  RETURNING * INTO v_result;
  -- 7B will atomically invalidate pending jobs on opt-out/policy changes.
  -- 7A only stores consent; dispatcher remains OFF and does not exist yet.
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ls_set_study_notification_preferences(boolean,integer,boolean,time,time,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ls_set_study_notification_preferences(boolean,integer,boolean,time,time,text) TO authenticated;

CREATE FUNCTION public.ls_set_study_notification_task_override(p_task_id uuid,p_enabled boolean)
RETURNS public.study_notification_task_overrides
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_result public.study_notification_task_overrides;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_enabled IS NULL OR p_task_id IS NULL THEN RAISE EXCEPTION 'Invalid Task override' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.tasks WHERE id = p_task_id AND user_id = v_uid FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.study_notification_task_overrides(user_id,task_id,enabled) VALUES(v_uid,p_task_id,p_enabled)
    ON CONFLICT(user_id,task_id) DO UPDATE SET enabled = excluded.enabled RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ls_set_study_notification_task_override(uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ls_set_study_notification_task_override(uuid,boolean) TO authenticated;

-- Preference-level permission only. This is NOT final send eligibility.
CREATE FUNCTION public.ls_study_notification_task_enabled(p_task_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce((SELECT p.study_email_enabled AND p.consented_at IS NOT NULL AND coalesce(o.enabled,true)
    FROM public.tasks t LEFT JOIN public.study_notification_preferences p ON p.user_id = t.user_id
    LEFT JOIN public.study_notification_task_overrides o ON o.task_id = t.id AND o.user_id = t.user_id
    WHERE t.id = p_task_id AND t.user_id = (SELECT auth.uid())),false);
$$;
REVOKE ALL ON FUNCTION public.ls_study_notification_task_enabled(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ls_study_notification_task_enabled(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
