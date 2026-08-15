begin;

-- ============================================================
-- 1. Helper: check whether a user owns a study group
-- ============================================================

create or replace function public.is_study_group_owner(
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
    from public.study_rooms room
    where room.id = p_room_id
      and room.owner_id = p_user_id
      and room.room_type::text = 'group'
  );
$$;

revoke all
on function public.is_study_group_owner(uuid, uuid)
from public;

grant execute
on function public.is_study_group_owner(uuid, uuid)
to authenticated;


-- ============================================================
-- 2. Helper: check whether a user can manage group members
-- Avoid direct self-reference inside RLS policy.
-- ============================================================

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
  select
    public.is_study_group_owner(p_room_id, p_user_id)
    or exists (
      select 1
      from public.study_room_members member
      join public.study_rooms room
        on room.id = member.room_id
      where member.room_id = p_room_id
        and member.user_id = p_user_id
        and member.membership_status::text = 'active'
        and member.role::text in ('owner', 'admin', 'host')
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
-- 3. Helper: check active group membership
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


-- ============================================================
-- 4. RLS policies for study_room_members
-- ============================================================

alter table public.study_room_members enable row level security;


-- Owner can insert their initial membership row after creating group.
drop policy if exists "Group owner can insert initial membership"
on public.study_room_members;

create policy "Group owner can insert initial membership"
on public.study_room_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and membership_status::text = 'active'
  and role::text in ('owner', 'admin', 'host')
  and public.is_study_group_owner(room_id, (select auth.uid()))
);


-- Owner/admin/host can invite normal members.
drop policy if exists "Group managers can insert members"
on public.study_room_members;

create policy "Group managers can insert members"
on public.study_room_members
for insert
to authenticated
with check (
  membership_status::text = 'active'
  and role::text in ('member')
  and public.can_manage_study_group_members(room_id, (select auth.uid()))
);


-- Needed for upsert if the member row already exists.
drop policy if exists "Group managers can update members"
on public.study_room_members;

create policy "Group managers can update members"
on public.study_room_members
for update
to authenticated
using (
  public.can_manage_study_group_members(room_id, (select auth.uid()))
)
with check (
  public.can_manage_study_group_members(room_id, (select auth.uid()))
);


-- Members can read their own group membership rows.
drop policy if exists "Users can view their own group memberships"
on public.study_room_members;

create policy "Users can view their own group memberships"
on public.study_room_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_active_study_group_member(room_id, (select auth.uid()))
  or public.can_manage_study_group_members(room_id, (select auth.uid()))
);

commit;