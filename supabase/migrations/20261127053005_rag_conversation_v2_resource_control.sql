begin;

create table public.rag_chat_preparations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,

  source_session_id uuid not null,

  client_request_id uuid not null,

  request_payload jsonb not null
    check (
      jsonb_typeof(request_payload) = 'object'
    ),

  include_rolling_summary boolean not null,

  status text not null
    default 'processing'
    check (
      status in (
        'processing',
        'completed',
        'failed'
      )
    ),

  lease_token uuid not null
    default gen_random_uuid(),

  lease_expires_at timestamptz not null,

  transition_id uuid unique
    references public.rag_chat_transitions(id)
    on delete cascade,

  error_code text,

  created_at timestamptz not null
    default now(),

  completed_at timestamptz,

  constraint rag_preparation_request_unique
    unique (user_id, client_request_id),

  constraint rag_preparation_source_owner_fk
    foreign key (
      source_session_id,
      user_id
    )
    references public.rag_chat_sessions(
      id,
      user_id
    )
    on delete cascade,

  constraint rag_preparation_state_check
    check (
      (
        status = 'processing'
        and transition_id is null
        and completed_at is null
        and error_code is null
      )
      or
      (
        status = 'completed'
        and transition_id is not null
        and completed_at is not null
        and error_code is null
      )
      or
      (
        status = 'failed'
        and transition_id is null
        and completed_at is not null
        and error_code is not null
      )
    )
);

create unique index
  idx_rag_one_processing_preparation
on public.rag_chat_preparations(
  source_session_id
)
where status = 'processing';

alter table public.rag_chat_preparations
  enable row level security;

revoke all
on public.rag_chat_preparations
from public, anon, authenticated;

grant select, insert, update, delete
on public.rag_chat_preparations
to service_role;

