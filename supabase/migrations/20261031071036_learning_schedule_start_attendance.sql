-- Phase 05 Step 5.1: owner-only scheduled -> in_progress attendance command.
-- No Focus timer, Task completion, minutes, completion timestamp or email side effects.
-- Window: [scheduled_start_at, scheduled_end_at + 60 elapsed minutes).
-- Contract: 42501 auth/ownership; 22023 invalid command/state/window;
-- PT409 stale version (PostgREST HTTP 409, deliberately not serialization 40001).
CREATE OR REPLACE FUNCTION public.ls_start_study_session(
  p_session_id uuid,
  p_expected_updated_at timestamptz,
  p_event_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_task record;
  v_schedule public.task_study_schedules%rowtype;
  v_session public.task_study_sessions%rowtype;
  v_prior record;
  v_fingerprint text;
  v_now timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid session or expected version' USING ERRCODE = '22023';
  END IF;
  IF p_event_key IS NULL OR p_event_key <> btrim(p_event_key)
     OR length(p_event_key) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid event key' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'command', 'start', 'sessionId', p_session_id,
      'expectedVersionEpoch', EXTRACT(EPOCH FROM p_expected_updated_at)
    )::text, 'UTF8'
  )), 'hex');

  SELECT t.id, t.status::text AS status, t.parent_task_id INTO v_task
  FROM public.tasks t JOIN public.task_study_sessions x
    ON x.task_id = t.id AND x.user_id = t.user_id
  WHERE x.id = p_session_id AND x.user_id = v_uid
  FOR UPDATE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study session not found or not owned' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_schedule
  FROM public.task_study_schedules s JOIN public.task_study_sessions x
    ON x.schedule_id = s.id AND x.user_id = s.user_id
  WHERE x.id = p_session_id AND x.user_id = v_uid
  FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study schedule not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session FROM public.task_study_sessions
  WHERE id = p_session_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_session.schedule_id IS DISTINCT FROM v_schedule.id THEN
    RAISE EXCEPTION 'Study session not found or not owned' USING ERRCODE = '42501';
  END IF;

  -- Replay must precede eligibility/version checks: the original command changed status/version.
  SELECT event_type, payload INTO v_prior FROM public.task_study_session_events
  WHERE session_id = p_session_id AND event_key = p_event_key;
  IF FOUND THEN
    IF v_prior.event_type = 'started'
       AND v_prior.payload->>'requestFingerprint' = v_fingerprint THEN
      RETURN p_session_id;
    END IF;
    RAISE EXCEPTION 'Event key reused with different request' USING ERRCODE = '22023';
  END IF;

  IF v_task.parent_task_id IS NOT NULL OR v_task.status NOT IN ('todo', 'in_progress')
     OR v_schedule.status <> 'active' OR v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Session is not eligible for starting' USING ERRCODE = '22023';
  END IF;
  -- Evaluate after obtaining locks, not at the beginning of a possibly waiting transaction.
  v_now := pg_catalog.clock_timestamp();
  IF v_now < v_session.scheduled_start_at
     OR v_now >= v_session.scheduled_end_at + interval '60 minutes' THEN
    RAISE EXCEPTION 'Session is outside the start window' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS DISTINCT FROM v_session.updated_at THEN
    RAISE EXCEPTION 'Stale session version' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.task_study_sessions SET status = 'in_progress' WHERE id = p_session_id;
  INSERT INTO public.task_study_session_events
    (user_id, session_id, event_type, from_status, to_status, actor_id, event_key, payload)
  VALUES (v_uid, p_session_id, 'started', 'scheduled', 'in_progress', v_uid, p_event_key,
    pg_catalog.jsonb_build_object('requestFingerprint', v_fingerprint,
      'expectedUpdatedAt', p_expected_updated_at, 'startedAt', v_now));
  RETURN p_session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ls_start_study_session(uuid,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ls_start_study_session(uuid,timestamptz,text) TO authenticated;
