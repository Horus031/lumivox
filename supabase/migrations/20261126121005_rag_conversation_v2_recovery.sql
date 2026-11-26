begin;

create function public.rag_v2_get_operation_status(
  p_user_id uuid,
  p_focus_session_id uuid,
  p_client_request_id uuid,
  p_operation text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_turn public.rag_chat_turns%rowtype;
  v_session public.rag_chat_sessions%rowtype;
  v_transition public.rag_chat_transitions%rowtype;
  v_status text;
begin
  if p_user_id is null
    or p_focus_session_id is null
    or p_client_request_id is null
    or p_operation is null
    or p_operation not in ('ask', 'new_chat')
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  -- Validate the Focus Session without requiring
  -- access to the previous conversation's documents.
  perform public.rag_v2_validate_scope(
    p_user_id,
    p_focus_session_id,
    '{}'::uuid[]
  );

  if p_operation = 'ask' then

    select t.*
    into v_turn
    from public.rag_chat_turns t
    join public.rag_chat_sessions s
      on s.id = t.session_id
      and s.user_id = t.user_id
    where t.user_id = p_user_id
      and t.client_request_id = p_client_request_id
      and s.focus_session_id = p_focus_session_id
      and s.conversation_version = 2;

    if not found then
      return jsonb_build_object(
        'operation', 'ask',
        'status', 'unknown'
      );
    end if;

    select *
    into v_session
    from public.rag_chat_sessions
    where id = v_turn.session_id
      and user_id = p_user_id;

    if exists (
      select 1
      from unnest(
        v_session.selected_document_ids
      ) d(id)
      where public.can_access_learning_document(
        d.id,
        p_user_id
      ) is not true
    ) then
      return jsonb_build_object(
        'operation', 'ask',
        'status', 'access_unavailable'
      );
    end if;

    v_status := case
      when v_turn.status = 'processing'
        and v_turn.lease_expires_at
          <= statement_timestamp()
        then 'expired'
      else v_turn.status
    end;

    return jsonb_build_object(
      'operation', 'ask',
      'status', v_status,
      'session_id', v_session.id,
      'turn_id', v_turn.id,
      'turn_index', v_turn.turn_index,
      'session_status', v_session.status,
      'completed_turn_count',
        v_session.completed_turn_count,
      'lease_expires_at',
        case
          when v_status = 'processing'
            then v_turn.lease_expires_at
          else null
        end
    );

  end if;

  select tr.*
  into v_transition
  from public.rag_chat_transitions tr
  join public.rag_chat_sessions source
    on source.id = tr.source_session_id
    and source.user_id = tr.user_id
  join public.rag_chat_sessions target
    on target.id = tr.target_session_id
    and target.user_id = tr.user_id
  where tr.user_id = p_user_id
    and tr.client_request_id = p_client_request_id
    and source.focus_session_id = p_focus_session_id
    and target.focus_session_id = p_focus_session_id
    and source.conversation_version = 2
    and target.conversation_version = 2;

  if not found then
    return jsonb_build_object(
      'operation', 'new_chat',
      'status', 'unknown'
    );
  end if;

  if exists (
    select 1 from public.rag_chat_sessions s
    cross join lateral unnest(s.selected_document_ids) d(id)
    where s.id = v_transition.target_session_id and s.user_id = p_user_id
      and public.can_access_learning_document(d.id, p_user_id) is not true
  ) then
    return jsonb_build_object('operation', 'new_chat', 'status', 'access_unavailable');
  end if;

  -- Transition status contains metadata only.
  -- Canonical restore performs document authorization
  -- before returning any conversation content.

  return jsonb_build_object(
    'operation', 'new_chat',
    'status', 'completed',
    'source_session_id',
      v_transition.source_session_id,
    'target_session_id',
      v_transition.target_session_id
  );
end;
$$;

revoke all on function
  public.rag_v2_get_operation_status(
    uuid, uuid, uuid, text
  )
from public, anon, authenticated;

grant execute on function
  public.rag_v2_get_operation_status(
    uuid, uuid, uuid, text
  )
to service_role;

create function public.rag_v2_recover_expired_turn(
  p_user_id uuid,
  p_focus_session_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.rag_chat_sessions%rowtype;
  v_turn public.rag_chat_turns%rowtype;
begin
  if p_user_id is null
    or p_focus_session_id is null
    or p_client_request_id is null
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  perform public.rag_v2_validate_scope(
    p_user_id,
    p_focus_session_id,
    '{}'::uuid[]
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'rag-v2:' || p_user_id::text,
      0
    )
  );

  select s.*
  into v_session
  from public.rag_chat_sessions s
  join public.rag_chat_turns t
    on t.session_id = s.id
    and t.user_id = s.user_id
  where t.user_id = p_user_id
    and t.client_request_id = p_client_request_id
    and s.focus_session_id = p_focus_session_id
    and s.conversation_version = 2
  for update of s;

  if not found then
    return jsonb_build_object(
      'operation', 'ask',
      'status', 'unknown'
    );
  end if;

  select *
  into v_turn
  from public.rag_chat_turns
  where session_id = v_session.id
    and user_id = p_user_id
    and client_request_id = p_client_request_id
  for update;

  if not found then
    return jsonb_build_object(
      'operation', 'ask',
      'status', 'unknown'
    );
  end if;

  if v_turn.status = 'processing'
    and v_turn.lease_expires_at
      <= clock_timestamp()
  then
    update public.rag_chat_turns
    set
      status = 'failed',
      error_code = 'lease_expired',
      completed_at = clock_timestamp()
    where id = v_turn.id
      and user_id = p_user_id
      and status = 'processing';
  end if;

  return public.rag_v2_get_operation_status(
    p_user_id,
    p_focus_session_id,
    p_client_request_id,
    'ask'
  );
end;
$$;

revoke all on function
  public.rag_v2_recover_expired_turn(
    uuid, uuid, uuid
  )
from public, anon, authenticated;

grant execute on function
  public.rag_v2_recover_expired_turn(
    uuid, uuid, uuid
  )
to service_role;

create or replace function public.rag_v2_reserve_turn(
  p_user_id uuid,
  p_session_id uuid,
  p_focus_session_id uuid,
  p_client_request_id uuid,
  p_request jsonb
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
  v_context_mode public.rag_context_mode;
  v_turn_index integer;
begin
  if p_client_request_id is null
    or jsonb_typeof(p_request) is distinct from 'object'
    or coalesce(length(btrim(p_request->>'question')), 0)
       not between 1 and 2000
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  select coalesce(
    array_agg(distinct value::uuid order by value::uuid),
    '{}'::uuid[]
  )
  into v_document_ids
  from jsonb_array_elements_text(
    coalesce(
      p_request->'selected_document_ids',
      '[]'::jsonb
    )
  );

  perform public.rag_v2_validate_scope(
    p_user_id,
    p_focus_session_id,
    v_document_ids
  );

  -- Serialize reservations from the same user.
  -- The lock lasts only for this RPC transaction.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'rag-v2:' || p_user_id::text,
      0
    )
  );

  select *
  into v_turn
  from public.rag_chat_turns
  where user_id = p_user_id
    and client_request_id = p_client_request_id;

  if found then
    if v_turn.request_payload is distinct from p_request
      or (
        p_session_id is not null
        and v_turn.session_id <> p_session_id
      )
    then
      raise exception 'RAG_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_session
    from public.rag_chat_sessions
    where id = v_turn.session_id
      and user_id = p_user_id
    for update;

    if not found
      or v_session.focus_session_id
         is distinct from p_focus_session_id
    then
      raise exception 'RAG_SESSION_NOT_FOUND';
    end if;

    perform public.rag_v2_validate_scope(
      p_user_id, v_session.focus_session_id, v_session.selected_document_ids
    );

    -- Refresh state after waiting for the session lock.
    select *
    into v_turn
    from public.rag_chat_turns
    where id = v_turn.id;

    if v_turn.status = 'processing'
      and v_turn.lease_expires_at <= clock_timestamp()
    then
      update public.rag_chat_turns
      set status = 'failed',
          error_code = 'lease_expired',
          completed_at = clock_timestamp()
      where id = v_turn.id
      returning * into v_turn;
    end if;

    return jsonb_build_object(
      'outcome', v_turn.status,
      'session_id', v_turn.session_id,
      'turn_id', v_turn.id,
      'turn_index', v_turn.turn_index,
      'response', v_turn.response_payload,
      'error_code', v_turn.error_code
    );
  end if;

  v_context_mode := case
    when cardinality(v_document_ids) > 0
      then 'document_rag'
    else 'general'
  end::public.rag_context_mode;

  if p_session_id is not null then
    select *
    into v_session
    from public.rag_chat_sessions
    where id = p_session_id
      and user_id = p_user_id
      and conversation_version = 2
    for update;

    if not found
      or v_session.focus_session_id
         is distinct from p_focus_session_id
    then
      raise exception 'RAG_SESSION_NOT_FOUND';
    end if;

  elsif p_focus_session_id is not null then
    select *
    into v_session
    from public.rag_chat_sessions
    where user_id = p_user_id
      and focus_session_id = p_focus_session_id
      and conversation_version = 2
      and status = 'active'
    for update;
  end if;

  if v_session.id is null then
    insert into public.rag_chat_sessions (
      user_id,
      focus_session_id,
      title,
      conversation_version,
      prompt_variant,
      context_mode,
      selected_document_ids,
      top_k,
      preferred_locale
    )
    values (
      p_user_id,
      p_focus_session_id,
      left(p_request->>'question', 80),
      2,
      (p_request->>'prompt_variant')
        ::public.rag_prompt_variant,
      v_context_mode,
      v_document_ids,
      (p_request->>'top_k')::integer,
      p_request->>'preferred_locale'
    )
    returning * into v_session;
  end if;

  if v_session.status <> 'active' then
    raise exception 'RAG_SESSION_CLOSED';
  end if;

  if v_session.completed_turn_count >= 24 then
    raise exception 'RAG_CONVERSATION_LIMIT_REACHED';
  end if;

  -- Keep the document and prompt scope stable.
  if v_session.selected_document_ids
       is distinct from v_document_ids
    or v_session.prompt_variant::text
       is distinct from p_request->>'prompt_variant'
    or v_session.top_k
       is distinct from (p_request->>'top_k')::integer
  then
    raise exception 'RAG_CONTEXT_CHANGED';
  end if;

  -- Recover abandoned reservations.
  update public.rag_chat_turns
  set status = 'failed',
      error_code = 'lease_expired',
      completed_at = clock_timestamp()
  where session_id = v_session.id
    and status = 'processing'
    and lease_expires_at <= clock_timestamp();

  if exists (
    select 1
    from public.rag_chat_turns
    where session_id = v_session.id
      and status = 'processing'
  ) then
    raise exception 'RAG_TURN_IN_PROGRESS';
  end if;

  select coalesce(max(turn_index), 0) + 1
  into v_turn_index
  from public.rag_chat_turns
  where session_id = v_session.id;

  insert into public.rag_chat_turns (
    session_id,
    user_id,
    client_request_id,
    turn_index,
    request_payload,
    lease_expires_at
  )
  values (
    v_session.id,
    p_user_id,
    p_client_request_id,
    v_turn_index,
    p_request,
    clock_timestamp() + interval '180 seconds'
  )
  returning * into v_turn;

  return jsonb_build_object(
    'outcome', 'reserved',
    'session_id', v_session.id,
    'turn_id', v_turn.id,
    'turn_index', v_turn.turn_index,
    'lease_token', v_turn.lease_token
  );
