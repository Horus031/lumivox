begin;

alter table public.pbi_snapshots
add column if not exists explanation_payload jsonb not null default '{}'::jsonb;

commit;