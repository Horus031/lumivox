begin;

-- ============================================================
-- 1. Admin AI overview metrics
-- Uses rag_chat_messages.retrieved_context instead of missing sources column.
-- ============================================================

create or replace function public.admin_get_ai_monitoring_metrics()
returns table (
  total_rag_sessions integer,
  total_rag_messages integer,
  general_ai_messages integer,
  document_rag_messages integer,

  grounded_rule_messages integer,
  no_rule_messages integer,

  top_k_3_messages integer,
  top_k_5_messages integer,
  top_k_7_messages integer,

  avg_latency_ms numeric,
  max_latency_ms integer,

  assistant_messages integer,
  user_messages integer,

  messages_with_sources integer,
  document_rag_messages_without_sources integer,

  processed_documents integer,
  failed_documents integer,
  pending_documents integer,
  unsupported_documents integer,

  total_document_chunks integer,
  embedded_document_chunks integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    (select count(*)::integer from public.rag_chat_sessions) as total_rag_sessions,

    (select count(*)::integer from public.rag_chat_messages) as total_rag_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where context_mode::text = 'general'
    ) as general_ai_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where context_mode::text = 'document_rag'
    ) as document_rag_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where prompt_variant::text = 'grounded_rule'
    ) as grounded_rule_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where prompt_variant::text = 'no_rule'
    ) as no_rule_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where top_k = 3
    ) as top_k_3_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where top_k = 5
    ) as top_k_5_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where top_k = 7
    ) as top_k_7_messages,

    (
      select round(avg(latency_ms), 2)
      from public.rag_chat_messages
      where latency_ms is not null
    ) as avg_latency_ms,

    (
      select max(latency_ms)::integer
      from public.rag_chat_messages
      where latency_ms is not null
    ) as max_latency_ms,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where role::text = 'assistant'
    ) as assistant_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where role::text = 'user'
    ) as user_messages,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where role::text = 'assistant'
        and retrieved_context is not null
        and jsonb_typeof(retrieved_context) = 'array'
        and jsonb_array_length(retrieved_context) > 0
    ) as messages_with_sources,

    (
      select count(*)::integer
      from public.rag_chat_messages
      where role::text = 'assistant'
        and context_mode::text = 'document_rag'
        and (
          retrieved_context is null
          or jsonb_typeof(retrieved_context) <> 'array'
          or jsonb_array_length(retrieved_context) = 0
        )
    ) as document_rag_messages_without_sources,

    (
      select count(*)::integer
      from public.learning_documents
      where extracted_text_status = 'completed'
    ) as processed_documents,

    (
      select count(*)::integer
      from public.learning_documents
      where extracted_text_status = 'failed'
    ) as failed_documents,

    (
      select count(*)::integer
      from public.learning_documents
      where extracted_text_status = 'pending'
    ) as pending_documents,

    (
      select count(*)::integer
      from public.learning_documents
      where extracted_text_status = 'unsupported'
    ) as unsupported_documents,

    (select count(*)::integer from public.document_chunks) as total_document_chunks,

    (
      select count(*)::integer
      from public.document_chunks
      where embedding is not null
    ) as embedded_document_chunks

  where public.is_admin((select auth.uid()));
$$;

revoke all
on function public.admin_get_ai_monitoring_metrics()
from public;

grant execute
on function public.admin_get_ai_monitoring_metrics()
to authenticated;


-- ============================================================
-- 2. Admin RAG sessions list
-- ============================================================

