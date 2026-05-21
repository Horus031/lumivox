begin;

-- ============================================================
-- 1. Helper function:
--    A user may view another profile if both are active members
--    of at least one same study room.
-- ============================================================

create or replace function public.can_view_study_room_peer_profile(
  p_profile_id uuid,
  p_viewer_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_room_members viewer_membership
    join public.study_room_members target_membership
      on target_membership.room_id = viewer_membership.room_id
    where viewer_membership.user_id = p_viewer_id
      and viewer_membership.membership_status = 'active'
      and target_membership.user_id = p_profile_id
      and target_membership.membership_status = 'active'
  );
$$;

revoke all
on function public.can_view_study_room_peer_profile(uuid, uuid)
from public;

grant execute
on function public.can_view_study_room_peer_profile(uuid, uuid)
to authenticated;


-- ============================================================
-- 2. Allow study room members to view peer profiles
--    in rooms they share.
-- ============================================================

drop policy if exists
  "Study room peers can view each other's profiles"
on public.profiles;

create policy
  "Study room peers can view each other's profiles"
on public.profiles
for select
to authenticated
using (
  public.can_view_study_room_peer_profile(
    profiles.id,
    (select auth.uid())
  )
);

commit;