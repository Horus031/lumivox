begin;

alter table public.rag_chat_turns add constraint rag_chat_turns_id_user_key unique (id, user_id);
alter table public.rag_chat_preparations add constraint rag_chat_preparations_id_user_key unique (id, user_id);

create table public.rag_provider_attempts (
  id uuid primary key,
  user_id uuid not null,
  turn_id uuid,
  preparation_id uuid,
  attempt_index integer not null,
  attempt_limit integer not null check (attempt_limit between 1 and 16),
  stage text not null,
  provider text not null,
  model_name text not null check (model_name ~ '^[A-Za-z0-9][A-Za-z0-9_./:-]{0,119}$'),
  status text not null default 'dispatch_pending',
  estimated_prompt_tokens integer check (estimated_prompt_tokens between 0 and 1000000),
  reserved_completion_tokens integer check (reserved_completion_tokens between 0 and 1000000),
  prompt_tokens integer check (prompt_tokens between 0 and 1000000),
  completion_tokens integer check (completion_tokens between 0 and 1000000),
  total_tokens integer check (total_tokens between 0 and 2000000),
  latency_ms integer check (latency_ms between 0 and 3600000),
  error_code text check (error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  foreign key (turn_id, user_id) references public.rag_chat_turns (id, user_id) on delete cascade,
  foreign key (preparation_id, user_id) references public.rag_chat_preparations (id, user_id) on delete cascade,
  check (attempt_index between 1 and attempt_limit),
  check (num_nonnulls(turn_id, preparation_id) = 1),
  check (
    (preparation_id is not null and stage = 'handoff' and provider = 'groq')
    or (turn_id is not null and (
      (stage in ('answer', 'rolling_summary') and provider = 'groq')
      or (stage = 'embedding' and provider = 'google')
    ))
  ),
  check (
    (status = 'dispatch_pending' and num_nonnulls(
      finished_at, prompt_tokens, completion_tokens, total_tokens, latency_ms, error_code
    ) = 0)
    or (status in ('success', 'failed', 'unknown') and finished_at is not null and latency_ms is not null)
  )
);

create unique index rag_provider_attempt_turn_index_uidx
  on public.rag_provider_attempts (turn_id, attempt_index) where turn_id is not null;
create unique index rag_provider_attempt_preparation_index_uidx
  on public.rag_provider_attempts (preparation_id, attempt_index) where preparation_id is not null;
create index rag_provider_attempt_created_at_idx on public.rag_provider_attempts (created_at);

alter table public.rag_provider_attempts enable row level security;
revoke all on table public.rag_provider_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.rag_provider_attempts to service_role;

create function public.rag_v2_begin_provider_attempt(
  p_attempt_id uuid, p_user_id uuid, p_turn_id uuid, p_preparation_id uuid,
  p_lease_token uuid, p_expected_revision jsonb, p_max_attempts integer, p_attempt_index integer,
  p_stage text, p_provider text, p_model_name text, p_estimated_prompt_tokens integer,
  p_reserved_completion_tokens integer
) returns text language plpgsql security invoker set search_path = ''
as $$
declare
  v_session_id uuid;
  v_existing public.rag_provider_attempts%rowtype;
  v_count integer;
  v_limit integer;
begin
  if p_attempt_id is null or p_user_id is null or p_lease_token is null
    or num_nonnulls(p_turn_id, p_preparation_id) <> 1
    or not coalesce(p_attempt_index between 1 and p_max_attempts and p_max_attempts between 1 and 16, false)
  then raise exception 'RAG_INVALID_REQUEST'; end if;

  -- Serialize with operation recovery and quarantine in session-before-operation order.
  if p_turn_id is not null then
    select session_id into v_session_id from public.rag_chat_turns where id = p_turn_id and user_id = p_user_id;
  else
    select source_session_id into v_session_id from public.rag_chat_preparations
      where id = p_preparation_id and user_id = p_user_id;
  end if;
  if v_session_id is null then raise exception 'RAG_INVALID_LEASE'; end if;
  perform 1 from public.rag_chat_sessions where id = v_session_id and user_id = p_user_id for update;

  if p_turn_id is not null then
    perform 1 from public.rag_chat_turns where id = p_turn_id and user_id = p_user_id for update;
    perform public.rag_v2_assert_turn_authorized(p_user_id, v_session_id, p_turn_id, p_lease_token);
    select count(*), min(attempt_limit) into v_count, v_limit from public.rag_provider_attempts
      where turn_id = p_turn_id;
  else
    perform 1 from public.rag_chat_preparations where id = p_preparation_id and user_id = p_user_id for update;
    perform public.rag_v2_assert_preparation_authorized(p_user_id, p_preparation_id, p_lease_token, p_expected_revision);
    select count(*), min(attempt_limit) into v_count, v_limit from public.rag_provider_attempts
      where preparation_id = p_preparation_id;
  end if;

  select * into v_existing from public.rag_provider_attempts where id = p_attempt_id;
  if found then
    if row(v_existing.user_id, v_existing.turn_id, v_existing.preparation_id, v_existing.attempt_index,
      v_existing.attempt_limit, v_existing.stage, v_existing.provider, v_existing.model_name,
      v_existing.estimated_prompt_tokens, v_existing.reserved_completion_tokens)
      is distinct from row(p_user_id, p_turn_id, p_preparation_id, p_attempt_index,
        p_max_attempts, p_stage, p_provider, p_model_name, p_estimated_prompt_tokens, p_reserved_completion_tokens)
    then raise exception 'RAG_INVALID_REQUEST'; end if;
    return 'existing';
  end if;
  if p_attempt_index <> v_count + 1 or (v_limit is not null and p_max_attempts <> v_limit)
  then raise exception 'RAG_INVALID_REQUEST'; end if;

  insert into public.rag_provider_attempts (
    id, user_id, turn_id, preparation_id, attempt_index, attempt_limit, stage, provider, model_name,
    estimated_prompt_tokens, reserved_completion_tokens
  ) values (
    p_attempt_id, p_user_id, p_turn_id, p_preparation_id, p_attempt_index, p_max_attempts, p_stage,
    p_provider, p_model_name, p_estimated_prompt_tokens, p_reserved_completion_tokens
  );
  return 'created';
exception when check_violation or unique_violation or foreign_key_violation or not_null_violation then
  raise exception 'RAG_INVALID_REQUEST';
end;
$$;

create function public.rag_v2_finish_provider_attempt(
  p_attempt_id uuid, p_user_id uuid, p_status text, p_prompt_tokens integer,
  p_completion_tokens integer, p_total_tokens integer, p_latency_ms integer, p_error_code text
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_attempt public.rag_provider_attempts%rowtype;
begin
  if not coalesce(p_status in ('success', 'failed', 'unknown'), false) or p_latency_ms is null
  then raise exception 'RAG_INVALID_REQUEST'; end if;
  select * into v_attempt from public.rag_provider_attempts
    where id = p_attempt_id and user_id = p_user_id for update;
  if not found then raise exception 'RAG_INVALID_REQUEST'; end if;

  if v_attempt.status <> 'dispatch_pending' then
    if row(v_attempt.status, v_attempt.prompt_tokens, v_attempt.completion_tokens, v_attempt.total_tokens,
        v_attempt.latency_ms, v_attempt.error_code)
      is distinct from row(p_status, p_prompt_tokens, p_completion_tokens, p_total_tokens, p_latency_ms, p_error_code)
    then raise exception 'RAG_INVALID_REQUEST'; end if;
    return true;
  end if;

  update public.rag_provider_attempts set status = p_status, prompt_tokens = p_prompt_tokens,
    completion_tokens = p_completion_tokens, total_tokens = p_total_tokens, latency_ms = p_latency_ms,
    error_code = p_error_code, finished_at = clock_timestamp()
  where id = p_attempt_id and user_id = p_user_id;
  return true;
exception when check_violation or not_null_violation then
  raise exception 'RAG_INVALID_REQUEST';
end;
$$;

revoke all on function
  public.rag_v2_begin_provider_attempt(uuid, uuid, uuid, uuid, uuid, jsonb, integer, integer, text, text, text, integer, integer),
  public.rag_v2_finish_provider_attempt(uuid, uuid, text, integer, integer, integer, integer, text)
from public, anon, authenticated;
grant execute on function
  public.rag_v2_begin_provider_attempt(uuid, uuid, uuid, uuid, uuid, jsonb, integer, integer, text, text, text, integer, integer),
  public.rag_v2_finish_provider_attempt(uuid, uuid, text, integer, integer, integer, integer, text)
to service_role;

commit;
