-- Run only on the disposable local rehearsal after setup-task-risk-observer.sql.
\set ON_ERROR_STOP on
begin isolation level repeatable read;
do $$ begin
 if current_setting('app.rehearsal_target',true) is distinct from 'lumivox-risk9-upgrade' or inet_server_addr() is not null
 then raise exception 'Local rehearsal only'; end if;
end $$;
insert into auth.users(id,email) values ('91000000-0000-4000-8000-000000000001','observer@example.invalid');
insert into public.profiles(id) values ('91000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.tasks(id,user_id,title,due_at) values
 ('91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000001','Observer fixture',now()+interval '1 day');
insert into public.ml_model_versions(id,model_key,version,algorithm,training_dataset,artifact_path) values
 ('91000000-0000-4000-8000-000000000021','observer-fixture','fixture','fixture','fixture','fixture');
insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload) values
 ('91000000-0000-4000-8000-000000000031','91000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000021','lumivox_native_features',0.7,true,'{}');
insert into public.task_risk_recovery_attempts(id,user_id,task_id,source_prediction_id,action_type,idempotency_key,original_due_at) values
 ('91000000-0000-4000-8000-000000000041','91000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000031','split_task',
 '91000000-0000-4000-8000-000000000041',now()+interval '1 day');
insert into task_risk_private.reassessments(user_id,task_id,attempt_id,reserved_at,started_at) values
 ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000011',
 '91000000-0000-4000-8000-000000000041',now()-interval '12 minutes',now()-interval '11 minutes');
create temp table admin_snapshot as select snapshot from task_risk_monitor.health_snapshot;
grant select on admin_snapshot to task_risk_observer;
set local role task_risk_observer;
do $$ declare v jsonb;
begin
 select snapshot into v from task_risk_monitor.health_snapshot;
 if v is distinct from (select snapshot from admin_snapshot) then raise exception 'Observer snapshot differs from owner'; end if;
 if v#>>'{cron,active}' <> 'true' then raise exception 'Observer cannot see postgres cron'; end if;
 if (v#>>'{reassessments,claimed_older_than_10m}')::int <> 1 then raise exception 'Observer missed protected backlog'; end if;
 if not v->'alerts' ? 'worker_claim_overdue' then raise exception 'Missing overdue alert'; end if;
 if exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb))
 then raise exception 'Observer has privileged attributes'; end if;
 if exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname=current_user))
 then raise exception 'Unexpected observer membership'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('start_verified_task_risk_recovery','complete_verified_task_risk_recovery','reconcile_task_risk_recovery',
   'reserve_task_risk_reassessment','claim_task_risk_reassessment','pair_task_risk_reassessment','create_recovery_focus_v2')
  and has_function_privilege(current_user,p.oid,'EXECUTE'))
 then raise exception 'Observer can execute a worker RPC'; end if;
 begin perform 1 from public.task_risk_recovery_attempts;
  raise exception 'Raw Recovery data accessible';
 exception when insufficient_privilege then null; end;
 begin perform 1 from task_risk_private.receipts;
  raise exception 'Private receipt data accessible';
 exception when insufficient_privilege then null; end;
 begin perform 1 from cron.job;
  raise exception 'Raw cron metadata accessible';
 exception when insufficient_privilege then null; end;
 begin insert into public.tasks default values;
  raise exception 'Observer can insert Task';
 exception when insufficient_privilege then null; end;
 begin update task_risk_monitor.health_snapshot set snapshot='{}';
  raise exception 'Observer can mutate snapshot';
 exception when insufficient_privilege or object_not_in_prerequisite_state then null; end;
 if has_schema_privilege('anon','task_risk_monitor','USAGE') or has_schema_privilege('authenticated','task_risk_monitor','USAGE')
 then raise exception 'Browser roles can reach monitor schema'; end if;
 raise notice 'PASS: 13 observer assertions: owner-equivalent aggregate, cron visibility, protected backlog/alert, role flags/membership, worker denial, three raw-read denials, two write denials, browser isolation';
end $$;
reset role;
rollback;
