-- Phase 2: auto-start, cancellation while paused, idempotency guards.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);
insert into auth.users (id,email)
values ('00000000-0000-4000-8000-000000000251','focus-phase2-edge-a@example.test'),
       ('00000000-0000-4000-8000-000000000252','focus-phase2-edge-b@example.test');
insert into public.profiles(id) values
 ('00000000-0000-4000-8000-000000000251'),
 ('00000000-0000-4000-8000-000000000252')
on conflict (id) do nothing;
create temporary table edge_sessions (user_id uuid, session_id uuid, first_id uuid, break_id uuid, second_id uuid);
insert into edge_sessions (user_id,session_id) values
 ('00000000-0000-4000-8000-000000000251',public.focus_v2_create_session(
    '00000000-0000-4000-8000-000000000251',null,5,1,15,2,4,true,true)),
 ('00000000-0000-4000-8000-000000000252',public.focus_v2_create_session(
    '00000000-0000-4000-8000-000000000252',null,5,1,15,2,4,false,false));
update edge_sessions set
 first_id=(select id from public.focus_session_segments where session_id=edge_sessions.session_id and position=1),
 break_id=(select id from public.focus_session_segments where session_id=edge_sessions.session_id and position=2),
 second_id=(select id from public.focus_session_segments where session_id=edge_sessions.session_id and position=3);

update public.focus_session_segments set started_at=now()-interval '6 minutes'
 where id=(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251');
select lives_ok(
 $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000251',
  (select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251'),
  'complete',(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251'))$$,
 'Focus completion advances with auto-start');
select is((select status from public.focus_session_segments
 where id=(select break_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251')),
 'running'::text, 'Auto-start starts break immediately');
select throws_ok(
 $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000251',
  (select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251'),
  'complete',(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251'))$$,
 'P0001','Focus segment state changed','A completed segment cannot complete twice');
update public.focus_session_segments set started_at=now()-interval '2 minutes'
 where id=(select break_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251');
select lives_ok(
 $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000251',
  (select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251'),
  'complete',(select break_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251'))$$,
 'Completing a break advances to next focus');
select is((select status from public.focus_session_segments
 where id=(select second_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000251')),
 'running'::text, 'Auto-start begins the next focus round');

update public.focus_session_segments set started_at=now()-interval '3 minutes'
 where id=(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252');
select lives_ok(
 $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000252',
  (select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252'),
  'pause',(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252'))$$,
 'Focus pauses after 3 minutes');
select lives_ok(
 $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000252',
  (select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252'),
  'cancel',(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252'))$$,
 'Paused cancellation closes active segment');
select is((select actual_focus_minutes from public.focus_sessions
 where id=(select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252')),
 3, 'Cancelled session includes partial focus but no paused interval');
select is((select status::text from public.focus_sessions
 where id=(select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252')),
 'cancelled'::text, 'Cancellation closes parent');
select throws_ok(
 $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000252',
  (select session_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252'),
  'cancel',(select first_id from edge_sessions where user_id='00000000-0000-4000-8000-000000000252'))$$,
 'P0001','Focus session state changed','Repeated cancellation has no side effects');
select * from finish();
rollback;
