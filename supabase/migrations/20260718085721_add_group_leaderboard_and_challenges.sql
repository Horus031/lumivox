begin;

-- ============================================================
-- 1. Group weekly challenges
-- ============================================================

create table if not exists public.study_group_weekly_challenges (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.study_rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,

  week_start date not null,
  week_end date not null,

  title text not null default 'Weekly Study Challenge',
  target_focus_minutes integer not null default 300 check (target_focus_minutes >= 0),
  target_completed_tasks integer not null default 10 check (target_completed_tasks >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (group_id, week_start)
);

alter table public.study_group_weekly_challenges enable row level security;


-- ============================================================
-- 2. Helper: active group member check
-- Reuse if already exists.
-- ============================================================

create or replace function public.is_active_study_group_member(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_room_members member
    join public.study_rooms room
      on room.id = member.room_id
    where member.room_id = p_room_id
      and member.user_id = p_user_id
      and member.membership_status::text = 'active'
      and room.room_type::text = 'group'
  );
$$;

revoke all
on function public.is_active_study_group_member(uuid, uuid)
from public;

grant execute
on function public.is_active_study_group_member(uuid, uuid)
to authenticated;


create or replace function public.can_manage_study_group_members(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_room_members member
    join public.study_rooms room
      on room.id = member.room_id
    where member.room_id = p_room_id
      and member.user_id = p_user_id
      and member.membership_status::text = 'active'
      and member.role::text in ('owner', 'admin', 'host')
      and room.room_type::text = 'group'
  )
  or exists (
    select 1
    from public.study_rooms room
    where room.id = p_room_id
      and room.owner_id = p_user_id
      and room.room_type::text = 'group'
  );
$$;

revoke all
on function public.can_manage_study_group_members(uuid, uuid)
from public;

grant execute
on function public.can_manage_study_group_members(uuid, uuid)
to authenticated;


-- ============================================================
-- 3. Challenge RLS
-- ============================================================

drop policy if exists "Active group members can view weekly challenges"
on public.study_group_weekly_challenges;

create policy "Active group members can view weekly challenges"
on public.study_group_weekly_challenges
for select
to authenticated
using (
  public.is_active_study_group_member(group_id, (select auth.uid()))
);


drop policy if exists "Group managers can create weekly challenges"
on public.study_group_weekly_challenges;

create policy "Group managers can create weekly challenges"
on public.study_group_weekly_challenges
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_manage_study_group_members(group_id, (select auth.uid()))
);


drop policy if exists "Group managers can update weekly challenges"
on public.study_group_weekly_challenges;

create policy "Group managers can update weekly challenges"
on public.study_group_weekly_challenges
for update
to authenticated
using (
  public.can_manage_study_group_members(group_id, (select auth.uid()))
)
with check (
  public.can_manage_study_group_members(group_id, (select auth.uid()))
);


-- ============================================================
-- 4. RPC: group weekly leaderboard
-- ============================================================

