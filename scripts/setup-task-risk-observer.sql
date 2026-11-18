-- Operational observer setup: run as postgres on reviewed STAGING only.
-- No password is embedded. The owner sets it separately using psql \password.
-- This is not a production migration and must not be auto-applied to Production.
begin;
set local search_path = pg_catalog;
do $$ begin
 if current_user <> 'postgres' or not (select rolbypassrls from pg_roles where rolname=current_user) then
  raise exception 'Run as the reviewed postgres owner with RLS visibility';
 end if;
 if to_regclass('public.task_risk_recovery_attempts') is null
   or to_regclass('task_risk_private.reassessments') is null
   or to_regclass('cron.job_run_details') is null then
  raise exception 'Compatible Recovery schema and pg_cron are required';
 end if;
 if exists(select 1 from pg_roles where rolname='task_risk_observer') then
  raise exception 'Observer already exists; inspect it before changing grants or credentials';
 end if;
end $$;
create role task_risk_observer login
 nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication connection limit 3;
-- Allow the existing owner to test the less-privileged role (PostgreSQL 17 SET membership).
grant task_risk_observer to postgres with set true;
alter role task_risk_observer set default_transaction_read_only = on;
alter role task_risk_observer set statement_timeout = '8s';
alter role task_risk_observer set search_path = pg_catalog;
create schema task_risk_monitor authorization postgres;
revoke all on schema task_risk_monitor from public,anon,authenticated;
create view task_risk_monitor.health_snapshot (snapshot)
 with (security_barrier=true,security_invoker=false)
as
with config as (
  select jobid,active from cron.job where jobname='task-risk-recovery-reconcile'
), cron_metrics as (
  select coalesce((select active from config),false) as active,
    max(start_time) filter (where status='succeeded') as last_success_at,
    count(*) filter (where status='failed') as failures_15m
  from cron.job_run_details
  where jobid=(select jobid from config) and start_time >= now()-interval '15 minutes'
), receipt_metrics as (
  select count(*) as pending,
    count(*) filter (where r.recorded_at < now()-interval '3 minutes') as older_than_3m,
    max(round(extract(epoch from now()-r.recorded_at))) as oldest_seconds
  from public.task_risk_recovery_attempts a
  join task_risk_private.receipts r on r.attempt_id=a.id
  where a.status='initiated' and a.receipt_recorded_at is not null
), reassessment_metrics as (
  select count(*) filter (where j.started_at < now()-interval '10 minutes' and j.finished_at is null) as claimed_older_than_10m,
    count(*) filter (where j.finished_at >= now()-interval '15 minutes'
      and (p.id is null or p.prediction_metadata->>'prediction_mode' is distinct from 'native_ml')) as finished_without_native_result_15m,
    count(*) filter (where j.finished_at >= now()-interval '15 minutes' and p.id is not null
      and p.prediction_metadata->>'prediction_mode'='native_ml' and a.reassessment_prediction_id is null) as persisted_unpaired_15m
  from task_risk_private.reassessments j
  join public.task_risk_recovery_attempts a on a.id=j.attempt_id
  left join public.deadline_risk_predictions p
    on (p.id,p.user_id,p.task_id)=(j.request_id,j.user_id,j.task_id)
  where j.finished_at is null or j.finished_at >= now()-interval '15 minutes'
)
select jsonb_build_object(
  'checked_at',now(),
  'cron',to_jsonb(c),
  'receipts',to_jsonb(r),
  'reassessments',to_jsonb(m),
  'alerts',to_jsonb(array_remove(array[
    case when not c.active then 'cron_inactive' end,
    case when c.last_success_at is null or c.last_success_at < now()-interval '3 minutes' then 'cron_no_recent_success' end,
    case when c.failures_15m > 0 then 'cron_failure' end,
    case when r.older_than_3m > 0 then 'receipt_backlog' end,
    case when m.claimed_older_than_10m > 0 then 'worker_claim_overdue' end,
    case when m.finished_without_native_result_15m >= 3 then 'reassessment_result_missing' end
  ],null))
)
from cron_metrics c cross join receipt_metrics r cross join reassessment_metrics m;
alter view task_risk_monitor.health_snapshot owner to postgres;
revoke all on task_risk_monitor.health_snapshot from public,anon,authenticated;
grant usage on schema task_risk_monitor to task_risk_observer;
grant select on task_risk_monitor.health_snapshot to task_risk_observer;
comment on view task_risk_monitor.health_snapshot is
 'Owner-context operational aggregate only; no raw rows, credentials or input arguments exposed.';
commit;