end;
$$;

create or replace function public.rag_v2_restore_context(
  p_user_id uuid,
  p_focus_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with owned_focus as (
    select f.id
    from public.focus_sessions f
    where f.id = p_focus_session_id
      and f.user_id = p_user_id
  ),
  active_session as (
    select s.*
    from owned_focus f
    join public.rag_chat_sessions s
      on s.focus_session_id = f.id
      and s.user_id = p_user_id
    where s.conversation_version = 2
      and s.status = 'active'
  ),
  authorized_session as (
    select s.*
    from active_session s
    where not exists (
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
  processing_turn as (
    select t.client_request_id, t.lease_expires_at
    from authorized_session s
    join public.rag_chat_turns t on t.session_id = s.id and t.user_id = s.user_id
    where t.status = 'processing'
    limit 1
  ),
  recent_turns as (
    select t.id, t.turn_index
    from authorized_session s
    join public.rag_chat_turns t
      on t.session_id = s.id
      and t.user_id = s.user_id
    where t.status = 'completed'
    order by t.turn_index desc
    limit 100
  ),
  history as (
    select
      m.id,
      m.turn_id,
      m.role,
      m.content,
      t.turn_index
    from authorized_session s
    join public.rag_chat_messages m
      on m.session_id = s.id
      and m.user_id = s.user_id
    join recent_turns t
      on t.id = m.turn_id
    where m.role in ('user', 'assistant')
  )
  select case
    when not exists (
      select 1 from owned_focus
    )
    then jsonb_build_object(
      'error', 'RAG_SESSION_NOT_FOUND'
    )

    when exists (
      select 1 from active_session
    )
    and not exists (
      select 1 from authorized_session
    )
    then jsonb_build_object(
      'error', 'RAG_DOCUMENT_ACCESS_DENIED'
    )

    when not exists (
      select 1 from authorized_session
    )
    then jsonb_build_object(
      'enabled', true
    )

    else (
      select jsonb_build_object(
        'enabled', true,
        'session_id', s.id,
        'has_handoff', exists (
          select from public.rag_chat_handoffs h
          where h.target_session_id = s.id and h.user_id = s.user_id
            and h.selected_document_ids is not distinct from s.selected_document_ids
        ),
        'pending_operation', (
          select jsonb_build_object(
            'operation', 'ask', 'client_request_id', p.client_request_id,
            'status', case when p.lease_expires_at <= statement_timestamp() then 'expired' else 'processing' end,
            'lease_expires_at', p.lease_expires_at
          ) from processing_turn p
        ),
        'completed_turn_count',
          s.completed_turn_count,
        'selected_document_ids',
          s.selected_document_ids,
        'top_k', s.top_k,
        'prompt_variant', s.prompt_variant,
        'messages',
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', h.id,
                  'turn_id', h.turn_id,
                  'role', h.role,
                  'content', h.content,
                  'turn_index', h.turn_index
                )
                order by h.turn_index asc,
                  case
                    when h.role = 'user' then 0
                    else 1
                  end
              )
              from history h
            ),
            '[]'::jsonb
          )
      )
      from authorized_session s
    )
  end
  into v_result;

  if v_result->>'error' = 'RAG_SESSION_NOT_FOUND'
  then
    raise exception 'RAG_SESSION_NOT_FOUND';
  end if;

  if v_result->>'error' = 'RAG_DOCUMENT_ACCESS_DENIED'
  then
    raise exception 'RAG_DOCUMENT_ACCESS_DENIED';
  end if;

  return v_result;
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

