
-- Lumivox Phase 05 / Step 5.6B-2B.2B
-- Exact fixed-instant boundary arithmetic.
-- Does not replace real clock-crossing RPC tests.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT plan(12);

-- ---------------------------------------------------------
-- Grace cutoff: inclusive for Sweep, exclusive for
-- Start and Complete.
-- ---------------------------------------------------------

CREATE TEMP TABLE cutoff_grace AS
SELECT
  timestamptz '2026-11-01 12:00:00+00'
    AS scheduled_end_at,
  timestamptz '2026-11-01 13:00:00+00'
    AS grace_deadline;

SELECT ok(
  timestamptz '2026-11-01 12:59:59.999999+00'
    < grace_deadline,
  'PREC-01 just before grace permits attendance'
)
FROM cutoff_grace;

SELECT ok(
  NOT (
    timestamptz '2026-11-01 13:00:00+00'
      < grace_deadline
  ),
  'PREC-02 exact grace cutoff denies attendance'
)
FROM cutoff_grace;

SELECT ok(
  timestamptz '2026-11-01 13:00:00+00'
    >= grace_deadline,
  'PREC-03 exact grace cutoff permits Sweep'
)
FROM cutoff_grace;

SELECT ok(
  NOT (
    timestamptz '2026-11-01 12:59:59.999999+00'
      >= grace_deadline
  ),
  'PREC-04 Sweep cannot mark missed before grace'
)
FROM cutoff_grace;

-- ---------------------------------------------------------
-- Recovery: local_date + 8 midnight, exclusive.
-- ---------------------------------------------------------

CREATE TEMP TABLE cutoff_recovery AS
SELECT
  date '2026-11-10' AS original_date,
  'Asia/Ho_Chi_Minh'::text AS zone,
  (
    (date '2026-11-10' + 8)::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ) AS recovery_deadline;

SELECT is(
  recovery_deadline,
  timestamptz '2026-11-17 17:00:00+00',
  'PREC-05 recovery cutoff maps to Nov 18 local midnight'
)
FROM cutoff_recovery;

SELECT ok(
  timestamptz '2026-11-17 16:59:59.999999+00'
    < recovery_deadline,
  'PREC-06 before midnight remains recoverable'
)
FROM cutoff_recovery;

SELECT ok(
  NOT (
    timestamptz '2026-11-17 17:00:00+00'
      < recovery_deadline
  ),
  'PREC-07 exact midnight rejects recovery'
)
FROM cutoff_recovery;

SELECT ok(
  NOT (
    timestamptz '2026-11-17 17:00:00.000001+00'
      < recovery_deadline
  ),
  'PREC-08 after midnight rejects recovery'
)
FROM cutoff_recovery;

-- ---------------------------------------------------------
-- DST: use local calendar dates, not a fixed UTC offset.
-- ---------------------------------------------------------

-- New York spring-forward takes place March 8, 2026.

SELECT is(
  (
    (date '2026-03-01' + 8)::timestamp
      AT TIME ZONE 'America/New_York'
  ),
  timestamptz '2026-03-09 04:00:00+00',
  'PREC-09 spring-forward recovery local midnight'
);

-- New York fall-back takes place November 1, 2026.

SELECT is(
  (
    (date '2026-10-25' + 8)::timestamp
      AT TIME ZONE 'America/New_York'
  ),
  timestamptz '2026-11-02 05:00:00+00',
  'PREC-10 fall-back recovery local midnight'
);

-- Different timezone, same original local date.
-- This proves that timezone is part of the cutoff.

SELECT isnt(
  (
    (date '2026-11-10' + 8)::timestamp
      AT TIME ZONE 'America/New_York'
  ),
  (
    (date '2026-11-10' + 8)::timestamp
      AT TIME ZONE 'Asia/Tokyo'
  ),
  'PREC-11 historical timezone materially changes cutoff'
);

-- The grace period uses elapsed instants even over DST.

SELECT is(
  timestamptz '2026-03-08 06:30:00+00'
    + interval '60 minutes',
  timestamptz '2026-03-08 07:30:00+00',
  'PREC-12 grace remains exactly 60 elapsed minutes'
);

SELECT * FROM finish();

ROLLBACK;

