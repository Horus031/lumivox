begin;

-- ============================================================
-- 1. Extend room realtime topic authorization helper
--    Supported topics now:
--      study-room-presence:<room_id>
--      study-room-members:<room_id>
--      study-room-chat:<room_id>
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
    'study-room-members',
    'study-room-chat'
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
-- 2. STUDY ROOM MESSAGES
-- ============================================================

create table public.study_room_messages (
  id uuid primary key default gen_random_uuid(),

  room_id uuid not null
    references public.study_rooms(id)
    on delete cascade,

  sender_id uuid not null
    references public.profiles(id)
    on delete cascade,

  content text not null
    check (
      char_length(trim(content)) >= 1
      and char_length(trim(content)) <= 2000
    ),

  created_at timestamptz not null default now()
);

create index idx_study_room_messages_room_created
on public.study_room_messages(room_id, created_at asc);

create index idx_study_room_messages_sender_id
on public.study_room_messages(sender_id);


-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.study_room_messages enable row level security;

create policy "Room members can view study room messages"
on public.study_room_messages
for select
to authenticated
using (
  public.is_active_study_room_member(
    study_room_messages.room_id,
    (select auth.uid())
  )
);

create policy "Room members can send study room messages"
on public.study_room_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_active_study_room_member(
    study_room_messages.room_id,
    (select auth.uid())
  )
);


-- ============================================================
-- 4. PRIVILEGES
-- ============================================================

grant select, insert
on public.study_room_messages
to authenticated;


-- ============================================================
-- 5. Broadcast database changes to private chat topic
-- ============================================================

create or replace function public.broadcast_study_room_message_changes()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'study-room-chat:' || new.room_id::text,
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

drop trigger if exists handle_study_room_message_realtime_changes
on public.study_room_messages;

create trigger handle_study_room_message_realtime_changes
after insert
on public.study_room_messages
for each row
execute function public.broadcast_study_room_message_changes();

commit;