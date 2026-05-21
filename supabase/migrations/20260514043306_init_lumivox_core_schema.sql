-- ============================================================
-- Lumivox - Core Database Schema
-- Migration: init_lumivox_core_schema
-- ============================================================

begin;

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

create extension if not exists pgcrypto with schema extensions;


-- ============================================================
-- 2. ENUM TYPES
-- ============================================================

create type public.goal_type as enum (
  'short_term',
  'long_term'
);

create type public.goal_status as enum (
  'active',
  'completed',
  'paused',
  'archived'
);

create type public.task_status as enum (
  'todo',
  'in_progress',
  'completed',
  'overdue',
  'cancelled'
);

create type public.task_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type public.focus_session_status as enum (
  'ongoing',
  'completed',
  'cancelled'
);

create type public.distraction_type as enum (
  'social_media',
  'messaging',
  'external_interrupt',
  'fatigue',
  'other'
);


-- ============================================================
-- 3. SHARED FUNCTION: AUTO UPDATE updated_at
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- 4. PROFILES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  full_name text,
  avatar_url text,
  timezone text not null default 'UTC',

  onboarding_completed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


-- ============================================================
-- 5. GOALS
-- ============================================================

create table public.goals (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  title text not null
    check (char_length(btrim(title)) > 0),

  description text,

  goal_type public.goal_type not null,
  status public.goal_status not null default 'active',

  start_date date,
  target_date date,

  progress_percent numeric(5, 2) not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint valid_goal_date_range
    check (
      start_date is null
      or target_date is null
      or target_date >= start_date
    )
);

create index idx_goals_user_id
on public.goals(user_id);

create index idx_goals_user_status
on public.goals(user_id, status);

create index idx_goals_target_date
on public.goals(target_date);

create trigger set_goals_updated_at
before update on public.goals
for each row
execute function public.set_updated_at();


-- ============================================================
-- 6. TASKS
-- ============================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,

  title text not null
    check (char_length(btrim(title)) > 0),

  description text,

  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',

  estimated_minutes integer
    check (estimated_minutes is null or estimated_minutes >= 0),

  due_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_user_id
on public.tasks(user_id);

create index idx_tasks_goal_id
on public.tasks(goal_id);

create index idx_tasks_user_status
on public.tasks(user_id, status);

create index idx_tasks_due_at
on public.tasks(due_at);

create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();


-- ============================================================
-- 7. FOCUS SESSIONS
-- ============================================================

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,

  planned_minutes integer not null
    check (planned_minutes > 0),

  actual_focus_minutes integer not null default 0
    check (actual_focus_minutes >= 0),

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  status public.focus_session_status not null default 'ongoing',

  self_focus_rating smallint
    check (
      self_focus_rating is null
      or self_focus_rating between 1 and 5
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint valid_focus_session_time_range
    check (
      ended_at is null
      or ended_at >= started_at
    )
);

create index idx_focus_sessions_user_id
on public.focus_sessions(user_id);

create index idx_focus_sessions_task_id
on public.focus_sessions(task_id);

create index idx_focus_sessions_started_at
on public.focus_sessions(started_at);

create trigger set_focus_sessions_updated_at
before update on public.focus_sessions
for each row
execute function public.set_updated_at();


-- ============================================================
-- 8. DISTRACTION EVENTS
-- ============================================================

create table public.distraction_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.focus_sessions(id) on delete cascade,

  distraction_type public.distraction_type not null default 'other',

  occurred_at timestamptz not null default now(),

  duration_seconds integer not null default 0
    check (duration_seconds >= 0),

  note text,

  created_at timestamptz not null default now()
);

create index idx_distraction_events_user_id
on public.distraction_events(user_id);

create index idx_distraction_events_session_id
on public.distraction_events(session_id);

create index idx_distraction_events_occurred_at
on public.distraction_events(occurred_at);


-- ============================================================
-- 9. PBI WEIGHT PROFILES
-- ============================================================
-- One row per user.
-- These are used for Personalized PBI.
-- Standard PBI will still use fixed default weights in the algorithm.

