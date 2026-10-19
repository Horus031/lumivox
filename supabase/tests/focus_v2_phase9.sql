-- Phase 9 RLS / immutable snapshot regression. Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000291','focus-phase9-a@example.test'),
 ('00000000-0000-4000-8000-000000000292','focus-phase9-b@example.test');
insert into public.profiles(id) values
 ('00000000-0000-4000-8000-000000000291'),
 ('00000000-0000-4000-8000-000000000292')
on conflict (id) do nothing;

insert into public.focus_sessions(id,user_id,planned_minutes,session_mode,started_at,status)
values ('00000000-0000-4000-8000-000000000293',
 '00000000-0000-4000-8000-000000000291',25,'pomodoro',now(),'ongoing');
insert into public.focus_session_plans(
 session_id,focus_minutes,short_break_minutes,long_break_minutes,
 round_count,long_break_every,auto_start_breaks,auto_start_focus)
values ('00000000-0000-4000-8000-000000000293',25,5,15,1,4,false,false);
insert into public.focus_session_segments(session_id,position,round_number,segment_kind,planned_seconds,status,started_at)
values ('00000000-0000-4000-8000-000000000293',1,1,'focus',1500,'running',now());
insert into public.focus_sessions(id,user_id,planned_minutes,session_mode,started_at,ended_at,status)
values ('00000000-0000-4000-8000-000000000294',
 '00000000-0000-4000-8000-000000000291',25,'legacy',now(),now(),'completed');

select ok((select count(*)=1 from pg_policies
 where schemaname='public' and tablename='focus_sessions'
 and policyname='focus_v2_legacy_only_delete' and permissive='RESTRICTIVE'),
 'Pomodoro DELETE restriction is deployed');
select ok((select relrowsecurity from pg_class where oid='public.focus_sessions'::regclass),
 'Focus parents remain protected by RLS');
select ok(has_table_privilege('authenticated','public.focus_sessions','DELETE'),
 'Legacy users retain the original DELETE grant');
select throws_ok(
 $$update public.focus_session_plans set focus_minutes=30
   where session_id='00000000-0000-4000-8000-000000000293'$$,
 '23514','Pomodoro plan configuration is immutable',
 'Privileged attempt to mutate a plan is rejected');
select is((select focus_minutes from public.focus_session_plans
 where session_id='00000000-0000-4000-8000-000000000293'),25,
 'Snapshot remains unchanged after rejected update');
select ok(not has_function_privilege('authenticated',
 'public.focus_v2_create_session(uuid,uuid,integer,integer,integer,integer,integer,boolean,boolean)', 'EXECUTE'),
 'Authenticated cannot call privileged create RPC');
select ok(not has_function_privilege('authenticated',
 'public.focus_v2_transition(uuid,uuid,text,uuid)', 'EXECUTE'),
 'Authenticated cannot call privileged transition RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000291',true);
with deleted as (
 delete from public.focus_sessions where id='00000000-0000-4000-8000-000000000293'
 returning id
)
select is((select count(*) from deleted),0::bigint,
 'Authenticated DELETE cannot remove active Pomodoro parent');
select is((select count(*) from public.focus_session_segments
 where session_id='00000000-0000-4000-8000-000000000293'),1::bigint,
 'Pomodoro segments remain intact after rejected deletion');
with deleted as (
 delete from public.focus_sessions where id='00000000-0000-4000-8000-000000000294'
 returning id
)
select is((select count(*) from deleted),1::bigint,
 'Legacy parent remains deletable under existing policy');
reset role;
select is((select count(*) from public.focus_session_plans
 where session_id='00000000-0000-4000-8000-000000000293'),1::bigint,
 'Pomodoro immutable plan remains intact');
select is((select count(*) from public.focus_sessions
 where id='00000000-0000-4000-8000-000000000293'),1::bigint,
 'Pomodoro parent remains intact');

select * from finish();
rollback;
