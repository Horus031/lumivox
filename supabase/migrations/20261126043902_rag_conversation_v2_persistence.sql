begin;

alter table public.rag_chat_sessions
  add column conversation_version smallint
    not null default 1,
  add column status text
    not null default 'active',
  add column completed_turn_count integer
    not null default 0,
  add column closed_at timestamptz;

alter table public.rag_chat_sessions
  add constraint rag_sessions_version_check
    check (conversation_version in (1, 2)),
  add constraint rag_sessions_status_check
    check (status in ('active', 'closed')),
  add constraint rag_sessions_turn_count_check
    check (completed_turn_count >= 0),
  add constraint rag_sessions_closed_at_check
    check (
      (status = 'active' and closed_at is null)
      or
      (status = 'closed' and closed_at is not null)
    ),
  add constraint rag_sessions_id_user_unique
    unique (id, user_id);

create index idx_rag_sessions_user_focus_updated
on public.rag_chat_sessions (
  user_id,
  focus_session_id,
  updated_at desc
);

create unique index idx_rag_active_v2_focus_session
on public.rag_chat_sessions (
  user_id,
  focus_session_id
)
where conversation_version = 2
  and status = 'active'
  and focus_session_id is not null;


create table public.rag_chat_turns (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null,
  user_id uuid not null,

  client_request_id uuid not null,

  turn_index integer not null
    check (turn_index > 0),

  status text not null default 'processing'
    check (
      status in (
        'processing',
        'completed',
        'failed'
      )
    ),

  request_payload jsonb not null
    check (
      jsonb_typeof(request_payload) = 'object'
    ),

  lease_token uuid not null
    default gen_random_uuid(),

  lease_expires_at timestamptz not null,

  response_payload jsonb,

  error_code text,

  provider text,
  model_name text,

  prompt_tokens integer
    check (prompt_tokens >= 0),

  completion_tokens integer
    check (completion_tokens >= 0),

  total_tokens integer
    check (total_tokens >= 0),

  latency_ms integer
    check (latency_ms >= 0),

  created_at timestamptz not null
    default now(),

  completed_at timestamptz,

  constraint rag_turn_session_owner_fk
    foreign key (session_id, user_id)
    references public.rag_chat_sessions(id, user_id)
    on delete cascade,

  constraint rag_turn_request_unique
    unique (user_id, client_request_id),

  constraint rag_turn_sequence_unique
    unique (session_id, turn_index),

  constraint rag_turn_identity_unique
    unique (id, session_id, user_id),

  constraint rag_turn_state_check
    check (
      (
        status = 'processing'
        and response_payload is null
        and error_code is null
        and completed_at is null
      )
      or
      (
        status = 'completed'
        and response_payload is not null
        and error_code is null
        and completed_at is not null
      )
      or
      (
        status = 'failed'
        and response_payload is null
        and error_code is not null
        and completed_at is not null
      )
    )
);

create unique index idx_rag_one_processing_turn
on public.rag_chat_turns(session_id)
where status = 'processing';

create index idx_rag_turns_session_completed
on public.rag_chat_turns(
  session_id,
  turn_index desc
)
where status = 'completed';

alter table public.rag_chat_messages
  add column turn_id uuid;

alter table public.rag_chat_messages
  add constraint rag_message_turn_owner_fk
  foreign key (
    turn_id,
    session_id,
    user_id
  )
  references public.rag_chat_turns (
    id,
    session_id,
    user_id
  )
  on delete cascade;

alter table public.rag_chat_messages
  add constraint rag_v2_message_role_check
  check (
    turn_id is null
    or role in ('user', 'assistant')
  );

create unique index idx_rag_turn_message_role
on public.rag_chat_messages(
  turn_id,
  role
)
where turn_id is not null;

create table public.rag_chat_summaries (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null,
  user_id uuid not null,

  version integer not null
    check (version > 0),

  covered_turn_index integer not null
    check (covered_turn_index > 0),

  summary jsonb not null
    check (jsonb_typeof(summary) = 'object'),

  model_name text,

  token_count integer
    check (token_count >= 0),

  created_at timestamptz not null
    default now(),

  constraint rag_summary_session_owner_fk
    foreign key (session_id, user_id)
    references public.rag_chat_sessions(id, user_id)
    on delete cascade,

  constraint rag_summary_version_unique
    unique (session_id, version)
);

create index idx_rag_summaries_latest
on public.rag_chat_summaries(
  session_id,
  version desc
);


alter table public.rag_chat_turns
  enable row level security;

alter table public.rag_chat_summaries
  enable row level security;

revoke all on public.rag_chat_turns
from public, anon, authenticated;

