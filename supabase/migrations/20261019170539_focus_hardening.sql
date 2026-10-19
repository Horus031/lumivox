-- Focus V2 Phase 9 / additive production hardening.
-- Place contents into a NEW timestamped migration, never edit Phase 2 migrations.
-- No modifications to existing focus sessions or reward history.
begin;

-- Existing user-owned DELETE policy is permissive. RLS uses OR across
-- permissive policies, AND with restrictive policies for the same operation.
-- Stop authenticated callers deleting an entire Pomodoro parent (CASCADE
-- would also remove the immutable plan and segment evidence).
create policy focus_v2_legacy_only_delete
on public.focus_sessions
as restrictive
for delete
to authenticated
using (session_mode = 'legacy');

-- Even a privileged maintenance operation must not rewrite the scheduled
-- snapshot after session creation. Note: direct authenticated clients already
-- lack UPDATE grants; this adds defense in depth for service-role code.
create or replace function public.focus_v2_check_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent public.focus_sessions%rowtype;
begin
  if tg_op = 'UPDATE' and new is distinct from old then
    raise exception using
      errcode = '23514',
      message = 'Pomodoro plan configuration is immutable';
  end if;

  select * into parent
  from public.focus_sessions
  where id = new.session_id;

  if not found or parent.session_mode <> 'pomodoro'
     or parent.status <> 'ongoing'
     or parent.planned_minutes <> new.focus_minutes * new.round_count then
    raise exception using
      errcode = '23514',
      message = 'Invalid Pomodoro parent or focus-only planned_minutes';
  end if;

  return new;
end;
$$;

-- Preserve tight execution privileges of the Phase 2 trigger function.
revoke all on function public.focus_v2_check_plan() from public, anon, authenticated;

-- User-scoped analytics session listing is filtered by (user_id, started_at).
-- This index supports date-window filtering without altering historical rows.
create index if not exists idx_focus_sessions_user_started_at_v2
  on public.focus_sessions (user_id, started_at desc, id);

commit;
