begin;

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

create type public.deadline_risk_input_mode as enum (
  'oulad_compatible_features',
  'lumivox_native_features'
);

create type public.feature_attribution_effect as enum (
  'increases_risk',
  'decreases_risk',
  'neutral'
);


-- ============================================================
-- 2. MODEL VERSION REGISTRY
-- ============================================================

create table public.ml_model_versions (
  id uuid primary key default gen_random_uuid(),

  model_key text not null,
  version text not null,
  algorithm text not null,

  training_dataset text not null,
  artifact_path text not null,

  metrics jsonb not null default '{}'::jsonb,
  feature_schema jsonb not null default '{}'::jsonb,
  explainability_metadata jsonb not null default '{}'::jsonb,

  is_active boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_ml_model_key_version
    unique (model_key, version)
);

create trigger set_ml_model_versions_updated_at
before update on public.ml_model_versions
for each row
execute function public.set_updated_at();

create unique index unique_active_ml_model_per_key
on public.ml_model_versions(model_key)
where is_active = true;


-- ============================================================
-- 3. DEADLINE RISK PREDICTIONS
-- ============================================================

create table public.deadline_risk_predictions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,

  model_version_id uuid not null
    references public.ml_model_versions(id)
    on delete restrict,

  input_mode public.deadline_risk_input_mode not null,

  risk_probability numeric(7, 6) not null
    check (risk_probability >= 0 and risk_probability <= 1),

  predicted_label boolean not null,

  decision_threshold numeric(7, 6) not null default 0.500000
    check (decision_threshold >= 0 and decision_threshold <= 1),

  feature_payload jsonb not null,
  prediction_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index idx_deadline_risk_predictions_user_id
on public.deadline_risk_predictions(user_id);

create index idx_deadline_risk_predictions_task_id
on public.deadline_risk_predictions(task_id);

create index idx_deadline_risk_predictions_model_version_id
on public.deadline_risk_predictions(model_version_id);

create index idx_deadline_risk_predictions_created_at
on public.deadline_risk_predictions(created_at desc);


-- ============================================================
-- 4. PREDICTION EXPLANATION SUMMARY
-- ============================================================

create table public.deadline_risk_prediction_explanations (
  id uuid primary key default gen_random_uuid(),

  prediction_id uuid not null unique
    references public.deadline_risk_predictions(id)
    on delete cascade,

  baseline_expected_value numeric not null,

  top_positive_contributors jsonb not null default '[]'::jsonb,
  top_negative_contributors jsonb not null default '[]'::jsonb,

  explanation_method text not null default 'shap_tree_explainer',
  explanation_version text not null default 'v1',

  created_at timestamptz not null default now()
);

create index idx_deadline_risk_prediction_explanations_prediction_id
on public.deadline_risk_prediction_explanations(prediction_id);


-- ============================================================
-- 5. NORMALIZED FEATURE ATTRIBUTIONS
-- ============================================================

create table public.deadline_risk_feature_attributions (
  id uuid primary key default gen_random_uuid(),

  prediction_id uuid not null
    references public.deadline_risk_predictions(id)
    on delete cascade,

  feature_name text not null,
  feature_value numeric not null,
  shap_value numeric not null,

  effect public.feature_attribution_effect not null,

  absolute_rank smallint not null
    check (absolute_rank >= 1),

  created_at timestamptz not null default now(),

  constraint unique_prediction_feature_attribution
    unique (prediction_id, feature_name)
);

create index idx_deadline_risk_feature_attributions_prediction_id
on public.deadline_risk_feature_attributions(prediction_id);

create index idx_deadline_risk_feature_attributions_feature_name
on public.deadline_risk_feature_attributions(feature_name);


-- ============================================================
-- 6. RLS
-- ============================================================

alter table public.ml_model_versions enable row level security;
alter table public.deadline_risk_predictions enable row level security;
alter table public.deadline_risk_prediction_explanations enable row level security;
alter table public.deadline_risk_feature_attributions enable row level security;


-- Users may read prediction rows that belong to them.
create policy "Users can view their own deadline risk predictions"
on public.deadline_risk_predictions
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

-- Users may read explanation summaries for their own predictions.
create policy "Users can view explanations for their own predictions"
on public.deadline_risk_prediction_explanations
for select
to authenticated
using (
  exists (
    select 1
    from public.deadline_risk_predictions
    where public.deadline_risk_predictions.id =
      public.deadline_risk_prediction_explanations.prediction_id
      and public.deadline_risk_predictions.user_id =
        (select auth.uid())
  )
);

-- Users may read feature attributions for their own predictions.
create policy "Users can view SHAP attributions for their own predictions"
on public.deadline_risk_feature_attributions
for select
to authenticated
using (
  exists (
    select 1
    from public.deadline_risk_predictions
    where public.deadline_risk_predictions.id =
      public.deadline_risk_feature_attributions.prediction_id
      and public.deadline_risk_predictions.user_id =
        (select auth.uid())
  )
);


-- ============================================================
-- 7. PRIVILEGES
-- ============================================================

grant select
on public.deadline_risk_predictions
to authenticated;

grant select
on public.deadline_risk_prediction_explanations
to authenticated;

grant select
on public.deadline_risk_feature_attributions
to authenticated;

commit;