revoke all on public.rag_chat_summaries
from public, anon, authenticated;

grant select, insert, update, delete
on public.rag_chat_turns
to service_role;

grant select, insert, update, delete
on public.rag_chat_summaries
to service_role;


-- Replace the broad legacy session policy.

drop policy if exists
  "Users can manage their own rag chat sessions"
on public.rag_chat_sessions;

create policy "Users can read own rag sessions"
on public.rag_chat_sessions
for select
to authenticated
using (
  user_id = (select auth.uid())
);


-- Prevent clients from manufacturing assistant messages.

drop policy if exists
  "Users can insert messages into their rag sessions"
on public.rag_chat_messages;

-- Revalidate document access for direct reads as well as replay and restore.
alter policy "Users can view messages from their rag sessions"
on public.rag_chat_messages
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.rag_chat_sessions as session
    where session.id = rag_chat_messages.session_id
      and session.user_id = (select auth.uid())
      and not exists (
        select 1
        from unnest(session.selected_document_ids || rag_chat_messages.selected_document_ids) as doc(id)
        where public.can_access_learning_document(doc.id, (select auth.uid())) is not true
      )
  )
);

-- The only caller is the internal AI API, which supplies an authenticated user ID.
revoke execute on function public.match_learning_document_chunks(
  extensions.vector, integer, uuid[], uuid
) from public, anon, authenticated;
grant execute on function public.match_learning_document_chunks(
  extensions.vector, integer, uuid[], uuid
) to service_role;

revoke all
on public.rag_chat_sessions,
   public.rag_chat_messages
from public, anon, authenticated;

grant select
on public.rag_chat_sessions,
   public.rag_chat_messages
to authenticated;

grant select, insert, update, delete
on public.rag_chat_sessions,
   public.rag_chat_messages
to service_role;


create or replace function public.rag_v2_validate_scope(
  p_user_id uuid,
  p_focus_session_id uuid,
  p_document_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  if p_focus_session_id is not null
    and not exists (
      select 1
      from public.focus_sessions f
      where f.id = p_focus_session_id
        and f.user_id = p_user_id
    )
  then
    raise exception 'RAG_SESSION_NOT_FOUND';
  end if;

  if exists (
    select 1
    from unnest(
      coalesce(p_document_ids, '{}'::uuid[])
    ) as d(id)
    where d.id is null
      or not exists (
        select 1
        from public.learning_documents ld
        where ld.id = d.id
          and public.can_access_learning_document(
            ld.id,
            p_user_id
          ) is true
      )
  ) then
    raise exception 'RAG_DOCUMENT_ACCESS_DENIED';
  end if;
end;
$$;

revoke all
on function public.rag_v2_validate_scope(
  uuid, uuid, uuid[]
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_validate_scope(
  uuid, uuid, uuid[]
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

revoke all
on function public.rag_v2_reserve_turn(
  uuid, uuid, uuid, uuid, jsonb
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_reserve_turn(
  uuid, uuid, uuid, uuid, jsonb
)
to service_role;


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
    'completed_turn_count',
      v_session.completed_turn_count + 1
  );

  update public.rag_chat_turns
  set status = 'completed',
      response_payload = v_response,
      provider = p_provider,
      model_name = p_model_name,
      latency_ms = p_latency_ms,
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

revoke all
on function public.rag_v2_complete_turn(
  uuid, uuid, uuid, text, jsonb,
  text, text, integer, jsonb
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_complete_turn(
  uuid, uuid, uuid, text, jsonb,
  text, text, integer, jsonb
)
to service_role;


create or replace function public.rag_v2_fail_turn(
  p_user_id uuid,
  p_turn_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_updated integer;
begin
  if p_error_code is null
    or p_error_code not in (
      'generation_failed',
      'provider_unavailable',
      'timeout',
      'persistence_failed',
      'document_access_denied'
    )
  then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  select session_id
  into v_session_id
  from public.rag_chat_turns
  where id = p_turn_id
    and user_id = p_user_id;

  if not found then
    return false;
  end if;

  perform 1
  from public.rag_chat_sessions
  where id = v_session_id
    and user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  update public.rag_chat_turns
  set status = 'failed',
      error_code = p_error_code,
      completed_at = clock_timestamp()
  where id = p_turn_id
    and user_id = p_user_id
    and lease_token = p_lease_token
    and status = 'processing';

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

revoke all
on function public.rag_v2_fail_turn(
  uuid, uuid, uuid, text
)
from public, anon, authenticated;

grant execute
on function public.rag_v2_fail_turn(
  uuid, uuid, uuid, text
)
to service_role;

commit;
