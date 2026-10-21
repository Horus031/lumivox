
begin;

create extension if not exists pgtap
  with schema extensions;

set local search_path = public, extensions;

select plan(6);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'distraction_events'
      and column_name = 'extension_event_id'
  ),
  'Extension event ID column exists'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'distraction_events'
      and column_name = 'extension_segment_id'
  ),
  'Extension segment ID column exists'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'distraction_events'
      and indexname =
        'uq_distraction_events_user_extension_event'
      and indexdef ilike '%UNIQUE%'
  ),
  'Extension events have a unique idempotency index'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.distraction_events'::regclass
      and tgname = 'protect_extension_distraction_key'
      and not tgisinternal
  ),
  'Idempotency key immutability trigger exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.distraction_events'::regclass
  ),
  'Distraction events remain protected by RLS'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.distraction_events'::regclass
      and conname = 'chk_extension_distraction_identity'
  ),
  'Extension event and segment IDs must be supplied together'
);

select * from finish();

rollback;
