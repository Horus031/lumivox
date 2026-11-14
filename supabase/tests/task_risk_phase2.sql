
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

-- Two isolated test users.
insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000801',
   'task-risk-phase2-a@example.test'),
  ('00000000-0000-4000-8000-000000000802',
   'task-risk-phase2-b@example.test');

insert into public.profiles (id)
values
  ('00000000-0000-4000-8000-000000000801'),
  ('00000000-0000-4000-8000-000000000802')
on conflict (id) do nothing;

insert into public.tasks (
  id, user_id, title, status, due_at
)
values
  (
    '00000000-0000-4000-8000-000000000811',
    '00000000-0000-4000-8000-000000000801',
    'User A Task',
    'todo',
    now() + interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000000812',
    '00000000-0000-4000-8000-000000000802',
    'User B Task',
    'todo',
    now() + interval '2 days'
  );

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_my_native_task_risk_snapshots_for_tasks(uuid[])',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_my_native_task_risk_snapshots_for_tasks(uuid[])',
    'EXECUTE'
  ),
  'Only authenticated users can invoke batch risk RPC'
);

select is(
  (
    select revision
    from public.native_task_risk_input_revisions
    where user_id =
      '00000000-0000-4000-8000-000000000801'
  ),
  1::bigint,
  'Creating a task increments owner A revision'
);

select is(
  (
    select revision
    from public.native_task_risk_input_revisions
    where user_id =
      '00000000-0000-4000-8000-000000000802'
  ),
  1::bigint,
  'Owner B has an independent revision'
);

-- Test-only model version.
insert into public.ml_model_versions (
  id,
  model_key,
  version,
  algorithm,
  training_dataset,
  artifact_path,
  is_active
)
values (
  '00000000-0000-4000-8000-000000000813',
  'task_risk_phase2_test_model',
  'test-v1',
  'logistic_regression_balanced',
  'test-dataset',
  'test-artifact',
  true
);

insert into public.deadline_risk_predictions (
  user_id,
  task_id,
  model_version_id,
  input_mode,
  risk_probability,
  predicted_label,
  decision_threshold,
  feature_payload,
  prediction_metadata
)
values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000811',
  '00000000-0000-4000-8000-000000000813',
  'lumivox_native_features',
  0.76,
  true,
  0.4,
  '{}'::jsonb,
  jsonb_build_object(
    'prediction_mode', 'native_ml',
    'input_revision', 1,
    'feature_schema_version', 'native-task-risk-v2',
    'risk_band', 'high',
    'risk_score', 76,
    'reason_summaries', '[]'::jsonb,
    'recommended_actions', '[]'::jsonb
  )
);

-- Authenticate as user A, not as service_role.
set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000801',
  true
);

select is(
  (
    select count(*)
    from public.get_my_native_task_risk_snapshots_for_tasks(
      array[
        '00000000-0000-4000-8000-000000000811'::uuid,
        '00000000-0000-4000-8000-000000000812'::uuid
      ]
    )
  ),
  1::bigint,
  'Batch RPC returns only owned tasks'
);

select is(
  (
    select count(*)
    from public.get_my_native_task_risk_snapshots_for_tasks(
      array[
        '00000000-0000-4000-8000-000000000812'::uuid
      ]
    )
  ),
  0::bigint,
  'Foreign task UUID does not reveal another user'
);

select is(
  (
    select risk_probability
    from public.get_my_native_task_risk_snapshots_for_tasks(
      array[
        '00000000-0000-4000-8000-000000000811'::uuid
      ]
    )
  ),
  0.76::numeric,
  'Owned native prediction is returned'
);

select is(
  (
    select count(*)
    from public.get_my_native_task_risk_snapshots_for_tasks(
      array[]::uuid[]
    )
  ),
  0::bigint,
  'Empty batch is safe'
);

select throws_ok(
  $$
    select *
    from public.get_my_native_task_risk_snapshots_for_tasks(
      array_fill(
        '00000000-0000-4000-8000-000000000811'::uuid,
        array[101]
      )
    )
  $$,
  '22023',
  'Invalid task batch size',
  'Oversized batches are rejected'
);

select is(
  (
    select current_input_revision
    from public.get_my_native_task_risk_snapshots_for_tasks(
      array[
        '00000000-0000-4000-8000-000000000811'::uuid
      ]
    )
  ),
  1::bigint,
  'Batch RPC exposes the current input revision'
);

reset role;

-- Task mutation must invalidate the snapshot revision.
update public.tasks
set priority = 'high'
where id =
  '00000000-0000-4000-8000-000000000811';

select is(
  (
    select revision
    from public.native_task_risk_input_revisions
    where user_id =
      '00000000-0000-4000-8000-000000000801'
  ),
  2::bigint,
  'Updating a task increments the input revision'
);

-- Focus is also a model input.
insert into public.focus_sessions (
  id, user_id, planned_minutes
)
values (
  '00000000-0000-4000-8000-000000000814',
  '00000000-0000-4000-8000-000000000801',
  25
);

select is(
  (
    select revision
    from public.native_task_risk_input_revisions
    where user_id =
      '00000000-0000-4000-8000-000000000801'
  ),
  3::bigint,
  'Creating a Focus session increments the input revision'
);

delete from public.focus_sessions
where id =
  '00000000-0000-4000-8000-000000000814';

select is(
  (
    select revision
    from public.native_task_risk_input_revisions
    where user_id =
      '00000000-0000-4000-8000-000000000801'
  ),
  4::bigint,
  'Deleting a Focus session also invalidates predictions'
);

select * from finish();

rollback;
