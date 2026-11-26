begin;

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
    or p_recent_turns not between 1 and 12
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
    'summary', null
  )
  into v_context
  from authorized_session s;

  if v_context is null then
    raise exception 'RAG_CONTEXT_UNAVAILABLE';
  end if;

  return v_context;
end;
$$;

revoke all
on function public.rag_v2_get_context(
  uuid, uuid, uuid, uuid, integer
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_get_context(
  uuid, uuid, uuid, uuid, integer
)
to service_role;

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

revoke all
on function public.rag_v2_restore_context(
  uuid, uuid
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_restore_context(
  uuid, uuid
)
to service_role;

alter table public.rag_chat_turns
  add column estimated_prompt_tokens integer
    check (estimated_prompt_tokens >= 0),

  add column history_turns_used integer
    check (history_turns_used >= 0),

  add column retrieved_chunks_used integer
    check (retrieved_chunks_used >= 0),

  add column generation_attempts integer
    check (generation_attempts >= 0),

  add column retrieval_strategy text,

  add column context_truncated boolean
    not null default false;

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
    'context', p_usage->'context',
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
      updated_at = clock_timestamp()
  where id = v_session.id;

  return v_response;
end;
$$;

commit;