create table public.pbi_weight_profiles (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null unique references public.profiles(id) on delete cascade,

  task_completion_weight numeric(5, 4) not null default 0.3000
    check (task_completion_weight >= 0 and task_completion_weight <= 1),

  focus_quality_weight numeric(5, 4) not null default 0.2500
    check (focus_quality_weight >= 0 and focus_quality_weight <= 1),

  deadline_adherence_weight numeric(5, 4) not null default 0.2500
    check (deadline_adherence_weight >= 0 and deadline_adherence_weight <= 1),

  goal_momentum_weight numeric(5, 4) not null default 0.1000
    check (goal_momentum_weight >= 0 and goal_momentum_weight <= 1),

  consistency_weight numeric(5, 4) not null default 0.1000
    check (consistency_weight >= 0 and consistency_weight <= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint valid_pbi_weight_sum
    check (
      abs(
        (
          task_completion_weight
          + focus_quality_weight
          + deadline_adherence_weight
          + goal_momentum_weight
          + consistency_weight
        ) - 1.0000
      ) <= 0.0001
    )
);

create index idx_pbi_weight_profiles_user_id
on public.pbi_weight_profiles(user_id);

create trigger set_pbi_weight_profiles_updated_at
before update on public.pbi_weight_profiles
for each row
execute function public.set_updated_at();


-- ============================================================
-- 10. PBI SNAPSHOTS
-- ============================================================
-- Weekly/periodic calculated behavioural scores.
-- AI backend or scheduled process will insert into this table later.

create table public.pbi_snapshots (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  period_start date not null,
  period_end date not null,

  standard_pbi numeric(5, 2) not null
    check (standard_pbi >= 0 and standard_pbi <= 100),

  personalized_pbi numeric(5, 2) not null
    check (personalized_pbi >= 0 and personalized_pbi <= 100),

  task_completion_rate numeric(5, 4) not null
    check (task_completion_rate >= 0 and task_completion_rate <= 1),

  focus_quality_score numeric(5, 4) not null
    check (focus_quality_score >= 0 and focus_quality_score <= 1),

  deadline_adherence_score numeric(5, 4) not null
    check (deadline_adherence_score >= 0 and deadline_adherence_score <= 1),

  goal_momentum_score numeric(5, 4) not null
    check (goal_momentum_score >= 0 and goal_momentum_score <= 1),

  consistency_score numeric(5, 4) not null
    check (consistency_score >= 0 and consistency_score <= 1),

  calculation_version text not null default 'v1.0',

  created_at timestamptz not null default now(),

  constraint valid_pbi_period
    check (period_end >= period_start),

  constraint unique_pbi_snapshot_per_period
    unique (user_id, period_start, period_end)
);

create index idx_pbi_snapshots_user_id
on public.pbi_snapshots(user_id);

create index idx_pbi_snapshots_user_period_end
on public.pbi_snapshots(user_id, period_end desc);


-- ============================================================
-- 11. AUTH TRIGGER:
-- Auto-create public profile + default PBI weight profile
-- when a Supabase Auth user signs up.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name'
  );

  insert into public.pbi_weight_profiles (
    user_id
  )
  values (
    new.id
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ============================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.distraction_events enable row level security;
alter table public.pbi_weight_profiles enable row level security;
alter table public.pbi_snapshots enable row level security;


-- ============================================================
-- 12.1. PROFILES POLICIES
-- ============================================================

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);


-- ============================================================
-- 12.2. GOALS POLICIES
-- ============================================================

create policy "Users can view their own goals"
on public.goals
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy "Users can create their own goals"
on public.goals
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

create policy "Users can update their own goals"
on public.goals
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

create policy "Users can delete their own goals"
on public.goals
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 12.3. TASKS POLICIES
-- ============================================================
-- Prevent a user from attaching their task to another user's goal.

create policy "Users can view their own tasks"
on public.tasks
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy "Users can create their own tasks"
on public.tasks
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    goal_id is null
    or exists (
      select 1
      from public.goals
      where public.goals.id = public.tasks.goal_id
        and public.goals.user_id = (select auth.uid())
    )
  )
);

create policy "Users can update their own tasks"
on public.tasks
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
  and (
    goal_id is null
    or exists (
      select 1
      from public.goals
      where public.goals.id = public.tasks.goal_id
        and public.goals.user_id = (select auth.uid())
    )
  )
);

create policy "Users can delete their own tasks"
on public.tasks
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 12.4. FOCUS SESSION POLICIES
-- ============================================================
-- Prevent a user from attaching a focus session to another user's task.

create policy "Users can view their own focus sessions"
on public.focus_sessions
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy "Users can create their own focus sessions"
on public.focus_sessions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    task_id is null
    or exists (
      select 1
      from public.tasks
      where public.tasks.id = public.focus_sessions.task_id
        and public.tasks.user_id = (select auth.uid())
    )
  )
);

create policy "Users can update their own focus sessions"
on public.focus_sessions
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
  and (
    task_id is null
    or exists (
      select 1
      from public.tasks
      where public.tasks.id = public.focus_sessions.task_id
        and public.tasks.user_id = (select auth.uid())
    )
  )
);

create policy "Users can delete their own focus sessions"
on public.focus_sessions
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 12.5. DISTRACTION EVENT POLICIES
-- ============================================================
-- Prevent a user from logging distraction events into another user's session.

create policy "Users can view their own distraction events"
on public.distraction_events
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy "Users can create their own distraction events"
on public.distraction_events
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.focus_sessions
    where public.focus_sessions.id = public.distraction_events.session_id
      and public.focus_sessions.user_id = (select auth.uid())
  )
);

create policy "Users can update their own distraction events"
on public.distraction_events
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.focus_sessions
    where public.focus_sessions.id = public.distraction_events.session_id
      and public.focus_sessions.user_id = (select auth.uid())
  )
);

create policy "Users can delete their own distraction events"
on public.distraction_events
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 12.6. PBI WEIGHT PROFILE POLICIES
-- ============================================================
-- Insert is handled by auth trigger.
-- Users may view and update their own PBI calibration.

create policy "Users can view their own PBI weight profile"
on public.pbi_weight_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy "Users can update their own PBI weight profile"
on public.pbi_weight_profiles
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 12.7. PBI SNAPSHOT POLICIES
-- ============================================================
-- Snapshots will be created by trusted backend/service role later.
-- Users can only read their own snapshots.

create policy "Users can view their own PBI snapshots"
on public.pbi_snapshots
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 13. TABLE PRIVILEGES
-- ============================================================

grant select, update
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.goals
to authenticated;

grant select, insert, update, delete
on public.tasks
to authenticated;

grant select, insert, update, delete
on public.focus_sessions
to authenticated;

grant select, insert, update, delete
on public.distraction_events
to authenticated;

grant select, update
on public.pbi_weight_profiles
to authenticated;

grant select
on public.pbi_snapshots
to authenticated;


commit;