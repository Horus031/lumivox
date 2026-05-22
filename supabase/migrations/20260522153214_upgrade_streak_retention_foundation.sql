begin;

-- ============================================================
-- 1. ENUM: STREAK STATUS
-- ============================================================

do $$
begin
  create type public.engagement_streak_status as enum (
    'active',
    'frozen',
    'lost'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 2. ENUM: STREAK EVENT TYPE
-- ============================================================

do $$
begin
  create type public.streak_event_type as enum (
    'activity_detected',
    'streak_started',
    'streak_continued',
    'streak_frozen',
    'streak_restored',
    'streak_lost'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 3. EXTEND REWARD EVENT TYPE
-- ============================================================

do $$
begin
  alter type public.reward_event_type
  add value 'streak_restored_with_tokens';
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 4. ALLOW TOKEN SPENDING IN REWARD LEDGER
--    Old: token_delta > 0
--    New: token_delta <> 0
-- ============================================================

alter table public.reward_ledger
drop constraint if exists reward_ledger_token_delta_check;

do $$
begin
  alter table public.reward_ledger
  add constraint reward_ledger_token_delta_non_zero
  check (token_delta <> 0);
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 5. EXTEND USER ENGAGEMENT STATS
-- ============================================================

alter table public.user_engagement_stats
add column if not exists streak_status public.engagement_streak_status
not null default 'lost';

alter table public.user_engagement_stats
add column if not exists streak_freeze_started_at timestamptz;

alter table public.user_engagement_stats
add column if not exists streak_restore_deadline_at timestamptz;

alter table public.user_engagement_stats
add column if not exists last_streak_evaluation_at timestamptz;

alter table public.user_engagement_stats
add column if not exists last_valid_activity_date date;

alter table public.user_engagement_stats
add column if not exists total_tokens_spent integer
not null default 0
check (total_tokens_spent >= 0);


-- ============================================================
-- 6. USER STREAK EVENTS
--    Audit log for streak state transitions.
-- ============================================================

create table if not exists public.user_streak_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  event_type public.streak_event_type not null,

  previous_status public.engagement_streak_status,
  next_status public.engagement_streak_status,

  event_date date not null default current_date,

  token_delta integer not null default 0,

  source_key text not null,

  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint unique_streak_event_source_per_user
    unique (user_id, source_key)
);

create index if not exists idx_user_streak_events_user_occurred
on public.user_streak_events(user_id, occurred_at desc);

create index if not exists idx_user_streak_events_user_event_type
on public.user_streak_events(user_id, event_type);


-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.user_streak_events enable row level security;

drop policy if exists "Users can view their own streak events"
on public.user_streak_events;

create policy "Users can view their own streak events"
on public.user_streak_events
for select
to authenticated
using (
  user_id = (select auth.uid())
);


-- ============================================================
-- 8. PRIVILEGES
-- ============================================================

grant select
on public.user_streak_events
to authenticated;


-- ============================================================
-- 9. TOKEN BALANCE HELPER
-- ============================================================

create or replace function public.get_user_token_balance(
  p_user_id uuid
)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(sum(token_delta), 0)::integer
  from public.reward_ledger
  where user_id = p_user_id;
$$;

revoke all
on function public.get_user_token_balance(uuid)
from public;

grant execute
on function public.get_user_token_balance(uuid)
to authenticated;


-- ============================================================
-- 10. RESTORE STREAK USING TOKENS
--     Called from authenticated frontend/server action.
-- ============================================================

create or replace function public.restore_my_streak_with_tokens()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_stats public.user_engagement_stats%rowtype;
  v_restore_cost integer := 30;
  v_balance integer;
  v_restore_count_7d integer;
  v_source_key text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_stats
  from public.user_engagement_stats
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Engagement stats not found. Please refresh engagement summary first.';
  end if;

  if v_stats.streak_status <> 'frozen' then
    raise exception 'Only frozen streaks can be restored.';
  end if;

  if v_stats.streak_restore_deadline_at is null
     or v_stats.streak_restore_deadline_at < now() then
    raise exception 'The streak restore window has expired.';
  end if;

  select count(*)
  into v_restore_count_7d
  from public.user_streak_events
  where user_id = v_user_id
    and event_type = 'streak_restored'
    and occurred_at >= now() - interval '7 days';

  if v_restore_count_7d >= 1 then
    raise exception 'Only one streak restore is allowed within a 7-day window.';
  end if;

  v_balance := public.get_user_token_balance(v_user_id);

  if v_balance < v_restore_cost then
    raise exception 'Not enough tokens to restore streak.';
  end if;

  v_source_key :=
    'streak_restore:' ||
    coalesce(
      extract(epoch from v_stats.streak_freeze_started_at)::text,
      extract(epoch from now())::text
    );

  insert into public.reward_ledger (
    user_id,
    event_type,
    token_delta,
    source_key,
    source_payload,
    reward_note,
    occurred_at
  )
  values (
    v_user_id,
    'streak_restored_with_tokens',
    -v_restore_cost,
    v_source_key,
    jsonb_build_object(
      'restore_cost', v_restore_cost,
      'previous_status', v_stats.streak_status,
      'restore_deadline_at', v_stats.streak_restore_deadline_at
    ),
    'Spent tokens to restore a frozen study streak.',
    now()
  )
  on conflict (user_id, source_key)
  do nothing;

  insert into public.user_streak_events (
    user_id,
    event_type,
    previous_status,
    next_status,
    event_date,
    token_delta,
    source_key,
    metadata,
    occurred_at
  )
  values (
    v_user_id,
    'streak_restored',
    'frozen',
    'active',
    current_date,
    -v_restore_cost,
    v_source_key,
    jsonb_build_object(
      'restore_cost', v_restore_cost,
      'balance_before', v_balance,
      'balance_after', v_balance - v_restore_cost
    ),
    now()
  )
  on conflict (user_id, source_key)
  do nothing;

  update public.user_engagement_stats
  set
    streak_status = 'active',
    streak_freeze_started_at = null,
    streak_restore_deadline_at = null,
    token_balance = v_balance - v_restore_cost,
    total_tokens_spent = total_tokens_spent + v_restore_cost,
    last_streak_evaluation_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Streak restored successfully.',
    'token_balance', v_balance - v_restore_cost,
    'token_spent', v_restore_cost
  );
