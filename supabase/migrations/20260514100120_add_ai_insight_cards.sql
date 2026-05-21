begin;

-- ============================================================
-- 1. ENUM TYPE
-- ============================================================

create type public.ai_insight_type as enum (
  'deadline_risk'
);


-- ============================================================
-- 2. AI INSIGHT CARDS
-- ============================================================

create table public.ai_insight_cards (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.profiles(id) on delete cascade,

  insight_type public.ai_insight_type not null,

  deadline_risk_prediction_id uuid unique
    references public.deadline_risk_predictions(id)
    on delete cascade,

  title text not null,
  summary text not null,
  risk_interpretation text not null,

  evidence jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,

  confidence_note text not null,

  llm_provider text not null default 'anthropic',
  llm_model text not null,
  prompt_version text not null default 'deadline-risk-insight-v1',
  structured_output_schema_version text not null default 'v1',

  generation_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_ai_insight_cards_updated_at
before update on public.ai_insight_cards
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. INDEXES
-- ============================================================

create index idx_ai_insight_cards_user_id
on public.ai_insight_cards(user_id);

create index idx_ai_insight_cards_prediction_id
on public.ai_insight_cards(deadline_risk_prediction_id);

create index idx_ai_insight_cards_created_at
on public.ai_insight_cards(created_at desc);


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.ai_insight_cards enable row level security;

create policy "Users can view their own AI insight cards"
on public.ai_insight_cards
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- 5. PRIVILEGES
-- ============================================================

grant select
on public.ai_insight_cards
to authenticated;

commit;