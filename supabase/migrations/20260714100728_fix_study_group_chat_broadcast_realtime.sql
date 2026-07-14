begin;

-- ============================================================
-- 1. Helper: authorize study group realtime topic
-- Topic format: study-group-chat:<group_id>
-- ============================================================

create or replace function public.can_access_study_group_realtime_topic(
  p_topic text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if p_topic is null or p_user_id is null then
    return false;
  end if;

  if p_topic not like 'study-group-chat:%' then
    return false;
  end if;

  begin
    v_group_id := replace(p_topic, 'study-group-chat:', '')::uuid;
  exception
    when others then
      return false;
  end;

  return exists (
    select 1
    from public.study_rooms room
    join public.study_room_members member
      on member.room_id = room.id
    where room.id = v_group_id
      and room.room_type::text = 'group'
      and member.user_id = p_user_id
      and member.membership_status::text = 'active'
  );
end;
$$;

revoke all
on function public.can_access_study_group_realtime_topic(text, uuid)
from public;

grant execute
on function public.can_access_study_group_realtime_topic(text, uuid)
to authenticated;


-- ============================================================
-- 2. Realtime messages policies for private broadcast channel
-- ============================================================

alter table realtime.messages enable row level security;

drop policy if exists "Active group members can read group realtime messages"
on realtime.messages;

create policy "Active group members can read group realtime messages"
on realtime.messages
for select
to authenticated
using (
  public.can_access_study_group_realtime_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);

drop policy if exists "Active group members can send group realtime messages"
on realtime.messages;

create policy "Active group members can send group realtime messages"
on realtime.messages
for insert
to authenticated
with check (
  public.can_access_study_group_realtime_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);


-- ============================================================
-- 3. Keep Postgres Changes fallback working
-- ============================================================

alter table public.study_room_messages enable row level security;

drop policy if exists "Active group members can view group messages"
on public.study_room_messages;

create policy "Active group members can view group messages"
on public.study_room_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.study_rooms room
    join public.study_room_members member
      on member.room_id = room.id
    where room.id = study_room_messages.room_id
      and room.room_type::text = 'group'
      and member.user_id = (select auth.uid())
      and member.membership_status::text = 'active'
  )
);

drop policy if exists "Active group members can insert group messages"
on public.study_room_messages;

create policy "Active group members can insert group messages"
on public.study_room_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.study_rooms room
    join public.study_room_members member
      on member.room_id = room.id
    where room.id = study_room_messages.room_id
      and room.room_type::text = 'group'
      and member.user_id = (select auth.uid())
      and member.membership_status::text = 'active'
  )
);

commit;