-- Phase 02 Step 2.3: forward-only foundation hardening.
-- Existing logical occurrences must not be re-created after completion.
DROP INDEX IF EXISTS public.ls_one_open_obligation_per_key;
CREATE UNIQUE INDEX ls_one_effective_obligation_per_key
  ON public.task_study_sessions (schedule_id, logical_occurrence_key)
  WHERE status <> 'cancelled';

-- Overlapping slots in one schedule/weekday are invalid. Adjacent slots are allowed.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER TABLE public.task_study_schedule_slots
  ADD CONSTRAINT ls_slots_no_overlap
  EXCLUDE USING gist (
    schedule_id WITH =,
    weekday WITH =,
    tsrange(
      date '2000-01-01' + start_time,
      date '2000-01-01' + end_time,
      '[)'
    ) WITH &&
  );
