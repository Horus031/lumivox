begin;

-- ============================================================
-- 1. Admin document list/search
-- ============================================================

create or replace function public.admin_search_learning_documents(
  p_query text default '',
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  document_id uuid,
  owner_id uuid,
  owner_name text,
  owner_email text,

  file_name text,
  file_path text,
  mime_type text,
  file_size_bytes bigint,
  visibility text,
  extracted_text_status text,
  extracted_text_preview text,

  goal_id uuid,
  task_id uuid,

  chunk_count integer,
  embedded_chunk_count integer,

  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    doc.id as document_id,
    doc.owner_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,

    doc.file_name,
    doc.file_path,
    doc.mime_type,
    doc.file_size_bytes,
    doc.visibility::text,
    doc.extracted_text_status,
    doc.extracted_text_preview,

    doc.goal_id,
    doc.task_id,

    (
      select count(*)::integer
      from public.document_chunks chunk
      where chunk.document_id = doc.id
    ) as chunk_count,

    (
      select count(*)::integer
      from public.document_chunks chunk
      where chunk.document_id = doc.id
        and chunk.status::text = 'embedded'
        and chunk.embedding is not null
    ) as embedded_chunk_count,

    doc.created_at,
    doc.updated_at

  from public.learning_documents doc
  left join public.profiles profile
    on profile.id = doc.owner_id
  left join auth.users auth_user
    on auth_user.id = doc.owner_id
  where public.is_admin((select auth.uid()))
    and (
      coalesce(trim(p_query), '') = ''
      or doc.file_name ilike '%' || trim(p_query) || '%'
      or doc.mime_type ilike '%' || trim(p_query) || '%'
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
      or doc.id::text ilike '%' || trim(p_query) || '%'
    )
    and (
      p_status = 'all'
      or doc.extracted_text_status = p_status
    )
  order by doc.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all
on function public.admin_search_learning_documents(text, text, integer, integer)
from public;

grant execute
on function public.admin_search_learning_documents(text, text, integer, integer)
to authenticated;


-- ============================================================
-- 2. Admin document detail
-- ============================================================

create or replace function public.admin_get_learning_document_detail(
  p_document_id uuid
)
returns table (
  document_id uuid,
  owner_id uuid,
  owner_name text,
  owner_email text,

  file_name text,
  file_path text,
  mime_type text,
  file_size_bytes bigint,
  visibility text,
  extracted_text_status text,
  extracted_text_preview text,

  goal_id uuid,
  task_id uuid,

  chunk_count integer,
  embedded_chunk_count integer,
  failed_chunk_count integer,

  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    doc.id as document_id,
    doc.owner_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,

    doc.file_name,
    doc.file_path,
    doc.mime_type,
    doc.file_size_bytes,
    doc.visibility::text,
    doc.extracted_text_status,
    doc.extracted_text_preview,

    doc.goal_id,
    doc.task_id,

    (
      select count(*)::integer
      from public.document_chunks chunk
      where chunk.document_id = doc.id
    ) as chunk_count,

    (
      select count(*)::integer
      from public.document_chunks chunk
      where chunk.document_id = doc.id
        and chunk.status::text = 'embedded'
        and chunk.embedding is not null
    ) as embedded_chunk_count,

    (
      select count(*)::integer
      from public.document_chunks chunk
      where chunk.document_id = doc.id
        and chunk.status::text = 'failed'
    ) as failed_chunk_count,

    doc.created_at,
    doc.updated_at

  from public.learning_documents doc
  left join public.profiles profile
    on profile.id = doc.owner_id
  left join auth.users auth_user
    on auth_user.id = doc.owner_id
  where public.is_admin((select auth.uid()))
    and doc.id = p_document_id
  limit 1;
$$;

revoke all
on function public.admin_get_learning_document_detail(uuid)
from public;

grant execute
on function public.admin_get_learning_document_detail(uuid)
to authenticated;


-- ============================================================
-- 3. Admin document chunks
-- ============================================================

create or replace function public.admin_get_document_chunks(
  p_document_id uuid,
  p_limit integer default 50
)
returns table (
  chunk_id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  content_char_count integer,
  token_estimate integer,
  embedding_model text,
  status text,
  has_embedding boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    chunk.id as chunk_id,
    chunk.document_id,
    chunk.chunk_index,
    chunk.content,
    chunk.content_char_count,
    chunk.token_estimate,
    chunk.embedding_model,
    chunk.status::text,
    chunk.embedding is not null as has_embedding,
    chunk.created_at,
    chunk.updated_at
  from public.document_chunks chunk
  where public.is_admin((select auth.uid()))
    and chunk.document_id = p_document_id
  order by chunk.chunk_index asc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all
on function public.admin_get_document_chunks(uuid, integer)
from public;

grant execute
on function public.admin_get_document_chunks(uuid, integer)
to authenticated;


-- ============================================================
-- 4. Admin delete document metadata + chunks
-- Note: storage object deletion should be handled in app action.
-- ============================================================

create or replace function public.admin_delete_learning_document(
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can delete learning documents.';
  end if;

  delete from public.document_chunks
  where document_id = p_document_id;

  delete from public.learning_document_permissions
  where document_id = p_document_id;

  delete from public.learning_documents
  where id = p_document_id;

  if not found then
    raise exception 'Document not found.';
  end if;
end;
$$;

revoke all
on function public.admin_delete_learning_document(uuid)
from public;

grant execute
on function public.admin_delete_learning_document(uuid)
to authenticated;

commit;