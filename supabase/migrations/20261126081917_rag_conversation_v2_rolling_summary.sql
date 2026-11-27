begin;

alter table public.rag_chat_summaries
  add column schema_version integer
    not null default 1
    check (schema_version > 0),

  add column covered_turn_count integer
    check (covered_turn_count > 0),

  add column generation_method text
    not null default 'llm'
    check (
      generation_method in (
        'llm',
        'extractive'
      )
    ),

  add column input_summary_version integer
    check (input_summary_version > 0),

  add column input_turn_count integer
    check (input_turn_count > 0),

  add column provider text,

  add column prompt_tokens integer
    check (prompt_tokens >= 0),

  add column completion_tokens integer
    check (completion_tokens >= 0),

  add column total_tokens integer
    check (total_tokens >= 0),

  add column latency_ms integer
    check (latency_ms >= 0);

create unique index idx_rag_summary_unique_coverage
on public.rag_chat_summaries (
  session_id,
  covered_turn_index
)
where covered_turn_count is not null;

create or replace function public.rag_v2_get_summary_input(
  p_user_id uuid,
  p_session_id uuid,
  p_turn_id uuid,
  p_lease_token uuid,
  p_recent_turns integer,
  p_batch_size integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_recent_turns is null
    or p_recent_turns not between 1 and 12
    or p_batch_size is null
    or p_batch_size not between 1 and 24
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  with authorized as (
    select
      s.id,
      s.user_id,
      s.selected_document_ids,
      s.completed_turn_count,
      current_turn.turn_index as current_index
    from public.rag_chat_sessions s
    join public.rag_chat_turns current_turn
      on current_turn.session_id = s.id
      and current_turn.user_id = s.user_id
    where s.id = p_session_id
      and s.user_id = p_user_id
      and s.conversation_version = 2
      and s.status = 'active'
      and current_turn.id = p_turn_id
      and current_turn.status = 'processing'
      and current_turn.lease_token = p_lease_token
      and current_turn.lease_expires_at
        > clock_timestamp()
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
        from unnest(s.selected_document_ids) d(id)
        where public.can_access_learning_document(
          d.id,
          p_user_id
        ) is not true
      )
  ),
  latest_summary as (
    select sm.*
    from authorized a
    join public.rag_chat_summaries sm
      on sm.session_id = a.id
      and sm.user_id = a.user_id
    where sm.schema_version = 1
      and sm.covered_turn_count is not null
      and sm.covered_turn_index < a.current_index
    order by sm.version desc
    limit 1
  ),
  ranked_turns as (
    select
      t.id,
      t.turn_index,
      row_number() over (
        order by t.turn_index desc
      ) as recent_rank
    from authorized a
    join public.rag_chat_turns t
      on t.session_id = a.id
      and t.user_id = a.user_id
    where t.status = 'completed'
      and t.turn_index < a.current_index
  ),
  eligible as (
    select r.id, r.turn_index
    from ranked_turns r
    where r.recent_rank > p_recent_turns
      and r.turn_index > coalesce(
        (
          select covered_turn_index
          from latest_summary
        ),
        0
      )
    order by r.turn_index asc
    limit p_batch_size
  ),
  pairs as (
    select
      e.turn_index,
      um.content as question,
      am.content as answer
    from eligible e
    join public.rag_chat_messages um
      on um.turn_id = e.id
      and um.role = 'user'
      and um.user_id = p_user_id
      and um.session_id = p_session_id
    join public.rag_chat_messages am
      on am.turn_id = e.id
      and am.role = 'assistant'
      and am.user_id = p_user_id
      and am.session_id = p_session_id
  )
  select jsonb_build_object(
    'session_id', a.id,

    'completed_turn_count',
      a.completed_turn_count,

    'selected_document_ids',
      a.selected_document_ids,

    'previous_summary',
      (
        select jsonb_build_object(
          'id', sm.id,
          'version', sm.version,
          'schema_version', sm.schema_version,
          'covered_turn_index',
            sm.covered_turn_index,
          'covered_turn_count',
            sm.covered_turn_count,
          'summary', sm.summary,
          'generation_method',
            sm.generation_method,
          'model_name', sm.model_name,
          'token_count', sm.token_count
        )
        from latest_summary sm
      ),

    'turns',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'turn_index', p.turn_index,
              'question', p.question,
              'answer', p.answer
            )
            order by p.turn_index
          )
          from pairs p
        ),
        '[]'::jsonb
      )
  )
  into v_result
  from authorized a
  where (select count(*) from eligible) = (select count(*) from pairs);

  if v_result is null then
    raise exception 'RAG_CONTEXT_UNAVAILABLE';
  end if;

  return v_result;
