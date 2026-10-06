begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000098', 'workspace-phase8@example.test');
insert into public.profiles (id)
values ('00000000-0000-4000-8000-000000000098')
on conflict (id) do nothing;
insert into public.tasks (id, user_id, title, status)
values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000098',
  'Phase 8 reliability fixture', 'in_progress'
);

-- Read the current task version for each request, as the service does.
create function pg_temp.reserve_review(request_id uuid)
returns table (
  attempt_id uuid, attempt_number integer,
  attempt_status public.task_review_attempt_status, reused boolean
)
language sql as $$
  select reservation.*
  from public.tasks task
  cross join lateral public.begin_task_review_generation(
    task.user_id, task.id, task.status, task.updated_at,
    request_id, 70, '{}'::jsonb, '{}'::jsonb, 900
  ) reservation
  where task.id = '00000000-0000-4000-8000-000000000801';
$$;

create temporary table first_reservation as
select * from pg_temp.reserve_review('00000000-0000-4000-8000-000000000811');
select ok((select not reused and attempt_number = 1 from first_reservation),
  'First generation reserves a new attempt');
select is(
  (select attempt_id from pg_temp.reserve_review('00000000-0000-4000-8000-000000000811')),
  (select attempt_id from first_reservation), 'Exact generation retry reuses the attempt');
select is(
  (select attempt_id from pg_temp.reserve_review('00000000-0000-4000-8000-000000000812')),
  (select attempt_id from first_reservation), 'Different request reuses an active generation');
select is((select count(*) from public.task_review_attempts
  where task_id = '00000000-0000-4000-8000-000000000801'),
  1::bigint, 'Generation retries do not duplicate attempts');

update public.task_review_attempts set created_at = now() - interval '1 hour'
where id = (select attempt_id from first_reservation);
create temporary table next_reservation as
select * from pg_temp.reserve_review('00000000-0000-4000-8000-000000000813');
select ok(
  (select status = 'generation_failed' from public.task_review_attempts
    where id = (select attempt_id from first_reservation))
  and (select not reused and attempt_number = 2 from next_reservation),
  'Stale generation fails and a new request reserves the next attempt');

select ok(
  not has_function_privilege('authenticated',
    'public.begin_task_review_generation(uuid,uuid,public.task_status,timestamptz,uuid,numeric,jsonb,jsonb,integer)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.begin_task_review_generation(uuid,uuid,public.task_status,timestamptz,uuid,numeric,jsonb,jsonb,integer)', 'EXECUTE'),
  'Generation reservation is restricted to the service role');
select ok(
  not has_function_privilege('authenticated',
    'public.finalize_task_review_submission_v2(uuid,uuid,uuid,numeric,jsonb,jsonb,text)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.finalize_task_review_submission_v2(uuid,uuid,uuid,numeric,jsonb,jsonb,text)', 'EXECUTE'),
  'Submission v2 is restricted to the service role');

update public.task_review_attempts set status = 'ready'
where id = (select attempt_id from next_reservation);
insert into public.task_review_answer_keys (attempt_id, user_id, answer_key)
select attempt_id, '00000000-0000-4000-8000-000000000098'::uuid,
  '{"schema_version":"v1","questions":[]}'::jsonb from next_reservation;
update public.tasks set status = 'in_review'
where id = '00000000-0000-4000-8000-000000000801';

create function pg_temp.submit_review(fingerprint text)
returns table (
  attempt_id uuid, attempt_status public.task_review_attempt_status,
  score numeric, pass_threshold numeric, task_status public.task_status,
  task_updated_at timestamptz
)
language sql as $$
  select result.* from next_reservation reservation
  cross join lateral public.finalize_task_review_submission_v2(
    reservation.attempt_id, '00000000-0000-4000-8000-000000000098',
    '00000000-0000-4000-8000-000000000801', 80, '{}'::jsonb, '[]'::jsonb,
    fingerprint
  ) result;
$$;
select ok((select attempt_status = 'passed' and task_status = 'completed'
  from pg_temp.submit_review(repeat('a', 64))), 'Passing submission completes the task');
select ok((select attempt_status = 'passed' and score = 80
  from pg_temp.submit_review(repeat('a', 64))), 'Identical submission retry returns the saved result');
select throws_ok(
  $$select * from pg_temp.submit_review(repeat('b', 64))$$,
  'P0001', 'Review was already submitted with a different answer payload.',
  'Conflicting submission retry is rejected');
select is((select count(*) from public.task_status_events
  where task_id = '00000000-0000-4000-8000-000000000801'
    and source = 'review_pass'
    and review_attempt_id = (select attempt_id from next_reservation)),
  1::bigint, 'Submission retry does not duplicate the review pass audit event');
select ok(
  not has_table_privilege('authenticated', 'public.task_status_events', 'SELECT')
  and has_table_privilege('service_role', 'public.task_status_events', 'SELECT'),
  'Audit events are readable only by the service role among API roles');

select * from finish();
rollback;
