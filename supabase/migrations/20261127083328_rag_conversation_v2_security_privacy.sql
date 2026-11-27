begin;

alter table public.rag_chat_sessions
  add column memory_quarantined_at timestamptz,
  add column memory_quarantine_reason text,
  add constraint rag_memory_quarantine_state_check check (
    (memory_quarantined_at is null and memory_quarantine_reason is null)
    or (memory_quarantined_at is not null and memory_quarantine_reason is not null
        and memory_quarantine_reason in ('sensitive_data', 'prompt_injection', 'invalid_provenance', 'security_review'))
  );

revoke select, insert, update, delete on public.rag_chat_sessions from public, anon, authenticated;
grant select (
  id, user_id, goal_id, task_id, focus_session_id, title, context_mode, prompt_variant,
  selected_document_ids, top_k, preferred_locale, conversation_version, status, completed_turn_count,
  created_at, updated_at, closed_at
) on public.rag_chat_sessions to authenticated;

update public.rag_chat_sessions s
set title = case
  when exists (select 1 from public.rag_chat_transitions t
               where t.target_session_id = s.id and t.user_id = s.user_id and t.mode = 'continue')
    then 'Continued study conversation'
  when s.context_mode = 'document_rag' then 'Document study conversation'
  else 'Study conversation'
end
where s.conversation_version = 2;

create function public.rag_v2_quarantine_memory(p_user_id uuid, p_session_id uuid, p_reason text)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  v_affected integer;
  v_now timestamptz;
begin
  if p_user_id is null or p_session_id is null or p_reason is null
    or p_reason not in ('sensitive_data', 'prompt_injection', 'invalid_provenance', 'security_review')
  then raise exception 'RAG_INVALID_REQUEST'; end if;

  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text, 0));
  perform 1 from public.rag_chat_sessions
  where id = p_session_id and user_id = p_user_id and conversation_version = 2 for update;
  if not found then raise exception 'RAG_SESSION_NOT_FOUND'; end if;
  v_now := clock_timestamp();

  with recursive lineage(id) as (
    select p_session_id
    union
    select tr.target_session_id
    from public.rag_chat_transitions tr join lineage l on l.id = tr.source_session_id
    where tr.user_id = p_user_id and tr.mode = 'continue'
  ), locked_sessions as materialized (
    select s.id from public.rag_chat_sessions s join lineage l on l.id = s.id
    where s.user_id = p_user_id and s.conversation_version = 2
    order by s.id for update of s
  ), marked as (
    update public.rag_chat_sessions s
    set memory_quarantined_at = v_now, memory_quarantine_reason = p_reason
    from locked_sessions l where s.id = l.id and s.memory_quarantined_at is null
    returning s.id
  ), failed_turns as (
    update public.rag_chat_turns t set status = 'failed', error_code = 'memory_quarantined', completed_at = v_now
    from locked_sessions l where t.session_id = l.id and t.user_id = p_user_id and t.status = 'processing'
  ), failed_preparations as (
    update public.rag_chat_preparations p set status = 'failed', error_code = 'memory_quarantined', completed_at = v_now
    from locked_sessions l where p.source_session_id = l.id and p.user_id = p_user_id and p.status = 'processing'
      and p.request_payload->>'mode' = 'continue'
  )
  select count(*) into v_affected from marked;
  return v_affected;
end;
$$;

