-- Focus Session V2 Phase 2: schema, constraints, RLS, activation gate.
-- Runs in a transaction and rolls back all fixtures.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000211', 'focus-p2-a@example.test'),
 ('00000000-0000-4000-8000-000000000212', 'focus-p2-b@example.test');
insert into public.profiles (id) values
 ('00000000-0000-4000-8000-000000000211'),
 ('00000000-0000-4000-8000-000000000212')
on conflict (id) do nothing;

insert into public.focus_sessions (id, user_id, planned_minutes, session_mode)
values
 ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000211', 100, 'pomodoro'),
 ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000212', 150, 'pomodoro');
insert into public.focus_sessions (id, user_id, planned_minutes, status, ended_at)
values ('00000000-0000-4000-8000-000000000223',
        '00000000-0000-4000-8000-000000000211', 25, 'completed', now());

insert into public.focus_session_plans
 (session_id, focus_minutes, short_break_minutes, long_break_minutes,
  round_count, long_break_every, auto_start_breaks, auto_start_focus)
values
 ('00000000-0000-4000-8000-000000000221', 25, 5, 15, 4, 4, false, false),
 ('00000000-0000-4000-8000-000000000222', 25, 5, 15, 6, 4, false, false);

insert into public.focus_session_segments
 (id, session_id, position, round_number, segment_kind, planned_seconds,
  status, started_at)
values
 ('00000000-0000-4000-8000-000000000231', '00000000-0000-4000-8000-000000000221', 1, 1, 'focus', 1500, 'running', now()),
 ('00000000-0000-4000-8000-000000000232', '00000000-0000-4000-8000-000000000221', 2, 1, 'short_break', 300, 'pending', null),
 ('00000000-0000-4000-8000-000000000233', '00000000-0000-4000-8000-000000000222', 8, 4, 'long_break', 900, 'pending', null);

insert into public.focus_user_preferences(user_id) values
 ('00000000-0000-4000-8000-000000000211'),
 ('00000000-0000-4000-8000-000000000212');

select is((select session_mode from public.focus_sessions where id = '00000000-0000-4000-8000-000000000223'),
  'legacy'::text, 'Old sessions default to legacy mode');
select ok((select planned_minutes = 100 from public.focus_sessions where id='00000000-0000-4000-8000-000000000221'),
  'Parent planned_minutes counts focus only');
select is((select count(*) from public.focus_session_plans), 2::bigint,
  'Plans stored one per Pomodoro parent');
select is((select count(*) from public.focus_session_segments), 3::bigint,
  'Segments are separate child rows');
select is((select segment_kind from public.focus_session_segments where position=8),
  'long_break'::text, 'Long-break schedule is valid after round 4');
select throws_ok(
  $$insert into public.focus_session_plans
      (session_id,focus_minutes,short_break_minutes,long_break_minutes,round_count,long_break_every,auto_start_breaks,auto_start_focus)
    values ('00000000-0000-4000-8000-000000000223',25,5,15,1,4,false,false)$$,
  '23514', 'Invalid Pomodoro parent or focus-only planned_minutes',
  'Legacy sessions cannot carry Pomodoro plans');
select throws_ok(
  $$insert into public.focus_session_segments
      (session_id,position,round_number,segment_kind,planned_seconds)
    values ('00000000-0000-4000-8000-000000000221',4,2,'long_break',900)$$,
  '23514', 'Segment differs from Pomodoro plan',
  'Long breaks are rejected at the wrong round');
select throws_ok(
  $$insert into public.focus_session_segments
      (session_id,position,round_number,segment_kind,planned_seconds,status,started_at)
    values ('00000000-0000-4000-8000-000000000221',3,2,'focus',1500,'running',now())$$,
  '23505', 'duplicate key value violates unique constraint "one_live_focus_v2_segment_per_session"',
  'Partial index prevents two simultaneously active segments');
select throws_ok(
  $$insert into public.focus_session_segments
      (session_id,position,round_number,segment_kind,planned_seconds,status)
    values ('00000000-0000-4000-8000-000000000221',3,2,'focus',1500,'paused')$$,
  '23514', 'new row for relation "focus_session_segments" violates check constraint "focus_v2_segment_temporal_integrity"',
  'Paused segments require a pause timestamp');

select ok((select relrowsecurity from pg_class where oid='public.focus_session_plans'::regclass)
  and (select relrowsecurity from pg_class where oid='public.focus_session_segments'::regclass)
  and (select relrowsecurity from pg_class where oid='public.focus_user_preferences'::regclass),
  'All new tables have RLS enabled');
select ok(not has_table_privilege('authenticated','public.focus_session_plans','INSERT')
  and not has_table_privilege('authenticated','public.focus_session_segments','UPDATE')
  and has_table_privilege('authenticated','public.focus_session_segments','SELECT'),
  'Clients cannot write plan/segment data before lifecycle RPC activation');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000211',true);
select is((select count(*) from public.focus_session_plans),1::bigint,
  'RLS reveals only the caller’s plan');
select is((select count(*) from public.focus_session_segments),2::bigint,
  'RLS reveals only the caller’s segments');
select is((select count(*) from public.focus_user_preferences),1::bigint,
  'RLS reveals only the caller’s preferences');
update public.focus_user_preferences set focus_minutes=45
where user_id='00000000-0000-4000-8000-000000000212';
select is((select focus_minutes from public.focus_user_preferences
  where user_id='00000000-0000-4000-8000-000000000211'),25,
  'Cross-user preference update cannot change own record');
select throws_ok(
  $$insert into public.focus_user_preferences(user_id)
    values('00000000-0000-4000-8000-000000000213')$$,
  '42501', NULL, 'Preferences cannot be inserted for another user');
select throws_ok(
  $$insert into public.focus_sessions(user_id,planned_minutes,session_mode)
    values('00000000-0000-4000-8000-000000000211',25,'pomodoro')$$,
  '42501', NULL,
  'Activation gate disallows client-created Pomodoro parents before Phase 3');
reset role;
select is((select focus_minutes from public.focus_user_preferences
  where user_id='00000000-0000-4000-8000-000000000212'),25,
  'Cross-user attempted update made no changes');
select is((select count(*) from public.focus_sessions
  where session_mode='pomodoro'),2::bigint,
  'Gate does not create any extra Pomodoro parents');

select * from finish();
rollback;
