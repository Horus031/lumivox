begin;

-- ============================================================
-- 1. Add archive fields to study_rooms
-- ============================================================

alter table public.study_rooms
add column if not exists archived_at timestamptz;

alter table public.study_rooms
add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.study_rooms
add column if not exists admin_note text;

create index if not exists idx_study_rooms_archived_at
on public.study_rooms(archived_at);

create index if not exists idx_study_rooms_group_archived
on public.study_rooms(room_type, archived_at);


-- ============================================================
-- 2. Admin search groups
-- ============================================================

create or replace function public.admin_search_study_groups(
  p_query text default '',
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  group_id uuid,
  name text,
  description text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  is_private boolean,
  archived_at timestamptz,
  admin_note text,
  member_count integer,
  message_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    room.id as group_id,
    room.title,
    room.description,
    room.owner_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,
    room.is_private,
    room.archived_at,
    room.admin_note,

    (
      select count(*)::integer
      from public.study_room_members member
      where member.room_id = room.id
        and member.membership_status::text = 'active'
    ) as member_count,

    (
      select count(*)::integer
      from public.study_room_messages message
      where message.room_id = room.id
    ) as message_count,

    room.created_at,
    room.updated_at

  from public.study_rooms room
  left join public.profiles profile
    on profile.id = room.owner_id
  left join auth.users auth_user
    on auth_user.id = room.owner_id
  where public.is_admin((select auth.uid()))
    and room.room_type::text = 'group'
    and (
      coalesce(trim(p_query), '') = ''
      or room.title ilike '%' || trim(p_query) || '%'
      or room.description ilike '%' || trim(p_query) || '%'
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
      or room.id::text ilike '%' || trim(p_query) || '%'
    )
    and (
      p_status = 'all'
      or (p_status = 'active' and room.archived_at is null)
      or (p_status = 'archived' and room.archived_at is not null)
    )
  order by room.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all
on function public.admin_search_study_groups(text, text, integer, integer)
from public;

grant execute
on function public.admin_search_study_groups(text, text, integer, integer)
to authenticated;


-- ============================================================
-- 3. Admin group detail
-- ============================================================

create or replace function public.admin_get_study_group_detail(
  p_group_id uuid
)
returns table (
  group_id uuid,
  name text,
  description text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  is_private boolean,
  archived_at timestamptz,
  archived_by uuid,
  admin_note text,
  member_count integer,
  message_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    room.id as group_id,
    room.title,
    room.description,
    room.owner_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,
    room.is_private,
    room.archived_at,
    room.archived_by,
    room.admin_note,

    (
      select count(*)::integer
      from public.study_room_members member
      where member.room_id = room.id
        and member.membership_status::text = 'active'
    ) as member_count,

    (
      select count(*)::integer
      from public.study_room_messages message
      where message.room_id = room.id
    ) as message_count,

    room.created_at,
    room.updated_at

  from public.study_rooms room
  left join public.profiles profile
    on profile.id = room.owner_id
  left join auth.users auth_user
    on auth_user.id = room.owner_id
  where public.is_admin((select auth.uid()))
    and room.room_type::text = 'group'
    and room.id = p_group_id
  limit 1;
$$;

revoke all
on function public.admin_get_study_group_detail(uuid)
from public;

grant execute
on function public.admin_get_study_group_detail(uuid)
to authenticated;


-- ============================================================
-- 4. Admin group members
-- ============================================================

create or replace function public.admin_get_study_group_members(
  p_group_id uuid
)
returns table (
  member_id uuid,
  group_id uuid,
  user_id uuid,
  full_name text,
  display_name text,
  email text,
  role text,
  membership_status text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    member.id as member_id,
    member.room_id as group_id,
    member.user_id,
    profile.full_name,
    profile.display_name,
    auth_user.email::text as email,
    member.role::text as role,
    member.membership_status::text as membership_status,
    member.joined_at
  from public.study_room_members member
  left join public.profiles profile
    on profile.id = member.user_id
  left join auth.users auth_user
    on auth_user.id = member.user_id
  join public.study_rooms room
    on room.id = member.room_id
  where public.is_admin((select auth.uid()))
    and room.room_type::text = 'group'
    and member.room_id = p_group_id
  order by member.joined_at asc;
$$;

revoke all
on function public.admin_get_study_group_members(uuid)
from public;

grant execute
on function public.admin_get_study_group_members(uuid)
to authenticated;


-- ============================================================
-- 5. Admin group messages
-- ============================================================

create or replace function public.admin_get_study_group_messages(
  p_group_id uuid,
  p_limit integer default 100
)
returns table (
  message_id uuid,
  group_id uuid,
  user_id uuid,
  full_name text,
  display_name text,
  email text,
  content text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    message.id as message_id,
    message.room_id as group_id,
    message.sender_id,
    profile.full_name,
    profile.display_name,
    auth_user.email::text as email,
    message.content,
    message.created_at
  from public.study_room_messages message
  left join public.profiles profile
    on profile.id = message.sender_id
  left join auth.users auth_user
    on auth_user.id = message.sender_id
  join public.study_rooms room
    on room.id = message.room_id
  where public.is_admin((select auth.uid()))
    and room.room_type::text = 'group'
    and message.room_id = p_group_id
  order by message.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all
on function public.admin_get_study_group_messages(uuid, integer)
from public;

grant execute
on function public.admin_get_study_group_messages(uuid, integer)
to authenticated;


-- ============================================================
-- 6. Admin delete/moderate one group message
-- ============================================================

create or replace function public.admin_delete_study_group_message(
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can delete group messages.';
  end if;

  delete from public.study_room_messages
  where id = p_message_id;

  if not found then
    raise exception 'Message not found.';
  end if;
end;
$$;

revoke all
on function public.admin_delete_study_group_message(uuid)
from public;

grant execute
on function public.admin_delete_study_group_message(uuid)
to authenticated;


-- ============================================================
-- 7. Admin archive/unarchive group
-- ============================================================

create or replace function public.admin_set_study_group_archived(
  p_group_id uuid,
  p_archived boolean,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can archive or restore groups.';
  end if;

  update public.study_rooms
  set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then (select auth.uid()) else null end,
    admin_note = p_admin_note,
    updated_at = now()
  where id = p_group_id
    and room_type::text = 'group';

  if not found then
    raise exception 'Study group not found.';
  end if;
end;
$$;

revoke all
on function public.admin_set_study_group_archived(uuid, boolean, text)
from public;

grant execute
on function public.admin_set_study_group_archived(uuid, boolean, text)
to authenticated;

commit;