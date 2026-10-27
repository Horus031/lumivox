-- Step 3.4A: revise the *whole recurring schedule*, atomically.
-- This function does not reschedule an individual occurrence; that is Step 3.4B.
-- IMPORTANT: verify locally before applying to any linked Supabase project.
CREATE OR REPLACE FUNCTION public.ls_revise_schedule(
  p_schedule_id uuid,
  p_expected_revision integer,
  p_starts_on date,
  p_ends_on date,
  p_timezone text,
  p_slots jsonb,
  p_occurrences jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_schedule record;
  v_new_revision integer;
  v_slot jsonb;
  v_occ jsonb;
  v_slot_index integer;
  v_date date;
  v_start time;
  v_end time;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_key text;
  v_slot_id uuid;
  v_expected_count integer;
  v_seen_keys text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  -- Lock the Task first: the existing create RPC also locks tasks first.
  -- This consistent ordering prevents a task-close/revision deadlock in later integration.
  SELECT t.id INTO v_schedule
  FROM public.task_study_schedules s
  JOIN public.tasks t ON t.id=s.task_id AND t.user_id=s.user_id
  WHERE s.id=p_schedule_id AND s.user_id=v_uid
  FOR UPDATE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found' USING ERRCODE='22023';
  END IF;

  SELECT s.id, s.task_id, s.revision, s.status, t.status AS task_status,
         t.parent_task_id
    INTO v_schedule
  FROM public.task_study_schedules s
  JOIN public.tasks t ON t.id=s.task_id AND t.user_id=s.user_id
  WHERE s.id=p_schedule_id AND s.user_id=v_uid
  FOR UPDATE OF s;
  IF NOT FOUND OR v_schedule.status <> 'active' OR
     v_schedule.task_status NOT IN ('todo','in_progress') OR
     v_schedule.parent_task_id IS NOT NULL THEN
    RAISE EXCEPTION 'Schedule not eligible for revision' USING ERRCODE='22023';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_schedule.revision THEN
    RAISE EXCEPTION 'Stale schedule revision' USING ERRCODE='40001';
  END IF;
  v_new_revision := v_schedule.revision + 1;

  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on
     OR p_ends_on - p_starts_on + 1 > 366 THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023';
  END IF;
  IF p_timezone IS NULL OR length(trim(p_timezone)) NOT BETWEEN 1 AND 128
     OR p_timezone <> trim(p_timezone)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone)
     OR p_starts_on < (now() AT TIME ZONE p_timezone)::date THEN
    RAISE EXCEPTION 'Invalid timezone or past start date' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_slots) NOT BETWEEN 1 AND 21
     OR jsonb_typeof(p_occurrences) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_occurrences) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid slots/occurrences' USING ERRCODE='22023';
  END IF;

  -- Started sessions are immutable and can collide with the new plan;
  -- v1 takes the conservative route: ask user to revise after active work ends.
  IF EXISTS (
    SELECT 1 FROM public.task_study_sessions
    WHERE schedule_id=p_schedule_id AND status='in_progress'
  ) THEN
    RAISE EXCEPTION 'Cannot revise while a study session is in progress' USING ERRCODE='22023';
  END IF;

  -- A future scheduled session may be superseded, never hard-deleted.
  UPDATE public.task_study_sessions
     SET status='cancelled', cancellation_reason='schedule_changed'
   WHERE schedule_id=p_schedule_id AND status='scheduled'
     AND scheduled_start_at > now();

  -- Existing sessions keep their history. The composite FK nulls source_slot_id.
  DELETE FROM public.task_study_schedule_slots WHERE schedule_id=p_schedule_id;

  FOR v_slot_index IN 0..jsonb_array_length(p_slots)-1 LOOP
    v_slot := p_slots->v_slot_index;
    IF jsonb_typeof(v_slot) <> 'object'
       OR (v_slot->>'weekday') !~ '^[1-7]$'
       OR (v_slot->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_slot->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Invalid slot' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES(v_uid,p_schedule_id,(v_slot->>'weekday')::smallint,
           (v_slot->>'startTime')::time,(v_slot->>'endTime')::time);
  END LOOP;

  SELECT count(*) INTO v_expected_count
  FROM pg_catalog.generate_series(p_starts_on,p_ends_on,interval '1 day') AS d
  JOIN public.task_study_schedule_slots s
    ON s.schedule_id=p_schedule_id
   AND s.weekday=EXTRACT(ISODOW FROM d)::integer;
  IF v_expected_count=0 OR v_expected_count<>jsonb_array_length(p_occurrences) THEN
    RAISE EXCEPTION 'Occurrence count mismatch' USING ERRCODE='22023';
  END IF;

  FOR v_occ IN SELECT value FROM jsonb_array_elements(p_occurrences) LOOP
    IF jsonb_typeof(v_occ) <> 'object'
       OR (v_occ->>'localDate') !~ '^\d{4}-\d{2}-\d{2}$'
       OR (v_occ->>'localStartTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_occ->>'localEndTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_occ->>'slotIndex') !~ '^(0|[1-9][0-9]*)$' THEN
      RAISE EXCEPTION 'Invalid occurrence' USING ERRCODE='22023';
    END IF;
    v_date := (v_occ->>'localDate')::date;
    v_start := (v_occ->>'localStartTime')::time;
    v_end := (v_occ->>'localEndTime')::time;
    v_slot_index := (v_occ->>'slotIndex')::integer;
    IF v_date NOT BETWEEN p_starts_on AND p_ends_on OR v_slot_index>=jsonb_array_length(p_slots)
       OR (v_occ->>'timezone') IS DISTINCT FROM p_timezone THEN
      RAISE EXCEPTION 'Occurrence outside schedule' USING ERRCODE='22023';
    END IF;
    v_slot := p_slots->v_slot_index;
    IF (v_slot->>'weekday')::integer<>EXTRACT(ISODOW FROM v_date)::integer
       OR (v_slot->>'startTime')::time<>v_start
       OR (v_slot->>'endTime')::time<>v_end THEN
      RAISE EXCEPTION 'Occurrence/slot mismatch' USING ERRCODE='22023';
    END IF;
    v_key := v_date::text||'|'||(v_slot->>'weekday')||'|'||(v_slot->>'startTime')||'|'||(v_slot->>'endTime');
    IF v_key=ANY(v_seen_keys) OR (v_occ->>'occurrenceKey') IS DISTINCT FROM v_key THEN
      RAISE EXCEPTION 'Duplicate or invalid key' USING ERRCODE='22023';
    END IF;
    v_seen_keys := pg_catalog.array_append(v_seen_keys,v_key);
    v_start_at := (v_occ->>'scheduledStartAt')::timestamptz;
    v_end_at := (v_occ->>'scheduledEndAt')::timestamptz;
    IF v_start_at>=v_end_at OR v_start_at<=now()
       OR (v_start_at AT TIME ZONE p_timezone)::date<>v_date
       OR (v_start_at AT TIME ZONE p_timezone)::time<>v_start
       OR (v_end_at AT TIME ZONE p_timezone)::date<>v_date
       OR (v_end_at AT TIME ZONE p_timezone)::time<>v_end THEN
      RAISE EXCEPTION 'Invalid occurrence instant' USING ERRCODE='22023';
    END IF;
    SELECT id INTO v_slot_id FROM public.task_study_schedule_slots
    WHERE schedule_id=p_schedule_id AND weekday=EXTRACT(ISODOW FROM v_date)::integer
      AND start_time=v_start AND end_time=v_end;
    IF v_slot_id IS NULL THEN RAISE EXCEPTION 'Missing slot' USING ERRCODE='22023'; END IF;
    INSERT INTO public.task_study_sessions(
      user_id,task_id,schedule_id,schedule_revision,source_slot_id,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at
    ) VALUES (
      v_uid,v_schedule.task_id,p_schedule_id,v_new_revision,v_slot_id,v_key,
      v_date,v_start,v_end,p_timezone,v_start_at,v_end_at
    );
  END LOOP;

  UPDATE public.task_study_schedules
    SET starts_on=p_starts_on,ends_on=p_ends_on,timezone=p_timezone,revision=v_new_revision
  WHERE id=p_schedule_id;
  INSERT INTO public.task_study_schedule_revisions(
    user_id,schedule_id,revision,starts_on,ends_on,timezone,slots_snapshot,changed_by,change_reason
  ) VALUES (v_uid,p_schedule_id,v_new_revision,p_starts_on,p_ends_on,p_timezone,p_slots,v_uid,'schedule_edited');
  RETURN v_new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.ls_revise_schedule(uuid,integer,date,date,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ls_revise_schedule(uuid,integer,date,date,text,jsonb,jsonb) TO authenticated;
