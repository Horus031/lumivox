
-- Phase 05 / Step 5.6A
-- Deterministic timezone and DST calendar tests.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap
  WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT plan(8);

-- America/New_York enters DST on 2026-03-08.
-- For a session dated March 1, recovery ends
-- at local midnight March 9 (UTC 04:00).

SELECT is(
  (
    (date '2026-03-01' + 8)::timestamp
    AT TIME ZONE 'America/New_York'
  ),
  timestamptz '2026-03-09 04:00:00+00',
  'DST spring-forward recovery cutoff uses local midnight'
);

-- A seven-day elapsed-time calculation from the original
-- March 1 midnight produces a different instant.

SELECT isnt(
  (
    (date '2026-03-01'::timestamp
      AT TIME ZONE 'America/New_York')
    + interval '7 days'
  ),
  (
    (date '2026-03-01' + 8)::timestamp
      AT TIME ZONE 'America/New_York'
  ),
  'Recovery cutoff is not seven elapsed 24-hour periods'
);

-- Fall-back occurs in New York on 2026-11-01.

SELECT is(
  (
    (date '2026-10-25' + 8)::timestamp
    AT TIME ZONE 'America/New_York'
  ),
  timestamptz '2026-11-02 05:00:00+00',
  'DST fall-back recovery cutoff uses local midnight'
);

-- Asia/Ho_Chi_Minh has UTC+07 at these dates.

SELECT is(
  (
    (date '2026-11-10' + 8)::timestamp
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ),
  timestamptz '2026-11-17 17:00:00+00',
  'Ho Chi Minh recovery cutoff is Nov 18 local midnight'
);

-- An instant strictly before cutoff is within the window.

SELECT ok(
  timestamptz '2026-11-17 16:59:59.999999+00'
  <
  (
    (date '2026-11-10' + 8)::timestamp
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ),
  'One microsecond before cutoff is eligible'
);

-- Exactly at cutoff is not eligible.

SELECT ok(
  NOT (
    timestamptz '2026-11-17 17:00:00+00'
    <
    (
      (date '2026-11-10' + 8)::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )
  ),
  'Exactly at cutoff is ineligible'
);

-- Grace is an elapsed-time rule, not a local-calendar rule.

SELECT is(
  timestamptz '2026-03-08 07:00:00+00'
    + interval '60 minutes',
  timestamptz '2026-03-08 08:00:00+00',
  'Missed grace is exactly 60 elapsed minutes'
);

-- The grace deadline is inclusive for the sweep.

SELECT ok(
  timestamptz '2026-03-08 08:00:00+00'
  >=
  (
    timestamptz '2026-03-08 07:00:00+00'
      + interval '60 minutes'
  ),
  'At grace cutoff a scheduled session is sweep eligible'
);

SELECT * FROM finish();

ROLLBACK;
