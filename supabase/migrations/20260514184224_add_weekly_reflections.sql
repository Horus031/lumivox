begin;

-- ============================================================
-- 1. ENUM TYPE
-- ============================================================

create type public.weekly_reflection_direction as enum (
  'improving',
  'stable',
  'mixed',
  'needs_attention'
);


-- ============================================================
-- 2. WEEKLY REFLECTIONS
--    Deterministic analytics layer
-- ============================================================

create table public.weekly_reflections (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  current_window_start timestamptz not null,
  current_window_end timestamptz not null,

  previous_window_start timestamptz not null,
  previous_window_end timestamptz not null,

  reflection_direction public.weekly_reflection_direction not null,

  current_metrics jsonb not null default '{}'::jsonb,
  previous_metrics jsonb not null default '{}'::jsonb,
  comparison_payload jsonb not null default '{}'::jsonb,
  evidence_payload jsonb not null default '[]'::jsonb,

  calculation_version text not null default 'weekly-reflection-v1',

  created_at timestamptz not null default now()
);

create index idx_weekly_reflections_user_created
on public.weekly_reflections(user_id, created_at desc);

create index idx_weekly_reflections_current_window
on public.weekly_reflections(current_window_start, current_window_end);


-- ============================================================
-- 3. WEEKLY REFLECTION CARDS
--    Gemini natural-language layer
-- ============================================================

create table public.weekly_reflection_cards (
  id uuid primary key default gen_random_uuid(),

  reflection_id uuid not null unique
    references public.weekly_reflections(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  title text not null,
  summary text not null,
  reflection_interpretation text not null,

  wins jsonb not null default '[]'::jsonb,
  watchouts jsonb not null default '[]'::jsonb,
  next_week_actions jsonb not null default '[]'::jsonb,

  confidence_note text not null,

  llm_provider text not null default 'google',
  llm_model text not null,
  prompt_version text not null default 'weekly-reflection-v1',
  structured_output_schema_version text not null default 'v1',

  generation_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_weekly_reflection_cards_updated_at
before update on public.weekly_reflection_cards
for each row
execute function public.set_updated_at();

create index idx_weekly_reflection_cards_user_created
on public.weekly_reflection_cards(user_id, created_at desc);


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.weekly_reflections enable row level security;
alter table public.weekly_reflection_cards enable row level security;

create policy "Users can view their own weekly reflections"
on public.weekly_reflections
for select
to authenticated
using (
  user_id = (select auth.uid())
);

create policy "Users can view their own weekly reflection cards"
on public.weekly_reflection_cards
for select
to authenticated
using (
  user_id = (select auth.uid())
);


-- ============================================================
-- 5. PRIVILEGES
-- ============================================================

grant select
on public.weekly_reflections
to authenticated;

grant select
on public.weekly_reflection_cards
to authenticated;

commit;