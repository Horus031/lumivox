begin;

-- ============================================================
-- 1. Drop old bigint RPC signature
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


-- ============================================================
-- 2. Fix rag_chat_sessions foreign key column types
-- ============================================================

alter table public.rag_chat_sessions
drop constraint if exists rag_chat_sessions_goal_id_fkey;

alter table public.rag_chat_sessions
drop constraint if exists rag_chat_sessions_task_id_fkey;

alter table public.rag_chat_sessions
drop constraint if exists rag_chat_sessions_focus_session_id_fkey;

-- If old test rows exist with bigint values, they cannot be cast to UUID.
-- Since this is still RAG testing data, clear relationship columns before altering.
update public.rag_chat_sessions
set
  goal_id = null,
  task_id = null,
  focus_session_id = null;

alter table public.rag_chat_sessions
alter column goal_id type uuid
using null;

alter table public.rag_chat_sessions
alter column task_id type uuid
using null;

alter table public.rag_chat_sessions
alter column focus_session_id type uuid
using null;

alter table public.rag_chat_sessions
add constraint rag_chat_sessions_goal_id_fkey
foreign key (goal_id)
references public.goals(id)
on delete set null;

alter table public.rag_chat_sessions
add constraint rag_chat_sessions_task_id_fkey
foreign key (task_id)
references public.tasks(id)
on delete set null;

alter table public.rag_chat_sessions
add constraint rag_chat_sessions_focus_session_id_fkey
foreign key (focus_session_id)
references public.focus_sessions(id)
on delete set null;


-- ============================================================
-- 3. Recreate vector match RPC with UUID goal/task params
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

commit;