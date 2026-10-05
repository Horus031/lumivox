begin;

insert into auth.users (
  id,
  email
)
values (
  '00000000-0000-4000-8000-000000000096',
  'workspace-phase6@example.test'
);

insert into public.profiles (
  id
)
values (
  '00000000-0000-4000-8000-000000000096'
)
on conflict (id)
do nothing;


-- ============================================================
-- PASS FIXTURE
-- ============================================================

insert into public.tasks (
  id,
  user_id,
  title,
  status
)
values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000096',
  'Phase 6 passed review',
  'in_review'
);


insert into public.task_review_attempts (
  id,
  user_id,
  task_id,
  attempt_number,
  status,
  pass_threshold,
  assessment_payload
)
values (
  '00000000-0000-4000-8000-000000000611',
  '00000000-0000-4000-8000-000000000096',
  '00000000-0000-4000-8000-000000000601',
  1,
  'ready',
  70,
  '{"title":"Test","summary":"Test","flashcards":[],"questions":[]}'::jsonb
);


insert into public.task_review_answer_keys (
  attempt_id,
  user_id,
  answer_key
)
values (
  '00000000-0000-4000-8000-000000000611',
  '00000000-0000-4000-8000-000000000096',
  '{"schema_version":"v1","questions":[]}'::jsonb
);


-- ============================================================
-- FAIL FIXTURE
-- ============================================================

insert into public.tasks (
  id,
  user_id,
  title,
  status
)
values (
  '00000000-0000-4000-8000-000000000602',
  '00000000-0000-4000-8000-000000000096',
  'Phase 6 failed review',
  'in_review'
);


insert into public.task_review_attempts (
  id,
  user_id,
  task_id,
  attempt_number,
  status,
  pass_threshold,
  assessment_payload
)
values (
  '00000000-0000-4000-8000-000000000612',
  '00000000-0000-4000-8000-000000000096',
  '00000000-0000-4000-8000-000000000602',
  1,
  'ready',
  70,
  '{"title":"Test","summary":"Test","flashcards":[],"questions":[]}'::jsonb
);


insert into public.task_review_answer_keys (
  attempt_id,
  user_id,
  answer_key
)
values (
  '00000000-0000-4000-8000-000000000612',
  '00000000-0000-4000-8000-000000000096',
  '{"schema_version":"v1","questions":[]}'::jsonb
);


-- ============================================================
-- PRIVILEGE
-- ============================================================

do $$
begin

  if has_function_privilege(
    'authenticated',
    'public.finalize_task_review_submission(uuid,uuid,uuid,numeric,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated must not execute review submission finalization';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.finalize_task_review_submission(uuid,uuid,uuid,numeric,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'service_role must execute review submission finalization';
  end if;

end;
$$;


-- ============================================================
-- PASS
-- ============================================================

set local role service_role;

select *
from public.finalize_task_review_submission(
  '00000000-0000-4000-8000-000000000611',
  '00000000-0000-4000-8000-000000000096',
  '00000000-0000-4000-8000-000000000601',
  80,
  '{
    "correct_count":4,
    "total_questions":5,
    "score":80,
    "passed":true,
    "questions":[]
  }'::jsonb,
  '[]'::jsonb
);

reset role;


do $$
declare
  v_attempt_status public.task_review_attempt_status;
  v_task_status public.task_status;
  v_completed_at timestamptz;
begin

  select status
  into v_attempt_status
  from public.task_review_attempts
  where id =
    '00000000-0000-4000-8000-000000000611';

  if v_attempt_status <> 'passed' then
    raise exception
      'Passing review must mark attempt passed';
  end if;

  select
    status,
    completed_at
  into
    v_task_status,
    v_completed_at
  from public.tasks
  where id =
    '00000000-0000-4000-8000-000000000601';

  if v_task_status <> 'completed' then
    raise exception
      'Passing review must complete task';
  end if;

  if v_completed_at is null then
    raise exception
      'Passing review must set task completed_at';
  end if;

end;
$$;


-- ============================================================
-- FAIL
-- ============================================================

set local role service_role;

select *
from public.finalize_task_review_submission(
  '00000000-0000-4000-8000-000000000612',
  '00000000-0000-4000-8000-000000000096',
  '00000000-0000-4000-8000-000000000602',
  40,
  '{
    "correct_count":2,
    "total_questions":5,
    "score":40,
    "passed":false,
    "questions":[]
  }'::jsonb,
  '["Subnet design"]'::jsonb
);

reset role;


do $$
declare
  v_attempt_status public.task_review_attempt_status;
  v_task_status public.task_status;
  v_completed_at timestamptz;
begin

  select status
  into v_attempt_status
  from public.task_review_attempts
  where id =
    '00000000-0000-4000-8000-000000000612';

  if v_attempt_status <> 'failed' then
    raise exception
      'Failed review must mark attempt failed';
  end if;

  select
    status,
    completed_at
  into
    v_task_status,
    v_completed_at
  from public.tasks
  where id =
    '00000000-0000-4000-8000-000000000602';

  if v_task_status <> 'in_progress' then
    raise exception
      'Failed review must return task to in_progress';
  end if;

  if v_completed_at is not null then
    raise exception
      'Failed review must not retain completed_at';
  end if;

end;
$$;


rollback;