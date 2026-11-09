-- Execute the existing aggregate-only snapshot function
-- under its trusted owner instead of the API caller.
ALTER FUNCTION public.ls_learning_schedule_operational_snapshot()
  SECURITY DEFINER;

-- Explicitly keep this privileged RPC inaccessible
-- to public and ordinary authenticated clients.
REVOKE ALL ON FUNCTION
  public.ls_learning_schedule_operational_snapshot()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.ls_learning_schedule_operational_snapshot()
  TO service_role;