create function public.rag_v2_prepare_new_chat_recovery(
  p_user_id uuid, p_focus_session_id uuid, p_source_session_id uuid,
  p_client_request_id uuid, p_request jsonb, p_include_rolling_summary boolean
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_source public.rag_chat_sessions%rowtype;
  v_transition public.rag_chat_transitions%rowtype;
  v_summary public.rag_chat_summaries%rowtype;
  v_handoff public.rag_chat_handoffs%rowtype;
  v_mode text := p_request->>'mode';
  v_documents uuid[];
  v_last_index integer;
  v_completed_count integer;
  v_pairs jsonb := '[]';
  v_uncovered_count integer;
begin
  if p_user_id is null or p_focus_session_id is null or p_source_session_id is null
    or p_include_rolling_summary is null or p_client_request_id is null or jsonb_typeof(p_request) is distinct from 'object'
    or p_request->>'source_session_id' is distinct from p_source_session_id::text
    or p_request->>'focus_session_id' is distinct from p_focus_session_id::text
    or coalesce(v_mode, '') not in ('fresh', 'continue')
    or coalesce(p_request->>'prompt_variant', '') not in ('grounded_rule', 'no_rule')
    or coalesce(p_request->>'preferred_locale', '') not in ('auto', 'en', 'vi')
    or jsonb_typeof(p_request->'top_k') is distinct from 'number'
    or coalesce(p_request->>'top_k', '') !~ '^[1-9]$'
    or jsonb_typeof(p_request->'selected_document_ids') is distinct from 'array'
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  begin
    select coalesce(array_agg(distinct value::uuid order by value::uuid), '{}'::uuid[])
    into v_documents
    from jsonb_array_elements_text(p_request->'selected_document_ids');
  exception when invalid_text_representation then
    raise exception 'RAG_INVALID_REQUEST';
  end;
  if p_request is distinct from jsonb_build_object(
    'source_session_id', p_source_session_id, 'focus_session_id', p_focus_session_id,
    'mode', v_mode, 'selected_document_ids', v_documents, 'top_k', (p_request->>'top_k')::integer,
    'prompt_variant', p_request->>'prompt_variant', 'preferred_locale', p_request->>'preferred_locale'
  ) then
    raise exception 'RAG_INVALID_REQUEST';
  end if;
  perform public.rag_v2_validate_scope(p_user_id, p_focus_session_id, '{}'::uuid[]);

  select * into v_transition from public.rag_chat_transitions
  where user_id = p_user_id and client_request_id = p_client_request_id;
  if found then
    if v_transition.request_payload is distinct from p_request then
      raise exception 'RAG_IDEMPOTENCY_CONFLICT';
    end if;
    -- This replay returns only IDs and mode. Canonical restore checks the active scope.
    return jsonb_build_object('outcome', 'completed', 'source_session_id', v_transition.source_session_id,
      'target_session_id', v_transition.target_session_id, 'mode', v_transition.mode,
      'has_handoff', v_transition.mode = 'continue');
  end if;

  select * into v_source from public.rag_chat_sessions
  where id = p_source_session_id and user_id = p_user_id
    and focus_session_id = p_focus_session_id and conversation_version = 2;
  if not found then raise exception 'RAG_SESSION_NOT_FOUND'; end if;
  if v_source.status <> 'active' then raise exception 'RAG_SESSION_CLOSED'; end if;
  if exists (select 1 from public.rag_chat_turns t
    where t.session_id = v_source.id and t.user_id = p_user_id and t.status = 'processing'
      and t.lease_expires_at > statement_timestamp()
  ) then raise exception 'RAG_TURN_IN_PROGRESS'; end if;

  if v_mode = 'continue' and v_documents is distinct from v_source.selected_document_ids then
    raise exception 'RAG_HANDOFF_SCOPE_CHANGED';
  end if;
  perform public.rag_v2_validate_scope(p_user_id, p_focus_session_id, v_documents);

  select count(*)::integer, max(turn_index) into v_completed_count, v_last_index
  from public.rag_chat_turns
  where session_id = v_source.id and user_id = p_user_id and status = 'completed';
  if v_completed_count <> v_source.completed_turn_count then
    raise exception 'RAG_CONTEXT_UNAVAILABLE';
  end if;

  if v_mode = 'continue' then
    if p_include_rolling_summary then
      select * into v_summary
      from public.rag_chat_summaries
      where session_id = v_source.id and user_id = p_user_id and schema_version = 1
        and covered_turn_count is not null and covered_turn_index <= v_last_index
      order by version desc limit 1;
    end if;

    select * into v_handoff from public.rag_chat_handoffs
    where target_session_id = v_source.id and user_id = p_user_id
      and selected_document_ids = v_documents;

    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
      'turn_index', t.turn_index, 'question', um.content, 'answer', am.content
    ) order by t.turn_index), '[]')
    into v_uncovered_count, v_pairs
    from public.rag_chat_turns t
    join public.rag_chat_messages um
      on um.turn_id = t.id and um.session_id = t.session_id and um.user_id = t.user_id and um.role = 'user'
    join public.rag_chat_messages am
      on am.turn_id = t.id and am.session_id = t.session_id and am.user_id = t.user_id and am.role = 'assistant'
    where t.session_id = v_source.id and t.user_id = p_user_id and t.status = 'completed'
      and t.turn_index > coalesce(v_summary.covered_turn_index, 0);
    if v_uncovered_count <> v_completed_count - coalesce(v_summary.covered_turn_count, 0) then
      raise exception 'RAG_CONTEXT_UNAVAILABLE';
    end if;
  end if;

  return jsonb_build_object(
    'outcome', 'prepared', 'source_session_id', v_source.id,
    'revision', jsonb_build_object(
      'source_completed_turn_count', v_completed_count,
      'source_last_completed_turn_index', v_last_index,
      'source_summary_version', v_summary.version, 'source_handoff_id', v_handoff.id
    ),
    'previous_summary', case when v_summary.id is not null then to_jsonb(v_summary) end,
    'inherited_memory', case when v_handoff.id is not null then to_jsonb(v_handoff) end,
    'uncovered_turns', v_pairs
  );
