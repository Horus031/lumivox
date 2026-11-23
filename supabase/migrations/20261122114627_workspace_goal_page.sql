create index if not exists idx_workspace_goals_user_created_id
  on public.goals (user_id, created_at desc, id desc);

create or replace function public.get_my_workspace_goal_page(
  p_search text default '',
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_include_progress boolean default false
)
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  total_tasks integer,
  completed_tasks integer
)
language sql stable security invoker
set search_path = ''
as $$
  with page as materialized (
    select goal.id, goal.title, goal.created_at, goal.user_id
    from public.goals as goal
    where goal.user_id = (select auth.uid())
      and (
        coalesce(btrim(p_search), '') = ''
        or strpos(lower(goal.title), lower(left(btrim(p_search), 160))) > 0
      )
      and (
        (p_before_created_at is null and p_before_id is null)
        or (goal.created_at, goal.id) < (p_before_created_at, p_before_id)
      )
    order by goal.created_at desc, goal.id desc
    limit 21
  )
  select page.id, page.title, page.created_at, progress.total_tasks, progress.completed_tasks
  from page
  left join lateral (
    select count(*)::integer as total_tasks,
           count(*) filter (where task.status = 'completed')::integer as completed_tasks
    from public.tasks as task
    where p_include_progress and task.user_id = page.user_id and task.goal_id = page.id
  ) as progress on p_include_progress
  order by page.created_at desc, page.id desc;
$$;

revoke all on function public.get_my_workspace_goal_page(text, timestamptz, uuid, boolean)
  from public, anon;
grant execute on function public.get_my_workspace_goal_page(text, timestamptz, uuid, boolean)
  to authenticated;