create or replace function public.admin_search_rag_chat_sessions(
  p_query text default '',
  p_context_mode text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  session_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  context_mode text,
  selected_document_count integer,
  top_k integer,
  message_count integer,
  assistant_message_count integer,
  avg_latency_ms numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    session.id as session_id,
    session.user_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as user_name,
    auth_user.email::text as user_email,
    session.context_mode::text,
    coalesce(array_length(session.selected_document_ids, 1), 0)::integer as selected_document_count,
    session.top_k,

    (
      select count(*)::integer
      from public.rag_chat_messages message
      where message.session_id = session.id
    ) as message_count,

    (
      select count(*)::integer
      from public.rag_chat_messages message
      where message.session_id = session.id
        and message.role::text = 'assistant'
    ) as assistant_message_count,

    (
      select round(avg(message.latency_ms), 2)
      from public.rag_chat_messages message
      where message.session_id = session.id
        and message.latency_ms is not null
    ) as avg_latency_ms,

    session.created_at,
    session.updated_at

  from public.rag_chat_sessions session
  left join public.profiles profile
    on profile.id = session.user_id
  left join auth.users auth_user
    on auth_user.id = session.user_id
  where public.is_admin((select auth.uid()))
    and (
      coalesce(trim(p_query), '') = ''
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
      or session.id::text ilike '%' || trim(p_query) || '%'
      or session.user_id::text ilike '%' || trim(p_query) || '%'
    )
    and (
      p_context_mode = 'all'
      or session.context_mode::text = p_context_mode
    )
  order by session.updated_at desc nulls last, session.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all
on function public.admin_search_rag_chat_sessions(text, text, integer, integer)
from public;

grant execute
on function public.admin_search_rag_chat_sessions(text, text, integer, integer)
to authenticated;


-- ============================================================
-- 3. Admin RAG session detail
-- ============================================================

create or replace function public.admin_get_rag_chat_session_detail(
  p_session_id uuid
)
returns table (
  session_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  context_mode text,
  selected_document_ids uuid[],
  selected_document_count integer,
  top_k integer,
  prompt_variant text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    session.id as session_id,
    session.user_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as user_name,
    auth_user.email::text as user_email,
    session.context_mode::text,
    session.selected_document_ids,
    coalesce(array_length(session.selected_document_ids, 1), 0)::integer as selected_document_count,
    session.top_k,
    session.prompt_variant::text,
    session.created_at,
    session.updated_at
  from public.rag_chat_sessions session
  left join public.profiles profile
    on profile.id = session.user_id
  left join auth.users auth_user
    on auth_user.id = session.user_id
  where public.is_admin((select auth.uid()))
    and session.id = p_session_id
  limit 1;
$$;

revoke all
on function public.admin_get_rag_chat_session_detail(uuid)
from public;

grant execute
on function public.admin_get_rag_chat_session_detail(uuid)
to authenticated;


-- ============================================================
-- 4. Admin RAG messages for a session
-- Return retrieved_context as sources alias for frontend compatibility.
-- ============================================================

create or replace function public.admin_get_rag_chat_messages(
  p_session_id uuid,
  p_limit integer default 100
)
returns table (
  message_id uuid,
  session_id uuid,
  user_id uuid,
  role text,
  content text,
  context_mode text,
  selected_document_ids uuid[],
  top_k integer,
  prompt_variant text,
  sources jsonb,
  source_count integer,
  latency_ms integer,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    message.id as message_id,
    message.session_id,
    message.user_id,
    message.role::text,
    message.content,
    message.context_mode::text,
    message.selected_document_ids,
    message.top_k,
    message.prompt_variant::text,
    message.retrieved_context as sources,
    case
      when message.retrieved_context is null then 0
      when jsonb_typeof(message.retrieved_context) <> 'array' then 0
      else jsonb_array_length(message.retrieved_context)
    end as source_count,
    message.latency_ms,
    message.created_at
  from public.rag_chat_messages message
  where public.is_admin((select auth.uid()))
    and message.session_id = p_session_id
  order by message.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all
on function public.admin_get_rag_chat_messages(uuid, integer)
from public;

grant execute
on function public.admin_get_rag_chat_messages(uuid, integer)
to authenticated;


-- ============================================================
-- 5. Admin recent problematic RAG answers
-- Document RAG assistant answers with no retrieved context.
-- ============================================================

create or replace function public.admin_get_rag_empty_source_answers(
  p_limit integer default 50
)
returns table (
  message_id uuid,
  session_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  content text,
  context_mode text,
  top_k integer,
  prompt_variant text,
  latency_ms integer,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    message.id as message_id,
    message.session_id,
    message.user_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as user_name,
    auth_user.email::text as user_email,
    message.content,
    message.context_mode::text,
    message.top_k,
    message.prompt_variant::text,
    message.latency_ms,
    message.created_at
  from public.rag_chat_messages message
  left join public.profiles profile
    on profile.id = message.user_id
  left join auth.users auth_user
    on auth_user.id = message.user_id
  where public.is_admin((select auth.uid()))
    and message.role::text = 'assistant'
    and message.context_mode::text = 'document_rag'
    and (
      message.retrieved_context is null
      or jsonb_typeof(message.retrieved_context) <> 'array'
      or jsonb_array_length(message.retrieved_context) = 0
    )
  order by message.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all
on function public.admin_get_rag_empty_source_answers(integer)
from public;

grant execute
on function public.admin_get_rag_empty_source_answers(integer)
to authenticated;

commit;