begin;

-- ============================================================
-- 1. REVIEW ATTEMPT STATUS
-- ============================================================

do $$
begin
  create type public.task_review_attempt_status as enum (
    'generating',
    'ready',
    'passed',
    'failed',
    'generation_failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 2. TASK REVIEW ATTEMPTS
--
-- This table is user-readable.
-- It MUST NOT contain correct answers.
-- ============================================================

create table if not exists public.task_review_attempts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  task_id uuid not null
    references public.tasks(id)
    on delete cascade,

  attempt_number integer not null
    check (attempt_number > 0),

  status public.task_review_attempt_status
    not null default 'generating',

  pass_threshold numeric(5, 2)
    not null default 70
    check (
      pass_threshold >= 0
      and pass_threshold <= 100
    ),

  score numeric(5, 2)
    check (
      score is null
      or (
        score >= 0
        and score <= 100
      )
    ),

  -- Snapshot of the Task / Goal / Subtasks used for this attempt.
  task_snapshot jsonb
    not null default '{}'::jsonb
    check (
      jsonb_typeof(task_snapshot) = 'object'
    ),

  -- IDs / metadata of documents and chunks used.
  -- Do not duplicate full source document contents here.
  source_snapshot jsonb
    not null default '{}'::jsonb
    check (
      jsonb_typeof(source_snapshot) = 'object'
    ),

  -- Safe browser-visible payload:
  -- flashcards + questions + options.
  --
  -- NO quiz answer keys here.
  assessment_payload jsonb
    not null default '{}'::jsonb
    check (
      jsonb_typeof(assessment_payload) = 'object'
    ),

  -- Populated in Phase 6 after quiz submission.
  feedback_payload jsonb
    not null default '{}'::jsonb
    check (
      jsonb_typeof(feedback_payload) = 'object'
    ),

  weak_areas jsonb
    not null default '[]'::jsonb
    check (
      jsonb_typeof(weak_areas) = 'array'
    ),

  provider text,
  model text,
  prompt_version text,
  latency_ms integer
    check (
      latency_ms is null
      or latency_ms >= 0
    ),

  generation_error text,

  ready_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint task_review_attempt_number_unique
    unique (task_id, attempt_number)
);


create index if not exists idx_task_review_attempts_user_created
on public.task_review_attempts(
  user_id,
  created_at desc
);


create index if not exists idx_task_review_attempts_task_created
on public.task_review_attempts(
  task_id,
  created_at desc
);


-- Only one active review lifecycle may exist for a Task.
create unique index if not exists idx_task_review_attempts_one_active
on public.task_review_attempts(task_id)
where status in (
  'generating',
  'ready'
);


drop trigger if exists set_task_review_attempts_updated_at
on public.task_review_attempts;

create trigger set_task_review_attempts_updated_at
before update on public.task_review_attempts
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. PRIVATE ANSWER KEYS
--
-- This table MUST NOT be readable by authenticated clients.
-- Only the backend service_role may access it.
-- ============================================================

