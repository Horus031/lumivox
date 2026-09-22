begin;

create or replace function public.get_native_task_risk_system_candidates(
  p_horizon_days integer default 14,
  p_max_users integer default 50,
  p_max_tasks_per_user integer default 8,
  p_skip_recent_hours integer default 6
)
returns table (
  user_id uuid,
  task_id uuid,
  effective_due_at timestamptz,
  days_until_due integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with open_tasks as (
    select
      task.user_id,
      task.id as task_id,
      coalesce(
        task.due_at,
        (task.due_date + 1)::timestamptz
      ) as effective_due_at,
      task.priority::text as priority
    from public.tasks task
    where task.status::text not in ('completed', 'cancelled')
      and task.completed_at is null
      and coalesce(task.due_at, (task.due_date + 1)::timestamptz) is not null
  ),
  due_tasks as (
    select *
    from open_tasks task
    where task.effective_due_at >= now()
      and task.effective_due_at <= now() + make_interval(days => greatest(1, least(p_horizon_days, 60)))
      and not exists (
        select 1
        from public.deadline_risk_predictions prediction
        where prediction.task_id = task.task_id
          and prediction.input_mode::text = 'lumivox_native_features'
          and prediction.created_at >= now() - make_interval(hours => greatest(1, least(p_skip_recent_hours, 48)))
      )
  ),
  selected_users as (
    select task.user_id
    from due_tasks task
    group by task.user_id
    order by min(task.effective_due_at) asc
    limit greatest(1, least(p_max_users, 200))
  ),
  ranked_tasks as (
    select
      task.*,
      row_number() over (
        partition by task.user_id
        order by
          task.effective_due_at asc,
          case task.priority
            when 'critical' then 1
            when 'high' then 2
            when 'medium' then 3
            else 4
          end asc
      ) as task_rank
    from due_tasks task
    join selected_users selected_user
      on selected_user.user_id = task.user_id
  )
  select
    ranked.user_id,
    ranked.task_id,
    ranked.effective_due_at,
    greatest(
      0,
      ceil(extract(epoch from (ranked.effective_due_at - now())) / 86400)::integer
    ) as days_until_due
  from ranked_tasks ranked
  where ranked.task_rank <= greatest(1, least(p_max_tasks_per_user, 20))
  order by ranked.effective_due_at asc;
$$;

revoke all
on function public.get_native_task_risk_system_candidates(integer, integer, integer, integer)
from public;

grant execute
on function public.get_native_task_risk_system_candidates(integer, integer, integer, integer)
to service_role;

commit;