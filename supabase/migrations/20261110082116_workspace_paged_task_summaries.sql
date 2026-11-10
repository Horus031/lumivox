create function public.get_workspace_task_page(
  p_goal_id uuid default null,
  p_unassigned boolean default false,
  p_search text default null,
  p_status public.task_status default null,
  p_priority public.task_priority default null,
  p_deadline text default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_reference_now timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select task.id, task.title, task.goal_id, task.status, task.priority,
           task.due_at, task.created_at, task.updated_at, effective.status as effective_status
    from public.tasks task
    cross join lateral (
      select case
        when task.status in ('completed', 'cancelled', 'in_review') then task.status
        when task.due_at < p_reference_now then 'overdue'::public.task_status
        when task.status = 'overdue' then 'in_progress'::public.task_status
        else task.status
      end as status
    ) effective
    where task.user_id = (select auth.uid())
      and task.parent_task_id is null
      and (p_goal_id is null or task.goal_id = p_goal_id)
      and (not p_unassigned or task.goal_id is null)
      and (p_search is null or strpos(lower(task.title), lower(left(p_search, 120))) > 0)
      and (p_status is null or effective.status = p_status)
      and (p_priority is null or task.priority = p_priority)
      and case p_deadline
        when 'overdue' then effective.status = 'overdue'
        when 'upcoming' then task.due_at >= p_reference_now
          and task.due_at < p_reference_now + interval '7 days'
          and task.status not in ('completed', 'cancelled')
        when 'none' then task.due_at is null
        else true
      end
  ), candidates as (
    select * from filtered
    where p_after_created_at is null or (created_at, id) < (p_after_created_at, p_after_id)
    order by created_at desc, id desc
    limit 26
  ), page as (
    select * from candidates order by created_at desc, id desc limit 25
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'hasMore', (select count(*) > 25 from candidates),
    'tasks', coalesce((
      select jsonb_agg(
        to_jsonb(page) || jsonb_build_object(
          'goal_title', goal.title,
          'subtask_count', checklist.total,
          'completed_subtask_count', checklist.completed
        )
        order by page.created_at desc, page.id desc
      )
      from page
      left join public.goals goal on goal.id = page.goal_id and goal.user_id = (select auth.uid())
      cross join lateral (
        select count(*) as total, count(*) filter (where child.status = 'completed') as completed
        from public.tasks child
        where child.parent_task_id = page.id and child.user_id = (select auth.uid())
      ) checklist
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_workspace_task_page(uuid, boolean, text, public.task_status, public.task_priority, text, timestamptz, uuid, timestamptz)
  from public, anon;
grant execute on function public.get_workspace_task_page(uuid, boolean, text, public.task_status, public.task_priority, text, timestamptz, uuid, timestamptz)
  to authenticated;
