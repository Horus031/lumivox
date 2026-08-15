begin;

-- ============================================================
-- 1. App role enum
-- ============================================================

do $$
begin
  create type public.app_role as enum (
    'user',
    'admin'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 2. Add role to profiles
-- ============================================================

alter table public.profiles
add column if not exists role public.app_role not null default 'user';

create index if not exists idx_profiles_role
on public.profiles(role);


-- ============================================================
-- 3. Helper: is admin
-- ============================================================

create or replace function public.is_admin(
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
    from public.profiles profile
    where profile.id = p_user_id
      and profile.role::text = 'admin'
  );
$$;

revoke all
on function public.is_admin(uuid)
from public;

grant execute
on function public.is_admin(uuid)
to authenticated;


-- ============================================================
-- 4. Admin dashboard metrics RPC
-- ============================================================

create or replace function public.get_admin_dashboard_metrics()
returns table (
  total_users integer,
  total_admins integer,
  users_created_last_7_days integer,

  total_goals integer,
  total_tasks integer,
  completed_tasks integer,

  total_focus_sessions integer,
  total_focus_minutes integer,

  total_learning_documents integer,
  processed_learning_documents integer,
  failed_learning_documents integer,

  total_document_chunks integer,

  total_study_groups integer,
  total_group_messages integer,

  total_rag_chat_sessions integer,
  total_rag_chat_messages integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    (select count(*)::integer from public.profiles) as total_users,

    (
      select count(*)::integer
      from public.profiles
      where role::text = 'admin'
    ) as total_admins,

    (
      select count(*)::integer
      from auth.users
      where created_at >= now() - interval '7 days'
    ) as users_created_last_7_days,

    (select count(*)::integer from public.goals) as total_goals,

    (select count(*)::integer from public.tasks) as total_tasks,

    (
      select count(*)::integer
      from public.tasks
      where status::text = 'completed'
    ) as completed_tasks,

    (select count(*)::integer from public.focus_sessions) as total_focus_sessions,

    (
      select coalesce(sum(actual_focus_minutes), 0)::integer
      from public.focus_sessions
      where ended_at is not null
    ) as total_focus_minutes,

    (select count(*)::integer from public.learning_documents) as total_learning_documents,

    (
      select count(*)::integer
      from public.learning_documents
      where extracted_text_status = 'completed'
    ) as processed_learning_documents,

    (
      select count(*)::integer
      from public.learning_documents
      where extracted_text_status = 'failed'
    ) as failed_learning_documents,

    (select count(*)::integer from public.document_chunks) as total_document_chunks,

    (
      select count(*)::integer
      from public.study_rooms
      where room_type::text = 'group'
    ) as total_study_groups,

    (select count(*)::integer from public.study_room_messages) as total_group_messages,

    (select count(*)::integer from public.rag_chat_sessions) as total_rag_chat_sessions,

    (select count(*)::integer from public.rag_chat_messages) as total_rag_chat_messages
  where public.is_admin((select auth.uid()));
$$;

revoke all
on function public.get_admin_dashboard_metrics()
from public;

grant execute
on function public.get_admin_dashboard_metrics()
to authenticated;


-- ============================================================
-- 5. Admin recent users RPC
-- Do not expose password/auth sensitive data.
-- ============================================================

create or replace function public.get_admin_recent_users(
  p_limit integer default 10
)
returns table (
  user_id uuid,
  full_name text,
  display_name text,
  role text,
  leaderboard_opt_in boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    profile.id as user_id,
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
  order by auth_user.created_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;

revoke all
on function public.get_admin_recent_users(integer)
from public;

grant execute
on function public.get_admin_recent_users(integer)
to authenticated;

commit;