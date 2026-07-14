begin;

-- ============================================================
-- 1. Find user id by auth email
-- Used by invite-by-email flow.
-- ============================================================

create or replace function public.find_user_id_by_auth_email(
  p_email text
)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select auth_user.id
  from auth.users auth_user
  where lower(auth_user.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all
on function public.find_user_id_by_auth_email(text)
from public;

grant execute
on function public.find_user_id_by_auth_email(text)
to authenticated;


-- ============================================================
-- 2. Get group members with auth emails
-- Only active members of the group can view the member list.
-- ============================================================

create or replace function public.get_study_group_members_with_email(
  p_group_id uuid
)
returns table (
  member_id uuid,
  room_id uuid,
  user_id uuid,
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
    member.room_id,
    member.user_id,
    auth_user.email::text,
    member.role::text,
    member.membership_status::text,
    member.joined_at
  from public.study_room_members member
  join public.study_rooms room
    on room.id = member.room_id
  join auth.users auth_user
    on auth_user.id = member.user_id
  where member.room_id = p_group_id
    and room.room_type = 'group'
    and exists (
      select 1
      from public.study_room_members current_member
      where current_member.room_id = p_group_id
        and current_member.user_id = (select auth.uid())
        and current_member.membership_status = 'active'
    )
  order by member.joined_at asc;
$$;

revoke all
on function public.get_study_group_members_with_email(uuid)
from public;

grant execute
on function public.get_study_group_members_with_email(uuid)
to authenticated;


-- ============================================================
-- 3. Get group messages with auth emails
-- Only active group members can view messages.
-- ============================================================

create or replace function public.get_study_group_messages_with_email(
  p_group_id uuid,
  p_limit integer default 100
)
returns table (
  message_id uuid,
  room_id uuid,
  user_id uuid,
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
    message.room_id,
    message.sender_id,
    auth_user.email::text,
    message.content,
    message.created_at
  from public.study_room_messages message
  join public.study_rooms room
    on room.id = message.room_id
  join auth.users auth_user
    on auth_user.id = message.sender_id
  where message.room_id = p_group_id
    and room.room_type = 'group'
    and exists (
      select 1
      from public.study_room_members current_member
      where current_member.room_id = p_group_id
        and current_member.user_id = (select auth.uid())
        and current_member.membership_status = 'active'
    )
  order by message.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all
on function public.get_study_group_messages_with_email(uuid, integer)
from public;

grant execute
on function public.get_study_group_messages_with_email(uuid, integer)
to authenticated;

commit;