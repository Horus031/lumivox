begin;

-- ============================================================
-- 1. Optional backfill public profile fields from auth metadata
-- This does not expose email. It only fills display_name/avatar_url
-- where users already have OAuth profile metadata.
-- ============================================================

update public.profiles profile
set
  display_name = coalesce(
    nullif(trim(profile.display_name), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    profile.display_name
  ),
  avatar_url = coalesce(
    nullif(trim(profile.avatar_url), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'picture'), ''),
    profile.avatar_url
  )
from auth.users auth_user
where auth_user.id = profile.id;


-- ============================================================
-- 2. Fix global weekly leaderboard display name
-- ============================================================

create or replace function public.get_global_weekly_leaderboard(
  p_week_start date,
  p_week_end date,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  focus_minutes integer,
  completed_tasks integer,
  focus_sessions integer,
  current_streak integer,
  score integer,
  rank_position integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with eligible_users as (
    select
      profile.id as user_id,
      coalesce(
        nullif(trim(profile.display_name), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
        'User ' || left(profile.id::text, 8)
      ) as display_name,
      coalesce(
        nullif(trim(profile.avatar_url), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'picture'), '')
      ) as avatar_url
    from public.profiles profile
    left join auth.users auth_user
      on auth_user.id = profile.id
    where profile.leaderboard_opt_in = true
  ),

  focus_summary as (
    select
      focus.user_id,
      coalesce(sum(focus.actual_focus_minutes), 0)::integer as focus_minutes,
      count(*)::integer as focus_sessions
    from public.focus_sessions focus
    where focus.ended_at is not null
      and focus.started_at::date >= p_week_start
      and focus.started_at::date <= p_week_end
      and coalesce(focus.actual_focus_minutes, 0) > 0
    group by focus.user_id
  ),

  task_summary as (
    select
      task.user_id,
      count(*)::integer as completed_tasks
    from public.tasks task
    where task.status::text = 'completed'
      and task.completed_at::date >= p_week_start
      and task.completed_at::date <= p_week_end
    group by task.user_id
  ),

  streak_summary as (
    select
      stats.user_id,
      coalesce(stats.current_streak_days, 0)::integer as current_streak
    from public.user_engagement_stats stats
  ),

  scored as (
    select
      user_row.user_id,
      user_row.display_name,
      user_row.avatar_url,
      coalesce(focus_summary.focus_minutes, 0)::integer as focus_minutes,
      coalesce(task_summary.completed_tasks, 0)::integer as completed_tasks,
      coalesce(focus_summary.focus_sessions, 0)::integer as focus_sessions,
      coalesce(streak_summary.current_streak, 0)::integer as current_streak,
      (
        coalesce(focus_summary.focus_minutes, 0)
        + coalesce(task_summary.completed_tasks, 0) * 10
        + coalesce(focus_summary.focus_sessions, 0) * 5
      )::integer as score
    from eligible_users user_row
    left join focus_summary
      on focus_summary.user_id = user_row.user_id
    left join task_summary
      on task_summary.user_id = user_row.user_id
    left join streak_summary
      on streak_summary.user_id = user_row.user_id
  ),

  ranked as (
    select
      scored.*,
      dense_rank() over (
        order by
          scored.score desc,
          scored.focus_minutes desc,
          scored.completed_tasks desc,
          scored.focus_sessions desc
      )::integer as rank_position
    from scored
    where scored.score > 0
  )

  select
    ranked.user_id,
    ranked.display_name,
    ranked.avatar_url,
    ranked.focus_minutes,
    ranked.completed_tasks,
    ranked.focus_sessions,
    ranked.current_streak,
    ranked.score,
    ranked.rank_position
  from ranked
  order by ranked.rank_position asc, ranked.display_name asc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all
on function public.get_global_weekly_leaderboard(date, date, integer)
from public;

grant execute
on function public.get_global_weekly_leaderboard(date, date, integer)
to authenticated;


-- ============================================================
-- 3. Fix current user's global rank display name
-- ============================================================

create or replace function public.get_my_global_weekly_rank(
  p_week_start date,
  p_week_end date
)
returns table (
  user_id uuid,
  display_name text,
  focus_minutes integer,
  completed_tasks integer,
  focus_sessions integer,
  current_streak integer,
  score integer,
  rank_position integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with eligible_users as (
    select
      profile.id as user_id,
      coalesce(
        nullif(trim(profile.display_name), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
        'User ' || left(profile.id::text, 8)
      ) as display_name
    from public.profiles profile
    left join auth.users auth_user
      on auth_user.id = profile.id
    where profile.leaderboard_opt_in = true
  ),

  focus_summary as (
    select
      focus.user_id,
      coalesce(sum(focus.actual_focus_minutes), 0)::integer as focus_minutes,
      count(*)::integer as focus_sessions
    from public.focus_sessions focus
    where focus.ended_at is not null
      and focus.started_at::date >= p_week_start
      and focus.started_at::date <= p_week_end
      and coalesce(focus.actual_focus_minutes, 0) > 0
    group by focus.user_id
  ),

  task_summary as (
    select
      task.user_id,
      count(*)::integer as completed_tasks
    from public.tasks task
    where task.status::text = 'completed'
      and task.completed_at::date >= p_week_start
      and task.completed_at::date <= p_week_end
    group by task.user_id
  ),

  streak_summary as (
    select
      stats.user_id,
      coalesce(stats.current_streak_days, 0)::integer as current_streak
    from public.user_engagement_stats stats
  ),

  scored as (
    select
      user_row.user_id,
      user_row.display_name,
      coalesce(focus_summary.focus_minutes, 0)::integer as focus_minutes,
      coalesce(task_summary.completed_tasks, 0)::integer as completed_tasks,
      coalesce(focus_summary.focus_sessions, 0)::integer as focus_sessions,
      coalesce(streak_summary.current_streak, 0)::integer as current_streak,
      (
        coalesce(focus_summary.focus_minutes, 0)
        + coalesce(task_summary.completed_tasks, 0) * 10
        + coalesce(focus_summary.focus_sessions, 0) * 5
      )::integer as score
    from eligible_users user_row
    left join focus_summary
      on focus_summary.user_id = user_row.user_id
    left join task_summary
      on task_summary.user_id = user_row.user_id
    left join streak_summary
      on streak_summary.user_id = user_row.user_id
  ),

  ranked as (
    select
      scored.*,
      dense_rank() over (
        order by
          scored.score desc,
          scored.focus_minutes desc,
          scored.completed_tasks desc,
          scored.focus_sessions desc
      )::integer as rank_position
    from scored
  )

  select
    ranked.user_id,
    ranked.display_name,
    ranked.focus_minutes,
    ranked.completed_tasks,
    ranked.focus_sessions,
    ranked.current_streak,
    ranked.score,
    ranked.rank_position
  from ranked
  where ranked.user_id = (select auth.uid())
  limit 1;
$$;

revoke all
on function public.get_my_global_weekly_rank(date, date)
from public;

grant execute
on function public.get_my_global_weekly_rank(date, date)
to authenticated;

commit;