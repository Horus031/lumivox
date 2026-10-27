-- Phase 03 Step 3.5A: audit schedule-driven session cancellations.
-- Forward-only migration; existing RPCs need not be rewritten.
-- Trigger executes within the same statement/transaction as the cancellation.
CREATE OR REPLACE FUNCTION public.ls_audit_schedule_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'scheduled'
     AND NEW.status = 'cancelled'
     AND NEW.cancellation_reason = 'schedule_changed' THEN
    INSERT INTO public.task_study_session_events (
      user_id, session_id, event_type, from_status, to_status,
      actor_id, event_key, payload
    ) VALUES (
      NEW.user_id, NEW.id, 'cancelled', OLD.status, NEW.status,
      auth.uid(), 'ls:schedule-change-cancel:' || NEW.id::text,
      pg_catalog.jsonb_build_object(
        'reason', NEW.cancellation_reason,
        'scheduleId', NEW.schedule_id,
        'scheduleRevision', NEW.schedule_revision,
        'scheduledStartAt', OLD.scheduled_start_at,
        'scheduledEndAt', OLD.scheduled_end_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ls_audit_schedule_cancellation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ls_audit_schedule_cancellation_trigger
AFTER UPDATE OF status, cancellation_reason
ON public.task_study_sessions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.ls_audit_schedule_cancellation();
