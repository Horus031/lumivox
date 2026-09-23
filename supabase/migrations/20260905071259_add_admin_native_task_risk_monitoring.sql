begin;

-- ============================================================
-- 1. Native task risk admin metrics
-- ============================================================

create or replace function public.admin_get_native_task_risk_metrics()
returns table (
  total_predictions integer,
  predictions_last_24h integer,
  predictions_last_7d integer,

  low_risk_predictions integer,
  moderate_risk_predictions integer,
  elevated_risk_predictions integer,
  high_risk_predictions integer,

  avg_risk_probability numeric,
  avg_risk_score numeric,

  active_model_key text,
  active_model_version text,
  active_algorithm text,
  active_model_created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  with native_predictions as (
    select
      prediction.*,
      coalesce(prediction.prediction_metadata ->> 'risk_band', 'low') as risk_band,
      coalesce(
        (prediction.prediction_metadata ->> 'risk_score')::numeric,
        prediction.risk_probability * 100
      ) as risk_score
    from public.deadline_risk_predictions prediction
    where prediction.input_mode::text = 'lumivox_native_features'
  ),
  active_model as (
    select *
    from public.ml_model_versions model
    where model.model_key = 'native_task_delay_risk_classifier'
      and model.is_active = true
    order by model.created_at desc
    limit 1
  )
  select
    count(prediction.id)::integer as total_predictions,
    count(prediction.id) filter (
      where prediction.created_at >= now() - interval '24 hours'
    )::integer as predictions_last_24h,
    count(prediction.id) filter (
      where prediction.created_at >= now() - interval '7 days'
    )::integer as predictions_last_7d,

    count(prediction.id) filter (where prediction.risk_band = 'low')::integer as low_risk_predictions,
    count(prediction.id) filter (where prediction.risk_band = 'moderate')::integer as moderate_risk_predictions,
    count(prediction.id) filter (where prediction.risk_band = 'elevated')::integer as elevated_risk_predictions,
    count(prediction.id) filter (where prediction.risk_band = 'high')::integer as high_risk_predictions,

    round(avg(prediction.risk_probability), 4) as avg_risk_probability,
    round(avg(prediction.risk_score), 2) as avg_risk_score,

    active_model.model_key as active_model_key,
    active_model.version as active_model_version,
    active_model.algorithm as active_algorithm,
    active_model.created_at as active_model_created_at

  from native_predictions prediction
  full join active_model on true
  where public.is_admin((select auth.uid()))
  group by
    active_model.model_key,
    active_model.version,
    active_model.algorithm,
    active_model.created_at;
$$;

revoke all
on function public.admin_get_native_task_risk_metrics()
from public;

grant execute
on function public.admin_get_native_task_risk_metrics()
to authenticated;


-- ============================================================
-- 2. Native task risk model versions
-- ============================================================

create or replace function public.admin_get_native_task_risk_model_versions()
returns table (
  model_version_id uuid,
  model_key text,
  version text,
  algorithm text,
  training_dataset text,
  artifact_path text,
  metrics jsonb,
  feature_schema jsonb,
  explainability_metadata jsonb,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    model.id as model_version_id,
    model.model_key,
    model.version,
    model.algorithm,
    model.training_dataset,
    model.artifact_path,
    model.metrics,
    model.feature_schema,
    model.explainability_metadata,
    model.is_active,
    model.created_at,
    model.updated_at
  from public.ml_model_versions model
  where public.is_admin((select auth.uid()))
    and model.model_key = 'native_task_delay_risk_classifier'
  order by model.is_active desc, model.created_at desc;
$$;

revoke all
on function public.admin_get_native_task_risk_model_versions()
from public;

grant execute
on function public.admin_get_native_task_risk_model_versions()
to authenticated;


-- ============================================================
-- 3. Search native task risk predictions
-- ============================================================

create or replace function public.admin_search_native_task_risk_predictions(
  p_query text default '',
  p_risk_band text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  prediction_id uuid,
  user_id uuid,
  owner_name text,
  owner_email text,

  task_id uuid,
  task_title text,
  goal_id uuid,
  goal_title text,

  model_key text,
  model_version text,
  algorithm text,

  risk_probability numeric,
  predicted_label boolean,
  decision_threshold numeric,
  risk_score numeric,
  risk_band text,

  days_until_due integer,
  due_at text,

  prediction_mode text,
  feature_payload jsonb,
  reason_summaries jsonb,
  recommended_actions jsonb,

  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    prediction.id as prediction_id,
    prediction.user_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,

    prediction.task_id,
    task.title as task_title,
    task.goal_id,
    goal.title as goal_title,

    model.model_key,
    model.version as model_version,
    model.algorithm,

    prediction.risk_probability,
    prediction.predicted_label,
    prediction.decision_threshold,
    coalesce(
      (prediction.prediction_metadata ->> 'risk_score')::numeric,
      prediction.risk_probability * 100
    ) as risk_score,
    coalesce(prediction.prediction_metadata ->> 'risk_band', 'low') as risk_band,

    nullif(prediction.prediction_metadata ->> 'days_until_due', '')::integer as days_until_due,
    prediction.prediction_metadata ->> 'due_at' as due_at,

    prediction.prediction_metadata ->> 'prediction_mode' as prediction_mode,
    prediction.feature_payload,
    coalesce(prediction.prediction_metadata -> 'reason_summaries', '[]'::jsonb) as reason_summaries,
    coalesce(prediction.prediction_metadata -> 'recommended_actions', '[]'::jsonb) as recommended_actions,

    prediction.created_at

  from public.deadline_risk_predictions prediction
  join public.ml_model_versions model
    on model.id = prediction.model_version_id
  left join public.tasks task
    on task.id = prediction.task_id
  left join public.goals goal
    on goal.id = task.goal_id
  left join public.profiles profile
    on profile.id = prediction.user_id
  left join auth.users auth_user
    on auth_user.id = prediction.user_id

  where public.is_admin((select auth.uid()))
    and prediction.input_mode::text = 'lumivox_native_features'
    and (
      p_risk_band = 'all'
      or coalesce(prediction.prediction_metadata ->> 'risk_band', 'low') = p_risk_band
    )
    and (
      coalesce(trim(p_query), '') = ''
      or task.title ilike '%' || trim(p_query) || '%'
      or goal.title ilike '%' || trim(p_query) || '%'
      or model.version ilike '%' || trim(p_query) || '%'
      or model.algorithm ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or prediction.task_id::text ilike '%' || trim(p_query) || '%'
      or prediction.user_id::text ilike '%' || trim(p_query) || '%'
    )

  order by prediction.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all
on function public.admin_search_native_task_risk_predictions(text, text, integer, integer)
from public;

grant execute
on function public.admin_search_native_task_risk_predictions(text, text, integer, integer)
to authenticated;


-- ============================================================
-- 4. Native task risk prediction detail
-- ============================================================

create or replace function public.admin_get_native_task_risk_prediction_detail(
  p_prediction_id uuid
)
returns table (
  prediction_id uuid,
  user_id uuid,
  owner_name text,
  owner_email text,

  task_id uuid,
  task_title text,
  task_status text,
  task_priority text,
  task_due_at timestamptz,
  task_due_date date,

  goal_id uuid,
  goal_title text,

  model_key text,
  model_version text,
  algorithm text,
  model_metrics jsonb,
  feature_schema jsonb,

  risk_probability numeric,
  predicted_label boolean,
  decision_threshold numeric,
  risk_score numeric,
  risk_band text,

  feature_payload jsonb,
  prediction_metadata jsonb,
  attributions jsonb,

  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    prediction.id as prediction_id,
    prediction.user_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,

    prediction.task_id,
    task.title as task_title,
    task.status::text as task_status,
    task.priority::text as task_priority,
    task.due_at as task_due_at,
    task.due_date as task_due_date,

    task.goal_id,
    goal.title as goal_title,

    model.model_key,
    model.version as model_version,
    model.algorithm,
    model.metrics as model_metrics,
    model.feature_schema,

    prediction.risk_probability,
    prediction.predicted_label,
    prediction.decision_threshold,
    coalesce(
      (prediction.prediction_metadata ->> 'risk_score')::numeric,
      prediction.risk_probability * 100
    ) as risk_score,
    coalesce(prediction.prediction_metadata ->> 'risk_band', 'low') as risk_band,

    prediction.feature_payload,
    prediction.prediction_metadata,

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
        where attribution.prediction_id = prediction.id
      ),
      '[]'::jsonb
    ) as attributions,

    prediction.created_at

  from public.deadline_risk_predictions prediction
  join public.ml_model_versions model
    on model.id = prediction.model_version_id
  left join public.tasks task
    on task.id = prediction.task_id
  left join public.goals goal
    on goal.id = task.goal_id
  left join public.profiles profile
    on profile.id = prediction.user_id
  left join auth.users auth_user
    on auth_user.id = prediction.user_id

  where public.is_admin((select auth.uid()))
    and prediction.id = p_prediction_id
    and prediction.input_mode::text = 'lumivox_native_features';
$$;

revoke all
on function public.admin_get_native_task_risk_prediction_detail(uuid)
from public;

grant execute
on function public.admin_get_native_task_risk_prediction_detail(uuid)
to authenticated;

commit;