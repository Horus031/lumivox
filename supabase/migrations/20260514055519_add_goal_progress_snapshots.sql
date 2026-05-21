begin;

-- ============================================================
-- Goal Progress Snapshots
-- Used to calculate Goal Momentum Score (GMS)
-- ============================================================

create table public.goal_progress_snapshots (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  period_start date not null,
  period_end date not null,

  average_progress_percent numeric(5, 2) not null
    check (
      average_progress_percent >= 0
      and average_progress_percent <= 100
    ),

  tracked_goal_count integer not null default 0
    check (tracked_goal_count >= 0),

  created_at timestamptz not null default now(),

  constraint valid_goal_progress_snapshot_period
    check (period_end >= period_start),

  constraint unique_goal_progress_snapshot_per_period
    unique (user_id, period_start, period_end)
);

create index idx_goal_progress_snapshots_user_id
on public.goal_progress_snapshots(user_id);

create index idx_goal_progress_snapshots_user_period
on public.goal_progress_snapshots(user_id, period_end desc);


-- ============================================================
-- RLS
-- ============================================================

alter table public.goal_progress_snapshots enable row level security;

create policy "Users can view their own goal progress snapshots"
on public.goal_progress_snapshots
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

grant select
on public.goal_progress_snapshots
to authenticated;

commit;