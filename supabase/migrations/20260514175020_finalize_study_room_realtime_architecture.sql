begin;

-- ============================================================
-- 1. FINAL REALTIME AUTHORIZATION POLICIES
--    Supports BOTH Presence and Broadcast on study-room:<room_id>
-- ============================================================

drop policy if exists
  "TEMP authenticated users can receive any private realtime"
on realtime.messages;

drop policy if exists
  "TEMP authenticated users can send any private realtime"
on realtime.messages;

drop policy if exists
  "TEMP authenticated users can receive presence"
on realtime.messages;

drop policy if exists
  "TEMP authenticated users can send presence"
on realtime.messages;

drop policy if exists
  "Study room members can receive room presence"
on realtime.messages;

drop policy if exists
  "Study room members can send room presence"
on realtime.messages;

drop policy if exists
  "Study room members can receive room realtime"
on realtime.messages;

drop policy if exists
  "Study room members can send room realtime"
on realtime.messages;


create policy
  "Study room members can receive room realtime"
on realtime.messages
for select
to authenticated
using (
  public.can_access_study_room_presence_topic(
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
  public.can_access_study_room_presence_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);


-- ============================================================
-- 2. BROADCAST DATABASE CHANGES FOR STUDY ROOM MEMBERS
--    Topic: study-room:<room_id>
--    Events: INSERT / UPDATE / DELETE
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
    'study-room:' || v_room_id::text,
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

drop trigger if exists handle_study_room_member_realtime_changes
on public.study_room_members;

create trigger handle_study_room_member_realtime_changes
after insert or update or delete
on public.study_room_members
for each row
execute function public.broadcast_study_room_member_changes();

commit;