create function public.rag_v2_commit_new_chat_resource_internal(
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

alter table public.rag_chat_transitions add constraint rag_transition_preparation_identity_unique
  unique (id, user_id, source_session_id, client_request_id);
alter table public.rag_chat_preparations add constraint rag_preparation_transition_identity_fk
  foreign key (transition_id, user_id, source_session_id, client_request_id)
  references public.rag_chat_transitions(id, user_id, source_session_id, client_request_id)
  on delete cascade;

alter table public.rag_chat_turns
  add column provider_calls_total integer check (provider_calls_total >= 0),
  add column known_provider_tokens integer check (known_provider_tokens >= 0),
  add column unknown_usage_attempts integer check (unknown_usage_attempts >= 0),
  add column provider_attempt_metadata jsonb check (jsonb_typeof(provider_attempt_metadata) = 'array');
alter table public.rag_chat_preparations
  add column provider_calls_total integer check (provider_calls_total >= 0),
  add column known_provider_tokens integer check (known_provider_tokens >= 0),
  add column unknown_usage_attempts integer check (unknown_usage_attempts >= 0),
  add column provider_attempt_metadata jsonb check (jsonb_typeof(provider_attempt_metadata) = 'array');

create function public.rag_v2_validate_provider_attempts(p_attempts jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_attempts is null or p_attempts = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_attempts) <> 'array' then raise exception 'RAG_INVALID_RESPONSE'; end if;
  if jsonb_array_length(p_attempts) > 16
    or exists (
      select 1 from jsonb_array_elements(p_attempts) a(value)
      where jsonb_typeof(a.value) <> 'object'
        or (a.value - array['stage','provider','model','outcome','latency_ms','error_code',
          'estimated_prompt_tokens','prompt_tokens','completion_tokens','total_tokens']) <> '{}'::jsonb
        or coalesce(a.value->>'stage','') not in ('answer','rolling_summary','handoff','embedding')
        or coalesce(a.value->>'provider','') not in ('groq','google')
        or coalesce(a.value->>'outcome','') not in ('success','failed','unknown')
        or coalesce(a.value->>'model','') !~ '^[a-zA-Z0-9._/-]{1,100}$'
        or coalesce(a.value->>'latency_ms','') !~ '^[0-9]{1,7}$'
        or coalesce(a.value->>'error_code','') !~ '^[a-z_]{0,50}$'
        or exists (
          select 1 from unnest(array['estimated_prompt_tokens','prompt_tokens','completion_tokens','total_tokens']) k(key)
          where coalesce(jsonb_typeof(a.value->k.key),'null') <> 'null'
            and (jsonb_typeof(a.value->k.key) <> 'number' or a.value->>k.key !~ '^[0-9]{1,7}$')
        )
    )
  then raise exception 'RAG_INVALID_RESPONSE'; end if;
  select jsonb_build_object('calls', count(*), 'known', coalesce(sum((value->>'total_tokens')::integer),0),
    'unknown', count(*) filter (where value->>'total_tokens' is null))
  into v_result from jsonb_array_elements(p_attempts);
  return v_result;
end;
$$;

-- Callers hold the user advisory lock and source session row lock.
create function public.rag_v2_guard_no_preparation(p_user_id uuid, p_source_session_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  update public.rag_chat_preparations
  set status='failed', completed_at=clock_timestamp(), error_code='lease_expired'
  where user_id=p_user_id and source_session_id=p_source_session_id
    and status='processing' and lease_expires_at <= clock_timestamp();
  if exists (select 1 from public.rag_chat_preparations
    where user_id=p_user_id and source_session_id=p_source_session_id and status='processing')
  then raise exception 'RAG_NEW_CHAT_IN_PROGRESS'; end if;
end;
$$;

create function public.rag_v2_reserve_new_chat_preparation(
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

create function public.rag_v2_commit_prepared_new_chat(
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

create function public.rag_v2_fail_new_chat_preparation(
  p_user_id uuid, p_preparation_id uuid, p_lease_token uuid, p_error_code text, p_attempts jsonb default null
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_usage jsonb;
  v_updated integer;
begin
  if p_user_id is null or coalesce(p_error_code,'') !~ '^[a-z_]{1,50}$'
    then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text,0));
  perform 1 from public.rag_chat_sessions s join public.rag_chat_preparations p
    on p.source_session_id=s.id and p.user_id=s.user_id
  where p.id=p_preparation_id and p.user_id=p_user_id for update of s;
  if not found then return false; end if;
  v_usage := public.rag_v2_validate_provider_attempts(p_attempts);
  update public.rag_chat_preparations set status='failed', completed_at=clock_timestamp(),
    error_code=case when lease_expires_at <= clock_timestamp() then 'lease_expired' else p_error_code end,
    provider_calls_total=(v_usage->>'calls')::integer, known_provider_tokens=(v_usage->>'known')::integer,
    unknown_usage_attempts=(v_usage->>'unknown')::integer, provider_attempt_metadata=nullif(p_attempts,'null'::jsonb)
  where id=p_preparation_id and user_id=p_user_id and lease_token=p_lease_token and status='processing';
  get diagnostics v_updated = row_count;
  return v_updated=1;
end;
$$;

create function public.rag_v2_fail_turn_with_usage(
  p_user_id uuid, p_turn_id uuid, p_lease_token uuid, p_error_code text, p_attempts jsonb
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_usage jsonb;
begin
  v_usage := public.rag_v2_validate_provider_attempts(p_attempts);
  if not public.rag_v2_fail_turn(p_user_id,p_turn_id,p_lease_token,p_error_code) then return false; end if;
  update public.rag_chat_turns set provider_calls_total=(v_usage->>'calls')::integer,
    known_provider_tokens=(v_usage->>'known')::integer, unknown_usage_attempts=(v_usage->>'unknown')::integer,
    provider_attempt_metadata=nullif(p_attempts,'null'::jsonb)
  where id=p_turn_id and user_id=p_user_id;
  return true;
end;
$$;

create function public.rag_v2_pending_new_chat(p_user_id uuid,p_focus_session_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('operation','new_chat','client_request_id',p.client_request_id,
    'status',case when p.lease_expires_at <= statement_timestamp() then 'expired' else 'processing' end,
    'lease_expires_at',p.lease_expires_at)
  from public.rag_chat_preparations p
  join public.rag_chat_sessions s on s.id=p.source_session_id and s.user_id=p.user_id
  join public.focus_sessions f on f.id=s.focus_session_id and f.user_id=p.user_id
  where p.user_id=p_user_id and f.id=p_focus_session_id and s.status='active'
    and s.conversation_version=2 and p.status='processing'
    and not exists (select 1 from jsonb_array_elements_text(p.request_payload->'selected_document_ids') doc(id)
      where public.can_access_learning_document(doc.id::uuid,p_user_id) is not true)
  limit 1;
$$;

create function public.rag_v2_recover_expired_preparation(
  p_user_id uuid,p_focus_session_id uuid,p_client_request_id uuid
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_source_id uuid;
begin
  if p_user_id is null or p_focus_session_id is null or p_client_request_id is null
    then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform public.rag_v2_validate_scope(p_user_id,p_focus_session_id,'{}'::uuid[]);
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text,0));
  select s.id into v_source_id from public.rag_chat_sessions s
  join public.rag_chat_preparations p on p.source_session_id=s.id and p.user_id=s.user_id
  where p.user_id=p_user_id and p.client_request_id=p_client_request_id
    and s.focus_session_id=p_focus_session_id and s.conversation_version=2
  for update of s;
  if found then
    update public.rag_chat_preparations set status='failed',error_code='lease_expired',completed_at=clock_timestamp()
    where user_id=p_user_id and client_request_id=p_client_request_id and source_session_id=v_source_id
      and status='processing' and lease_expires_at <= clock_timestamp();
  end if;
  return public.rag_v2_get_operation_status(p_user_id,p_focus_session_id,p_client_request_id,'new_chat');
end;
$$;

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

create or replace function public.rag_v2_get_operation_status(
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
  v_preparation public.rag_chat_preparations%rowtype;
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
    select p.* into v_preparation
    from public.rag_chat_preparations p
    join public.rag_chat_sessions s on p.source_session_id=s.id and p.user_id=s.user_id
    where p.user_id=p_user_id and p.client_request_id=p_client_request_id
      and s.focus_session_id=p_focus_session_id and s.conversation_version=2;
    if not found then return jsonb_build_object('operation','new_chat','status','unknown'); end if;
    if exists (select 1 from jsonb_array_elements_text(v_preparation.request_payload->'selected_document_ids') d(id)
      where public.can_access_learning_document(d.id::uuid,p_user_id) is not true)
    then return jsonb_build_object('operation','new_chat','status','access_unavailable'); end if;
    v_status := case when v_preparation.status='processing' and v_preparation.lease_expires_at <= statement_timestamp()
      then 'expired' else v_preparation.status end;
    return jsonb_build_object('operation','new_chat','status',v_status,
      'source_session_id',v_preparation.source_session_id,
      'lease_expires_at',case when v_status='processing' then v_preparation.lease_expires_at end);
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


create or replace function public.rag_v2_commit_new_chat_recovery(
  p_user_id uuid,p_focus_session_id uuid,p_source_session_id uuid,p_client_request_id uuid,
  p_request jsonb,p_expected_revision jsonb,p_handoff jsonb,p_include_rolling_summary boolean
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if p_user_id is null then raise exception 'RAG_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rag-v2:' || p_user_id::text,0));
  if not exists (select 1 from public.rag_chat_transitions
    where user_id=p_user_id and client_request_id=p_client_request_id) then
    perform 1 from public.rag_chat_sessions
    where id=p_source_session_id and user_id=p_user_id and focus_session_id=p_focus_session_id
      and conversation_version=2 for update;
    if found then perform public.rag_v2_guard_no_preparation(p_user_id,p_source_session_id); end if;
  end if;
  return public.rag_v2_commit_new_chat_resource_internal(p_user_id,p_focus_session_id,p_source_session_id,
    p_client_request_id,p_request,p_expected_revision,p_handoff,p_include_rolling_summary);
end;
$$;

create or replace function public.rag_v2_commit_new_chat(
  p_user_id uuid,p_focus_session_id uuid,p_source_session_id uuid,p_client_request_id uuid,
  p_request jsonb,p_expected_revision jsonb,p_handoff jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select public.rag_v2_commit_new_chat_recovery(p_user_id,p_focus_session_id,p_source_session_id,
    p_client_request_id,p_request,p_expected_revision,p_handoff,true);
$$;

revoke all on function
  public.rag_v2_validate_provider_attempts(jsonb),
  public.rag_v2_guard_no_preparation(uuid,uuid),
  public.rag_v2_commit_new_chat_resource_internal(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,boolean),
  public.rag_v2_reserve_new_chat_preparation(uuid,uuid,uuid,uuid,jsonb,boolean),
  public.rag_v2_commit_prepared_new_chat(uuid,uuid,uuid,jsonb,jsonb,jsonb),
  public.rag_v2_fail_new_chat_preparation(uuid,uuid,uuid,text,jsonb),
  public.rag_v2_pending_new_chat(uuid,uuid),
  public.rag_v2_recover_expired_preparation(uuid,uuid,uuid),
  public.rag_v2_fail_turn_with_usage(uuid,uuid,uuid,text,jsonb)
from public, anon, authenticated;

grant execute on function
  public.rag_v2_validate_provider_attempts(jsonb),
  public.rag_v2_guard_no_preparation(uuid,uuid),
  public.rag_v2_commit_new_chat_resource_internal(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,boolean),
  public.rag_v2_reserve_new_chat_preparation(uuid,uuid,uuid,uuid,jsonb,boolean),
  public.rag_v2_commit_prepared_new_chat(uuid,uuid,uuid,jsonb,jsonb,jsonb),
  public.rag_v2_fail_new_chat_preparation(uuid,uuid,uuid,text,jsonb),
  public.rag_v2_pending_new_chat(uuid,uuid),
  public.rag_v2_recover_expired_preparation(uuid,uuid,uuid),
  public.rag_v2_fail_turn_with_usage(uuid,uuid,uuid,text,jsonb)
to service_role;

commit;
