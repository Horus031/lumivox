begin;

-- ============================================================
-- 1. CMS Settings table
-- Stores platform-level configurable feature flags/settings.
-- ============================================================

create table if not exists public.cms_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.cms_settings enable row level security;


-- ============================================================
-- 2. RLS
-- Admins can view/update CMS settings.
-- ============================================================

drop policy if exists "Admins can view CMS settings"
on public.cms_settings;

create policy "Admins can view CMS settings"
on public.cms_settings
for select
to authenticated
using (
  public.is_admin((select auth.uid()))
);

drop policy if exists "Admins can insert CMS settings"
on public.cms_settings;

create policy "Admins can insert CMS settings"
on public.cms_settings
for insert
to authenticated
with check (
  public.is_admin((select auth.uid()))
);

drop policy if exists "Admins can update CMS settings"
on public.cms_settings;

create policy "Admins can update CMS settings"
on public.cms_settings
for update
to authenticated
using (
  public.is_admin((select auth.uid()))
)
with check (
  public.is_admin((select auth.uid()))
);


-- ============================================================
-- 3. Default settings
-- ============================================================

insert into public.cms_settings (key, value, description)
values
  (
    'global_leaderboard_enabled',
    'true'::jsonb,
    'Enable or disable the public global leaderboard.'
  ),
  (
    'group_leaderboard_enabled',
    'true'::jsonb,
    'Enable or disable study group leaderboards.'
  ),
  (
    'default_rag_top_k',
    '5'::jsonb,
    'Default number of chunks retrieved for document RAG.'
  ),
  (
    'default_rag_prompt_variant',
    '"grounded_rule"'::jsonb,
    'Default RAG prompt variant used by the Study Assistant.'
  ),
  (
    'weekly_challenge_default_focus_minutes',
    '300'::jsonb,
    'Default weekly focus target for group study challenges.'
  ),
  (
    'weekly_challenge_default_completed_tasks',
    '10'::jsonb,
    'Default weekly completed task target for group study challenges.'
  ),
  (
    'maintenance_mode_enabled',
    'false'::jsonb,
    'Enable or disable maintenance mode.'
  )
on conflict (key) do nothing;


-- ============================================================
-- 4. Public/admin safe settings getter
-- This can be used by the app to read feature flags.
-- It does not expose private data.
-- ============================================================

create or replace function public.get_cms_setting(
  p_key text
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select setting.value
  from public.cms_settings setting
  where setting.key = p_key
  limit 1;
$$;

revoke all
on function public.get_cms_setting(text)
from public;

grant execute
on function public.get_cms_setting(text)
to authenticated;


-- ============================================================
-- 5. Admin list settings
-- ============================================================

create or replace function public.admin_get_cms_settings()
returns table (
  key text,
  value jsonb,
  description text,
  updated_by uuid,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    setting.key,
    setting.value,
    setting.description,
    setting.updated_by,
    setting.updated_at,
    setting.created_at
  from public.cms_settings setting
  where public.is_admin((select auth.uid()))
  order by setting.key asc;
$$;

revoke all
on function public.admin_get_cms_settings()
from public;

grant execute
on function public.admin_get_cms_settings()
to authenticated;


-- ============================================================
-- 6. Admin update setting
-- Validate allowed keys and values.
-- ============================================================

create or replace function public.admin_update_cms_setting(
  p_key text,
  p_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Only admins can update CMS settings.';
  end if;

  if p_key not in (
    'global_leaderboard_enabled',
    'group_leaderboard_enabled',
    'default_rag_top_k',
    'default_rag_prompt_variant',
    'weekly_challenge_default_focus_minutes',
    'weekly_challenge_default_completed_tasks',
    'maintenance_mode_enabled'
  ) then
    raise exception 'Invalid CMS setting key.';
  end if;

  if p_key in (
    'global_leaderboard_enabled',
    'group_leaderboard_enabled',
    'maintenance_mode_enabled'
  )
  and jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'This setting requires a boolean value.';
  end if;

  if p_key = 'default_rag_top_k'
  and (
    jsonb_typeof(p_value) <> 'number'
    or (p_value #>> '{}')::integer not in (3, 5, 7)
  ) then
    raise exception 'default_rag_top_k must be 3, 5, or 7.';
  end if;

  if p_key = 'default_rag_prompt_variant'
  and (
    jsonb_typeof(p_value) <> 'string'
    or p_value #>> '{}' not in ('grounded_rule', 'no_rule')
  ) then
    raise exception 'default_rag_prompt_variant must be grounded_rule or no_rule.';
  end if;

  if p_key in (
    'weekly_challenge_default_focus_minutes',
    'weekly_challenge_default_completed_tasks'
  )
  and (
    jsonb_typeof(p_value) <> 'number'
    or (p_value #>> '{}')::integer < 0
  ) then
    raise exception 'Weekly challenge defaults must be non-negative numbers.';
  end if;

  update public.cms_settings
  set
    value = p_value,
    updated_by = (select auth.uid()),
    updated_at = now()
  where key = p_key;

  if not found then
    raise exception 'CMS setting not found.';
  end if;
end;
$$;

revoke all
on function public.admin_update_cms_setting(text, jsonb)
from public;

grant execute
on function public.admin_update_cms_setting(text, jsonb)
to authenticated;

commit;