create function public.rag_v2_assert_turn_authorized(
  p_user_id uuid, p_session_id uuid, p_turn_id uuid, p_lease_token uuid
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_session public.rag_chat_sessions%rowtype;
begin
  select * into v_session from public.rag_chat_sessions
  where id = p_session_id and user_id = p_user_id and conversation_version = 2 and status = 'active';
  if not found then raise exception 'RAG_INVALID_LEASE'; end if;
  if v_session.memory_quarantined_at is not null then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
  if not exists (select 1 from public.rag_chat_turns
    where id = p_turn_id and session_id = p_session_id and user_id = p_user_id and status = 'processing'
      and lease_token = p_lease_token and lease_expires_at > clock_timestamp())
  then raise exception 'RAG_INVALID_LEASE'; end if;
  perform public.rag_v2_validate_scope(p_user_id, v_session.focus_session_id, v_session.selected_document_ids);
  return true;
end;
$$;

create function public.rag_v2_assert_preparation_authorized(
  p_user_id uuid, p_preparation_id uuid, p_lease_token uuid, p_expected_revision jsonb
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_preparation public.rag_chat_preparations%rowtype;
  v_source public.rag_chat_sessions%rowtype;
  v_snapshot jsonb;
begin
  select * into v_preparation from public.rag_chat_preparations
  where id = p_preparation_id and user_id = p_user_id and lease_token = p_lease_token;
  if not found then raise exception 'RAG_INVALID_LEASE'; end if;
  select * into v_source from public.rag_chat_sessions
  where id = v_preparation.source_session_id and user_id = p_user_id
    and conversation_version = 2 and status = 'active';
  if not found then raise exception 'RAG_INVALID_LEASE'; end if;
  if v_source.memory_quarantined_at is not null then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
  if v_preparation.status <> 'processing' or v_preparation.lease_expires_at <= clock_timestamp()
    or v_preparation.request_payload->>'mode' is distinct from 'continue'
  then raise exception 'RAG_INVALID_LEASE'; end if;

  v_snapshot := public.rag_v2_prepare_new_chat_recovery(
    p_user_id, v_source.focus_session_id, v_source.id, v_preparation.client_request_id,
    v_preparation.request_payload, v_preparation.include_rolling_summary
  );
  if v_snapshot->>'outcome' is distinct from 'prepared' or v_snapshot->'revision' is distinct from p_expected_revision
  then raise exception 'RAG_HANDOFF_SOURCE_CHANGED'; end if;
  return true;
end;
$$;

revoke all on function public.rag_v2_quarantine_memory(uuid, uuid, text),
  public.rag_v2_assert_turn_authorized(uuid, uuid, uuid, uuid),
  public.rag_v2_assert_preparation_authorized(uuid, uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.rag_v2_quarantine_memory(uuid, uuid, text),
  public.rag_v2_assert_turn_authorized(uuid, uuid, uuid, uuid),
  public.rag_v2_assert_preparation_authorized(uuid, uuid, uuid, jsonb)
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

    if v_session.memory_quarantined_at is not null then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
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
    if cardinality(v_document_ids) > 20 then raise exception 'RAG_INVALID_REQUEST'; end if;
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
      case when v_context_mode = 'document_rag' then 'Document study conversation' else 'Study conversation' end,
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

  if v_session.memory_quarantined_at is not null then raise exception 'RAG_MEMORY_QUARANTINED'; end if;

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

  perform public.rag_v2_guard_no_preparation(p_user_id,v_session.id);

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

  if exists (select 1 from public.rag_chat_sessions where id = p_session_id and user_id = p_user_id
             and memory_quarantined_at is not null)
  then raise exception 'RAG_MEMORY_QUARANTINED'; end if;

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
      and s.memory_quarantined_at is null
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

  if exists (select 1 from public.rag_chat_sessions where id = p_session_id and user_id = p_user_id
             and memory_quarantined_at is not null)
  then raise exception 'RAG_MEMORY_QUARANTINED'; end if;

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
      and s.memory_quarantined_at is null
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

  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text, 0));
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

  if v_session.memory_quarantined_at is not null then raise exception 'RAG_MEMORY_QUARANTINED'; end if;

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
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text, 0));
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

  if v_session.memory_quarantined_at is not null then raise exception 'RAG_MEMORY_QUARANTINED'; end if;

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
      updated_at = clock_timestamp()
  where id = v_session.id;

  return v_response;
end;
$$;

