
begin;

-- 1. A conservative per-user revision for all native ML inputs.
create table public.native_task_risk_input_revisions (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,
  revision bigint not null default 0
    check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.native_task_risk_input_revisions
  enable row level security;

revoke all on public.native_task_risk_input_revisions
  from public, anon, authenticated;

grant select, insert, update, delete
  on public.native_task_risk_input_revisions
  to service_role;

-- 2. Invalidate snapshots when tasks or focus sessions change.
create function public.bump_native_task_risk_input_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_old_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  -- Avoid recreating a deleted profile during FK cascades.
  if v_user_id is not null
    and exists (
      select 1 from public.profiles
      where id = v_user_id
    )
  then
    insert into public.native_task_risk_input_revisions
      as current_revision (user_id, revision, updated_at)
    values (v_user_id, 1, clock_timestamp())
    on conflict (user_id) do update
      set revision = current_revision.revision + 1,
          updated_at = excluded.updated_at;
  end if;

  -- Ownership changes invalidate both users' snapshots.
    if tg_op = 'UPDATE' then
        if old.user_id is distinct from new.user_id then
            v_old_user_id := old.user_id;

            if v_old_user_id is not null
            and exists (
                select 1 from public.profiles
                where id = v_old_user_id
            )
            then
            insert into public.native_task_risk_input_revisions
                as current_revision (user_id, revision, updated_at)
            values (v_old_user_id, 1, clock_timestamp())
            on conflict (user_id) do update
                set revision = current_revision.revision + 1,
                    updated_at = excluded.updated_at;
            end if;
        end if;
    end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger native_task_risk_revision_tasks
after insert or update or delete
on public.tasks
for each row
execute function public.bump_native_task_risk_input_revision();

create trigger native_task_risk_revision_focus_sessions
after insert or update or delete
on public.focus_sessions
for each row
execute function public.bump_native_task_risk_input_revision();

revoke all
on function public.bump_native_task_risk_input_revision()
from public, anon, authenticated;

-- 3. Index to retrieve the latest native prediction for an owner/task.
create index if not exists
  idx_native_task_risk_owner_task_latest
on public.deadline_risk_predictions (
  user_id,
  task_id,
  created_at desc,
  id desc
)
where input_mode =
  'lumivox_native_features'::public.deadline_risk_input_mode;

-- 4. Read at most 100 owned tasks per request.
create function public.get_my_native_task_risk_snapshots_for_tasks(
  p_task_ids uuid[]
)
returns table (
  task_id uuid,
  task_title text,
  goal_id uuid,
  goal_title text,
  task_status text,
  task_updated_at timestamptz,
  task_completed_at timestamptz,
  effective_due_at timestamptz,
  current_input_revision bigint,
  prediction_id uuid,
  predicted_at timestamptz,
  risk_probability numeric,
  predicted_label boolean,
  decision_threshold numeric,
  prediction_metadata jsonb,
  model_key text,
  model_version text,
  algorithm text,
  model_active boolean,
  top_attributions jsonb
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_task_ids is null
    or cardinality(p_task_ids) > 100
  then
    raise exception 'Invalid task batch size'
      using errcode = '22023';
  end if;

  return query
  with owned_tasks as (
    select task.*
    from public.tasks task
    where task.user_id = v_user_id
      and task.id = any(p_task_ids)
  ),
  latest as (
    select distinct on (prediction.task_id)
      prediction.*
    from public.deadline_risk_predictions prediction
    join owned_tasks task
      on task.id = prediction.task_id
    where prediction.user_id = v_user_id
      and prediction.input_mode =
        'lumivox_native_features'::public.deadline_risk_input_mode
    order by
      prediction.task_id,
      prediction.created_at desc,
      prediction.id desc
  )
  select
    task.id,
    task.title,
    task.goal_id,
    goal.title,
    task.status::text,
    task.updated_at,
    task.completed_at,
    coalesce(
      task.due_at,
      (task.due_date + 1)::timestamp at time zone 'UTC'
    ),
    coalesce(revision.revision, 0::bigint),

    prediction.id,
    prediction.created_at,
    prediction.risk_probability,
    prediction.predicted_label,
    prediction.decision_threshold,
    prediction.prediction_metadata,

    model.model_key,
    model.version,
    model.algorithm,
    coalesce(model.is_active, false),

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'feature_name', ranked.feature_name,
            'feature_value', ranked.feature_value,
            'contribution', ranked.shap_value,
            'effect', ranked.effect,
            'rank', ranked.absolute_rank
          )
          order by ranked.absolute_rank
        )
        from (
          select
            attribution.feature_name,
            attribution.feature_value,
            attribution.shap_value,
            attribution.effect,
            attribution.absolute_rank
          from public.deadline_risk_feature_attributions attribution
          where attribution.prediction_id = prediction.id
          order by attribution.absolute_rank
          limit 5
        ) ranked
      ),
      '[]'::jsonb
    )

  from owned_tasks task

  left join latest prediction
    on prediction.task_id = task.id

  left join public.ml_model_versions model
    on model.id = prediction.model_version_id

  left join public.goals goal
    on goal.id = task.goal_id
    and goal.user_id = v_user_id

  left join public.native_task_risk_input_revisions revision
    on revision.user_id = v_user_id

  order by array_position(p_task_ids, task.id);
end;
$$;

revoke all
on function public.get_my_native_task_risk_snapshots_for_tasks(uuid[])
from public, anon;

grant execute
on function public.get_my_native_task_risk_snapshots_for_tasks(uuid[])
to authenticated;

commit;