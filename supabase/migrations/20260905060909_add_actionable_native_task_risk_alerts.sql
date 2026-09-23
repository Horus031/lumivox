begin;

drop function if exists public.get_my_latest_native_task_risk_alerts(integer);

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

  top_attributions jsonb,
  reason_summaries jsonb,
  recommended_actions jsonb
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
    coalesce(
      (latest.prediction_metadata ->> 'risk_score')::numeric,
      latest.risk_probability * 100
    ) as risk_score,
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
            'feature_name', ranked.feature_name,
            'feature_value', ranked.feature_value,
            'contribution', ranked.shap_value,
            'effect', ranked.effect,
            'rank', ranked.absolute_rank
          )
          order by ranked.absolute_rank asc
        )
        from (
          select *
          from public.deadline_risk_feature_attributions attribution
          where attribution.prediction_id = latest.id
          order by attribution.absolute_rank asc
          limit 5
        ) ranked
      ),
      '[]'::jsonb
    ) as top_attributions,

    coalesce(
      latest.prediction_metadata -> 'reason_summaries',
      '[]'::jsonb
    ) as reason_summaries,

    coalesce(
      latest.prediction_metadata -> 'recommended_actions',
      '[]'::jsonb
    ) as recommended_actions

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