create or replace function public.rag_v2_prepare_new_chat(
  p_user_id uuid, p_focus_session_id uuid, p_source_session_id uuid,
  p_client_request_id uuid, p_request jsonb
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
    or p_client_request_id is null or jsonb_typeof(p_request) is distinct from 'object'
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
  if v_source.memory_quarantined_at is not null and v_mode = 'continue'
  then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
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
    select * into v_summary
    from public.rag_chat_summaries
    where session_id = v_source.id and user_id = p_user_id and schema_version = 1
      and covered_turn_count is not null and covered_turn_index <= v_last_index
    order by version desc limit 1;

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

create or replace function public.rag_v2_prepare_new_chat_recovery(
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
  if v_source.memory_quarantined_at is not null and v_mode = 'continue'
  then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
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

create or replace function public.rag_v2_commit_new_chat_resource_internal(
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
  if v_source.memory_quarantined_at is not null and v_mode = 'continue'
  then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
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
    case when v_mode = 'continue' then 'Continued study conversation'
         when cardinality(v_documents) > 0 then 'Document study conversation' else 'Study conversation' end,
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

create or replace function public.rag_v2_reserve_new_chat_preparation(
  p_user_id uuid, p_focus_session_id uuid, p_source_session_id uuid,
  p_client_request_id uuid, p_request jsonb, p_include_rolling_summary boolean
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_existing public.rag_chat_preparations%rowtype;
  v_snapshot jsonb;
begin
  if p_user_id is null or p_focus_session_id is null or p_source_session_id is null
    or p_client_request_id is null or p_include_rolling_summary is null
  then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform public.rag_v2_validate_scope(p_user_id,p_focus_session_id,'{}'::uuid[]);
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text,0));
  if exists (select 1 from public.rag_chat_transitions
    where user_id=p_user_id and client_request_id=p_client_request_id) then
    return public.rag_v2_prepare_new_chat_recovery(p_user_id,p_focus_session_id,p_source_session_id,
      p_client_request_id,p_request,p_include_rolling_summary);
  end if;
  perform 1 from public.rag_chat_sessions
  where id=p_source_session_id and user_id=p_user_id and focus_session_id=p_focus_session_id
    and conversation_version=2
  for update;
  if not found then raise exception 'RAG_SESSION_NOT_FOUND'; end if;

  if p_request->>'mode' = 'continue' and exists (
    select 1 from public.rag_chat_sessions where id = p_source_session_id and user_id = p_user_id
      and memory_quarantined_at is not null
  ) then raise exception 'RAG_MEMORY_QUARANTINED'; end if;

  select * into v_existing from public.rag_chat_preparations
  where user_id=p_user_id and client_request_id=p_client_request_id;
  if found then
    if v_existing.source_session_id <> p_source_session_id
      or v_existing.request_payload is distinct from p_request
    then raise exception 'RAG_IDEMPOTENCY_CONFLICT'; end if;
    if exists (select 1 from jsonb_array_elements_text(p_request->'selected_document_ids') doc(id)
      where public.can_access_learning_document(doc.id::uuid,p_user_id) is not true)
    then raise exception 'RAG_DOCUMENT_ACCESS_DENIED'; end if;
    if v_existing.status='processing' and v_existing.lease_expires_at <= clock_timestamp() then
      update public.rag_chat_preparations
      set status='failed', error_code='lease_expired', completed_at=clock_timestamp()
      where id=v_existing.id returning * into v_existing;
    end if;
    return jsonb_build_object('outcome',v_existing.status,'preparation_id',v_existing.id);
  end if;

  perform public.rag_v2_guard_no_preparation(p_user_id,p_source_session_id);
  v_snapshot := public.rag_v2_prepare_new_chat_recovery(p_user_id,p_focus_session_id,p_source_session_id,
    p_client_request_id,p_request,p_include_rolling_summary);
  if p_request->>'mode'='fresh' and jsonb_array_length(p_request->'selected_document_ids') > 20 then
    raise exception 'RAG_INVALID_REQUEST';
  end if;
  insert into public.rag_chat_preparations (user_id,source_session_id,client_request_id,request_payload,
    include_rolling_summary,lease_expires_at)
  values (p_user_id,p_source_session_id,p_client_request_id,p_request,p_include_rolling_summary,
    clock_timestamp() + interval '90 seconds')
  returning * into v_existing;
  return v_snapshot || jsonb_build_object('outcome','reserved','preparation_id',v_existing.id,
    'lease_token',v_existing.lease_token);
end;
$$;

create or replace function public.rag_v2_commit_prepared_new_chat(
  p_user_id uuid, p_preparation_id uuid, p_lease_token uuid,
  p_expected_revision jsonb, p_handoff jsonb, p_attempts jsonb default null
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_preparation public.rag_chat_preparations%rowtype;
  v_source public.rag_chat_sessions%rowtype;
  v_response jsonb;
  v_usage jsonb;
  v_transition_id uuid;
begin
  if p_user_id is null then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text,0));
  select s.* into v_source from public.rag_chat_sessions s
  join public.rag_chat_preparations p on p.source_session_id=s.id and p.user_id=s.user_id
  where p.id=p_preparation_id and p.user_id=p_user_id for update of s;
  if not found then raise exception 'RAG_SESSION_NOT_FOUND'; end if;
  select * into v_preparation from public.rag_chat_preparations
  where id=p_preparation_id and user_id=p_user_id for update;
  if not found or v_preparation.lease_token is distinct from p_lease_token then
    raise exception 'RAG_INVALID_LEASE';
  end if;
  if v_preparation.status='completed' then
    return public.rag_v2_prepare_new_chat_recovery(p_user_id,v_source.focus_session_id,v_source.id,
      v_preparation.client_request_id,v_preparation.request_payload,v_preparation.include_rolling_summary);
  end if;
  if v_source.memory_quarantined_at is not null and v_preparation.request_payload->>'mode' = 'continue'
  then raise exception 'RAG_MEMORY_QUARANTINED'; end if;
  if v_preparation.status <> 'processing' or v_preparation.lease_expires_at <= clock_timestamp() then
    raise exception 'RAG_INVALID_LEASE';
  end if;

  v_usage := public.rag_v2_validate_provider_attempts(p_attempts);
  v_response := public.rag_v2_commit_new_chat_resource_internal(p_user_id,v_source.focus_session_id,v_source.id,
    v_preparation.client_request_id,v_preparation.request_payload,p_expected_revision,p_handoff,
    v_preparation.include_rolling_summary);
  if v_preparation.lease_expires_at <= clock_timestamp() then
    raise exception 'RAG_INVALID_LEASE';
  end if;
  select id into strict v_transition_id from public.rag_chat_transitions
  where user_id=p_user_id and client_request_id=v_preparation.client_request_id and source_session_id=v_source.id;
  update public.rag_chat_preparations set status='completed', transition_id=v_transition_id,
    completed_at=clock_timestamp(), provider_calls_total=(v_usage->>'calls')::integer,
    known_provider_tokens=(v_usage->>'known')::integer, unknown_usage_attempts=(v_usage->>'unknown')::integer,
    provider_attempt_metadata=nullif(p_attempts,'null'::jsonb)
  where id=v_preparation.id;
  return v_response;
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
        'memory_quarantined', s.memory_quarantined_at is not null,
        'has_handoff', s.memory_quarantined_at is null and exists (
          select from public.rag_chat_handoffs h
          where h.target_session_id = s.id and h.user_id = s.user_id
            and h.selected_document_ids is not distinct from s.selected_document_ids
        ),
        'pending_operation', coalesce((
          select jsonb_build_object(
            'operation', 'ask', 'client_request_id', p.client_request_id,
            'status', case when p.lease_expires_at <= statement_timestamp() then 'expired' else 'processing' end,
            'lease_expires_at', p.lease_expires_at
          ) from processing_turn p
        ), public.rag_v2_pending_new_chat(p_user_id,p_focus_session_id)),
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

create or replace function public.rag_v2_list_conversations(
  p_user_id uuid, p_focus_session_id uuid, p_limit integer default 20,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_focus_session_id is null or p_limit is null or p_limit not between 1 and 50
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
  then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform public.rag_v2_validate_scope(p_user_id, p_focus_session_id, '{}'::uuid[]);
  with candidates as (
    select s.id, s.title, s.status, s.completed_turn_count, s.created_at, s.updated_at,
      s.memory_quarantined_at is not null as memory_quarantined,
      s.memory_quarantined_at is null and exists (select 1 from public.rag_chat_handoffs h
        where h.target_session_id = s.id and h.user_id = s.user_id) as has_handoff,
      not exists (select 1 from unnest(s.selected_document_ids) d(id)
        where public.can_access_learning_document(d.id, p_user_id) is not true) as content_available
    from public.rag_chat_sessions s
    where s.user_id = p_user_id and s.focus_session_id = p_focus_session_id
      and s.conversation_version = 2
      and (p_cursor_id is null or (s.created_at, s.id) < (p_cursor_created_at, p_cursor_id))
    order by s.created_at desc, s.id desc limit p_limit + 1
  ),
  page as (select * from candidates order by created_at desc, id desc limit p_limit)
  select jsonb_build_object(
    'active_session_id', (select s.id from public.rag_chat_sessions s
      where s.user_id = p_user_id and s.focus_session_id = p_focus_session_id
        and s.conversation_version = 2 and s.status = 'active'),
    'conversations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'title', case when content_available then title end, 'status', status,
      'completed_turn_count', completed_turn_count, 'created_at', created_at, 'updated_at', updated_at,
      'has_handoff', content_available and has_handoff, 'content_available', content_available,
      'memory_quarantined', memory_quarantined
    ) order by created_at desc, id desc) from page), '[]'),
    'next_cursor', case when (select count(*) from candidates) > p_limit
      then (select jsonb_build_object('created_at', created_at, 'id', id)
        from page order by created_at, id limit 1) end
  ) into v_result;
  return v_result;
end;
$$;

commit;