create table if not exists public.task_review_answer_keys (
  attempt_id uuid primary key
    references public.task_review_attempts(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  answer_key jsonb
    not null
    check (
      jsonb_typeof(answer_key) = 'object'
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


drop trigger if exists set_task_review_answer_keys_updated_at
on public.task_review_answer_keys;

create trigger set_task_review_answer_keys_updated_at
before update on public.task_review_answer_keys
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.task_review_attempts
enable row level security;

alter table public.task_review_answer_keys
enable row level security;


drop policy if exists "Users can view their own task review attempts"
on public.task_review_attempts;

create policy "Users can view their own task review attempts"
on public.task_review_attempts
for select
to authenticated
using (
  user_id = (select auth.uid())
);


-- Explicit deny policy.
-- Even if somebody accidentally adds a table grant later,
-- RLS continues denying browser/client access.
drop policy if exists "Clients cannot access task review answer keys"
on public.task_review_answer_keys;

create policy "Clients cannot access task review answer keys"
on public.task_review_answer_keys
for all
to authenticated
using (false)
with check (false);


-- ============================================================
-- 5. PRIVILEGES
-- ============================================================

revoke all
on public.task_review_attempts
from anon, authenticated;

grant select
on public.task_review_attempts
to authenticated;

grant select, insert, update, delete
on public.task_review_attempts
to service_role;


revoke all
on public.task_review_answer_keys
from anon, authenticated;

grant select, insert, update, delete
on public.task_review_answer_keys
to service_role;


-- ============================================================
-- 6. REVIEW-SPECIFIC VECTOR SEARCH
--
-- Important:
-- Filter by embedding_model.
--
-- A query vector produced by embedding model A must never be
-- compared with vectors produced by embedding model B.
-- ============================================================

create or replace function public.match_task_review_document_chunks(
  p_query_embedding extensions.vector(768),
  p_match_count integer default 8,
  p_document_ids uuid[] default null,
  p_user_id uuid default null,
  p_embedding_model text default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  file_name text,
  chunk_index integer,
  content text,
  similarity double precision,
  embedding_model text
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    chunk.id as chunk_id,
    chunk.document_id,
    doc.file_name,
    chunk.chunk_index,
    chunk.content,
    (
      1
      - (
        chunk.embedding
        OPERATOR(extensions.<=>)
        p_query_embedding
      )
    ) as similarity,
    chunk.embedding_model
  from public.document_chunks chunk
  join public.learning_documents doc
    on doc.id = chunk.document_id
  where p_user_id is not null
    and p_embedding_model is not null
    and chunk.owner_id = p_user_id
    and doc.owner_id = p_user_id
    and chunk.embedding is not null
    and chunk.status = 'embedded'
    and chunk.embedding_model = p_embedding_model
    and (
      p_document_ids is null
      or chunk.document_id = any(p_document_ids)
    )
  order by
    chunk.embedding
    OPERATOR(extensions.<=>)
    p_query_embedding
  limit greatest(
    1,
    least(p_match_count, 12)
  );
$$;


revoke all
on function public.match_task_review_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid,
  text
)
from public, anon, authenticated;

grant execute
on function public.match_task_review_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid,
  text
)
to service_role;


-- ============================================================
-- 7. ATOMIC REVIEW FINALIZATION
--
-- Generation itself happens outside Postgres.
--
-- Once generation succeeds, this function atomically:
--
--   1. saves the secret answer key
--   2. marks the attempt ready
--   3. moves the Task into in_review
--
-- If ANY step fails, the entire transaction rolls back.
-- ============================================================

create or replace function public.finalize_task_review_generation(
  p_attempt_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_expected_status public.task_status,
  p_expected_updated_at timestamptz,
  p_assessment_payload jsonb,
  p_answer_key jsonb,
  p_source_snapshot jsonb,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_latency_ms integer
)
returns table (
  attempt_id uuid,
  task_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_affected integer;
  v_task_updated_at timestamptz;
begin
  if p_expected_status not in (
    'in_progress'::public.task_status,
    'overdue'::public.task_status
  ) then
    raise exception
      'Task must be in progress before review.';
  end if;


  -- Parent/root Task only.
  if not exists (
    select 1
    from public.tasks task
    where task.id = p_task_id
      and task.user_id = p_user_id
      and task.parent_task_id is null
  ) then
    raise exception
      'Review requires an owned root task.';
  end if;


  -- Completed or cancelled subtasks are resolved.
  -- Any active subtask blocks review.
  if exists (
    select 1
    from public.tasks child
    where child.parent_task_id = p_task_id
      and child.user_id = p_user_id
      and child.status not in (
        'completed'::public.task_status,
        'cancelled'::public.task_status
      )
  ) then
    raise exception
      'All active subtasks must be completed or cancelled before review.';
  end if;


  -- Save the answer key in the private table.
  insert into public.task_review_answer_keys (
    attempt_id,
    user_id,
    answer_key
  )
  select
    attempt.id,
    attempt.user_id,
    p_answer_key
  from public.task_review_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.status = 'generating';

  get diagnostics v_affected = row_count;

  if v_affected <> 1 then
    raise exception
      'Review attempt is no longer eligible for finalization.';
  end if;


  update public.task_review_attempts
  set
    status = 'ready',
    assessment_payload = p_assessment_payload,
    source_snapshot = p_source_snapshot,
    provider = p_provider,
    model = p_model,
    prompt_version = p_prompt_version,
    latency_ms = p_latency_ms,
    generation_error = null,
    ready_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and task_id = p_task_id
    and status = 'generating';

  get diagnostics v_affected = row_count;

  if v_affected <> 1 then
    raise exception
      'Failed to finalize review attempt.';
  end if;


  -- Optimistic concurrency check against the original Task.
  --
  -- If the user edited/reopened/changed the Task while AI was
  -- generating, do not silently review stale Task data.
  update public.tasks
  set
    status = 'in_review',
    completed_at = null
  where id = p_task_id
    and user_id = p_user_id
    and parent_task_id is null
    and status = p_expected_status
    and updated_at = p_expected_updated_at
  returning updated_at
  into v_task_updated_at;


  if v_task_updated_at is null then
    raise exception
      'Task changed while review content was being generated.';
  end if;


  return query
  select
    p_attempt_id,
    v_task_updated_at;
end;
$$;


revoke all
on function public.finalize_task_review_generation(
  uuid,
  uuid,
  uuid,
  public.task_status,
  timestamptz,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  integer
)
from public, anon, authenticated;

grant execute
on function public.finalize_task_review_generation(
  uuid,
  uuid,
  uuid,
  public.task_status,
  timestamptz,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  integer
)
to service_role;


-- ============================================================
-- 8. MANAGED TASK STATUS GUARD
--
-- Browser/authenticated mutations may not manually:
--
--   - enter In Review
--   - mutate a Task while it is In Review
--   - manually create Overdue
--
-- AI backend uses service_role and is allowed to manage review.
-- ============================================================

create or replace function public.guard_managed_task_statuses()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then

    if old.status = 'in_review'::public.task_status then
      raise exception
        'Tasks in review are managed by the review workflow.';
    end if;

    if new.status = 'in_review'::public.task_status then
      raise exception
        'Tasks can only enter review through the review workflow.';
    end if;

    if (
      new.status = 'overdue'::public.task_status
      and old.status is distinct from 'overdue'::public.task_status
    ) then
      raise exception
        'Overdue is derived from the task deadline.';
    end if;

  end if;

  return new;
end;
$$;


drop trigger if exists trg_guard_managed_task_statuses
on public.tasks;

create trigger trg_guard_managed_task_statuses
before update on public.tasks
for each row
execute function public.guard_managed_task_statuses();


commit;