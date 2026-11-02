-- Lumivox Learning Schedule: Phase 02 — additive, no data backfill.
-- Review before applying. No application writes or email sending are enabled here.

-- Composite FKs guarantee tenant-consistent parent/child relationships.
-- Existing task PK remains unchanged.
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_id_user_id_unique UNIQUE (id, user_id);

CREATE TABLE public.task_study_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id uuid NOT NULL UNIQUE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','closed')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_schedule_date_range CHECK (ends_on >= starts_on),
  CONSTRAINT ls_schedule_timezone_nonblank CHECK (length(btrim(timezone)) BETWEEN 1 AND 128),
  CONSTRAINT ls_schedule_task_owner_fk FOREIGN KEY (task_id, user_id)
    REFERENCES public.tasks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT ls_schedule_id_owner_unique UNIQUE (id, user_id),
  CONSTRAINT ls_schedule_id_task_owner_unique UNIQUE (id, task_id, user_id)
);

CREATE TABLE public.task_study_schedule_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  timezone text NOT NULL,
  slots_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(slots_snapshot) = 'array'),
  changed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_rev_dates CHECK (ends_on >= starts_on),
  CONSTRAINT ls_rev_schedule_owner_fk FOREIGN KEY (schedule_id, user_id)
    REFERENCES public.task_study_schedules (id, user_id) ON DELETE CASCADE,
  CONSTRAINT ls_rev_unique UNIQUE (schedule_id, revision)
);

CREATE TABLE public.task_study_schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_slot_same_day CHECK (start_time < end_time),
  CONSTRAINT ls_slot_schedule_owner_fk FOREIGN KEY (schedule_id, user_id)
    REFERENCES public.task_study_schedules (id, user_id) ON DELETE CASCADE,
  CONSTRAINT ls_slot_unique UNIQUE (schedule_id, weekday, start_time, end_time),
  CONSTRAINT ls_slot_id_owner_unique UNIQUE (id, user_id)
);

CREATE TABLE public.task_study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  schedule_revision integer NOT NULL CHECK (schedule_revision > 0),
  source_slot_id uuid NULL,
  logical_occurrence_key text NOT NULL,
  replaces_session_id uuid NULL,
  local_date date NOT NULL,
  local_start_time time without time zone NOT NULL,
  local_end_time time without time zone NOT NULL,
  timezone text NOT NULL,
  scheduled_start_at timestamptz NOT NULL,
  scheduled_end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','missed','skipped','cancelled')),
  completed_at timestamptz NULL,
  actual_study_minutes integer NULL CHECK (actual_study_minutes >= 0),
  cancellation_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_session_same_day CHECK (local_start_time < local_end_time),
  CONSTRAINT ls_session_instant_order CHECK (scheduled_end_at > scheduled_start_at),
  CONSTRAINT ls_session_key_nonblank CHECK (length(btrim(logical_occurrence_key)) BETWEEN 1 AND 256),
  CONSTRAINT ls_session_completion CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT ls_session_task_owner_fk FOREIGN KEY (task_id, user_id)
    REFERENCES public.tasks (id, user_id) ON DELETE CASCADE,
  CONSTRAINT ls_session_schedule_task_owner_fk FOREIGN KEY (schedule_id, task_id, user_id)
    REFERENCES public.task_study_schedules (id, task_id, user_id) ON DELETE CASCADE,
  CONSTRAINT ls_session_slot_owner_fk FOREIGN KEY (source_slot_id, user_id)
    REFERENCES public.task_study_schedule_slots (id, user_id) ON DELETE SET NULL (source_slot_id),
  CONSTRAINT ls_session_replaces_owner_fk FOREIGN KEY (replaces_session_id, user_id)
    REFERENCES public.task_study_sessions (id, user_id),
  CONSTRAINT ls_session_id_owner_unique UNIQUE (id, user_id)
);
-- One *current* obligation per logical key; completed and superseded history coexist.
CREATE UNIQUE INDEX ls_one_open_obligation_per_key
  ON public.task_study_sessions (schedule_id, logical_occurrence_key)
  WHERE status IN ('scheduled', 'in_progress', 'missed', 'skipped');
CREATE INDEX ls_sessions_user_start_idx
  ON public.task_study_sessions (user_id, scheduled_start_at);
CREATE INDEX ls_sessions_schedule_local_idx
  ON public.task_study_sessions (schedule_id, local_date);
CREATE INDEX ls_sessions_task_status_idx
  ON public.task_study_sessions (task_id, status);

CREATE TABLE public.task_study_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN
    ('created','started','completed','marked_missed','skipped','recovered','rescheduled','cancelled','correction')),
  from_status text NULL,
  to_status text NULL,
  actor_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_key text NOT NULL CHECK (length(btrim(event_key)) BETWEEN 1 AND 256),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ls_event_session_owner_fk FOREIGN KEY (session_id, user_id)
    REFERENCES public.task_study_sessions (id, user_id) ON DELETE CASCADE,
  CONSTRAINT ls_event_dedupe UNIQUE (session_id, event_key)
);
CREATE INDEX ls_events_user_created_idx ON public.task_study_session_events (user_id, created_at DESC);

-- Existing project's timestamp trigger, verified in baseline migration.
CREATE TRIGGER set_ls_schedules_updated_at BEFORE UPDATE ON public.task_study_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_ls_sessions_updated_at BEFORE UPDATE ON public.task_study_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Root Task and Task status are checked by a database trigger as well as future RPC.
-- This catches privileged writes but is not a substitute for authenticated command validation.
CREATE FUNCTION public.ls_validate_schedule_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE p record;
BEGIN
  SELECT parent_task_id, status INTO p
  FROM public.tasks WHERE id = NEW.task_id AND user_id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Study schedule task not found'; END IF;
  IF p.parent_task_id IS NOT NULL THEN
    RAISE EXCEPTION 'Study schedules are supported for root tasks only';
  END IF;
  IF p.status NOT IN ('todo','in_progress') AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Study schedule cannot be active for this task status';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ls_schedule_parent_guard BEFORE INSERT OR UPDATE OF task_id, user_id, status
ON public.task_study_schedules FOR EACH ROW EXECUTE FUNCTION public.ls_validate_schedule_parent();

-- Phase 02: authenticated users can READ only their own records.
-- Writes must wait for reviewed SECURITY DEFINER RPCs in Phase 03/05.
ALTER TABLE public.task_study_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_study_schedule_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_study_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_study_session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ls_schedules_read ON public.task_study_schedules FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY ls_revisions_read ON public.task_study_schedule_revisions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY ls_slots_read ON public.task_study_schedule_slots FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY ls_sessions_read ON public.task_study_sessions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY ls_events_read ON public.task_study_session_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.task_study_schedules,
  public.task_study_schedule_revisions,
  public.task_study_schedule_slots,
  public.task_study_sessions,
  public.task_study_session_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.task_study_schedules,
  public.task_study_schedule_revisions,
  public.task_study_schedule_slots,
  public.task_study_sessions,
  public.task_study_session_events TO authenticated;
