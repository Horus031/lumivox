begin;

alter table public.rag_chat_turns
  add column context_policy text check (context_policy in ('legacy', 'adaptive_v1')),
  add column history_candidate_turns integer check (history_candidate_turns between 0 and 24),
  add column history_tokens_used integer check (history_tokens_used >= 0),
  add column summary_covered_turn_count integer check (summary_covered_turn_count between 0 and 24),
  add column omitted_history_turns integer check (omitted_history_turns between 0 and 24),
  add column truncated_history_turns integer check (truncated_history_turns between 0 and 24),
  add column sources_truncated boolean;

create or replace function public.rag_v2_get_context(
  p_user_id uuid,
  p_session_id uuid,
  p_turn_id uuid,
  p_lease_token uuid,
  p_recent_turns integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_context jsonb;
begin
  if p_recent_turns is null
    or p_recent_turns not between 1 and 24
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  with authorized_session as (
    select
      s.id,
      s.user_id,
      s.focus_session_id,
      s.selected_document_ids,
      s.context_mode,
      s.prompt_variant,
      s.completed_turn_count,
      t.turn_index as current_turn_index
    from public.rag_chat_sessions s
    join public.rag_chat_turns t
      on t.session_id = s.id
      and t.user_id = s.user_id
    where s.id = p_session_id
      and s.user_id = p_user_id
      and s.conversation_version = 2
      and s.status = 'active'
      and t.id = p_turn_id
      and t.status = 'processing'
      and t.lease_token = p_lease_token
      and t.lease_expires_at > clock_timestamp()
      and (
        s.focus_session_id is null
        or exists (
          select 1
          from public.focus_sessions f
          where f.id = s.focus_session_id
            and f.user_id = p_user_id
        )
      )
      and not exists (
        select 1
        from unnest(
          s.selected_document_ids
        ) as doc(id)
        where public.can_access_learning_document(
          doc.id,
          p_user_id
        ) is not true
      )
  ),
  latest_summary as (
    select sm.*
    from authorized_session s
    join public.rag_chat_summaries sm
      on sm.session_id = s.id
      and sm.user_id = s.user_id
    where sm.schema_version = 1
      and sm.covered_turn_count is not null
      and sm.covered_turn_index < s.current_turn_index
    order by sm.version desc
    limit 1
  ),
  authorized_handoff as (
    select h.id, h.source_session_id, h.target_session_id, h.schema_version,
      h.source_completed_turn_count, h.source_last_completed_turn_index,
      h.source_summary_version, h.summary, h.generation_method, h.token_count
    from authorized_session s
    join public.rag_chat_handoffs h on h.target_session_id = s.id and h.user_id = s.user_id
    where h.selected_document_ids is not distinct from s.selected_document_ids
      and not exists (select 1 from unnest(h.selected_document_ids) d(id)
        where public.can_access_learning_document(d.id, s.user_id) is not true)
  ),
  recent as (
    select
      t.id,
      t.turn_index,
      um.content as question,
      am.content as answer
    from authorized_session s
    join public.rag_chat_turns t
      on t.session_id = s.id
      and t.user_id = s.user_id
    join public.rag_chat_messages um
      on um.turn_id = t.id
      and um.session_id = s.id
      and um.user_id = s.user_id
      and um.role = 'user'
    join public.rag_chat_messages am
      on am.turn_id = t.id
      and am.session_id = s.id
      and am.user_id = s.user_id
      and am.role = 'assistant'
    where t.status = 'completed'
      and t.turn_index < s.current_turn_index
    order by t.turn_index desc
    limit p_recent_turns
  )
  select jsonb_build_object(
    'session_id', s.id,
    'completed_turn_count',
      s.completed_turn_count,
    'current_turn_index',
      s.current_turn_index,
    'recent_turns',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'turn_index', r.turn_index,
              'question', r.question,
              'answer', r.answer
            )
            order by r.turn_index asc
          )
          from recent r
        ),
        '[]'::jsonb
      ),
    'handoff', (select to_jsonb(h) from authorized_handoff h),
    'summary', (
      select jsonb_build_object(
        'id', sm.id,
        'version', sm.version,
        'covered_turn_index', sm.covered_turn_index,
        'covered_turn_count', sm.covered_turn_count,
        'summary', sm.summary,
        'schema_version', sm.schema_version,
        'generation_method', sm.generation_method,
        'model_name', sm.model_name,
        'token_count', sm.token_count
      )
      from latest_summary sm
    )
  )
  into v_context
  from authorized_session s;

  if v_context is null then
    raise exception 'RAG_CONTEXT_UNAVAILABLE';
  end if;

  return v_context;
