begin;

alter function public.set_updated_at() set search_path = '';

create table public.rag_document_processing_jobs (
  document_id uuid primary key references public.learning_documents(id) on delete cascade,
  operation_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  document_updated_at timestamptz not null
);
alter table public.rag_document_processing_jobs enable row level security;
revoke all on table public.rag_document_processing_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.rag_document_processing_jobs to service_role;

create function public.rag_begin_document_processing(
  p_document_id uuid, p_user_id uuid, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_document public.learning_documents%rowtype;
begin
  select * into v_document from public.learning_documents
    where id = p_document_id and owner_id = p_user_id for update;
  if not found or public.can_access_learning_document(p_document_id, p_user_id) is not true then
    raise exception 'RAG_DOCUMENT_ACCESS_DENIED';
  end if;

  update public.learning_documents set extracted_text_status = 'processing'
    where id = p_document_id returning * into v_document;
  insert into public.rag_document_processing_jobs (document_id, operation_id, owner_id, document_updated_at)
    values (p_document_id, p_operation_id, p_user_id, v_document.updated_at)
    on conflict (document_id) do update set operation_id = excluded.operation_id,
      owner_id = excluded.owner_id, document_updated_at = excluded.document_updated_at;
  return jsonb_build_object('id', v_document.id, 'owner_id', v_document.owner_id,
    'file_name', v_document.file_name, 'file_path', v_document.file_path, 'mime_type', v_document.mime_type);
end;
$$;

create function public.rag_assert_document_processing(
  p_document_id uuid, p_user_id uuid, p_operation_id uuid
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_document public.learning_documents%rowtype;
begin
  -- Keep the document lock through finalization when called inside its transaction.
  select * into v_document from public.learning_documents
    where id = p_document_id and owner_id = p_user_id for update;
  if not found or public.can_access_learning_document(p_document_id, p_user_id) is not true then
    raise exception 'RAG_DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.extracted_text_status <> 'processing' or not exists (
    select 1 from public.rag_document_processing_jobs j
    where j.document_id = p_document_id and j.owner_id = p_user_id
      and j.operation_id = p_operation_id and j.document_updated_at = v_document.updated_at
  ) then
    raise exception 'RAG_DOCUMENT_PROCESSING_STALE';
  end if;
  return true;
end;
$$;

create function public.rag_finish_document_processing(
  p_document_id uuid, p_user_id uuid, p_operation_id uuid,
  p_status text, p_preview text, p_chunks jsonb
) returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  perform public.rag_assert_document_processing(p_document_id, p_user_id, p_operation_id);
  if p_status = 'completed' then
    if jsonb_typeof(p_chunks) is distinct from 'array' or jsonb_array_length(p_chunks) = 0 then
      raise exception 'RAG_INVALID_REQUEST';
    end if;
    delete from public.document_chunks where document_id = p_document_id;
    insert into public.document_chunks (document_id, owner_id, chunk_index, content, content_char_count,
      token_estimate, embedding, embedding_model, status, metadata)
    select p_document_id, p_user_id, c.chunk_index, c.content, char_length(c.content),
      c.token_estimate, c.embedding::extensions.vector(768), c.embedding_model, 'embedded', c.metadata
    from jsonb_to_recordset(p_chunks) as c(chunk_index integer, content text, token_estimate integer,
      embedding text, embedding_model text, metadata jsonb);
    get diagnostics v_count = row_count;
  elsif p_status is null or p_status not in ('failed', 'unsupported') then
    raise exception 'RAG_INVALID_REQUEST';
  end if;

  update public.learning_documents
    set extracted_text_status = p_status,
      extracted_text_preview = coalesce(left(p_preview, 1200), extracted_text_preview)
    where id = p_document_id;
  delete from public.rag_document_processing_jobs where document_id = p_document_id;
  return v_count;
end;
$$;

create function public.rag_assert_legacy_dispatch(
  p_user_id uuid, p_session_id uuid, p_focus_session_id uuid, p_document_ids uuid[]
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_focus uuid;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'RAG_SESSION_NOT_FOUND';
  end if;
  if p_session_id is not null then
    select focus_session_id into v_focus from public.rag_chat_sessions
      where id = p_session_id and user_id = p_user_id and conversation_version = 1;
    if not found then raise exception 'RAG_SESSION_NOT_FOUND'; end if;
  end if;
  perform public.rag_v2_validate_scope(p_user_id, v_focus, p_document_ids);
  if p_focus_session_id is not null and p_focus_session_id is distinct from v_focus then
    perform public.rag_v2_validate_scope(p_user_id, p_focus_session_id, '{}'::uuid[]);
  end if;
  return true;
end;
$$;

revoke all on function public.rag_begin_document_processing(uuid, uuid, uuid),
  public.rag_assert_document_processing(uuid, uuid, uuid),
  public.rag_finish_document_processing(uuid, uuid, uuid, text, text, jsonb),
  public.rag_assert_legacy_dispatch(uuid, uuid, uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.rag_begin_document_processing(uuid, uuid, uuid),
  public.rag_assert_document_processing(uuid, uuid, uuid),
  public.rag_finish_document_processing(uuid, uuid, uuid, text, text, jsonb),
  public.rag_assert_legacy_dispatch(uuid, uuid, uuid, uuid[])
to service_role;

commit;
