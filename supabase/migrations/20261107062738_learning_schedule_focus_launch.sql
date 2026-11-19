BEGIN;

CREATE TABLE public.task_study_focus_launches (
  user_id uuid NOT NULL,
  launch_request_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  focus_session_id uuid NOT NULL UNIQUE REFERENCES public.task_study_focus_attributions(focus_session_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, launch_request_id)
);
ALTER TABLE public.task_study_focus_launches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_study_focus_launches FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.ls_create_attributed_focus_v2(
  p_user_id uuid, p_study_session_id uuid, p_launch_request_id uuid,
  p_focus_minutes integer, p_short_break_minutes integer, p_long_break_minutes integer,
  p_round_count integer, p_long_break_every integer,
  p_auto_start_breaks boolean, p_auto_start_focus boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s'
AS $$
DECLARE
  v_payload jsonb;
  v_launch public.task_study_focus_launches;
  v_task public.tasks;
  v_schedule public.task_study_schedules;
  v_study public.task_study_sessions;
  v_focus_id uuid;
  v_constraint text;
  v_now timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_study_session_id IS NULL OR p_launch_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Focus launch identity' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_array(p_study_session_id, p_focus_minutes, p_short_break_minutes,
    p_long_break_minutes, p_round_count, p_long_break_every, p_auto_start_breaks, p_auto_start_focus);

  -- Serialize exact retries before taking any lifecycle locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('ls-focus-launch:' || p_user_id::text || ':' || p_launch_request_id::text, 0));
  SELECT * INTO v_launch FROM public.task_study_focus_launches
    WHERE user_id = p_user_id AND launch_request_id = p_launch_request_id;
  IF FOUND THEN
    IF v_launch.request_payload <> v_payload THEN
      RAISE EXCEPTION 'Focus launch key reused with different request' USING ERRCODE = 'PT409';
    END IF;
    RETURN jsonb_build_object('session_id', v_launch.focus_session_id, 'replay', true);
  END IF;

  SELECT * INTO v_study FROM public.task_study_sessions
    WHERE id = p_study_session_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study session is unavailable' USING ERRCODE = 'PT403';
  END IF;

  -- The Task lock excludes lifecycle updates but permits the FK KEY SHARE
  -- acquired by ordinary Focus creation after inserting its active row.
  SELECT * INTO v_task FROM public.tasks WHERE id = v_study.task_id AND user_id = p_user_id FOR NO KEY UPDATE;
  SELECT * INTO v_schedule FROM public.task_study_schedules
    WHERE id = v_study.schedule_id AND user_id = p_user_id AND task_id = v_task.id FOR NO KEY UPDATE;
  SELECT * INTO v_study FROM public.task_study_sessions
    WHERE id = p_study_session_id AND user_id = p_user_id AND task_id = v_task.id
      AND schedule_id = v_schedule.id FOR NO KEY UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_task.parent_task_id IS NOT NULL OR v_task.status NOT IN ('todo', 'in_progress')
    OR v_schedule.status <> 'active' OR v_schedule.revision <> v_study.schedule_revision
    OR v_study.status NOT IN ('scheduled', 'in_progress')
    OR v_now < v_study.scheduled_start_at - interval '15 minutes' OR v_now >= v_study.scheduled_end_at THEN
    RAISE EXCEPTION 'Study session is not eligible for Focus launch' USING ERRCODE = 'PT422';
  END IF;

  BEGIN
    v_focus_id := public.focus_v2_create_session(p_user_id, v_task.id, p_focus_minutes,
      p_short_break_minutes, p_long_break_minutes, p_round_count, p_long_break_every,
      p_auto_start_breaks, p_auto_start_focus);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'unique_active_focus_session_per_user' THEN
      RAISE EXCEPTION 'An active Focus session already exists' USING ERRCODE = 'PT423';
    END IF;
    RAISE;
  END;

  INSERT INTO public.task_study_focus_attributions (user_id, task_id, study_session_id, focus_session_id)
    VALUES (p_user_id, v_task.id, v_study.id, v_focus_id);
  INSERT INTO public.task_study_focus_launches (user_id, launch_request_id, request_payload, focus_session_id)
    VALUES (p_user_id, p_launch_request_id, v_payload, v_focus_id);
  RETURN jsonb_build_object('session_id', v_focus_id, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.ls_create_attributed_focus_v2(uuid, uuid, uuid, integer, integer, integer, integer, integer, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ls_create_attributed_focus_v2(uuid, uuid, uuid, integer, integer, integer, integer, integer, boolean, boolean)
  TO service_role;
COMMIT;