end;
$$;

create or replace function public.rag_v2_complete_turn(
  p_user_id uuid,
  p_turn_id uuid,
  p_lease_token uuid,
  p_answer text,
  p_sources jsonb,
  p_provider text,
  p_model_name text,
  p_latency_ms integer,
  p_usage jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.rag_chat_sessions%rowtype;
  v_turn public.rag_chat_turns%rowtype;
  v_document_ids uuid[];
  v_chunk_ids uuid[];
  v_response jsonb;
  v_question text;
  v_locale text;
  v_handoff_used boolean;
  v_provider_usage jsonb;
  v_context jsonb := p_usage->'context';
  v_metric text;
  v_handoff_tokens integer;
  v_handoff_id uuid;
begin
  select *
  into v_session
  from public.rag_chat_sessions
  where user_id = p_user_id
    and id = (
      select session_id
      from public.rag_chat_turns
      where id = p_turn_id
        and user_id = p_user_id
    )
  for update;

  if not found then
    raise exception 'RAG_SESSION_NOT_FOUND';
  end if;

  select *
  into v_turn
  from public.rag_chat_turns
  where id = p_turn_id
    and user_id = p_user_id
    and session_id = v_session.id
  for update;

  if not found
    or v_turn.lease_token
       is distinct from p_lease_token
  then
    raise exception 'RAG_INVALID_LEASE';
  end if;

  perform public.rag_v2_validate_scope(
    p_user_id,
    v_session.focus_session_id,
    v_session.selected_document_ids
  );

  if v_turn.status = 'completed' then
    return v_turn.response_payload;
  end if;

  if v_turn.status <> 'processing'
    or v_session.status <> 'active'
    or v_turn.lease_expires_at <= clock_timestamp()
  then
    raise exception 'RAG_INVALID_LEASE';
  end if;

  if coalesce(length(btrim(p_answer)), 0) = 0
    or jsonb_typeof(p_sources) is distinct from 'array'
    or p_latency_ms is null
    or p_latency_ms < 0
  then
    raise exception 'RAG_INVALID_RESPONSE';
  end if;

  v_provider_usage := public.rag_v2_validate_provider_attempts(p_usage->'provider_attempts');
  v_handoff_used := coalesce((p_usage->'context'->>'handoff_used')::boolean, false);
  v_handoff_tokens := coalesce((p_usage->'context'->>'handoff_tokens_used')::integer, 0);
  v_handoff_id := (p_usage->'context'->>'handoff_id')::uuid;
  if v_handoff_tokens not between 0 and 500
    or (v_handoff_used and (v_handoff_tokens = 0 or not exists (
      select from public.rag_chat_handoffs h
      where h.id = v_handoff_id and h.target_session_id = v_session.id and h.user_id = p_user_id
        and h.selected_document_ids is not distinct from v_session.selected_document_ids
    )))
    or (not v_handoff_used and (v_handoff_tokens <> 0 or v_handoff_id is not null))
  then raise exception 'RAG_INVALID_RESPONSE'; end if;

  if v_context ? 'context_policy' and v_context->>'context_policy' is distinct from 'adaptive_v1'
    and v_context->>'context_policy' is distinct from 'legacy'
  then raise exception 'RAG_INVALID_RESPONSE'; end if;

  if v_context->>'context_policy' = 'adaptive_v1' then
    foreach v_metric in array array[
      'history_candidate_turns', 'history_tokens_used', 'history_turns_used', 'omitted_history_turns',
      'truncated_history_turns', 'summary_covered_turn_count', 'summary_tokens_used',
      'handoff_tokens_used', 'estimated_prompt_tokens'
    ] loop
      if jsonb_typeof(v_context->v_metric) is distinct from 'number'
        or v_context->>v_metric !~ '^[0-9]{1,5}$'
      then raise exception 'RAG_INVALID_RESPONSE'; end if;
    end loop;

    if (v_context->>'history_candidate_turns')::integer > v_session.completed_turn_count
      or (v_context->>'history_turns_used')::integer > (v_context->>'history_candidate_turns')::integer
      or (v_context->>'truncated_history_turns')::integer > (v_context->>'history_turns_used')::integer
      or (v_context->>'history_tokens_used')::integer > 750
      or ((v_context->>'history_tokens_used')::integer = 0) <> ((v_context->>'history_turns_used')::integer = 0)
      or (v_context->>'omitted_history_turns')::integer + (v_context->>'history_turns_used')::integer
         + (v_context->>'summary_covered_turn_count')::integer <> v_session.completed_turn_count
      or (v_context->>'summary_tokens_used')::integer + v_handoff_tokens > 500
      or (v_context->>'estimated_prompt_tokens')::integer > 4000
      or jsonb_typeof(v_context->'sources_truncated') is distinct from 'boolean'
    then raise exception 'RAG_INVALID_RESPONSE'; end if;

    if (v_context->>'summary_covered_turn_count')::integer > 0 then
      if (v_context->>'summary_tokens_used')::integer = 0 or not exists (
        select 1 from public.rag_chat_summaries s
        where s.session_id = v_session.id and s.user_id = p_user_id and s.schema_version = 1
          and s.version::text = v_context->>'summary_version_used'
          and s.covered_turn_index::text = v_context->>'summary_covered_turn_index'
          and s.covered_turn_index < v_turn.turn_index
          and s.covered_turn_count = (v_context->>'summary_covered_turn_count')::integer
      ) then raise exception 'RAG_INVALID_RESPONSE'; end if;
    elsif (v_context->>'summary_tokens_used')::integer <> 0
      or v_context->>'summary_version_used' is not null or v_context->>'summary_covered_turn_index' is not null
    then raise exception 'RAG_INVALID_RESPONSE'; end if;
  end if;

  v_document_ids := v_session.selected_document_ids;
  v_question := v_turn.request_payload->>'question';
  v_locale := v_turn.request_payload->>'preferred_locale';

  -- Only sources belonging to the selected document scope.
  if exists (
    select 1
    from jsonb_array_elements(p_sources) as src(value)
    where not exists (
      select 1
      from public.document_chunks c
      where c.id = (src.value->>'chunk_id')::uuid
        and c.document_id =
          (src.value->>'document_id')::uuid
        and c.document_id = any(v_document_ids)
    )
  ) then
    raise exception 'RAG_INVALID_RESPONSE';
  end if;

  select coalesce(
    array_agg((value->>'chunk_id')::uuid),
    '{}'::uuid[]
  )
  into v_chunk_ids
  from jsonb_array_elements(p_sources);

  insert into public.rag_chat_messages (
    turn_id,
    session_id,
    user_id,
    role,
    content,
    prompt_variant,
    context_mode,
    selected_document_ids,
    top_k,
    content_locale,
    preferred_locale
  )
  values (
    v_turn.id,
    v_session.id,
    p_user_id,
    'user',
    v_question,
    v_session.prompt_variant,
    v_session.context_mode,
    v_document_ids,
    case
      when v_session.context_mode::text = 'document_rag'
        then v_session.top_k
      else null
    end,
    'auto',
    v_locale
  );

  insert into public.rag_chat_messages (
    turn_id,
    session_id,
    user_id,
    role,
    content,
    prompt_variant,
    context_mode,
    selected_document_ids,
    top_k,
    retrieved_chunk_ids,
    retrieved_context,
    model_name,
    latency_ms,
    content_locale,
    preferred_locale
  )
  values (
    v_turn.id,
    v_session.id,
    p_user_id,
    'assistant',
    p_answer,
    v_session.prompt_variant,
    v_session.context_mode,
    v_document_ids,
    case
      when v_session.context_mode::text = 'document_rag'
        then v_session.top_k
      else null
    end,
    v_chunk_ids,
    p_sources,
    p_model_name,
    p_latency_ms,
    v_locale,
    v_locale
  );

  v_response := jsonb_build_object(
    'session_id', v_session.id,
    'turn_id', v_turn.id,
    'turn_index', v_turn.turn_index,
    'answer', p_answer,
    'sources', p_sources,
    'prompt_variant', v_session.prompt_variant,
    'context_mode', v_session.context_mode,
    'selected_document_ids', v_document_ids,
    'top_k', v_session.top_k,
    'latency_ms', p_latency_ms,
    'preferred_locale', v_locale,
    'context', (p_usage->'context') - 'handoff_id',
    'completed_turn_count',
      v_session.completed_turn_count + 1
  );

  update public.rag_chat_turns
  set status = 'completed',
      response_payload = v_response,
      provider_attempt_metadata = nullif(p_usage->'provider_attempts','null'::jsonb),
      provider_calls_total = (v_provider_usage->>'calls')::integer,
      known_provider_tokens = (v_provider_usage->>'known')::integer,
      unknown_usage_attempts = (v_provider_usage->>'unknown')::integer,
      provider = p_provider,
      model_name = p_model_name,
      latency_ms = p_latency_ms,
    estimated_prompt_tokens =
      (p_usage->'context'->>'estimated_prompt_tokens')
        ::integer,

    history_turns_used =
      (p_usage->'context'->>'history_turns_used')
        ::integer,

    retrieved_chunks_used =
      (p_usage->'context'->>'retrieved_chunks_used')
        ::integer,

    generation_attempts =
      (p_usage->'context'->>'generation_attempts')
        ::integer,

    retrieval_strategy =
      p_usage->'context'->>'retrieval_strategy',

    handoff_used = v_handoff_used,
    handoff_tokens_used = v_handoff_tokens,
    handoff_id_used = v_handoff_id,
    summary_version_used = (p_usage->'context'->>'summary_version_used')::integer,
    summary_tokens_used = (p_usage->'context'->>'summary_tokens_used')::integer,
    summary_covered_turn_index = (p_usage->'context'->>'summary_covered_turn_index')::integer,
    summary_generation_method = p_usage->'context'->>'summary_generation_method',
    context_policy = v_context->>'context_policy',
    history_candidate_turns = case when v_context->>'context_policy' = 'adaptive_v1' then (v_context->>'history_candidate_turns')::integer end,
    history_tokens_used = case when v_context->>'context_policy' = 'adaptive_v1' then (v_context->>'history_tokens_used')::integer end,
    summary_covered_turn_count = case when v_context->>'context_policy' = 'adaptive_v1' then (v_context->>'summary_covered_turn_count')::integer end,
    omitted_history_turns = case when v_context->>'context_policy' = 'adaptive_v1' then (v_context->>'omitted_history_turns')::integer end,
    truncated_history_turns = case when v_context->>'context_policy' = 'adaptive_v1' then (v_context->>'truncated_history_turns')::integer end,
    sources_truncated = case when v_context->>'context_policy' = 'adaptive_v1' then (v_context->>'sources_truncated')::boolean end,
    context_truncated =
      coalesce(
        (p_usage->'context'->>'context_truncated')
          ::boolean,
        false
      ),
      prompt_tokens =
        (p_usage->>'prompt_tokens')::integer,
      completion_tokens =
        (p_usage->>'completion_tokens')::integer,
      total_tokens =
        (p_usage->>'total_tokens')::integer,
      completed_at = clock_timestamp()
  where id = v_turn.id;

  update public.rag_chat_sessions
  set completed_turn_count =
        completed_turn_count + 1,
      title = case when completed_turn_count = 0
        and title in ('New conversation', 'Continued study conversation')
        then left(regexp_replace(btrim(v_question), '[[:space:]]+', ' ', 'g'), 80)
        else title
      end,
      updated_at = clock_timestamp()
  where id = v_session.id;

  return v_response;
end;
$$;

revoke all on function public.rag_v2_get_context(uuid, uuid, uuid, uuid, integer),
  public.rag_v2_complete_turn(uuid, uuid, uuid, text, jsonb, text, text, integer, jsonb)
from public, anon, authenticated;

grant execute on function public.rag_v2_get_context(uuid, uuid, uuid, uuid, integer),
  public.rag_v2_complete_turn(uuid, uuid, uuid, text, jsonb, text, text, integer, jsonb)
to service_role;

commit;
