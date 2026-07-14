begin;

-- ============================================================
-- 1. Room type enum
-- ============================================================

do $$
begin
  create type public.study_room_type as enum (
    'room',
    'group'
  );
exception
  when duplicate_object then null;
end;
$$;

-- ============================================================
-- 2. Extend study_rooms
-- ============================================================

alter table public.study_rooms
add column if not exists room_type public.study_room_type not null default 'room';

alter table public.study_rooms
add column if not exists description text;

alter table public.study_rooms
add column if not exists is_private boolean not null default false;

create index if not exists idx_study_rooms_type_created
on public.study_rooms(room_type, created_at desc);

create index if not exists idx_study_rooms_creator_type
on public.study_rooms(owner_id, room_type);

commit;