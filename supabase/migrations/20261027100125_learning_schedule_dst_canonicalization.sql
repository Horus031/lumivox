
-- Phase 03 Step 3.5B: DST canonicalization.
-- Forward-only migration.
--
-- Policy:
-- * Nonexistent local datetime: reject.
-- * Ambiguous local datetime: choose earlier UTC instant.
-- * Existing historical session fields are not rewritten.

CREATE OR REPLACE FUNCTION public.ls_earliest_local_instant(
  p_local_date date,
  p_local_time time without time zone,
  p_timezone text
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH wall AS (
    SELECT
      (p_local_date + p_local_time) AS local_ts
  ),
  offsets AS (
    SELECT DISTINCT
      (
        pg_catalog.timezone(
          p_timezone,
          pg_catalog.timezone('UTC', wall.local_ts)
            + make_interval(hours => sample.hour_offset)
        )
        -
        pg_catalog.timezone(
          'UTC',
          pg_catalog.timezone('UTC', wall.local_ts)
            + make_interval(hours => sample.hour_offset)
        )
      ) AS utc_offset,
      wall.local_ts
    FROM wall
    CROSS JOIN LATERAL (
      SELECT generate_series(-48, 48, 6) AS hour_offset
    ) AS sample
  ),
  candidates AS (
    SELECT
      pg_catalog.timezone('UTC', local_ts) - utc_offset
        AS utc_instant,
      local_ts
    FROM offsets
  )
  SELECT min(utc_instant)
  FROM candidates
  WHERE pg_catalog.timezone(p_timezone, utc_instant)
        = local_ts;
$$;

CREATE OR REPLACE FUNCTION
  public.ls_validate_session_dst_canonical()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_expected_start timestamptz;
  v_expected_end timestamptz;
BEGIN
  v_expected_start :=
    public.ls_earliest_local_instant(
      NEW.local_date,
      NEW.local_start_time,
      NEW.timezone
    );

  v_expected_end :=
    public.ls_earliest_local_instant(
      NEW.local_date,
      NEW.local_end_time,
      NEW.timezone
    );

  IF v_expected_start IS NULL
     OR v_expected_end IS NULL
     OR NEW.scheduled_start_at IS DISTINCT FROM v_expected_start
     OR NEW.scheduled_end_at IS DISTINCT FROM v_expected_end
  THEN
    RAISE EXCEPTION
      'Noncanonical or nonexistent local study time'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.ls_earliest_local_instant(date,time,text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.ls_validate_session_dst_canonical()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ls_session_dst_canonical_guard
BEFORE INSERT OR UPDATE OF
  local_date,
  local_start_time,
  local_end_time,
  timezone,
  scheduled_start_at,
  scheduled_end_at
ON public.task_study_sessions
FOR EACH ROW
EXECUTE FUNCTION public.ls_validate_session_dst_canonical();
