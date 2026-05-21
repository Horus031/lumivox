begin;

-- ============================================================
-- 1. ENUM TYPE
-- ============================================================

create type public.native_task_risk_band as enum (
  'low',
  'moderate',
  'elevated',
  'high'
);


-- ============================================================
-- 2. NATIVE TASK RISK ASSESSMENTS
-- ============================================================

create table public.native_task_risk_assessments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  task_id uuid not null
    references public.tasks(id)
    on delete cascade,

  risk_score numeric(5, 2) not null
    check (risk_score >= 0 and risk_score <= 100),

  risk_band public.native_task_risk_band not null,

  deadline_pressure_score numeric(5, 4) not null
    check (deadline_pressure_score >= 0 and deadline_pressure_score <= 1),

  priority_pressure_score numeric(5, 4) not null
    check (priority_pressure_score >= 0 and priority_pressure_score <= 1),

  focus_neglect_score numeric(5, 4) not null
    check (focus_neglect_score >= 0 and focus_neglect_score <= 1),

  deadline_reliability_risk_score numeric(5, 4) not null
    check (
      deadline_reliability_risk_score >= 0
      and deadline_reliability_risk_score <= 1
    ),

  workload_pressure_score numeric(5, 4) not null
    check (workload_pressure_score >= 0 and workload_pressure_score <= 1),

  component_payload jsonb not null default '{}'::jsonb,
  evidence_payload jsonb not null default '[]'::jsonb,

  horizon_days integer not null default 14
    check (horizon_days >= 1),

  focus_window_days integer not null default 7
    check (focus_window_days >= 1),

  history_window_days integer not null default 30
    check (history_window_days >= 1),

  calculation_version text not null default 'native-risk-v1',

  created_at timestamptz not null default now()
);


-- ============================================================
-- 3. INDEXES
-- ============================================================

create index idx_native_task_risk_assessments_user_id
on public.native_task_risk_assessments(user_id);

create index idx_native_task_risk_assessments_task_id
on public.native_task_risk_assessments(task_id);

create index idx_native_task_risk_assessments_created_at
on public.native_task_risk_assessments(created_at desc);

create index idx_native_task_risk_assessments_user_created
on public.native_task_risk_assessments(user_id, created_at desc);


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.native_task_risk_assessments
enable row level security;

create policy "Users can view their own native task risk assessments"
on public.native_task_risk_assessments
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 5. PRIVILEGES
-- ============================================================

grant select
on public.native_task_risk_assessments
to authenticated;

commit;