create or replace function public.get_study_group_weekly_leaderboard(
  p_group_id uuid,
  p_week_start date,
  p_week_end date
)
returns table (
  user_id uuid,
  email text,
  role text,
  focus_minutes integer,
  completed_tasks integer,
  score integer,
  rank_position integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with group_members as (
    select
      member.user_id,
      member.role::text as role,
      auth_user.email::text as email
    from public.study_room_members member
    join auth.users auth_user
      on auth_user.id = member.user_id
    join public.study_rooms room
      on room.id = member.room_id
    where member.room_id = p_group_id
      and member.membership_status::text = 'active'
      and room.room_type::text = 'group'
      and public.is_active_study_group_member(p_group_id, (select auth.uid()))
  ),

  focus_summary as (
    select
      focus.user_id,
      coalesce(sum(focus.actual_focus_minutes), 0)::integer as focus_minutes
    from public.focus_sessions focus
    where focus.user_id in (select gm.user_id from group_members gm)
      and focus.ended_at is not null
      and focus.started_at::date >= p_week_start
      and focus.started_at::date <= p_week_end
    group by focus.user_id
  ),

  task_summary as (
    select
      task.user_id,
      count(*)::integer as completed_tasks
    from public.tasks task
    where task.user_id in (select gm.user_id from group_members gm)
      and task.status::text = 'completed'
      and task.completed_at::date >= p_week_start
      and task.completed_at::date <= p_week_end
    group by task.user_id
  ),

  scored as (
    select
      gm.user_id,
      gm.email,
      gm.role,
      coalesce(fs.focus_minutes, 0)::integer as focus_minutes,
      coalesce(ts.completed_tasks, 0)::integer as completed_tasks,
      (
        coalesce(fs.focus_minutes, 0)
        + coalesce(ts.completed_tasks, 0) * 10
      )::integer as score
    from group_members gm
    left join focus_summary fs
      on fs.user_id = gm.user_id
    left join task_summary ts
      on ts.user_id = gm.user_id
  )

  select
    scored.user_id,
    scored.email,
    scored.role,
    scored.focus_minutes,
    scored.completed_tasks,
    scored.score,
    dense_rank() over (
      order by scored.score desc, scored.focus_minutes desc, scored.completed_tasks desc
    )::integer as rank_position
  from scored
  order by rank_position asc, scored.email asc;
$$;

revoke all
on function public.get_study_group_weekly_leaderboard(uuid, date, date)
from public;

grant execute
on function public.get_study_group_weekly_leaderboard(uuid, date, date)
to authenticated;


-- ============================================================
-- 5. RPC: group weekly challenge progress
-- ============================================================

create or replace function public.get_study_group_weekly_challenge_progress(
  p_group_id uuid,
  p_week_start date,
  p_week_end date
)
returns table (
  group_id uuid,
  week_start date,
  week_end date,
  target_focus_minutes integer,
  target_completed_tasks integer,
  actual_focus_minutes integer,
  actual_completed_tasks integer,
  focus_progress_percent integer,
  task_progress_percent integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with challenge as (
    select
      c.group_id,
      c.week_start,
      c.week_end,
      c.target_focus_minutes,
      c.target_completed_tasks
    from public.study_group_weekly_challenges c
    where c.group_id = p_group_id
      and c.week_start = p_week_start
    limit 1
  ),

  group_members as (
    select member.user_id
    from public.study_room_members member
    join public.study_rooms room
      on room.id = member.room_id
    where member.room_id = p_group_id
      and member.membership_status::text = 'active'
      and room.room_type::text = 'group'
      and public.is_active_study_group_member(p_group_id, (select auth.uid()))
  ),

  focus_total as (
    select coalesce(sum(focus.actual_focus_minutes), 0)::integer as total
    from public.focus_sessions focus
    where focus.user_id in (select gm.user_id from group_members gm)
      and focus.ended_at is not null
      and focus.started_at::date >= p_week_start
      and focus.started_at::date <= p_week_end
  ),

  task_total as (
    select count(*)::integer as total
    from public.tasks task
    where task.user_id in (select gm.user_id from group_members gm)
      and task.status::text = 'completed'
      and task.completed_at::date >= p_week_start
      and task.completed_at::date <= p_week_end
  )

  select
    p_group_id as group_id,
    p_week_start as week_start,
    p_week_end as week_end,
    coalesce((select target_focus_minutes from challenge), 300) as target_focus_minutes,
    coalesce((select target_completed_tasks from challenge), 10) as target_completed_tasks,
    (select total from focus_total) as actual_focus_minutes,
    (select total from task_total) as actual_completed_tasks,
    case
      when coalesce((select target_focus_minutes from challenge), 300) = 0 then 100
      else least(
        100,
        round(
          (select total from focus_total)::numeric
          / coalesce((select target_focus_minutes from challenge), 300)::numeric
          * 100
        )::integer
      )
    end as focus_progress_percent,
    case
      when coalesce((select target_completed_tasks from challenge), 10) = 0 then 100
      else least(
        100,
        round(
          (select total from task_total)::numeric
          / coalesce((select target_completed_tasks from challenge), 10)::numeric
          * 100
        )::integer
      )
    end as task_progress_percent;
$$;

revoke all
on function public.get_study_group_weekly_challenge_progress(uuid, date, date)
from public;

grant execute
on function public.get_study_group_weekly_challenge_progress(uuid, date, date)
to authenticated;

commit;