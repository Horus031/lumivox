-- ============================================================
-- 6. VECTOR MATCH RPC
-- ============================================================

create or replace function public.match_learning_document_chunks(
  p_query_embedding extensions.vector(768),
  p_match_count integer default 5,
  p_document_ids uuid[] default null,
  p_goal_id uuid default null,
  p_task_id uuid default null
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
    and public.can_access_learning_document(doc.id, (select auth.uid()))
    and (
      p_document_ids is null
      or chunk.document_id = any(p_document_ids)
    )
    and (
      p_goal_id is null
      or doc.goal_id = p_goal_id
    )
    and (
      p_task_id is null
      or doc.task_id = p_task_id
    )
  order by chunk.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit greatest(1, least(p_match_count, 10));
$$;

revoke all
on function public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid,
  uuid
)
from public;

grant execute
on function public.match_learning_document_chunks(
  extensions.vector(768),
  integer,
  uuid[],
  uuid,
  uuid
)
to authenticated;