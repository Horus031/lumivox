begin;

-- ============================================================
-- 1. Admin user list/search
-- ============================================================

create or replace function public.admin_search_users(
  p_query text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  display_name text,
  role text,
  leaderboard_opt_in boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  total_goals integer,
  total_tasks integer,
  completed_tasks integer,
  total_focus_sessions integer,
  total_focus_minutes integer,
  uploaded_documents integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with base_users as (
    select
      profile.id as user_id,
      auth_user.email::text as email,
      profile.full_name,
      profile.display_name,
      profile.role::text as role,
      profile.leaderboard_opt_in,
      auth_user.created_at,
      auth_user.last_sign_in_at
    from public.profiles profile
    left join auth.users auth_user
      on auth_user.id = profile.id
    where public.is_admin((select auth.uid()))
      and (
        coalesce(trim(p_query), '') = ''
        or profile.full_name ilike '%' || trim(p_query) || '%'
        or profile.display_name ilike '%' || trim(p_query) || '%'
        or auth_user.email ilike '%' || trim(p_query) || '%'
        or profile.id::text ilike '%' || trim(p_query) || '%'
      )
  )

  select
    base.user_id,
    base.email,
    base.full_name,
    base.display_name,
    base.role,
    base.leaderboard_opt_in,
    base.created_at,
    base.last_sign_in_at,

    (
      select count(*)::integer
      from public.goals goal
      where goal.user_id = base.user_id
    ) as total_goals,

    (
      select count(*)::integer
      from public.tasks task
      where task.user_id = base.user_id
    ) as total_tasks,

    (
      select count(*)::integer
      from public.tasks task
      where task.user_id = base.user_id
        and task.status::text = 'completed'
    ) as completed_tasks,

    (
      select count(*)::integer
      from public.focus_sessions focus
      where focus.user_id = base.user_id
    ) as total_focus_sessions,

    (
      select coalesce(sum(focus.actual_focus_minutes), 0)::integer
      from public.focus_sessions focus
      where focus.user_id = base.user_id
        and focus.ended_at is not null
    ) as total_focus_minutes,

    (
      select count(*)::integer
      from public.learning_documents doc
      where doc.owner_id = base.user_id
    ) as uploaded_documents

  from base_users base
  order by base.created_at desc nulls last
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all
on function public.admin_search_users(text, integer, integer)
from public;

grant execute
on function public.admin_search_users(text, integer, integer)
to authenticated;


-- ============================================================
-- 2. Admin user detail
-- ============================================================

create or replace function public.admin_get_user_detail(
  p_user_id uuid
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  display_name text,
  role text,
  leaderboard_opt_in boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,

  total_goals integer,
  total_tasks integer,
  completed_tasks integer,
  total_focus_sessions integer,
  total_focus_minutes integer,
  uploaded_documents integer,
  processed_documents integer,
  rag_chat_sessions integer,
  rag_chat_messages integer,
  study_group_memberships integer,
  current_streak integer,
  token_balance integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    profile.id as user_id,
    auth_user.email::text as email,
    profile.full_name,
    profile.display_name,
    profile.role::text as role,
    profile.leaderboard_opt_in,
    auth_user.created_at,
    auth_user.last_sign_in_at,

    (
      select count(*)::integer
      from public.goals goal
      where goal.user_id = profile.id
    ) as total_goals,

    (
      select count(*)::integer
      from public.tasks task
      where task.user_id = profile.id
    ) as total_tasks,

    (
      select count(*)::integer
      from public.tasks task
      where task.user_id = profile.id
        and task.status::text = 'completed'
    ) as completed_tasks,

    (
      select count(*)::integer
      from public.focus_sessions focus
      where focus.user_id = profile.id
    ) as total_focus_sessions,

    (
      select coalesce(sum(focus.actual_focus_minutes), 0)::integer
      from public.focus_sessions focus
      where focus.user_id = profile.id
        and focus.ended_at is not null
    ) as total_focus_minutes,

    (
      select count(*)::integer
      from public.learning_documents doc
      where doc.owner_id = profile.id
    ) as uploaded_documents,

    (
      select count(*)::integer
      from public.learning_documents doc
      where doc.owner_id = profile.id
        and doc.extracted_text_status = 'completed'
    ) as processed_documents,

    (
      select count(*)::integer
      from public.rag_chat_sessions session
      where session.user_id = profile.id
    ) as rag_chat_sessions,

    (
      select count(*)::integer
      from public.rag_chat_messages message
      where message.user_id = profile.id
    ) as rag_chat_messages,

    (
      select count(*)::integer
      from public.study_room_members member
      where member.user_id = profile.id
        and member.membership_status::text = 'active'
    ) as study_group_memberships,

    coalesce(stats.current_streak_days, 0)::integer as current_streak,

    coalesce(public.get_user_token_balance(profile.id), 0)::integer as token_balance

  from public.profiles profile
  left join auth.users auth_user
    on auth_user.id = profile.id
  left join public.user_engagement_stats stats
    on stats.user_id = profile.id
  where public.is_admin((select auth.uid()))
    and profile.id = p_user_id
  limit 1;
$$;

revoke all
on function public.admin_get_user_detail(uuid)
from public;

grant execute
on function public.admin_get_user_detail(uuid)
to authenticated;


-- ============================================================
-- 3. Admin update user role
-- Prevent removing the last admin.
-- ============================================================

create or replace function public.admin_update_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_admin_count integer;
  v_target_current_role text;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can update user roles.';
  end if;

  select role::text
  into v_target_current_role
  from public.profiles
  where id = p_user_id;

  if v_target_current_role is null then
    raise exception 'User profile not found.';
  end if;

  select count(*)::integer
  into v_current_admin_count
  from public.profiles
  where role::text = 'admin';

  if v_target_current_role = 'admin'
     and p_role::text = 'user'
     and v_current_admin_count <= 1 then
    raise exception 'Cannot remove the last admin.';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;
end;
$$;

revoke all
on function public.admin_update_user_role(uuid, public.app_role)
from public;

grant execute
on function public.admin_update_user_role(uuid, public.app_role)
to authenticated;


-- ============================================================
-- 4. Admin update leaderboard visibility
-- ============================================================

create or replace function public.admin_update_user_leaderboard_visibility(
  p_user_id uuid,
  p_leaderboard_opt_in boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can update leaderboard visibility.';
  end if;

  update public.profiles
  set leaderboard_opt_in = p_leaderboard_opt_in
  where id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;
end;
$$;

revoke all
on function public.admin_update_user_leaderboard_visibility(uuid, boolean)
from public;

grant execute
on function public.admin_update_user_leaderboard_visibility(uuid, boolean)
to authenticated;

commit;