begin;

-- ============================================================
-- 1. Candidate tasks for native risk prediction
-- ============================================================

create or replace function public.get_my_native_task_risk_candidate_tasks(
  p_horizon_days integer default 14,
  p_limit integer default 8
)
returns table (
  task_id uuid,
  goal_id uuid,
  task_title text,
  goal_title text,
  priority text,
  status text,
  due_at timestamptz,
  days_until_due integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with candidate_tasks as (
    select
      task.id as task_id,
      task.goal_id,
      task.title as task_title,
      goal.title as goal_title,
      task.priority::text as priority,
      task.status::text as status,
      coalesce(
        task.due_at,
        (task.due_date + 1)::timestamptz
      ) as effective_due_at
    from public.tasks task
    left join public.goals goal
      on goal.id = task.goal_id
    where task.user_id = (select auth.uid())
      and task.status::text not in ('completed', 'cancelled')
      and task.completed_at is null
      and coalesce(task.due_at, (task.due_date + 1)::timestamptz) is not null
  )
  select
    candidate.task_id,
    candidate.goal_id,
    candidate.task_title,
    candidate.goal_title,
    candidate.priority,
    candidate.status,
    candidate.effective_due_at as due_at,
    greatest(
      0,
      ceil(
        extract(epoch from (candidate.effective_due_at - now())) / 86400
      )::integer
    ) as days_until_due
  from candidate_tasks candidate
  where candidate.effective_due_at >= now()
    and candidate.effective_due_at <= now() + make_interval(days => greatest(1, least(p_horizon_days, 60)))
  order by
    candidate.effective_due_at asc,
    case candidate.priority
      when 'critical' then 1
      when 'high' then 2
      when 'medium' then 3
      else 4
    end asc
  limit greatest(1, least(p_limit, 20));
$$;

revoke all
on function public.get_my_native_task_risk_candidate_tasks(integer, integer)
from public;

grant execute
on function public.get_my_native_task_risk_candidate_tasks(integer, integer)
to authenticated;


-- ============================================================
-- 2. Latest native risk alerts for current user
-- ============================================================

create or replace function public.get_my_latest_native_task_risk_alerts(
  p_limit integer default 8
)
returns table (
  prediction_id uuid,
  task_id uuid,
  goal_id uuid,
  task_title text,
  goal_title text,

  risk_probability numeric,
  predicted_label boolean,
  decision_threshold numeric,
  risk_score numeric,
  risk_band text,

  days_until_due integer,
  due_at text,

  model_key text,
  model_version text,
  algorithm text,

  predicted_at timestamptz,

  top_attributions jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  with latest as (
    select distinct on (prediction.task_id)
      prediction.id,
      prediction.user_id,
      prediction.task_id,
      prediction.model_version_id,
      prediction.risk_probability,
      prediction.predicted_label,
      prediction.decision_threshold,
      prediction.prediction_metadata,
      prediction.created_at
    from public.deadline_risk_predictions prediction
    where prediction.user_id = (select auth.uid())
      and prediction.input_mode::text = 'lumivox_native_features'
    order by prediction.task_id, prediction.created_at desc
  )
  select
    latest.id as prediction_id,
    task.id as task_id,
    task.goal_id,
    task.title as task_title,
    goal.title as goal_title,

    latest.risk_probability,
    latest.predicted_label,
    latest.decision_threshold,
    coalesce((latest.prediction_metadata ->> 'risk_score')::numeric, latest.risk_probability * 100) as risk_score,
    coalesce(latest.prediction_metadata ->> 'risk_band', 'low') as risk_band,

    nullif(latest.prediction_metadata ->> 'days_until_due', '')::integer as days_until_due,
    latest.prediction_metadata ->> 'due_at' as due_at,

    model.model_key,
    model.version as model_version,
    model.algorithm,

    latest.created_at as predicted_at,

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'feature_name', attribution.feature_name,
            'feature_value', attribution.feature_value,
            'contribution', attribution.shap_value,
            'effect', attribution.effect,
            'rank', attribution.absolute_rank
          )
          order by attribution.absolute_rank asc
        )
        from public.deadline_risk_feature_attributions attribution
        where attribution.prediction_id = latest.id
        limit 5
      ),
      '[]'::jsonb
    ) as top_attributions

  from latest
  join public.tasks task
    on task.id = latest.task_id
  left join public.goals goal
    on goal.id = task.goal_id
  join public.ml_model_versions model
    on model.id = latest.model_version_id
  where task.status::text not in ('completed', 'cancelled')
    and task.completed_at is null
  order by
    case coalesce(latest.prediction_metadata ->> 'risk_band', 'low')
      when 'high' then 1
      when 'elevated' then 2
      when 'moderate' then 3
      else 4
    end asc,
    latest.risk_probability desc,
    latest.created_at desc
  limit greatest(1, least(p_limit, 20));
$$;

revoke all
on function public.get_my_latest_native_task_risk_alerts(integer)
from public;

grant execute
on function public.get_my_latest_native_task_risk_alerts(integer)
to authenticated;

commit;