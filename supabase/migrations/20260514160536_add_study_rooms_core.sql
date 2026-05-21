begin;

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

create type public.study_room_visibility as enum (
  'public',
  'private'
);

create type public.study_room_status as enum (
  'active',
  'archived'
);

create type public.study_room_member_role as enum (
  'owner',
  'member'
);

create type public.study_room_member_status as enum (
  'active',
  'left',
  'removed'
);


-- ============================================================
-- 2. STUDY ROOMS
-- ============================================================

create table public.study_rooms (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null
    references public.profiles(id)
    on delete cascade,

  title text not null
    check (char_length(trim(title)) >= 3),

  description text,

  visibility public.study_room_visibility not null default 'public',
  status public.study_room_status not null default 'active',

  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),

  max_participants integer not null default 20
    check (max_participants between 2 and 100),

  realtime_topic text generated always as (
    'study-room:' || id::text
  ) stored unique,

  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_study_rooms_updated_at
before update on public.study_rooms
for each row
execute function public.set_updated_at();

create index idx_study_rooms_owner_id
on public.study_rooms(owner_id);

create index idx_study_rooms_visibility_status
on public.study_rooms(visibility, status);

create index idx_study_rooms_created_at
on public.study_rooms(created_at desc);


-- ============================================================
-- 3. STUDY ROOM MEMBERS
-- ============================================================

create table public.study_room_members (
  id uuid primary key default gen_random_uuid(),

  room_id uuid not null
    references public.study_rooms(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  role public.study_room_member_role not null default 'member',
  membership_status public.study_room_member_status not null default 'active',

  joined_at timestamptz not null default now(),
  left_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_study_room_member
    unique (room_id, user_id)
);

create trigger set_study_room_members_updated_at
before update on public.study_room_members
for each row
execute function public.set_updated_at();

create index idx_study_room_members_room_id
on public.study_room_members(room_id);

create index idx_study_room_members_user_id
on public.study_room_members(user_id);

create index idx_study_room_members_active_room
on public.study_room_members(room_id, membership_status);


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.study_rooms enable row level security;
alter table public.study_room_members enable row level security;


-- ------------------------------------------------------------
-- study_rooms SELECT
-- - Public active rooms are visible to authenticated users.
-- - Private rooms are visible only to active members.
-- ------------------------------------------------------------

create policy "Authenticated users can view public rooms or rooms they belong to"
on public.study_rooms
for select
to authenticated
using (
  (
    visibility = 'public'
    and status = 'active'
  )
  or exists (
    select 1
    from public.study_room_members members
    where members.room_id = study_rooms.id
      and members.user_id = (select auth.uid())
      and members.membership_status = 'active'
  )
);


-- ------------------------------------------------------------
-- study_rooms INSERT
-- Normally room creation will go through RPC, but this policy
-- keeps the table safe if direct insert is ever used.
-- ------------------------------------------------------------

create policy "Users can create rooms for themselves"
on public.study_rooms
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
);


-- ------------------------------------------------------------
-- study_rooms UPDATE
-- Only owner may update/archive their room.
-- ------------------------------------------------------------

create policy "Room owners can update their own rooms"
on public.study_rooms
for update
to authenticated
using (
  owner_id = (select auth.uid())
)
with check (
  owner_id = (select auth.uid())
);


-- ------------------------------------------------------------
-- study_room_members SELECT
-- Only active members of the room can view its member roster.
-- ------------------------------------------------------------

create policy "Room members can view members in the same room"
on public.study_room_members
for select
to authenticated
using (
  exists (
    select 1
    from public.study_room_members self_membership
    where self_membership.room_id = study_room_members.room_id
      and self_membership.user_id = (select auth.uid())
      and self_membership.membership_status = 'active'
  )
);


-- ------------------------------------------------------------
-- study_room_members UPDATE
-- Users may update their own membership only.
-- Useful for leaving a room through RPC-controlled update.
-- ------------------------------------------------------------

create policy "Users can update their own room membership"
on public.study_room_members
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);


-- ============================================================
-- 5. PRIVILEGES
-- ============================================================

grant select, insert, update
on public.study_rooms
to authenticated;

grant select, update
on public.study_room_members
to authenticated;


-- ============================================================
-- 6. RPC: CREATE STUDY ROOM
-- Creates room + owner membership atomically.
-- ============================================================

