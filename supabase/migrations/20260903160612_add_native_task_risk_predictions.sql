begin;

-- ============================================================
-- 1. Task risk level
-- ============================================================

do $$
begin
  create type public.task_risk_level as enum (
    'low',
    'medium',
    'high'
  );
exception
  when duplicate_object then null;
end $$;


-- ============================================================
-- 2. Native task risk prediction logs
-- ============================================================

create table if not exists public.task_risk_predictions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,

  model_version text not null,
  model_name text not null,

  risk_score numeric(6, 5) not null,
  risk_level public.task_risk_level not null,

  predicted_at timestamptz not null default now(),

  due_date date,
  days_until_due integer,

  features jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  constraint task_risk_predictions_score_check
    check (risk_score >= 0 and risk_score <= 1)
);

create index if not exists idx_task_risk_predictions_user_time
on public.task_risk_predictions(user_id, predicted_at desc);

create index if not exists idx_task_risk_predictions_task_time
on public.task_risk_predictions(task_id, predicted_at desc);

create index if not exists idx_task_risk_predictions_level
on public.task_risk_predictions(risk_level);


-- ============================================================
-- 3. Latest prediction helper
-- ============================================================

create or replace function public.get_my_latest_task_risk_predictions(
  p_limit integer default 20
)
returns table (
  prediction_id uuid,
  task_id uuid,
  goal_id uuid,
  task_title text,
  goal_title text,
  model_version text,
  model_name text,
  risk_score numeric,
  risk_level text,
  predicted_at timestamptz,
  due_date date,
  days_until_due integer,
  reasons jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  with latest as (
    select distinct on (prediction.task_id)
      prediction.*
    from public.task_risk_predictions prediction
    where prediction.user_id = (select auth.uid())
    order by prediction.task_id, prediction.predicted_at desc
  )
  select
    latest.id as prediction_id,
    latest.task_id,
    latest.goal_id,
    task.title as task_title,
    goal.title as goal_title,
    latest.model_version,
    latest.model_name,
    latest.risk_score,
    latest.risk_level::text,
    latest.predicted_at,
    latest.due_date,
    latest.days_until_due,
    latest.reasons
  from latest
  join public.tasks task
    on task.id = latest.task_id
  left join public.goals goal
    on goal.id = latest.goal_id
  order by latest.risk_score desc, latest.predicted_at desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all
on function public.get_my_latest_task_risk_predictions(integer)
from public;

grant execute
on function public.get_my_latest_task_risk_predictions(integer)
to authenticated;


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.task_risk_predictions enable row level security;

drop policy if exists "Users can view own task risk predictions"
on public.task_risk_predictions;

create policy "Users can view own task risk predictions"
on public.task_risk_predictions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can insert own task risk predictions"
on public.task_risk_predictions;

create policy "Users can insert own task risk predictions"
on public.task_risk_predictions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

commit;