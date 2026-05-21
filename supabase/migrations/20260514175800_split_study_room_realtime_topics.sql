begin;

-- ============================================================
-- 1. GENERIC ROOM REALTIME AUTHORIZATION HELPER
--
-- Supported topics:
--   study-room-presence:<room_id>
--   study-room-members:<room_id>
--
-- Later we can extend this for:
--   study-room-chat:<room_id>
--   study-room-voice:<room_id>
-- ============================================================

create or replace function public.can_access_study_room_realtime_topic(
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

  if v_prefix not in (
    'study-room-presence',
    'study-room-members'
  ) then
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
on function public.can_access_study_room_realtime_topic(text, uuid)
from public;

grant execute
on function public.can_access_study_room_realtime_topic(text, uuid)
to authenticated;


-- ============================================================
-- 2. RECREATE REALTIME AUTHORIZATION POLICIES
-- ============================================================

drop policy if exists
  "Study room members can receive room realtime"
on realtime.messages;

drop policy if exists
  "Study room members can send room realtime"
on realtime.messages;

drop policy if exists
  "Study room members can receive room presence"
on realtime.messages;

drop policy if exists
  "Study room members can send room presence"
on realtime.messages;


create policy
  "Study room members can receive room realtime"
on realtime.messages
for select
to authenticated
using (
  public.can_access_study_room_realtime_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);

create policy
  "Study room members can send room realtime"
on realtime.messages
for insert
to authenticated
with check (
  public.can_access_study_room_realtime_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);


-- ============================================================
-- 3. CHANGE MEMBER DB BROADCAST TOPIC
--    FROM: study-room:<room_id>
--    TO:   study-room-members:<room_id>
-- ============================================================

create or replace function public.broadcast_study_room_member_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  v_room_id := coalesce(new.room_id, old.room_id);

  perform realtime.broadcast_changes(
    'study-room-members:' || v_room_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );

  return null;
end;
$$;

commit;