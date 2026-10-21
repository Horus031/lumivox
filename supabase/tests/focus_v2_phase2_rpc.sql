-- Phase 2 lifecycle RPC tests, including transition safety and completion totals.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);
insert into auth.users (id,email)
values ('00000000-0000-4000-8000-000000000241','focus-phase2-rpc-a@example.test'),
       ('00000000-0000-4000-8000-000000000242','focus-phase2-rpc-b@example.test');
insert into public.profiles(id) values
  ('00000000-0000-4000-8000-000000000241'),
  ('00000000-0000-4000-8000-000000000242')
on conflict (id) do nothing;
create temporary table phase2_ids (session_id uuid, first_segment_id uuid, second_segment_id uuid, third_segment_id uuid);
insert into phase2_ids(session_id)
select public.focus_v2_create_session(
  '00000000-0000-4000-8000-000000000241', null,
  5,1,15,2,4,false,false
);
update phase2_ids set
 first_segment_id=(select id from public.focus_session_segments where session_id=phase2_ids.session_id and position=1),
 second_segment_id=(select id from public.focus_session_segments where session_id=phase2_ids.session_id and position=2),
 third_segment_id=(select id from public.focus_session_segments where session_id=phase2_ids.session_id and position=3);
select is((select count(*) from public.focus_session_segments where session_id=(select session_id from phase2_ids)), 3::bigint,
  'Atomic session creation pre-creates exactly 2*N-1 segments');
select is((select count(*) from public.focus_session_segments where session_id=(select session_id from phase2_ids) and status='running'), 1::bigint,
  'Exactly the first focus segment starts running');
select throws_ok(
  $$select public.focus_v2_create_session('00000000-0000-4000-8000-000000000241',null,5,1,15,2,4,false,false)$$,
  '23505', NULL, 'Unique active parent prevents double creation');
select throws_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000242',
    (select session_id from phase2_ids),'pause',(select first_segment_id from phase2_ids))$$,
  'P0001','Focus session state changed','Wrong owner cannot mutate a session');
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'pause',(select first_segment_id from phase2_ids))$$,
  'Running focus pauses with its parent');
select is((select status from public.focus_session_segments where id=(select first_segment_id from phase2_ids)),
  'paused'::text, 'Segment status is paused');
select throws_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'pause',(select first_segment_id from phase2_ids))$$,
  'P0001','Focus segment state changed','Retrying pause is rejected');
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'resume',(select first_segment_id from phase2_ids))$$,
  'Paused segment resumes with its parent');
select throws_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'resume',(select first_segment_id from phase2_ids))$$,
  'P0001','Focus segment state changed','Retrying resume cannot double-count pause');
update public.focus_session_segments set started_at=now()-interval '6 minutes'
 where id=(select first_segment_id from phase2_ids);
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'complete',(select first_segment_id from phase2_ids))$$,
  'First focus round completes after reaching planned duration');
select is((select status from public.focus_session_segments where id=(select second_segment_id from phase2_ids)),
  'pending'::text, 'Break waits for explicit start when auto-start is disabled');
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'start_next',(select second_segment_id from phase2_ids))$$,
  'Start next segment after completed previous');
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'skip_break',(select second_segment_id from phase2_ids))$$,
  'Break can be skipped without awarding focus time');
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'start_next',(select third_segment_id from phase2_ids))$$,
  'Second focus starts');
update public.focus_session_segments set started_at=now()-interval '6 minutes'
 where id=(select third_segment_id from phase2_ids);
select lives_ok(
  $$select public.focus_v2_transition('00000000-0000-4000-8000-000000000241',
    (select session_id from phase2_ids),'complete',(select third_segment_id from phase2_ids))$$,
  'Final focus completes the parent');
select is((select actual_focus_minutes from public.focus_sessions where id=(select session_id from phase2_ids)),
  10, 'Actual focus excludes skipped breaks and counts both focus rounds');
select is((select status::text from public.focus_sessions where id=(select session_id from phase2_ids)),
  'completed'::text, 'Parent marks completed exactly once');
select ok(not has_function_privilege('authenticated',
  'public.focus_v2_transition(uuid,uuid,text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role',
  'public.focus_v2_transition(uuid,uuid,text,uuid)', 'EXECUTE'),
  'Lifecycle functions are restricted to service_role');
select * from finish();
rollback;
