-- Phase 03 Step 3.5C: bind a reschedule event key to a request fingerprint.
-- Forward-only replacement of the existing RPC. No table or generated type change.
CREATE OR REPLACE FUNCTION public.ls_reschedule_session(
  p_session_id uuid,
  p_expected_updated_at timestamptz,
  p_new_local_date date,
  p_new_start_time time,
  p_new_end_time time,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_event_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_schedule public.task_study_schedules%rowtype;
  v_session public.task_study_sessions%rowtype;
  v_task_status text;
  v_old jsonb;
  v_prior_event record;
  v_fingerprint text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid event key' USING ERRCODE='22023';
  END IF;

  -- Hash a canonical, typed request representation, including the expected version.
  -- Epoch seconds avoid session TimeZone-dependent timestamptz text formatting.
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'sessionId',p_session_id,
        'expectedVersionEpoch',EXTRACT(EPOCH FROM p_expected_updated_at),
        'localDate',p_new_local_date,
        'startTime',p_new_start_time,
        'endTime',p_new_end_time,
        'startEpoch',EXTRACT(EPOCH FROM p_new_start_at),
        'endEpoch',EXTRACT(EPOCH FROM p_new_end_at)
      )::text, 'UTF8'
    )), 'hex'
  );

  -- Consistent lock order: task -> schedule -> session.
  SELECT t.status::text INTO v_task_status
  FROM public.task_study_sessions x
  JOIN public.tasks t ON t.id=x.task_id AND t.user_id=x.user_id
  WHERE x.id=p_session_id AND x.user_id=v_uid
  FOR UPDATE OF t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found' USING ERRCODE='22023'; END IF;

  SELECT s.* INTO v_schedule
  FROM public.task_study_schedules s
  JOIN public.task_study_sessions x ON x.schedule_id=s.id AND x.user_id=s.user_id
  WHERE x.id=p_session_id AND x.user_id=v_uid
  FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule not found' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_session
  FROM public.task_study_sessions
  WHERE id=p_session_id AND user_id=v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found' USING ERRCODE='22023'; END IF;

  -- Check prior command BEFORE the stale version check. Identical retry succeeds.
  SELECT event_type, payload INTO v_prior_event
  FROM public.task_study_session_events
  WHERE session_id=p_session_id AND event_key=p_event_key;
  IF FOUND THEN
    IF v_prior_event.event_type = 'rescheduled'
       AND v_prior_event.payload->>'requestFingerprint' = v_fingerprint THEN
      RETURN p_session_id;
    END IF;
    -- Also fail closed for legacy events without a fingerprint.
    RAISE EXCEPTION 'Event key reused with different request' USING ERRCODE='22023';
  END IF;

  IF v_task_status NOT IN ('todo','in_progress') OR v_schedule.status <> 'active' OR
     v_session.status <> 'scheduled' OR v_session.scheduled_start_at <= now() THEN
    RAISE EXCEPTION 'Session is not eligible for rescheduling' USING ERRCODE='22023';
  END IF;
  IF p_expected_updated_at IS DISTINCT FROM v_session.updated_at THEN
    RAISE EXCEPTION 'Stale session version' USING ERRCODE='40001';
  END IF;
  IF p_new_local_date IS NULL OR p_new_start_time IS NULL OR p_new_end_time IS NULL OR
     p_new_start_at IS NULL OR p_new_end_at IS NULL OR
     p_new_start_time >= p_new_end_time OR p_new_start_at <= now() OR
     p_new_end_at <= p_new_start_at OR
     p_new_local_date NOT BETWEEN v_schedule.starts_on AND v_schedule.ends_on THEN
    RAISE EXCEPTION 'Invalid new study time' USING ERRCODE='22023';
  END IF;
  IF (p_new_start_at AT TIME ZONE v_schedule.timezone)::date <> p_new_local_date OR
     (p_new_end_at AT TIME ZONE v_schedule.timezone)::date <> p_new_local_date OR
     (p_new_start_at AT TIME ZONE v_schedule.timezone)::time <> p_new_start_time OR
     (p_new_end_at AT TIME ZONE v_schedule.timezone)::time <> p_new_end_time THEN
    RAISE EXCEPTION 'Local time/UTC mismatch' USING ERRCODE='22023';
  END IF;
  -- The Phase 3.5B BEFORE UPDATE trigger additionally enforces earlier DST fold.
  IF EXISTS (
    SELECT 1 FROM public.task_study_sessions other
    WHERE other.schedule_id=v_schedule.id AND other.id<>v_session.id
      AND other.status IN ('scheduled','in_progress','completed','missed','skipped')
      AND pg_catalog.tstzrange(other.scheduled_start_at, other.scheduled_end_at, '[)') &&
          pg_catalog.tstzrange(p_new_start_at, p_new_end_at, '[)')
  ) THEN RAISE EXCEPTION 'Study session overlaps another obligation' USING ERRCODE='23P01'; END IF;

  v_old := pg_catalog.jsonb_build_object(
    'localDate',v_session.local_date,'startAt',v_session.scheduled_start_at,
    'endAt',v_session.scheduled_end_at,'startTime',v_session.local_start_time,
    'endTime',v_session.local_end_time
  );
  UPDATE public.task_study_sessions SET
    source_slot_id=NULL,
    local_date=p_new_local_date,
    local_start_time=p_new_start_time,
    local_end_time=p_new_end_time,
    scheduled_start_at=p_new_start_at,
    scheduled_end_at=p_new_end_at
  WHERE id=v_session.id;

  INSERT INTO public.task_study_session_events
    (user_id,session_id,event_type,from_status,to_status,actor_id,event_key,payload)
  VALUES (v_uid,v_session.id,'rescheduled','scheduled','scheduled',v_uid,p_event_key,
    pg_catalog.jsonb_build_object(
      'requestFingerprint',v_fingerprint,
      'previous',v_old,
      'new',pg_catalog.jsonb_build_object(
        'localDate',p_new_local_date,'startAt',p_new_start_at,'endAt',p_new_end_at,
        'startTime',p_new_start_time,'endTime',p_new_end_time
      )
    ));
  RETURN v_session.id;
END $$;

REVOKE ALL ON FUNCTION public.ls_reschedule_session(uuid,timestamptz,date,time,time,timestamptz,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ls_reschedule_session(uuid,timestamptz,date,time,time,timestamptz,timestamptz,text) TO authenticated;
