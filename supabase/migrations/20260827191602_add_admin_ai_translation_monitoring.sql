begin;

-- ============================================================
-- 1. Admin search AI content translations
-- ============================================================

create or replace function public.admin_search_ai_content_translations(
  p_query text default '',
  p_target_locale text default 'all',
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  translation_id uuid,
  owner_id uuid,
  owner_name text,
  owner_email text,

  entity_type text,
  entity_id uuid,
  field_name text,

  source_locale text,
  target_locale text,
  source_hash text,
  translated_text text,

  provider text,
  model_name text,
  status text,
  error_message text,

  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    translation.id as translation_id,
    translation.owner_id,
    coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.full_name), ''),
      'User ' || left(profile.id::text, 8)
    ) as owner_name,
    auth_user.email::text as owner_email,

    translation.entity_type,
    translation.entity_id,
    translation.field_name,

    translation.source_locale,
    translation.target_locale,
    translation.source_hash,
    translation.translated_text,

    translation.provider,
    translation.model_name,
    translation.status::text,
    translation.error_message,

    translation.created_at,
    translation.updated_at

  from public.ai_content_translations translation
  left join public.profiles profile
    on profile.id = translation.owner_id
  left join auth.users auth_user
    on auth_user.id = translation.owner_id
  where public.is_admin((select auth.uid()))
    and (
      coalesce(trim(p_query), '') = ''
      or translation.entity_type ilike '%' || trim(p_query) || '%'
      or translation.field_name ilike '%' || trim(p_query) || '%'
      or translation.translated_text ilike '%' || trim(p_query) || '%'
      or translation.entity_id::text ilike '%' || trim(p_query) || '%'
      or translation.owner_id::text ilike '%' || trim(p_query) || '%'
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or auth_user.email ilike '%' || trim(p_query) || '%'
    )
    and (
      p_target_locale = 'all'
      or translation.target_locale = p_target_locale
    )
    and (
      p_status = 'all'
      or translation.status::text = p_status
    )
  order by translation.updated_at desc, translation.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke all
on function public.admin_search_ai_content_translations(text, text, text, integer, integer)
from public;

grant execute
on function public.admin_search_ai_content_translations(text, text, text, integer, integer)
to authenticated;


-- ============================================================
-- 2. Admin delete one cached translation
-- Used when admin wants the system to regenerate translation later.
-- ============================================================

create or replace function public.admin_delete_ai_content_translation(
  p_translation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can delete AI content translations.';
  end if;

  delete from public.ai_content_translations
  where id = p_translation_id;

  if not found then
    raise exception 'Translation cache item not found.';
  end if;
end;
$$;

revoke all
on function public.admin_delete_ai_content_translation(uuid)
from public;

grant execute
on function public.admin_delete_ai_content_translation(uuid)
to authenticated;


-- ============================================================
-- 3. Admin clear translations for one AI entity
-- Useful when original entity output was regenerated.
-- ============================================================

create or replace function public.admin_clear_ai_entity_translations(
  p_entity_type text,
  p_entity_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can clear AI entity translations.';
  end if;

  delete from public.ai_content_translations
  where entity_type = p_entity_type
    and entity_id = p_entity_id;

  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

revoke all
on function public.admin_clear_ai_entity_translations(text, uuid)
from public;

grant execute
on function public.admin_clear_ai_entity_translations(text, uuid)
to authenticated;

commit;