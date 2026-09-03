begin;

-- ============================================================
-- 1. Make sure goals/tasks have roadmap-compatible fields
-- ============================================================

alter table public.goals
add column if not exists target_date date;

alter table public.goals
alter column goal_type set default 'short_term';

alter table public.tasks
add column if not exists due_date date;

alter table public.tasks
add column if not exists estimated_minutes integer;

alter table public.tasks
add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;

alter table public.tasks
add column if not exists source_roadmap_id uuid references public.learning_roadmaps(id) on delete set null;

alter table public.tasks
add column if not exists source_roadmap_node_id uuid references public.learning_roadmap_nodes(id) on delete set null;

alter table public.goals
add column if not exists source_roadmap_id uuid references public.learning_roadmaps(id) on delete set null;

alter table public.goals
add column if not exists source_roadmap_node_id uuid references public.learning_roadmap_nodes(id) on delete set null;

create index if not exists idx_tasks_parent_task_id
on public.tasks(parent_task_id);

create index if not exists idx_tasks_source_roadmap
on public.tasks(source_roadmap_id);

create index if not exists idx_goals_source_roadmap
on public.goals(source_roadmap_id);


-- ============================================================
-- 2. Validate task parent hierarchy
-- parent_task_id is used for subtasks
-- ============================================================

create or replace function public.validate_task_parent_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_user_id uuid;
  parent_goal_id uuid;
  cycle_exists boolean;
begin
  if new.parent_task_id is null then
    return new;
  end if;

  if new.parent_task_id = new.id then
    raise exception 'A task cannot be its own parent.';
  end if;

  select
    task.user_id,
    task.goal_id
  into
    parent_user_id,
    parent_goal_id
  from public.tasks task
  where task.id = new.parent_task_id;

  if parent_user_id is null then
    raise exception 'Parent task not found.';
  end if;

  if parent_user_id <> new.user_id then
    raise exception 'Parent task must belong to the same user.';
  end if;

  if parent_goal_id is not null and new.goal_id is not null and parent_goal_id <> new.goal_id then
    raise exception 'Parent task and child task must belong to the same goal.';
  end if;

  with recursive ancestors as (
    select task.id, task.parent_task_id
    from public.tasks task
    where task.id = new.parent_task_id

    union all

    select parent.id, parent.parent_task_id
    from public.tasks parent
    join ancestors
      on parent.id = ancestors.parent_task_id
  )
  select exists (
    select 1 from ancestors where id = new.id
  )
  into cycle_exists;

  if cycle_exists then
    raise exception 'Task hierarchy would create a cycle.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_task_parent_task
on public.tasks;

create trigger trg_validate_task_parent_task
before insert or update on public.tasks
for each row
execute function public.validate_task_parent_task();


-- ============================================================
-- 3. Apply roadmap RPC
-- ============================================================

