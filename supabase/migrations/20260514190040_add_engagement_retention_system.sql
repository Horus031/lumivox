begin;

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

create type public.reward_event_type as enum (
  'focus_session_completed',
  'task_completed',
  'daily_streak_continued',
  'streak_milestone_3',
  'streak_milestone_7'
);


-- ============================================================
-- 2. USER ENGAGEMENT STATS
--    Current snapshot of streak and token status
-- ============================================================

create table public.user_engagement_stats (
  user_id uuid primary key
    references public.profiles(id)
    on delete cascade,

  current_streak_days integer not null default 0
    check (current_streak_days >= 0),

  longest_streak_days integer not null default 0
    check (longest_streak_days >= 0),

  latest_active_study_date date,

  token_balance integer not null default 0
    check (token_balance >= 0),

  total_tokens_earned integer not null default 0
    check (total_tokens_earned >= 0),

  tokens_earned_last_7d integer not null default 0
    check (tokens_earned_last_7d >= 0),

  completed_focus_sessions_total integer not null default 0
    check (completed_focus_sessions_total >= 0),

  completed_tasks_total integer not null default 0
    check (completed_tasks_total >= 0),

  calculation_version text not null default 'engagement-v1',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_user_engagement_stats_updated_at
before update on public.user_engagement_stats
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. REWARD LEDGER
--    Immutable reward history
-- ============================================================

create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  event_type public.reward_event_type not null,

  token_delta integer not null
    check (token_delta > 0),

  source_key text not null,

  source_payload jsonb not null default '{}'::jsonb,

  reward_note text not null,

  occurred_at timestamptz not null,

  created_at timestamptz not null default now(),

  constraint unique_reward_source_per_user
    unique (user_id, source_key)
);

create index idx_reward_ledger_user_created
on public.reward_ledger(user_id, created_at desc);

create index idx_reward_ledger_user_occurred
on public.reward_ledger(user_id, occurred_at desc);

create index idx_reward_ledger_event_type
on public.reward_ledger(event_type);


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.user_engagement_stats enable row level security;
alter table public.reward_ledger enable row level security;

create policy "Users can view their own engagement stats"
on public.user_engagement_stats
for select
to authenticated
using (
  user_id = (select auth.uid())
);

create policy "Users can view their own reward ledger"
on public.reward_ledger
for select
to authenticated
using (
  user_id = (select auth.uid())
);


-- ============================================================
-- 5. PRIVILEGES
-- ============================================================

grant select
on public.user_engagement_stats
to authenticated;

grant select
on public.reward_ledger
to authenticated;

commit;