end;
$$;

create function public.rag_v2_commit_new_chat_recovery(
  p_user_id uuid, p_focus_session_id uuid, p_source_session_id uuid, p_client_request_id uuid,
  p_request jsonb, p_expected_revision jsonb, p_handoff jsonb, p_include_rolling_summary boolean
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_source public.rag_chat_sessions%rowtype;
  v_target public.rag_chat_sessions%rowtype;
  v_mode text := p_request->>'mode';
  v_snapshot jsonb;
  v_revision jsonb;
  v_summary jsonb;
  v_documents uuid[];
  v_transition_id uuid;
begin
  if p_user_id is null then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text, 0));
  perform 1 from public.rag_chat_transitions
  where user_id = p_user_id and client_request_id = p_client_request_id;
  if found then
    return public.rag_v2_prepare_new_chat_recovery(
      p_user_id, p_focus_session_id, p_source_session_id, p_client_request_id, p_request, p_include_rolling_summary
    );
  end if;

  select * into v_source from public.rag_chat_sessions
  where id = p_source_session_id and user_id = p_user_id
    and focus_session_id = p_focus_session_id and conversation_version = 2
  for update;
  if not found then raise exception 'RAG_SESSION_NOT_FOUND'; end if;
  if v_source.status <> 'active' then raise exception 'RAG_SESSION_CLOSED'; end if;

  update public.rag_chat_turns set status = 'failed', error_code = 'lease_expired',
    completed_at = clock_timestamp()
  where session_id = v_source.id and user_id = p_user_id
    and status = 'processing' and lease_expires_at <= clock_timestamp();
  if exists (select 1 from public.rag_chat_turns
    where session_id = v_source.id and user_id = p_user_id and status = 'processing'
  ) then raise exception 'RAG_TURN_IN_PROGRESS'; end if;

  v_snapshot := public.rag_v2_prepare_new_chat_recovery(
    p_user_id, p_focus_session_id, p_source_session_id, p_client_request_id, p_request, p_include_rolling_summary
  );
  v_revision := v_snapshot->'revision';
  if v_mode = 'continue' and p_expected_revision is distinct from v_revision then
    raise exception 'RAG_HANDOFF_SOURCE_CHANGED';
  end if;
  if v_mode = 'continue' then
    if (v_revision->>'source_completed_turn_count')::integer = 0
      and v_revision->>'source_handoff_id' is null then
      raise exception 'RAG_HANDOFF_EMPTY_CONTEXT';
    end if;
    v_summary := p_handoff->'summary';
    if jsonb_typeof(p_handoff) is distinct from 'object'
      or jsonb_typeof(v_summary) is distinct from 'object'
      or p_handoff->'schema_version' is distinct from '1'::jsonb
      or coalesce(p_handoff->>'generation_method', '') not in ('llm', 'extractive')
      or jsonb_typeof(p_handoff->'token_count') is distinct from 'number'
      or coalesce(p_handoff->>'token_count', '') !~ '^[1-9][0-9]{0,2}$'
    then raise exception 'RAG_INVALID_REQUEST'; end if;
    if (p_handoff->>'token_count')::integer > 500
      or (select count(*) from jsonb_object_keys(v_summary)) <> 8
      or exists (
        select 1 from (values ('main_topic',240),('learning_objective',400),('continuation_hint',400)) f(key, maximum)
        where jsonb_typeof(v_summary->f.key) is distinct from 'string'
          or length(v_summary->>f.key) > f.maximum
      )
      or exists (
        select 1 from (values ('covered_concepts',12),('important_user_context',6),
          ('unresolved_questions',8),('document_references',12),('uncertainties',8)) f(key, maximum)
        where jsonb_typeof(v_summary->f.key) is distinct from 'array'
          or (select count(*) > f.maximum or coalesce(bool_or(jsonb_typeof(e.value) <> 'string'),false)
            from jsonb_array_elements(case when jsonb_typeof(v_summary->f.key) = 'array'
              then v_summary->f.key else '[]'::jsonb end) e(value))
      )
      or exists (
        select 1 from unnest(array['prompt_tokens','completion_tokens','total_tokens','latency_ms']) k(key)
        where coalesce(jsonb_typeof(p_handoff->k.key), 'null') <> 'null'
          and (jsonb_typeof(p_handoff->k.key) <> 'number'
            or p_handoff->>k.key !~ '^[0-9]{1,9}$')
      )
      or exists (
        select 1 from unnest(array['model_name','provider']) k(key)
        where coalesce(jsonb_typeof(p_handoff->k.key), 'null') not in ('null','string')
          or length(p_handoff->>k.key) > 120
      )
    then raise exception 'RAG_INVALID_REQUEST'; end if;
  elsif p_handoff is not null and p_handoff <> 'null'::jsonb then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
  into v_documents from jsonb_array_elements_text(p_request->'selected_document_ids');

  update public.rag_chat_sessions
  set status = 'closed', closed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_source.id;

  insert into public.rag_chat_sessions (
    user_id, focus_session_id, title, conversation_version, status, completed_turn_count,
    prompt_variant, context_mode, selected_document_ids, top_k, preferred_locale
  ) values (
    p_user_id, p_focus_session_id,
    case when v_mode = 'continue' then 'Continued study conversation' else 'New conversation' end,
    2, 'active', 0, (p_request->>'prompt_variant')::public.rag_prompt_variant,
    (case when cardinality(v_documents)>0 then 'document_rag' else 'general' end)::public.rag_context_mode,
    v_documents, (p_request->>'top_k')::integer, p_request->>'preferred_locale'
  ) returning * into v_target;

  insert into public.rag_chat_transitions (user_id, client_request_id, source_session_id,
    target_session_id, mode, request_payload)
  values (p_user_id, p_client_request_id, v_source.id, v_target.id, v_mode, p_request)
  returning id into v_transition_id;

  if v_mode = 'continue' then
    insert into public.rag_chat_handoffs (transition_id, user_id, source_session_id, target_session_id,
      source_completed_turn_count, source_last_completed_turn_index, source_summary_version,
      selected_document_ids, summary, generation_method, token_count, model_name, provider,
      prompt_tokens, completion_tokens, total_tokens, latency_ms)
    values (v_transition_id, p_user_id, v_source.id, v_target.id,
      (v_revision->>'source_completed_turn_count')::integer,
      (v_revision->>'source_last_completed_turn_index')::integer,
      (v_revision->>'source_summary_version')::integer, v_documents, v_summary,
      p_handoff->>'generation_method', (p_handoff->>'token_count')::integer,
      p_handoff->>'model_name', p_handoff->>'provider', (p_handoff->>'prompt_tokens')::integer,
      (p_handoff->>'completion_tokens')::integer, (p_handoff->>'total_tokens')::integer,
      (p_handoff->>'latency_ms')::integer);
  end if;

  return jsonb_build_object('outcome', 'completed', 'source_session_id', v_source.id,
    'target_session_id', v_target.id, 'mode', v_mode, 'has_handoff', v_mode = 'continue');
end;
$$;

revoke all on function
  public.rag_v2_prepare_new_chat_recovery(uuid, uuid, uuid, uuid, jsonb, boolean),
  public.rag_v2_commit_new_chat_recovery(uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, boolean)
from public, anon, authenticated;

grant execute on function
  public.rag_v2_prepare_new_chat_recovery(uuid, uuid, uuid, uuid, jsonb, boolean),
  public.rag_v2_commit_new_chat_recovery(uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, boolean)
to service_role;

commit;
