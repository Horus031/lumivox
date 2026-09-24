-- Enable Supabase Cron / pg_cron for fresh local, staging,
-- and production environments.
create extension if not exists pg_cron;

-- cron.schedule is idempotent by job name in pg_cron/Supabase Cron:
-- scheduling the same job name updates the existing job.
select cron.schedule(
  'lumivox-expire-frozen-streaks-hourly',
  '0 * * * *',
  $$select public.evaluate_engagement_streak_states();$$
);