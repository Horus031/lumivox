begin;

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

create extension if not exists vector with schema extensions;


-- ============================================================
-- 2. ENUMS
-- ============================================================

do $$
begin
  create type public.rag_prompt_variant as enum (
    'no_rule',
    'grounded_rule'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.rag_message_role as enum (
    'user',
    'assistant',
    'system'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.document_chunk_status as enum (
    'pending',
    'embedded',
    'failed'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 3. DOCUMENT CHUNKS
-- ============================================================

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),

  document_id uuid not null
    references public.learning_documents(id)
    on delete cascade,

  owner_id uuid not null
    references public.profiles(id)
    on delete cascade,

  chunk_index integer not null
    check (chunk_index >= 0),

  content text not null,
  content_char_count integer not null
    check (content_char_count > 0),

  token_estimate integer not null default 0
    check (token_estimate >= 0),

  embedding extensions.vector(768),

  embedding_model text,
  status public.document_chunk_status not null default 'pending',

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_document_chunk_index
    unique (document_id, chunk_index)
);

create index if not exists idx_document_chunks_document
on public.document_chunks(document_id, chunk_index);

create index if not exists idx_document_chunks_owner
on public.document_chunks(owner_id, created_at desc);

-- Vector index.
-- ivfflat works after enough rows exist; for small datasets, sequential scan is also fine.
create index if not exists idx_document_chunks_embedding_ivfflat
on public.document_chunks
using ivfflat (embedding extensions.vector_cosine_ops)
with (lists = 100)
where embedding is not null;

create trigger set_document_chunks_updated_at
before update on public.document_chunks
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. RAG CHAT SESSIONS
-- ============================================================

create table if not exists public.rag_chat_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  goal_id uuid
    references public.goals(id)
    on delete set null,

  task_id uuid
    references public.tasks(id)
    on delete set null,

  focus_session_id uuid
    references public.focus_sessions(id)
    on delete set null,

  title text,
  prompt_variant public.rag_prompt_variant not null default 'grounded_rule',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rag_chat_sessions_user_created
on public.rag_chat_sessions(user_id, created_at desc);

create index if not exists idx_rag_chat_sessions_focus
on public.rag_chat_sessions(focus_session_id);

create trigger set_rag_chat_sessions_updated_at
before update on public.rag_chat_sessions
for each row
execute function public.set_updated_at();


-- ============================================================
-- 5. RAG CHAT MESSAGES
-- ============================================================

create table if not exists public.rag_chat_messages (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.rag_chat_sessions(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  role public.rag_message_role not null,

  content text not null,

  prompt_variant public.rag_prompt_variant,
  retrieved_chunk_ids uuid[] not null default '{}'::uuid[],
  retrieved_context jsonb not null default '[]'::jsonb,

  model_name text,
  latency_ms integer,

  created_at timestamptz not null default now()
);

create index if not exists idx_rag_chat_messages_session_created
on public.rag_chat_messages(session_id, created_at asc);

create index if not exists idx_rag_chat_messages_user_created
on public.rag_chat_messages(user_id, created_at desc);

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


-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.document_chunks enable row level security;
alter table public.rag_chat_sessions enable row level security;
alter table public.rag_chat_messages enable row level security;


-- ----------------------------
-- document_chunks RLS
-- ----------------------------

drop policy if exists "Users can view chunks for accessible documents"
on public.document_chunks;

create policy "Users can view chunks for accessible documents"
on public.document_chunks
for select
to authenticated
using (
  public.can_access_learning_document(document_id, (select auth.uid()))
);

drop policy if exists "Owners can insert chunks for own documents"
on public.document_chunks;

create policy "Owners can insert chunks for own documents"
on public.document_chunks
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.learning_documents doc
    where doc.id = document_id
      and doc.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update chunks for own documents"
on public.document_chunks;

create policy "Owners can update chunks for own documents"
on public.document_chunks
for update
to authenticated
using (
  owner_id = (select auth.uid())
)
with check (
  owner_id = (select auth.uid())
);

drop policy if exists "Owners can delete chunks for own documents"
on public.document_chunks;

create policy "Owners can delete chunks for own documents"
on public.document_chunks
for delete
to authenticated
using (
  owner_id = (select auth.uid())
);


-- ----------------------------
-- rag_chat_sessions RLS
-- ----------------------------

drop policy if exists "Users can manage their own rag chat sessions"
on public.rag_chat_sessions;

create policy "Users can manage their own rag chat sessions"
on public.rag_chat_sessions
for all
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);


-- ----------------------------
-- rag_chat_messages RLS
-- ----------------------------

drop policy if exists "Users can view messages from their rag sessions"
on public.rag_chat_messages;

create policy "Users can view messages from their rag sessions"
on public.rag_chat_messages
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.rag_chat_sessions session
    where session.id = session_id
      and session.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can insert messages into their rag sessions"
on public.rag_chat_messages;

create policy "Users can insert messages into their rag sessions"
on public.rag_chat_messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.rag_chat_sessions session
    where session.id = session_id
      and session.user_id = (select auth.uid())
  )
);


-- ============================================================
-- 8. PRIVILEGES
-- ============================================================

grant select, insert, update, delete
on public.document_chunks
to authenticated;

grant select, insert, update, delete
on public.rag_chat_sessions
to authenticated;

grant select, insert
on public.rag_chat_messages
to authenticated;

commit;