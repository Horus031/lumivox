begin;

-- ============================================================
-- 1. Enums
-- ============================================================

do $$
begin
  create type public.learning_roadmap_status as enum (
    'draft',
    'applied',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.learning_roadmap_node_type as enum (
    'goal',
    'task',
    'subtask'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.learning_roadmap_level as enum (
    'beginner',
    'intermediate',
    'advanced',
    'custom'
  );
exception
  when duplicate_object then null;
end $$;


-- ============================================================
-- 2. Updated-at helper
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
-- 3. Roadmap table
-- ============================================================

create table if not exists public.learning_roadmaps (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  topic text not null,
  subject_name text,
  description text,

  current_level public.learning_roadmap_level not null default 'beginner',
  target_level public.learning_roadmap_level not null default 'intermediate',
  custom_current_level text,
  custom_target_level text,

  start_date date not null,
  end_date date not null,

  study_days_per_week integer not null default 5,
  available_weekdays text[] not null default '{}',
  minutes_per_study_day integer not null default 60,

  preferred_locale text not null default 'en',

  status public.learning_roadmap_status not null default 'draft',

  generation_input jsonb not null default '{}'::jsonb,
  source_prompt text,

  ai_provider text,
  ai_model text,
  ai_latency_ms integer,

  applied_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learning_roadmaps_date_check
    check (end_date >= start_date),

  constraint learning_roadmaps_study_days_check
    check (study_days_per_week between 1 and 7),

  constraint learning_roadmaps_minutes_check
    check (minutes_per_study_day between 10 and 480),

  constraint learning_roadmaps_locale_check
    check (preferred_locale in ('en', 'vi'))
);

create index if not exists idx_learning_roadmaps_user_status
on public.learning_roadmaps(user_id, status);

create index if not exists idx_learning_roadmaps_created_at
on public.learning_roadmaps(created_at desc);

drop trigger if exists trg_learning_roadmaps_updated_at
on public.learning_roadmaps;

create trigger trg_learning_roadmaps_updated_at
before update on public.learning_roadmaps
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. Roadmap nodes table
-- ============================================================

create table if not exists public.learning_roadmap_nodes (
  id uuid primary key default gen_random_uuid(),

  roadmap_id uuid not null references public.learning_roadmaps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  parent_node_id uuid references public.learning_roadmap_nodes(id) on delete cascade,

  node_type public.learning_roadmap_node_type not null,

  title text not null,
  description text,

  estimated_hours numeric(8, 2) not null default 1,
  suggested_start_date date,
  suggested_end_date date,

  priority integer not null default 3,
  sort_order integer not null default 0,

  position_x numeric(10, 2) not null default 0,
  position_y numeric(10, 2) not null default 0,

  metadata jsonb not null default '{}'::jsonb,

  linked_goal_id uuid references public.goals(id) on delete set null,
  linked_task_id uuid references public.tasks(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learning_roadmap_nodes_title_check
    check (length(trim(title)) > 0),

  constraint learning_roadmap_nodes_estimated_hours_check
    check (estimated_hours > 0 and estimated_hours <= 500),

  constraint learning_roadmap_nodes_priority_check
    check (priority between 1 and 5),

  constraint learning_roadmap_nodes_date_check
    check (
      suggested_start_date is null
      or suggested_end_date is null
      or suggested_end_date >= suggested_start_date
    ),

  constraint learning_roadmap_nodes_no_self_parent_check
    check (parent_node_id is null or parent_node_id <> id)
);

create index if not exists idx_learning_roadmap_nodes_roadmap
on public.learning_roadmap_nodes(roadmap_id, sort_order);

create index if not exists idx_learning_roadmap_nodes_parent
on public.learning_roadmap_nodes(parent_node_id);

create index if not exists idx_learning_roadmap_nodes_user
on public.learning_roadmap_nodes(user_id);

drop trigger if exists trg_learning_roadmap_nodes_updated_at
on public.learning_roadmap_nodes;

create trigger trg_learning_roadmap_nodes_updated_at
before update on public.learning_roadmap_nodes
for each row
execute function public.set_updated_at();


-- ============================================================
-- 5. Extend tasks/goals for roadmap apply
-- ============================================================

alter table public.goals
add column if not exists source_roadmap_id uuid references public.learning_roadmaps(id) on delete set null;

alter table public.goals
add column if not exists source_roadmap_node_id uuid references public.learning_roadmap_nodes(id) on delete set null;

alter table public.tasks
add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;

alter table public.tasks
add column if not exists source_roadmap_id uuid references public.learning_roadmaps(id) on delete set null;

alter table public.tasks
add column if not exists source_roadmap_node_id uuid references public.learning_roadmap_nodes(id) on delete set null;

create index if not exists idx_tasks_parent_task_id
on public.tasks(parent_task_id);

create index if not exists idx_tasks_source_roadmap
on public.tasks(source_roadmap_id);

create index if not exists idx_goals_source_roadmap
on public.goals(source_roadmap_id);


-- ============================================================
-- 6. Validate roadmap tree logic
-- ============================================================

create or replace function public.validate_learning_roadmap_node()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_type public.learning_roadmap_node_type;
  parent_roadmap_id uuid;
  parent_user_id uuid;
  cycle_exists boolean;
begin
  -- goal must be root
  if new.node_type = 'goal' and new.parent_node_id is not null then
    raise exception 'Goal nodes cannot have a parent node.';
  end if;

  -- task and subtask must have parent
  if new.node_type in ('task', 'subtask') and new.parent_node_id is null then
    raise exception 'Task and subtask nodes must have a parent node.';
  end if;

  if new.parent_node_id is not null then
    select
      node.node_type,
      node.roadmap_id,
      node.user_id
    into
      parent_type,
      parent_roadmap_id,
      parent_user_id
    from public.learning_roadmap_nodes node
    where node.id = new.parent_node_id;

    if parent_roadmap_id is null then
      raise exception 'Parent roadmap node not found.';
    end if;

    if parent_roadmap_id <> new.roadmap_id then
      raise exception 'Parent node must belong to the same roadmap.';
    end if;

    if parent_user_id <> new.user_id then
      raise exception 'Parent node must belong to the same user.';
    end if;

    if new.node_type = 'task' and parent_type <> 'goal' then
      raise exception 'Task nodes must be connected under a goal node.';
    end if;

    if new.node_type = 'subtask' and parent_type <> 'task' then
      raise exception 'Subtask nodes must be connected under a task node.';
    end if;
  end if;

  -- prevent cycles on update
  if tg_op = 'UPDATE' and new.parent_node_id is not null then
    with recursive ancestors as (
      select node.id, node.parent_node_id
      from public.learning_roadmap_nodes node
      where node.id = new.parent_node_id

      union all

      select parent.id, parent.parent_node_id
      from public.learning_roadmap_nodes parent
      join ancestors
        on parent.id = ancestors.parent_node_id
    )
    select exists (
      select 1 from ancestors where id = new.id
    )
    into cycle_exists;

    if cycle_exists then
      raise exception 'Roadmap node connection would create a cycle.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_learning_roadmap_node
on public.learning_roadmap_nodes;

create trigger trg_validate_learning_roadmap_node
before insert or update on public.learning_roadmap_nodes
for each row
execute function public.validate_learning_roadmap_node();


-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.learning_roadmaps enable row level security;
alter table public.learning_roadmap_nodes enable row level security;

drop policy if exists "Users can view own roadmaps"
on public.learning_roadmaps;

create policy "Users can view own roadmaps"
on public.learning_roadmaps
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can insert own roadmaps"
on public.learning_roadmaps;

create policy "Users can insert own roadmaps"
on public.learning_roadmaps
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can update own roadmaps"
on public.learning_roadmaps;

create policy "Users can update own roadmaps"
on public.learning_roadmaps
for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can delete own roadmaps"
on public.learning_roadmaps;

create policy "Users can delete own roadmaps"
on public.learning_roadmaps
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);


drop policy if exists "Users can view own roadmap nodes"
on public.learning_roadmap_nodes;

create policy "Users can view own roadmap nodes"
on public.learning_roadmap_nodes
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can insert own roadmap nodes"
on public.learning_roadmap_nodes;

create policy "Users can insert own roadmap nodes"
on public.learning_roadmap_nodes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can update own roadmap nodes"
on public.learning_roadmap_nodes;

create policy "Users can update own roadmap nodes"
on public.learning_roadmap_nodes
for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can delete own roadmap nodes"
on public.learning_roadmap_nodes;

create policy "Users can delete own roadmap nodes"
on public.learning_roadmap_nodes
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

commit;