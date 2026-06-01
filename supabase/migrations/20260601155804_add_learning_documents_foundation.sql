begin;

-- ============================================================
-- 1. ENUMS
-- ============================================================

do $$
begin
  create type public.learning_document_visibility as enum (
    'private',
    'shared',
    'public'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.learning_document_permission_role as enum (
    'viewer',
    'editor'
  );
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 2. LEARNING DOCUMENTS
-- ============================================================

create table if not exists public.learning_documents (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null
    references public.profiles(id)
    on delete cascade,

  goal_id uuid
    references public.goals(id)
    on delete cascade,

  task_id uuid
    references public.tasks(id)
    on delete cascade,

  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null
    check (file_size_bytes > 0),

  visibility public.learning_document_visibility not null default 'private',

  extracted_text_status text not null default 'pending',
  extracted_text_preview text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learning_document_goal_or_task_required
    check (goal_id is not null or task_id is not null)
);

create index if not exists idx_learning_documents_owner_created
on public.learning_documents(owner_id, created_at desc);

create index if not exists idx_learning_documents_goal
on public.learning_documents(goal_id, created_at desc);

create index if not exists idx_learning_documents_task
on public.learning_documents(task_id, created_at desc);

create trigger set_learning_documents_updated_at
before update on public.learning_documents
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. DOCUMENT PERMISSIONS
-- ============================================================

create table if not exists public.learning_document_permissions (
  id uuid primary key default gen_random_uuid(),

  document_id uuid not null
    references public.learning_documents(id)
    on delete cascade,

  user_email text not null,
  role public.learning_document_permission_role not null default 'viewer',

  created_by uuid not null
    references public.profiles(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  constraint unique_document_permission_email
    unique (document_id, user_email)
);

create index if not exists idx_learning_document_permissions_document
on public.learning_document_permissions(document_id);

create index if not exists idx_learning_document_permissions_email
on public.learning_document_permissions(lower(user_email));


-- ============================================================
-- 4. ACCESS HELPER
-- ============================================================

create or replace function public.can_access_learning_document(
  p_document_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.learning_documents doc
    left join auth.users auth_user
      on auth_user.id = p_user_id
    where doc.id = p_document_id
      and (
        doc.owner_id = p_user_id
        or doc.visibility = 'public'
        or exists (
          select 1
          from public.learning_document_permissions perm
          where perm.document_id = doc.id
            and auth_user.email is not null
            and lower(perm.user_email) = lower(auth_user.email)
        )
      )
  );
$$;

revoke all
on function public.can_access_learning_document(uuid, uuid)
from public;

grant execute
on function public.can_access_learning_document(uuid, uuid)
to authenticated;


-- ============================================================
-- 5. RLS
-- ============================================================

alter table public.learning_documents enable row level security;
alter table public.learning_document_permissions enable row level security;

drop policy if exists "Users can view accessible learning documents"
on public.learning_documents;

create policy "Users can view accessible learning documents"
on public.learning_documents
for select
to authenticated
using (
  public.can_access_learning_document(id, (select auth.uid()))
);

drop policy if exists "Users can insert their own learning documents"
on public.learning_documents;

create policy "Users can insert their own learning documents"
on public.learning_documents
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
);

drop policy if exists "Owners can update their own learning documents"
on public.learning_documents;

create policy "Owners can update their own learning documents"
on public.learning_documents
for update
to authenticated
using (
  owner_id = (select auth.uid())
)
with check (
  owner_id = (select auth.uid())
);

drop policy if exists "Owners can delete their own learning documents"
on public.learning_documents;

create policy "Owners can delete their own learning documents"
on public.learning_documents
for delete
to authenticated
using (
  owner_id = (select auth.uid())
);


drop policy if exists "Owners can view permissions for their documents"
on public.learning_document_permissions;

create policy "Owners can view permissions for their documents"
on public.learning_document_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_documents doc
    where doc.id = document_id
      and doc.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can create permissions for their documents"
on public.learning_document_permissions;

create policy "Owners can create permissions for their documents"
on public.learning_document_permissions
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.learning_documents doc
    where doc.id = document_id
      and doc.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete permissions for their documents"
on public.learning_document_permissions;

create policy "Owners can delete permissions for their documents"
on public.learning_document_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.learning_documents doc
    where doc.id = document_id
      and doc.owner_id = (select auth.uid())
  )
);


-- ============================================================
-- 6. PRIVILEGES
-- ============================================================

grant select, insert, update, delete
on public.learning_documents
to authenticated;

grant select, insert, delete
on public.learning_document_permissions
to authenticated;

commit;