-- Phase 03 Step 3.3: atomic creation only, no schedule revisions yet.
-- Payloads are calculated by Temporal on the authenticated Next.js server.
-- DB revalidates ownership, local wall time, slot coverage and bounded input.
CREATE OR REPLACE FUNCTION public.ls_create_schedule(
  p_task_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_timezone text,
  p_slots jsonb,
  p_occurrences jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_schedule_id uuid;
  v_task record;
  v_slot jsonb;
  v_occ jsonb;
  v_weekday smallint;
  v_start time;
  v_end time;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_date date;
  v_count integer := 0;
  v_expected_count integer;
  v_slot_id uuid;
  v_slot_index integer;
  v_key text;
  v_seen_keys text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id, parent_task_id, status INTO v_task
    FROM public.tasks WHERE id = p_task_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_task.parent_task_id IS NOT NULL OR v_task.status NOT IN ('todo','in_progress') THEN
    RAISE EXCEPTION 'Task is not eligible for scheduling' USING ERRCODE = '22023';
  END IF;
  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on
     OR p_ends_on - p_starts_on + 1 > 366 THEN
    RAISE EXCEPTION 'Invalid schedule date range' USING ERRCODE = '22023';
  END IF;
  IF p_timezone IS NULL OR length(trim(p_timezone)) NOT BETWEEN 1 AND 128 OR p_timezone <> trim(p_timezone)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone)
    OR p_starts_on < (now() AT TIME ZONE p_timezone)::date THEN
    RAISE EXCEPTION 'Invalid timezone or past start date' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_slots) NOT BETWEEN 1 AND 21
    OR jsonb_typeof(p_occurrences) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_occurrences) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid slots or occurrences' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.task_study_schedules(user_id,task_id,starts_on,ends_on,timezone)
  VALUES(v_uid,p_task_id,p_starts_on,p_ends_on,p_timezone)
  RETURNING id INTO v_schedule_id;

  -- Parse and insert slots. Database exclusion constraint rejects overlaps.
  FOR v_slot_index IN 0..jsonb_array_length(p_slots)-1 LOOP
    v_slot := p_slots -> v_slot_index;
    IF jsonb_typeof(v_slot) <> 'object'
       OR (v_slot->>'weekday') !~ '^[1-7]$'
       OR (v_slot->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_slot->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
       RAISE EXCEPTION 'Invalid slot format' USING ERRCODE='22023';
    END IF;
    v_weekday := (v_slot->>'weekday')::smallint;
    v_start := (v_slot->>'startTime')::time;
    v_end := (v_slot->>'endTime')::time;
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
    VALUES(v_uid,v_schedule_id,v_weekday,v_start,v_end);
  END LOOP;

  -- Expect exactly one occurrence for every matching date/slot.
  SELECT count(*) INTO v_expected_count
  FROM generate_series(p_starts_on,p_ends_on, interval '1 day') d
  JOIN public.task_study_schedule_slots s
    ON s.schedule_id = v_schedule_id AND s.weekday = EXTRACT(ISODOW FROM d)::integer;
  IF v_expected_count = 0 OR v_expected_count <> jsonb_array_length(p_occurrences) THEN
    RAISE EXCEPTION 'Occurrence count mismatch' USING ERRCODE='22023';
  END IF;

  FOR v_occ IN SELECT value FROM jsonb_array_elements(p_occurrences) LOOP
    IF jsonb_typeof(v_occ) <> 'object'
      OR (v_occ->>'localDate') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (v_occ->>'localStartTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (v_occ->>'localEndTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (v_occ->>'slotIndex') !~ '^(0|[1-9][0-9]*)$' THEN
      RAISE EXCEPTION 'Invalid occurrence format' USING ERRCODE='22023';
    END IF;
    v_date := (v_occ->>'localDate')::date;
    v_start := (v_occ->>'localStartTime')::time;
    v_end := (v_occ->>'localEndTime')::time;
    v_slot_index := (v_occ->>'slotIndex')::integer;
    IF v_date NOT BETWEEN p_starts_on AND p_ends_on
       OR v_slot_index >= jsonb_array_length(p_slots)
       OR (v_occ->>'timezone') IS DISTINCT FROM p_timezone THEN
      RAISE EXCEPTION 'Occurrence outside schedule' USING ERRCODE='22023';
    END IF;
    v_slot := p_slots -> v_slot_index;
    IF (v_slot->>'weekday')::integer <> EXTRACT(ISODOW FROM v_date)::integer
       OR (v_slot->>'startTime')::time <> v_start
       OR (v_slot->>'endTime')::time <> v_end THEN
       RAISE EXCEPTION 'Occurrence does not match source slot' USING ERRCODE='22023';
    END IF;
    v_key := v_date::text || '|' || (v_slot->>'weekday') || '|' || (v_slot->>'startTime') || '|' || (v_slot->>'endTime');
    IF v_key = ANY(v_seen_keys) OR (v_occ->>'occurrenceKey') IS DISTINCT FROM v_key THEN
       RAISE EXCEPTION 'Duplicate or invalid occurrence key' USING ERRCODE='22023';
    END IF;
    v_seen_keys := array_append(v_seen_keys,v_key);
    v_start_at := (v_occ->>'scheduledStartAt')::timestamptz;
    v_end_at := (v_occ->>'scheduledEndAt')::timestamptz;
    IF v_start_at >= v_end_at
       OR (v_start_at AT TIME ZONE p_timezone)::date <> v_date
       OR (v_start_at AT TIME ZONE p_timezone)::time <> v_start
       OR (v_end_at AT TIME ZONE p_timezone)::date <> v_date
       OR (v_end_at AT TIME ZONE p_timezone)::time <> v_end THEN
       RAISE EXCEPTION 'Occurrence timestamps do not match local times' USING ERRCODE='22023';
    END IF;
    -- Temporal has already selected earlier fold; DB validates wall-clock roundtrip.
    SELECT id INTO v_slot_id FROM public.task_study_schedule_slots
      WHERE schedule_id = v_schedule_id AND weekday = EXTRACT(ISODOW FROM v_date)::integer
      AND start_time=v_start AND end_time=v_end;
    IF v_slot_id IS NULL THEN RAISE EXCEPTION 'Missing occurrence slot' USING ERRCODE='22023'; END IF;
    INSERT INTO public.task_study_sessions(
      user_id,task_id,schedule_id,schedule_revision,source_slot_id,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at
    ) VALUES (
      v_uid,p_task_id,v_schedule_id,1,v_slot_id,v_key,
      v_date,v_start,v_end,p_timezone,v_start_at,v_end_at
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.task_study_schedule_revisions(
    user_id,schedule_id,revision,starts_on,ends_on,timezone,slots_snapshot,changed_by,change_reason
  ) VALUES(v_uid,v_schedule_id,1,p_starts_on,p_ends_on,p_timezone,p_slots,v_uid,'initial_creation');
  RETURN v_schedule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ls_create_schedule(uuid,date,date,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ls_create_schedule(uuid,date,date,text,jsonb,jsonb) TO authenticated;
