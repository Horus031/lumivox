begin;

-- ============================================================
-- 1. HELPER FUNCTION:
--    Safely check whether a user is an active room member.
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

revoke all
on function public.is_active_study_room_member(uuid, uuid)
from public;

grant execute
on function public.is_active_study_room_member(uuid, uuid)
to authenticated;


-- ============================================================
-- 2. HELPER FUNCTION:
--    Check whether a private realtime topic belongs to a room
--    and the current user is an active member.
--
--    Expected topic:
--      study-room:<uuid>
-- ============================================================

create or replace function public.can_access_study_room_presence_topic(
  p_topic text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_prefix text;
  v_room_id_text text;
  v_room_id uuid;
begin
  v_prefix := split_part(p_topic, ':', 1);
  v_room_id_text := split_part(p_topic, ':', 2);

  if v_prefix <> 'study-room' then
    return false;
  end if;

  begin
    v_room_id := v_room_id_text::uuid;
  exception
    when others then
      return false;
  end;

  return exists (
    select 1
    from public.study_rooms rooms
    where rooms.id = v_room_id
      and rooms.status = 'active'
      and public.is_active_study_room_member(
        rooms.id,
        p_user_id
      )
  );
end;
$$;

revoke all
on function public.can_access_study_room_presence_topic(text, uuid)
from public;

grant execute
on function public.can_access_study_room_presence_topic(text, uuid)
to authenticated;


-- ============================================================
-- 3. DROP OLD REALTIME POLICIES
-- ============================================================

drop policy if exists
  "Study room members can receive room presence"
on realtime.messages;

drop policy if exists
  "Study room members can send room presence"
on realtime.messages;


-- ============================================================
-- 4. CREATE NEW PRESENCE AUTHORIZATION POLICIES
-- ============================================================

create policy
  "Study room members can receive room presence"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('presence')
  and public.can_access_study_room_presence_topic(
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
  realtime.messages.extension in ('presence')
  and public.can_access_study_room_presence_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);


-- ============================================================
-- 5. ENABLE POSTGRES CHANGES FOR STUDY ROOM MEMBERS
--    Needed for persistent roster live updates.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_room_members'
  ) then
    alter publication supabase_realtime
    add table public.study_room_members;
  end if;
end;
$$;

commit;