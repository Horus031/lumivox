
-- Lumivox — Phase 05 / Step 5.5
-- Explicit Late Recovery for missed/skipped Study Sessions.
--
-- Allowed: missed -> completed; skipped -> completed.
-- Deadline: midnight at start of local_date + 8 calendar days,
-- in the historical session timezone (exclusive).
--
-- No Task, Focus, minutes, email or notification mutation.
--
-- Errors:
-- 42501 = unauthenticated / ownership denied
-- 22023 = invalid input / state / recovery window / reused key
-- PT409 = stale session version (HTTP 409)

CREATE OR REPLACE FUNCTION public.ls_recover_study_session(
  p_session_id uuid,
  p_expected_updated_at timestamptz,
  p_event_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());

  v_task record;
  v_schedule public.task_study_schedules%rowtype;
  v_session public.task_study_sessions%rowtype;

  v_prior record;
  v_fingerprint text;

  v_now timestamptz;
  v_recovery_cutoff timestamptz;
BEGIN
  -- 1. Authentication and argument validation.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL
     OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid session or expected version'
      USING ERRCODE = '22023';
  END IF;

  IF p_event_key IS NULL
     OR p_event_key <> pg_catalog.btrim(p_event_key)
     OR length(p_event_key) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid event key'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Idempotency fingerprint.
  -- Include every semantic command argument.
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'command', 'recover',
          'sessionId', p_session_id,
          'expectedVersionEpoch',
            EXTRACT(EPOCH FROM p_expected_updated_at)
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  -- 3. Global lock order: Task first.
  SELECT
    t.id,
    t.status::text AS status,
    t.parent_task_id
  INTO v_task
  FROM public.tasks t
  JOIN public.task_study_sessions x
    ON x.task_id = t.id
   AND x.user_id = t.user_id
  WHERE x.id = p_session_id
    AND x.user_id = v_uid
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study session not found or not owned'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Schedule second.
  SELECT s.*
  INTO v_schedule
  FROM public.task_study_schedules s
  JOIN public.task_study_sessions x
    ON x.schedule_id = s.id
   AND x.user_id = s.user_id
  WHERE x.id = p_session_id
    AND x.user_id = v_uid
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study schedule not found'
      USING ERRCODE = '42501';
  END IF;

  -- 5. Session third.
  SELECT *
  INTO v_session
  FROM public.task_study_sessions
  WHERE id = p_session_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.schedule_id IS DISTINCT FROM v_schedule.id
     OR v_session.task_id IS DISTINCT FROM v_task.id
     OR v_session.user_id IS DISTINCT FROM v_schedule.user_id THEN
    RAISE EXCEPTION 'Study session not found or not owned'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Exact replay must occur before checking eligibility,
  -- status, deadline or updated_at.
  --
  -- Recovery changes the row to completed. An identical
  -- command retry still returns success after the transition.
  SELECT event_type, payload
  INTO v_prior
  FROM public.task_study_session_events
  WHERE session_id = p_session_id
    AND event_key = p_event_key;

  IF FOUND THEN
    IF v_prior.event_type = 'recovered'
       AND v_prior.payload->>'requestFingerprint'
           = v_fingerprint THEN
      RETURN p_session_id;
    END IF;

    RAISE EXCEPTION 'Event key reused with different request'
      USING ERRCODE = '22023';
  END IF;

  -- 7. Validate Task / Schedule / Session state.
  IF v_task.parent_task_id IS NOT NULL
     OR v_task.status NOT IN ('todo', 'in_progress')
     OR v_schedule.status <> 'active'
     OR v_session.status NOT IN ('missed', 'skipped') THEN
    RAISE EXCEPTION 'Session is not eligible for recovery'
      USING ERRCODE = '22023';
  END IF;

  -- 8. Calculate recovery cutoff from historical session
  -- date and timezone, not the current schedule timezone.
  --
  -- Day 0: local_date.
  -- Days 1 through 7: recovery window.
  -- Beginning of day 8: exclusive cutoff.
  v_recovery_cutoff :=
    ((v_session.local_date + 8)::timestamp
      AT TIME ZONE v_session.timezone);

  -- 9. Check the clock AFTER acquiring all locks.
  v_now := pg_catalog.clock_timestamp();

  IF v_now >= v_recovery_cutoff THEN
    RAISE EXCEPTION 'Session is outside the recovery window'
      USING ERRCODE = '22023';
  END IF;

  -- Recovery is not a way to complete a future
  -- study obligation.
  IF v_now < v_session.scheduled_start_at THEN
    RAISE EXCEPTION 'Session has not started'
      USING ERRCODE = '22023';
  END IF;

  -- 10. Optimistic concurrency.
  IF p_expected_updated_at
     IS DISTINCT FROM v_session.updated_at THEN
    RAISE EXCEPTION 'Stale session version'
      USING ERRCODE = 'PT409';
  END IF;

  -- 11. Persist explicit completion.
  UPDATE public.task_study_sessions
  SET
    status = 'completed',
    completed_at = v_now
  WHERE id = p_session_id
    AND user_id = v_uid;

  -- 12. Audit the recovery atomically.
  --
  -- Event type "recovered" is already permitted by the
  -- Phase 02 task_study_session_events CHECK constraint.
  INSERT INTO public.task_study_session_events (
    user_id,
    session_id,
    event_type,
    from_status,
    to_status,
    actor_id,
    event_key,
    payload
  )
  VALUES (
    v_uid,
    p_session_id,
    'recovered',
    v_session.status,
    'completed',
    v_uid,
    p_event_key,
    pg_catalog.jsonb_build_object(
      'requestFingerprint', v_fingerprint,
      'expectedUpdatedAt', p_expected_updated_at,
      'recoveredAt', v_now,
      'recoveryCutoff', v_recovery_cutoff,
      'originalLocalDate', v_session.local_date,
      'originalTimezone', v_session.timezone,
      'wasLate', true,
      'sourceStatus', v_session.status
    )
  );

  RETURN p_session_id;
END;
$$;

-- 13. Authenticated RPC only.
REVOKE ALL ON FUNCTION
  public.ls_recover_study_session(
    uuid, timestamptz, text
  )
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.ls_recover_study_session(
    uuid, timestamptz, text
  )
TO authenticated;
