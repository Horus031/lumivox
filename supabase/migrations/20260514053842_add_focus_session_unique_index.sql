begin;

-- ============================================================
-- Create unique index for one active session per user
-- (runs in separate transaction after enum is committed)
-- ============================================================
create unique index if not exists unique_active_focus_session_per_user on public.focus_sessions (user_id)
where
    status in ('ongoing', 'paused');

commit;