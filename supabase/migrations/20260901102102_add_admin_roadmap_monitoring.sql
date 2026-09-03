begin;

-- ============================================================
-- 1. Admin roadmap metrics
-- ============================================================

create or replace function public.admin_get_roadmap_metrics()
returns table (
  total_roadmaps integer,
  draft_roadmaps integer,
  applied_roadmaps integer,
  archived_roadmaps integer,
  total_roadmap_nodes integer,
  total_goal_nodes integer,
  total_task_nodes integer,
  total_subtask_nodes integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    count(distinct roadmap.id)::integer as total_roadmaps,
    count(distinct roadmap.id) filter (where roadmap.status::text = 'draft')::integer as draft_roadmaps,
    count(distinct roadmap.id) filter (where roadmap.status::text = 'applied')::integer as applied_roadmaps,
    count(distinct roadmap.id) filter (where roadmap.status::text = 'archived')::integer as archived_roadmaps,
    count(node.id)::integer as total_roadmap_nodes,
    count(node.id) filter (where node.node_type::text = 'goal')::integer as total_goal_nodes,
    count(node.id) filter (where node.node_type::text = 'task')::integer as total_task_nodes,
    count(node.id) filter (where node.node_type::text = 'subtask')::integer as total_subtask_nodes
  from public.learning_roadmaps roadmap
  left join public.learning_roadmap_nodes node
    on node.roadmap_id = roadmap.id
  where public.is_admin((select auth.uid()));
$$;

revoke all on function public.admin_get_roadmap_metrics() from public;
grant execute on function public.admin_get_roadmap_metrics() to authenticated;


-- ============================================================
-- 2. Admin search roadmaps
-- ============================================================

create or replace function public.admin_search_learning_roadmaps(
  p_query text default '',
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  roadmap_id uuid,
  user_id uuid,
  owner_name text,
  owner_email text,

  title text,
  topic text,
  subject_name text,
  description text,

  current_level text,
  target_level text,
  start_date date,
  end_date date,
  study_days_per_week integer,
  minutes_per_study_day integer,
  preferred_locale text,
  status text,

  goal_nodes integer,
  task_nodes integer,
  subtask_nodes integer,
  total_nodes integer,

  ai_provider text,
  ai_model text,
  ai_latency_ms integer,

  applied_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    roadmap.id as roadmap_id,
    roadmap.user_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,

    roadmap.title,
    roadmap.topic,
    roadmap.subject_name,
    roadmap.description,

    roadmap.current_level::text,
    roadmap.target_level::text,
    roadmap.start_date,
    roadmap.end_date,
    roadmap.study_days_per_week,
    roadmap.minutes_per_study_day,
    roadmap.preferred_locale,
    roadmap.status::text,

    count(node.id) filter (where node.node_type::text = 'goal')::integer as goal_nodes,
    count(node.id) filter (where node.node_type::text = 'task')::integer as task_nodes,
    count(node.id) filter (where node.node_type::text = 'subtask')::integer as subtask_nodes,
    count(node.id)::integer as total_nodes,

    roadmap.ai_provider,
    roadmap.ai_model,
    roadmap.ai_latency_ms,

    roadmap.applied_at,
    roadmap.archived_at,
    roadmap.created_at,
    roadmap.updated_at

  from public.learning_roadmaps roadmap
  left join public.learning_roadmap_nodes node
    on node.roadmap_id = roadmap.id
  left join public.profiles profile
    on profile.id = roadmap.user_id
  left join auth.users auth_user
    on auth_user.id = roadmap.user_id
  where public.is_admin((select auth.uid()))
    and (
      coalesce(trim(p_query), '') = ''
      or roadmap.title ilike '%' || trim(p_query) || '%'
      or roadmap.topic ilike '%' || trim(p_query) || '%'
      or roadmap.subject_name ilike '%' || trim(p_query) || '%'
      or roadmap.description ilike '%' || trim(p_query) || '%'
      or roadmap.id::text ilike '%' || trim(p_query) || '%'
      or roadmap.user_id::text ilike '%' || trim(p_query) || '%'
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
    )
    and (
      p_status = 'all'
      or roadmap.status::text = p_status
    )
  group by
    roadmap.id,
    profile.id,
    profile.display_name,
    profile.full_name,
    auth_user.email
  order by roadmap.updated_at desc, roadmap.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all on function public.admin_search_learning_roadmaps(text, text, integer, integer) from public;
grant execute on function public.admin_search_learning_roadmaps(text, text, integer, integer) to authenticated;


-- ============================================================
-- 3. Admin archive / unarchive roadmap
-- ============================================================

create or replace function public.admin_set_learning_roadmap_archived(
  p_roadmap_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can archive roadmaps.';
  end if;

  if p_archived then
    update public.learning_roadmaps
    set
      status = 'archived',
      archived_at = now()
    where id = p_roadmap_id
      and status::text <> 'applied';
  else
    update public.learning_roadmaps
    set
      status = 'draft',
      archived_at = null
    where id = p_roadmap_id
      and status::text = 'archived';
  end if;

  if not found then
    raise exception 'Roadmap not found or cannot be archived.';
  end if;
end;
$$;

revoke all on function public.admin_set_learning_roadmap_archived(uuid, boolean) from public;
grant execute on function public.admin_set_learning_roadmap_archived(uuid, boolean) to authenticated;

commit;