create or replace function public.apply_learning_roadmap(
  p_roadmap_id uuid
)
returns table (
  roadmap_id uuid,
  created_goals integer,
  created_tasks integer,
  created_subtasks integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_roadmap record;
  v_node record;

  v_goal_id uuid;
  v_task_id uuid;
  v_parent_goal_id uuid;
  v_parent_task_id uuid;

  v_goal_map jsonb := '{}'::jsonb;
  v_task_map jsonb := '{}'::jsonb;

  v_created_goals integer := 0;
  v_created_tasks integer := 0;
  v_created_subtasks integer := 0;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_roadmap
  from public.learning_roadmaps roadmap
  where roadmap.id = p_roadmap_id
    and roadmap.user_id = v_user_id
  for update;

  if v_roadmap.id is null then
    raise exception 'Roadmap not found.';
  end if;

  if v_roadmap.status::text <> 'draft' then
    raise exception 'Only draft roadmaps can be applied.';
  end if;

  if not exists (
    select 1
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'goal'
  ) then
    raise exception 'Roadmap must contain at least one goal node.';
  end if;

  -- ==========================================================
  -- Step 1: Create goals
  -- ==========================================================

  for v_node in
    select *
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'goal'
    order by node.sort_order asc, node.position_x asc
  loop
    insert into public.goals (
      user_id,
      title,
      description,
      goal_type,
      target_date,
      source_roadmap_id,
      source_roadmap_node_id
    )
    values (
      v_user_id,
      v_node.title,
      v_node.description,
      'short_term',
      coalesce(v_node.suggested_end_date, v_roadmap.end_date),
      p_roadmap_id,
      v_node.id
    )
    returning id into v_goal_id;

    update public.learning_roadmap_nodes
    set linked_goal_id = v_goal_id
    where id = v_node.id;

    v_goal_map := v_goal_map || jsonb_build_object(v_node.id::text, v_goal_id::text);
    v_created_goals := v_created_goals + 1;
  end loop;

  -- ==========================================================
  -- Step 2: Create parent tasks
  -- task nodes must be under goal nodes
  -- ==========================================================

  for v_node in
    select *
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'task'
    order by node.sort_order asc, node.position_y asc, node.position_x asc
  loop
    v_parent_goal_id := null;

    if v_node.parent_node_id is not null then
      v_parent_goal_id := (v_goal_map ->> v_node.parent_node_id::text)::uuid;
    end if;

    if v_parent_goal_id is null then
      raise exception 'Task node % is not connected to a valid goal.', v_node.id;
    end if;

    insert into public.tasks (
      user_id,
      goal_id,
      parent_task_id,
      title,
      description,
      due_date,
      estimated_minutes,
      source_roadmap_id,
      source_roadmap_node_id
    )
    values (
      v_user_id,
      v_parent_goal_id,
      null,
      v_node.title,
      v_node.description,
      coalesce(v_node.suggested_end_date, v_roadmap.end_date),
      greatest(1, ceil(v_node.estimated_hours * 60)::integer),
      p_roadmap_id,
      v_node.id
    )
    returning id into v_task_id;

    update public.learning_roadmap_nodes
    set linked_task_id = v_task_id
    where id = v_node.id;

    v_task_map := v_task_map || jsonb_build_object(v_node.id::text, v_task_id::text);
    v_created_tasks := v_created_tasks + 1;
  end loop;

  -- ==========================================================
  -- Step 3: Create subtasks
  -- subtask nodes become tasks with parent_task_id
  -- ==========================================================

  for v_node in
    select *
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'subtask'
    order by node.sort_order asc, node.position_y asc, node.position_x asc
  loop
    v_parent_task_id := null;

    if v_node.parent_node_id is not null then
      v_parent_task_id := (v_task_map ->> v_node.parent_node_id::text)::uuid;
    end if;

    if v_parent_task_id is null then
      raise exception 'Subtask node % is not connected to a valid task.', v_node.id;
    end if;

    select task.goal_id
    into v_parent_goal_id
    from public.tasks task
    where task.id = v_parent_task_id
      and task.user_id = v_user_id;

    if v_parent_goal_id is null then
      raise exception 'Parent task for subtask % does not have a valid goal.', v_node.id;
    end if;

    insert into public.tasks (
      user_id,
      goal_id,
      parent_task_id,
      title,
      description,
      due_date,
      estimated_minutes,
      source_roadmap_id,
      source_roadmap_node_id
    )
    values (
      v_user_id,
      v_parent_goal_id,
      v_parent_task_id,
      v_node.title,
      v_node.description,
      coalesce(v_node.suggested_end_date, v_roadmap.end_date),
      greatest(1, ceil(v_node.estimated_hours * 60)::integer),
      p_roadmap_id,
      v_node.id
    )
    returning id into v_task_id;

    update public.learning_roadmap_nodes
    set linked_task_id = v_task_id
    where id = v_node.id;

    v_created_subtasks := v_created_subtasks + 1;
  end loop;

  -- ==========================================================
  -- Step 4: Mark roadmap as applied
  -- ==========================================================

  update public.learning_roadmaps
  set
    status = 'applied',
    applied_at = now()
  where id = p_roadmap_id
    and user_id = v_user_id;

  roadmap_id := p_roadmap_id;
  created_goals := v_created_goals;
  created_tasks := v_created_tasks;
  created_subtasks := v_created_subtasks;

  return next;
end;
$$;

revoke all
on function public.apply_learning_roadmap(uuid)
from public;

grant execute
on function public.apply_learning_roadmap(uuid)
to authenticated;

commit;
