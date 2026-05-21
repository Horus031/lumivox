begin;

-- ============================================================
-- 1. SECURITY DEFINER HELPER:
--    Check whether a user is an active member of a room.
--
--    This avoids recursive RLS policies on study_room_members.
-- ============================================================

create or replace function public.is_active_study_room_member(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_room_members members
    where members.room_id = p_room_id
      and members.user_id = p_user_id
      and members.membership_status = 'active'
  );
$$;


-- Optional but clean:
revoke all on function public.is_active_study_room_member(uuid, uuid)
from public;

grant execute
on function public.is_active_study_room_member(uuid, uuid)
to authenticated;


-- ============================================================
-- 2. SECURITY DEFINER HELPER:
--    Check whether a user can access a Realtime room topic.
--    Topic format: study-room:<room_id>
-- ============================================================

create or replace function public.can_access_study_room_realtime_topic(
  p_topic text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_rooms rooms
    join public.study_room_members members
      on members.room_id = rooms.id
    where rooms.realtime_topic = p_topic
      and rooms.status = 'active'
      and members.user_id = p_user_id
      and members.membership_status = 'active'
  );
$$;


revoke all on function public.can_access_study_room_realtime_topic(text, uuid)
from public;

grant execute
on function public.can_access_study_room_realtime_topic(text, uuid)
to authenticated;


-- ============================================================
-- 3. FIX study_rooms SELECT POLICY
--    Avoid referencing study_room_members directly inside policy.
-- ============================================================

drop policy if exists
  "Authenticated users can view public rooms or rooms they belong to"
on public.study_rooms;

create policy
  "Authenticated users can view public rooms or rooms they belong to"
on public.study_rooms
for select
to authenticated
using (
  (
    visibility = 'public'
    and status = 'active'
  )
  or public.is_active_study_room_member(
    study_rooms.id,
    (select auth.uid())
  )
);


-- ============================================================
-- 4. FIX study_room_members SELECT POLICY
--    This was the direct source of the recursion error.
-- ============================================================

drop policy if exists
  "Room members can view members in the same room"
on public.study_room_members;

create policy
  "Room members can view members in the same room"
on public.study_room_members
for select
to authenticated
using (
  public.is_active_study_room_member(
    study_room_members.room_id,
    (select auth.uid())
  )
);


-- ============================================================
-- 5. FIX Realtime Presence Authorization Policies
--    Use SECURITY DEFINER helper instead of direct joins
--    against RLS-protected tables.
-- ============================================================

drop policy if exists
  "Study room members can receive room presence"
on realtime.messages;

drop policy if exists
  "Study room members can send room presence"
on realtime.messages;


create policy
  "Study room members can receive room presence"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and public.can_access_study_room_realtime_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);


create policy
  "Study room members can send room presence"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and public.can_access_study_room_realtime_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);

commit;