end;
$$;

revoke all
on function public.restore_my_streak_with_tokens()
from public;

grant execute
on function public.restore_my_streak_with_tokens()
to authenticated;


-- ============================================================
-- 11. EXPIRE FROZEN STREAKS
--     This will be called by Supabase Cron.
-- ============================================================

create or replace function public.expire_frozen_streaks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_count integer;
begin
  with expired as (
    update public.user_engagement_stats
    set
      streak_status = 'lost',
      current_streak_days = 0,
      streak_freeze_started_at = null,
      streak_restore_deadline_at = null,
      last_streak_evaluation_at = now()
    where streak_status = 'frozen'
      and streak_restore_deadline_at is not null
      and streak_restore_deadline_at < now()
    returning
      user_id,
      latest_active_study_date
  ),
  inserted_events as (
    insert into public.user_streak_events (
      user_id,
      event_type,
      previous_status,
      next_status,
      event_date,
      token_delta,
      source_key,
      metadata,
      occurred_at
    )
    select
      user_id,
      'streak_lost',
      'frozen',
      'lost',
      current_date,
      0,
      'streak_lost:' || current_date::text || ':' || user_id::text,
      jsonb_build_object(
        'reason', 'restore_window_expired',
        'latest_active_study_date', latest_active_study_date
      ),
      now()
    from expired
    on conflict (user_id, source_key)
    do nothing
    returning id
  )
  select count(*)
  into v_expired_count
  from expired;

  return coalesce(v_expired_count, 0);
end;
$$;

revoke all
on function public.expire_frozen_streaks()
from public;

grant execute
on function public.expire_frozen_streaks()
to authenticated;


commit;