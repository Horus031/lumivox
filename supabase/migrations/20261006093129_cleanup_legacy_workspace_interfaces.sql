begin;


-- ============================================================
-- 1. REMOVE LEGACY TASK PAGE RPC
--
-- Workspace now owns Task discovery and presentation.
-- ============================================================

drop function if exists
public.get_my_tasks_page(
  integer,
  integer,
  text,
  public.task_status,
  public.task_priority,
  uuid
);


-- ============================================================
-- 2. REMOVE REVIEW SUBMISSION V1
--
-- All current AI Review submissions use the idempotent V2 RPC.
-- ============================================================

drop function if exists
public.finalize_task_review_submission(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb
);


commit;