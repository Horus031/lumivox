
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(5);

SELECT is(
  public.ls_earliest_local_instant(
    '2026-11-01',
    '01:30',
    'America/New_York'
  ),
  '2026-11-01 05:30:00+00'::timestamptz,
  'Fall-back fold chooses earlier UTC instant'
);

SELECT isnt(
  public.ls_earliest_local_instant(
    '2026-11-01',
    '01:30',
    'America/New_York'
  ),
  '2026-11-01 06:30:00+00'::timestamptz,
  'Later fold instant is not canonical'
);

SELECT is(
  public.ls_earliest_local_instant(
    '2026-03-08',
    '02:30',
    'America/New_York'
  ),
  NULL::timestamptz,
  'Spring-forward nonexistent local time returns NULL'
);

SELECT is(
  public.ls_earliest_local_instant(
    '2026-11-02',
    '19:00',
    'Asia/Ho_Chi_Minh'
  ),
  '2026-11-02 12:00:00+00'::timestamptz,
  'Vietnam timezone converts correctly'
);

SELECT is(
  public.ls_earliest_local_instant(
    '2026-11-02',
    '19:00',
    'UTC'
  ),
  '2026-11-02 19:00:00+00'::timestamptz,
  'UTC timezone conversion remains correct'
);

SELECT * FROM finish();

ROLLBACK;
