begin read only;
set local statement_timeout = '8s';
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
rollback;
