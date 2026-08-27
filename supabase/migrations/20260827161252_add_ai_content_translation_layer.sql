begin;

-- ============================================================
-- 1. AI content translation status
-- ============================================================

do $$
begin
  create type public.ai_translation_status as enum (
    'completed',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;


-- ============================================================
-- 2. Generic AI content translation cache
-- ============================================================

create table if not exists public.ai_content_translations (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null references auth.users(id) on delete cascade,

  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,

  source_locale text not null default 'auto',
  target_locale text not null,

  source_hash text not null,
  translated_text text not null,

  provider text,
  model_name text,
  status public.ai_translation_status not null default 'completed',
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_content_translations_target_locale_check
    check (target_locale in ('en', 'vi')),

  constraint ai_content_translations_source_locale_check
    check (source_locale in ('auto', 'en', 'vi'))
);

create unique index if not exists idx_ai_content_translations_unique_cache
on public.ai_content_translations (
  owner_id,
  entity_type,
  entity_id,
  field_name,
  target_locale,
  source_hash
);

create index if not exists idx_ai_content_translations_owner
on public.ai_content_translations(owner_id);

create index if not exists idx_ai_content_translations_entity
on public.ai_content_translations(entity_type, entity_id);

alter table public.ai_content_translations enable row level security;


-- ============================================================
-- 3. RLS
-- Users can read their own cached translations.
-- Service role can still insert/update through backend.
-- ============================================================

drop policy if exists "Users can view own AI translations"
on public.ai_content_translations;

create policy "Users can view own AI translations"
on public.ai_content_translations
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can insert own AI translations"
on public.ai_content_translations;

create policy "Users can insert own AI translations"
on public.ai_content_translations
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "Users can update own AI translations"
on public.ai_content_translations;

create policy "Users can update own AI translations"
on public.ai_content_translations
for update
to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
)
with check (
  owner_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);


-- ============================================================
-- 4. Optional metadata columns for RAG messages/sessions
-- These help identify the intended display/generation locale.
-- ============================================================

alter table public.rag_chat_sessions
add column if not exists preferred_locale text default 'auto';

alter table public.rag_chat_messages
add column if not exists content_locale text default 'auto';

alter table public.rag_chat_messages
add column if not exists preferred_locale text default 'auto';

alter table public.rag_chat_sessions
drop constraint if exists rag_chat_sessions_preferred_locale_check;

alter table public.rag_chat_sessions
add constraint rag_chat_sessions_preferred_locale_check
check (preferred_locale in ('auto', 'en', 'vi'));

alter table public.rag_chat_messages
drop constraint if exists rag_chat_messages_content_locale_check;

alter table public.rag_chat_messages
add constraint rag_chat_messages_content_locale_check
check (content_locale in ('auto', 'en', 'vi'));

alter table public.rag_chat_messages
drop constraint if exists rag_chat_messages_preferred_locale_check;

alter table public.rag_chat_messages
add constraint rag_chat_messages_preferred_locale_check
check (preferred_locale in ('auto', 'en', 'vi'));


-- ============================================================
-- 5. Admin monitoring RPC for translation cache
-- ============================================================

create or replace function public.admin_get_ai_translation_metrics()
returns table (
  total_translations integer,
  english_translations integer,
  vietnamese_translations integer,
  failed_translations integer,
  unique_entities integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    count(*)::integer as total_translations,
    count(*) filter (where target_locale = 'en')::integer as english_translations,
    count(*) filter (where target_locale = 'vi')::integer as vietnamese_translations,
    count(*) filter (where status::text = 'failed')::integer as failed_translations,
    count(distinct entity_type || ':' || entity_id::text)::integer as unique_entities
  from public.ai_content_translations
  where public.is_admin((select auth.uid()));
$$;

revoke all
on function public.admin_get_ai_translation_metrics()
from public;

grant execute
on function public.admin_get_ai_translation_metrics()
to authenticated;

commit;