create or replace function public.create_study_room(
  p_title text,
  p_description text default null,
  p_visibility public.study_room_visibility default 'public',
  p_max_participants integer default 20
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_room_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if char_length(trim(p_title)) < 3 then
    raise exception 'Room title must contain at least 3 characters.';
  end if;

  if p_max_participants < 2 or p_max_participants > 100 then
    raise exception 'Max participants must be between 2 and 100.';
  end if;

  insert into public.study_rooms (
    owner_id,
    title,
    description,
    visibility,
    max_participants
  )
  values (
    v_user_id,
    trim(p_title),
    nullif(trim(p_description), ''),
    p_visibility,
    p_max_participants
  )
  returning id into v_room_id;

  insert into public.study_room_members (
    room_id,
    user_id,
    role,
    membership_status
  )
  values (
    v_room_id,
    v_user_id,
    'owner',
    'active'
  );

  return v_room_id;
end;
$$;


-- ============================================================
-- 7. RPC: JOIN STUDY ROOM
-- Public room: invite code optional.
-- Private room: invite code required and must match.
-- Rejoin restores existing membership row to active.
-- ============================================================

create or replace function public.join_study_room(
  p_room_id uuid,
  p_invite_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_room public.study_rooms%rowtype;
  v_active_count integer;
  v_existing_member public.study_room_members%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_room
  from public.study_rooms
  where id = p_room_id
    and status = 'active';

  if not found then
    raise exception 'Room not found or unavailable.';
  end if;

  if v_room.visibility = 'private' then
    if p_invite_code is null
       or upper(trim(p_invite_code)) <> v_room.invite_code then
      raise exception 'Invalid invite code.';
    end if;
  end if;

  select count(*)
  into v_active_count
  from public.study_room_members
  where room_id = p_room_id
    and membership_status = 'active';

  select *
  into v_existing_member
  from public.study_room_members
  where room_id = p_room_id
    and user_id = v_user_id;

  if found then
    if v_existing_member.membership_status <> 'active' then
      if v_active_count >= v_room.max_participants then
        raise exception 'Room is currently full.';
      end if;

      update public.study_room_members
      set
        membership_status = 'active',
        left_at = null,
        joined_at = now()
      where id = v_existing_member.id;
    end if;

    return p_room_id;
  end if;

  if v_active_count >= v_room.max_participants then
    raise exception 'Room is currently full.';
  end if;

  insert into public.study_room_members (
    room_id,
    user_id,
    role,
    membership_status
  )
  values (
    p_room_id,
    v_user_id,
    'member',
    'active'
  );

  return p_room_id;
end;
$$;


-- ============================================================
-- 8. RPC: JOIN PRIVATE ROOM BY INVITE CODE
-- Used by the "Join with code" UI.
-- ============================================================

create or replace function public.join_study_room_by_code(
  p_invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  select id
  into v_room_id
  from public.study_rooms
  where invite_code = upper(trim(p_invite_code))
    and status = 'active';

  if v_room_id is null then
    raise exception 'No active room found for this invite code.';
  end if;

  perform public.join_study_room(
    v_room_id,
    p_invite_code
  );

  return v_room_id;
end;
$$;


-- ============================================================
-- 9. RPC: LEAVE STUDY ROOM
-- Owner cannot leave directly; archive/delete flow can be added later.
-- ============================================================

create or replace function public.leave_study_room(
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role public.study_room_member_role;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select role
  into v_role
  from public.study_room_members
  where room_id = p_room_id
    and user_id = v_user_id
    and membership_status = 'active';

  if v_role is null then
    raise exception 'Active membership not found.';
  end if;

  if v_role = 'owner' then
    raise exception 'Room owner cannot leave directly. Archive the room instead.';
  end if;

  update public.study_room_members
  set
    membership_status = 'left',
    left_at = now()
  where room_id = p_room_id
    and user_id = v_user_id;
end;
$$;


-- ============================================================
-- 10. REALTIME AUTHORIZATION FOR PRIVATE PRESENCE CHANNELS
-- Topic format: study-room:<room_id>
-- Only active members can read/send presence state.
-- ============================================================

create policy "Study room members can receive room presence"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and exists (
    select 1
    from public.study_rooms rooms
    join public.study_room_members members
      on members.room_id = rooms.id
    where rooms.realtime_topic = (select realtime.topic())
      and members.user_id = (select auth.uid())
      and members.membership_status = 'active'
      and rooms.status = 'active'
  )
);

create policy "Study room members can send room presence"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and exists (
    select 1
    from public.study_rooms rooms
    join public.study_room_members members
      on members.room_id = rooms.id
    where rooms.realtime_topic = (select realtime.topic())
      and members.user_id = (select auth.uid())
      and members.membership_status = 'active'
      and rooms.status = 'active'
  )
);

commit;