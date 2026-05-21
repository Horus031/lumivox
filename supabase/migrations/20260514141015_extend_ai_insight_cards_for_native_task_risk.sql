begin;

-- ============================================================
-- 1. Add new insight type
-- ============================================================

alter type public.ai_insight_type
add value if not exists 'native_task_risk';


-- ============================================================
-- 2. Link AI insight cards to native task risk assessments
-- ============================================================

alter table public.ai_insight_cards
add column if not exists native_task_risk_assessment_id uuid unique
references public.native_task_risk_assessments(id)
on delete cascade;


-- ============================================================
-- 3. Ensure an AI insight card is linked to exactly one source
--    Either:
--    - research ML deadline prediction
--    - native task risk assessment
-- ============================================================

alter table public.ai_insight_cards
add constraint ai_insight_cards_exactly_one_source
check (
  (
    case
      when deadline_risk_prediction_id is not null then 1
      else 0
    end
  )
  +
  (
    case
      when native_task_risk_assessment_id is not null then 1
      else 0
    end
  )
  = 1
);


-- ============================================================
-- 4. Index
-- ============================================================

create index if not exists idx_ai_insight_cards_native_task_risk_assessment_id
on public.ai_insight_cards(native_task_risk_assessment_id);

commit;