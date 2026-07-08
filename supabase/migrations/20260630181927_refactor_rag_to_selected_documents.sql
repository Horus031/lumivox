begin;

-- ============================================================
-- 1. ENUM: RAG context mode
-- ============================================================

do $$
begin
  create type public.rag_context_mode as enum (
    'general',
    'document_rag'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 2. Add context fields to chat sessions
-- ============================================================

alter table public.rag_chat_sessions
add column if not exists context_mode public.rag_context_mode not null default 'general';

alter table public.rag_chat_sessions
add column if not exists selected_document_ids uuid[] not null default '{}'::uuid[];

alter table public.rag_chat_sessions
add column if not exists top_k integer not null default 5
check (top_k in (3, 5, 7));


-- ============================================================
-- 3. Add context fields to chat messages
-- ============================================================

alter table public.rag_chat_messages
add column if not exists context_mode public.rag_context_mode not null default 'general';

alter table public.rag_chat_messages
add column if not exists selected_document_ids uuid[] not null default '{}'::uuid[];

alter table public.rag_chat_messages
add column if not exists top_k integer
check (top_k is null or top_k in (3, 5, 7));


-- ============================================================
-- 4. Drop old RPC signatures
-- ============================================================

drop function if exists public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  bigint,
  bigint
);

drop function if exists public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid,
  uuid
);

drop function if exists public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid,
  uuid,
  uuid
);


-- ============================================================
-- 5. New selected-document RPC
-- ============================================================

create or replace function public.match_learning_document_chunks(
  p_query_embedding extensions.vector(768),
  p_match_count integer default 5,
  p_document_ids uuid[] default null,
  p_user_id uuid default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  file_name text,
  chunk_index integer,
  content text,
  similarity double precision
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    chunk.id as chunk_id,
    chunk.document_id,
    doc.file_name,
    chunk.chunk_index,
    chunk.content,
    1 - (chunk.embedding OPERATOR(extensions.<=>) p_query_embedding) as similarity
  from public.document_chunks chunk
  join public.learning_documents doc
    on doc.id = chunk.document_id
  where chunk.embedding is not null
    and chunk.status = 'embedded'
    and p_user_id is not null
    and public.can_access_learning_document(doc.id, p_user_id)
    and (
      p_document_ids is null
      or chunk.document_id = any(p_document_ids)
    )
  order by chunk.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit greatest(1, least(p_match_count, 10));
$$;

revoke all
on function public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid
)
from public;

grant execute
on function public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid
)
to authenticated;

commit;