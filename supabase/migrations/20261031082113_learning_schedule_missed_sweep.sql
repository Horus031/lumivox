
-- Lumivox Phase 05 / Step 5.4
-- Automatic missed attendance sweep.
--
-- Production-safe default:
-- Cron is registered but the processing gate is OFF.
--
-- Only scheduled -> missed is automated here.
-- In-progress reconciliation is deferred until a trustworthy
-- Study Session <-> Focus association is available.
--
-- No email sending, Focus mutations, Task completion
-- or automatic late recovery.

-- 1. Private operational switch.
CREATE TABLE public.ls_missed_sweep_control (
  singleton boolean PRIMARY KEY DEFAULT true
    CHECK (singleton = true),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ls_missed_sweep_control (
  singleton, enabled
) VALUES (true, false);

ALTER TABLE public.ls_missed_sweep_control
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.ls_missed_sweep_control
FROM PUBLIC, anon, authenticated;

-- 2. Support the bounded overdue candidate scan.
CREATE INDEX ls_sessions_missed_sweep_candidates_idx
ON public.task_study_sessions (
  scheduled_end_at,
  id
)
WHERE status = 'scheduled';

-- 3. Trusted bounded batch.
CREATE FUNCTION public.ls_mark_missed_batch(
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;

  v_task record;
  v_schedule public.task_study_schedules%rowtype;
  v_session public.task_study_sessions%rowtype;

  v_now timestamptz;
  v_cutoff timestamptz;

  v_marked integer := 0;
  v_examined integer := 0;
  v_event_key text;
BEGIN
  IF p_batch_size IS NULL
     OR p_batch_size < 1
     OR p_batch_size > 500 THEN
    RAISE EXCEPTION 'Invalid missed sweep batch size'
      USING ERRCODE = '22023';
  END IF;

  -- Candidate discovery does not take row locks.
  -- Individual transitions acquire locks in the
  -- established Task -> Schedule -> Session order.
  --
  -- This query is a bounded discovery pass, not a
  -- snapshot of rows guaranteed to remain eligible.
  FOR v_id IN
    SELECT x.id
    FROM public.task_study_sessions x
    WHERE x.status = 'scheduled'
      AND x.scheduled_end_at
          <= pg_catalog.clock_timestamp()
             - interval '60 minutes'
    ORDER BY x.scheduled_end_at, x.id
    LIMIT p_batch_size * 10
  LOOP
    EXIT WHEN v_marked >= p_batch_size;

    v_examined := v_examined + 1;

    -- Task lock first.
    SELECT
      t.id,
      t.status::text AS status,
      t.parent_task_id
    INTO v_task
    FROM public.tasks t
    JOIN public.task_study_sessions x
      ON x.task_id = t.id
     AND x.user_id = t.user_id
    WHERE x.id = v_id
    FOR UPDATE OF t SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Schedule lock second.
    SELECT s.*
    INTO v_schedule
    FROM public.task_study_schedules s
    JOIN public.task_study_sessions x
      ON x.schedule_id = s.id
     AND x.user_id = s.user_id
    WHERE x.id = v_id
    FOR UPDATE OF s SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Session lock last.
    SELECT *
    INTO v_session
    FROM public.task_study_sessions
    WHERE id = v_id
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Repeat eligibility checks after all locks.
    IF v_task.id IS DISTINCT FROM v_session.task_id
       OR v_task.parent_task_id IS NOT NULL
       OR v_task.status NOT IN ('todo', 'in_progress')
       OR v_schedule.id IS DISTINCT FROM v_session.schedule_id
       OR v_schedule.user_id IS DISTINCT FROM v_session.user_id
       OR v_schedule.status <> 'active'
       OR v_session.status <> 'scheduled' THEN
      CONTINUE;
    END IF;

    -- Time is evaluated after locks.
    v_now := pg_catalog.clock_timestamp();
    v_cutoff :=
      v_session.scheduled_end_at + interval '60 minutes';

    IF v_now < v_cutoff THEN
      CONTINUE;
    END IF;

    -- Deterministic event key: this session can only
    -- receive one automatic missed event.
    v_event_key := 'ls:missed:' || v_session.id::text;

    UPDATE public.task_study_sessions
    SET status = 'missed'
    WHERE id = v_session.id
      AND status = 'scheduled';

    -- Atomic audit for the transition above.
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
      v_session.user_id,
      v_session.id,
      'marked_missed',
      'scheduled',
      'missed',
      NULL,
      v_event_key,
      pg_catalog.jsonb_build_object(
        'source', 'attendance_sweep',
        'reason', 'grace_expired',
        'graceMinutes', 60,
        'graceDeadline', v_cutoff,
        'markedAt', v_now,
        'scheduleRevision',
          v_session.schedule_revision
      )
    );

    v_marked := v_marked + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'marked', v_marked,
    'examined', v_examined
  );
END;
$$;

-- 4. Only trusted database/service roles may execute.
REVOKE ALL ON FUNCTION
  public.ls_mark_missed_batch(integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.ls_mark_missed_batch(integer)
TO service_role;

-- 5. Cron entrypoint.
-- The gate is checked server-side, not in the browser.
CREATE FUNCTION public.ls_run_missed_sweep_if_enabled()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled boolean;
  v_result jsonb;
BEGIN
  SELECT enabled INTO v_enabled
  FROM public.ls_missed_sweep_control
  WHERE singleton = true;

  IF v_enabled IS DISTINCT FROM true THEN
    RETURN 0;
  END IF;

  v_result := public.ls_mark_missed_batch(100);

  RETURN (v_result->>'marked')::integer;
END;
$$;

REVOKE ALL ON FUNCTION
  public.ls_run_missed_sweep_if_enabled()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.ls_run_missed_sweep_if_enabled()
TO service_role;

-- 6. Register the recurring Cron job.
-- The default-disabled gate prevents attendance mutations.
SELECT cron.schedule(
  'lumivox-learning-schedule-missed-5m',
  '*/5 * * * *',
  $cron$
    SELECT public.ls_run_missed_sweep_if_enabled();
  $cron$
);
