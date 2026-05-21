begin;

-- ============================================================
-- 1. Add paused status to focus_session_status enum
-- ============================================================
alter type public.focus_session_status add value if not exists 'paused' after 'ongoing';

-- ============================================================
-- 2. Add pause tracking columns
-- ============================================================
alter table public.focus_sessions
add column if not exists paused_at timestamptz,
add column if not exists total_paused_seconds integer not null default 0;

alter table public.focus_sessions add constraint focus_sessions_total_paused_seconds_non_negative check (total_paused_seconds >= 0);

commit;