end;
$$;

revoke all
on function public.rag_v2_get_summary_input(
  uuid, uuid, uuid, uuid, integer, integer
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_get_summary_input(
  uuid, uuid, uuid, uuid, integer, integer
)
to service_role;

create or replace function public.rag_v2_save_summary(
  p_user_id uuid,
  p_session_id uuid,
  p_turn_id uuid,
  p_lease_token uuid,
  p_expected_version integer,
  p_covered_turn_index integer,
  p_recent_turns integer,
  p_summary jsonb,
  p_token_count integer,
  p_generation_method text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.rag_chat_sessions%rowtype;
  v_turn public.rag_chat_turns%rowtype;
  v_previous public.rag_chat_summaries%rowtype;
  v_saved public.rag_chat_summaries%rowtype;

  v_previous_index integer;
  v_previous_version integer;
  v_new_count integer;
  v_total_count integer;
  v_next_version integer;
  v_expected_count integer;
  v_expected_index integer;
  v_missing_pairs integer;
begin
  if p_expected_version is null
    or p_expected_version < 0
    or p_covered_turn_index is null
    or p_covered_turn_index <= 0
    or p_recent_turns is null
    or p_recent_turns not between 1 and 12
    or jsonb_typeof(p_summary)
      is distinct from 'object'
    or p_token_count is null
    or p_token_count not between 1 and 2048
    or p_generation_method is null
    or p_generation_method not in (
      'llm',
      'extractive'
    )
    or jsonb_typeof(p_metadata)
      is distinct from 'object'
    or p_metadata->'schema_version' is distinct from '1'::jsonb
    or coalesce(p_metadata->>'input_turn_count', '') !~ '^([1-9]|1[0-9]|2[0-4])$'
    or coalesce(p_metadata->>'batch_size', '') !~ '^([1-9]|1[0-9]|2[0-4])$'
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  if (select count(*) from jsonb_object_keys(p_summary)) <> 8
    or exists (
      select 1
      from unnest(array['main_topic', 'learning_objective', 'continuation_hint']) k(key)
      where jsonb_typeof(p_summary->k.key) is distinct from 'string'
    )
    or exists (
      select 1
      from unnest(array[
        'covered_concepts', 'important_user_context', 'unresolved_questions',
        'document_references', 'uncertainties'
      ]) k(key)
      where jsonb_typeof(p_summary->k.key) is distinct from 'array'
        or exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(p_summary->k.key) = 'array'
              then p_summary->k.key else '[]'::jsonb end
          ) e(value)
          where jsonb_typeof(e.value) <> 'string'
        )
    )
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  select *
  into v_session
  from public.rag_chat_sessions
  where id = p_session_id
    and user_id = p_user_id
    and conversation_version = 2
    and status = 'active'
  for update;

  if not found then
    raise exception 'RAG_SESSION_NOT_FOUND';
  end if;

  select *
  into v_turn
  from public.rag_chat_turns
  where id = p_turn_id
    and session_id = p_session_id
    and user_id = p_user_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp();

  if not found then
    raise exception 'RAG_INVALID_LEASE';
  end if;

  perform public.rag_v2_validate_scope(
    p_user_id,
    v_session.focus_session_id,
    v_session.selected_document_ids
  );

  select *
  into v_previous
  from public.rag_chat_summaries
  where session_id = p_session_id
    and user_id = p_user_id
    and schema_version = 1
    and covered_turn_count is not null
    and covered_turn_index < v_turn.turn_index
  order by version desc
  limit 1;

  v_previous_version := coalesce(
    v_previous.version, 0
  );

  v_previous_index := coalesce(
    v_previous.covered_turn_index, 0
  );

  -- Safe replay after an uncertain summary commit.
  if v_previous.id is not null
    and coalesce(v_previous.input_summary_version, 0) = p_expected_version
    and v_previous.covered_turn_index
      = p_covered_turn_index
    and v_previous.summary = p_summary
    and v_previous.generation_method = p_generation_method
    and v_previous.token_count = p_token_count
    and v_previous.input_turn_count = (p_metadata->>'input_turn_count')::integer
  then
    return to_jsonb(v_previous);
  end if;

  if v_previous_version <> p_expected_version
    or p_covered_turn_index <= v_previous_index
    or p_covered_turn_index >= v_turn.turn_index
  then
    raise exception 'RAG_SUMMARY_CONFLICT';
  end if;

  if not exists (
    select 1
    from public.rag_chat_turns t
    where t.session_id = p_session_id
      and t.user_id = p_user_id
      and t.turn_index = p_covered_turn_index
      and t.status = 'completed'
  ) then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  -- The latest completed turns must remain outside
  -- summary coverage.
  if (
    select count(*)
    from public.rag_chat_turns t
    where t.session_id = p_session_id
      and t.user_id = p_user_id
      and t.status = 'completed'
      and t.turn_index > p_covered_turn_index
      and t.turn_index < v_turn.turn_index
  ) < p_recent_turns
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  select count(*)::integer
  into v_new_count
  from public.rag_chat_turns t
  where t.session_id = p_session_id
    and t.user_id = p_user_id
    and t.status = 'completed'
    and t.turn_index > v_previous_index
    and t.turn_index <= p_covered_turn_index;

  select count(*)::integer
  into v_total_count
  from public.rag_chat_turns t
  where t.session_id = p_session_id
    and t.user_id = p_user_id
    and t.status = 'completed'
    and t.turn_index <= p_covered_turn_index;

  with ranked as (
    select t.id, t.turn_index,
      row_number() over (order by t.turn_index desc) as recent_rank
    from public.rag_chat_turns t
    where t.session_id = p_session_id
      and t.user_id = p_user_id
      and t.status = 'completed'
      and t.turn_index < v_turn.turn_index
  ),
  eligible as (
    select id, turn_index
    from ranked
    where recent_rank > p_recent_turns and turn_index > v_previous_index
    order by turn_index
    limit (p_metadata->>'batch_size')::integer
  )
  select count(*)::integer, max(e.turn_index),
    count(*) filter (where um.id is null or am.id is null)::integer
  into v_expected_count, v_expected_index, v_missing_pairs
  from eligible e
  left join public.rag_chat_messages um
    on um.turn_id = e.id and um.role = 'user'
    and um.session_id = p_session_id and um.user_id = p_user_id
  left join public.rag_chat_messages am
    on am.turn_id = e.id and am.role = 'assistant'
    and am.session_id = p_session_id and am.user_id = p_user_id;

  if v_new_count <= 0
    or v_new_count <> (p_metadata->>'input_turn_count')::integer
    or v_new_count <> v_expected_count
    or p_covered_turn_index is distinct from v_expected_index
    or v_missing_pairs <> 0
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  select coalesce(max(version), 0) + 1
  into v_next_version
  from public.rag_chat_summaries
  where session_id = p_session_id;

  if v_turn.lease_expires_at <= clock_timestamp() then
    raise exception 'RAG_INVALID_LEASE';
  end if;

  insert into public.rag_chat_summaries (
    session_id,
    user_id,
    version,
    covered_turn_index,
    covered_turn_count,
    summary,
    schema_version,
    generation_method,
    input_summary_version,
    input_turn_count,
    model_name,
    provider,
    token_count,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    latency_ms
  )
  values (
    p_session_id,
    p_user_id,
    v_next_version,
    p_covered_turn_index,
    v_total_count,
    p_summary,
    1,
    p_generation_method,
    nullif(v_previous_version, 0),
    v_new_count,
    p_metadata->>'model_name',
    p_metadata->>'provider',
    p_token_count,
    (p_metadata->>'prompt_tokens')::integer,
    (p_metadata->>'completion_tokens')::integer,
    (p_metadata->>'total_tokens')::integer,
    (p_metadata->>'latency_ms')::integer
  )
  returning *
  into v_saved;

  return to_jsonb(v_saved);
end;
$$;

revoke all
on function public.rag_v2_save_summary(
  uuid, uuid, uuid, uuid,
  integer, integer, integer,
  jsonb, integer, text, jsonb
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_save_summary(
  uuid, uuid, uuid, uuid,
  integer, integer, integer,
  jsonb, integer, text, jsonb
)
to service_role;

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

alter table public.rag_chat_turns
  add column summary_version_used integer
    check (summary_version_used > 0),

  add column summary_tokens_used integer
    check (summary_tokens_used >= 0),

  add column summary_covered_turn_index integer
    check (summary_covered_turn_index > 0),

  add column summary_generation_method text
    check (
      summary_generation_method in (
        'llm',
        'extractive'
      )
    );

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
      updated_at = clock_timestamp()
  where id = v_session.id;

  return v_response;
end;
$$;

commit;
