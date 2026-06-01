begin;

-- Extract document UUID from storage path:
-- {ownerId}/goals/{goalId}/{documentId}-{filename}
create or replace function public.extract_learning_document_id_from_storage_path(
  p_object_name text
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_file_name text;
  v_uuid_text text;
begin
  v_file_name := split_part(p_object_name, '/', 4);

  if v_file_name is null or v_file_name = '' then
    return null;
  end if;

  v_uuid_text := substring(
    v_file_name
    from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  );

  if v_uuid_text is null or v_uuid_text = '' then
    return null;
  end if;

  return v_uuid_text::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all
on function public.extract_learning_document_id_from_storage_path(text)
from public;

grant execute
on function public.extract_learning_document_id_from_storage_path(text)
to authenticated;


-- Check whether the current authenticated user can access
-- a storage object that belongs to a learning document.
create or replace function public.can_access_learning_document_storage_object(
  p_object_name text,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.can_access_learning_document(
    public.extract_learning_document_id_from_storage_path(p_object_name),
    p_user_id
  );
$$;

revoke all
on function public.can_access_learning_document_storage_object(text, uuid)
from public;

grant execute
on function public.can_access_learning_document_storage_object(text, uuid)
to authenticated;

commit;

drop policy if exists "Users can read accessible shared learning documents"
on storage.objects;

create policy "Users can read accessible shared learning documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'learning-documents'
  and public.can_access_learning_document_storage_object(
    name,
    (select auth.uid())
  )
);