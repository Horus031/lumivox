-- Phase 03 Step 3.5D-A
-- Close learning schedules when the owning Task closes.
-- All writes run in the same transaction as the Task update.

CREATE OR REPLACE FUNCTION public.ls_handle_task_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only act when a Task transitions into a closed state.
  IF NEW.status::text NOT IN ('completed', 'cancelled')
     OR OLD.status IS NOT DISTINCT FROM NEW.status
  THEN
    RETURN NEW;
  END IF;

  -- Do not resurrect schedules on Task reopening.
  UPDATE public.task_study_schedules
  SET status = 'closed'
  WHERE task_id = NEW.id
    AND user_id = NEW.user_id
    AND status <> 'closed';

  -- Mark future unstarted obligations as cancelled.
  -- Audit inserts below are part of the same transaction.
  WITH cancelled AS (
    UPDATE public.task_study_sessions
    SET
      status = 'cancelled',
      cancellation_reason = 'task_closed'
    WHERE task_id = NEW.id
      AND user_id = NEW.user_id
      AND status = 'scheduled'
      AND scheduled_start_at > now()
    RETURNING
      id,
      user_id,
      scheduled_start_at,
      scheduled_end_at,
      schedule_id
  )
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
  SELECT
    c.user_id,
    c.id,
    'cancelled',
    'scheduled',
    'cancelled',
    auth.uid(),
    'ls:task-close:' || c.id::text,
    pg_catalog.jsonb_build_object(
      'reason', 'task_closed',
      'taskId', NEW.id,
      'taskStatus', NEW.status::text,
      'scheduleId', c.schedule_id,
      'scheduledStartAt', c.scheduled_start_at,
      'scheduledEndAt', c.scheduled_end_at
    )
  FROM cancelled c;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ls_handle_task_closed()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ls_task_closed_sync
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.ls_handle_task_closed();
