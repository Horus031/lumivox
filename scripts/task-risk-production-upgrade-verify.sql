-- Local-only: verify the committed baseline snapshots after incremental migration up.
\set ON_ERROR_STOP on
begin;
do $$ declare s record; actual jsonb;
begin
 if current_setting('app.rehearsal_target',true) is distinct from 'lumivox-risk9-upgrade' or inet_server_addr() is not null
 then raise exception 'Only the named local Unix-socket rehearsal is allowed'; end if;
 if (select count(*) from supabase_migrations.schema_migrations) <> 99 then
  raise exception 'Expected 99 applied migrations';
 end if;
 for s in select * from rehearsal_guard.snapshots loop
  execute s.query into actual;
  if actual is distinct from s.rows then raise exception 'Pre-existing data changed in table %',s.table_name; end if;
 end loop;
 if not exists(select 1 from cron.job where jobname='task-risk-recovery-reconcile' and active and schedule='* * * * *')
 then raise exception 'Missing active recovery cron'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('native_task_risk_input_revisions','task_risk_recovery_attempts',
   'task_study_schedules','task_study_schedule_revisions','task_study_schedule_slots','task_study_sessions','task_study_session_events')
  and not c.relrowsecurity) then raise exception 'Missing RLS'; end if;
 if (select count(*) from pg_trigger where tgname in ('native_task_risk_revision_tasks','native_task_risk_revision_focus_sessions',
  'zz_capture_task_recovery_receipt','zz_capture_legacy_focus_recovery_receipt') and not tgisinternal and tgenabled='O') <> 4
 then raise exception 'Recovery/input revision trigger inventory mismatch'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('start_verified_task_risk_recovery','complete_verified_task_risk_recovery',
   'reconcile_task_risk_recovery','reserve_task_risk_reassessment','claim_task_risk_reassessment','pair_task_risk_reassessment',
   'create_recovery_focus_v2')
   and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')
    or not has_function_privilege('service_role',p.oid,'EXECUTE')))
 then raise exception 'Worker RPC grant mismatch'; end if;
end $$;
select jsonb_build_object('migrations',99,'preserved_tables',count(*),'preserved_rows',sum(jsonb_array_length(rows)))
from rehearsal_guard.snapshots;
-- Exercise new invalidation triggers on old rows, within this rolled-back transaction.
create temp table before_revision as select coalesce((select revision from public.native_task_risk_input_revisions
 where user_id='90000000-0000-4000-8000-000000000001'),0) revision;
update public.tasks set title=title||' (trigger probe)' where id='90000000-0000-4000-8000-000000000011';
do $$ begin
 if (select revision from public.native_task_risk_input_revisions where user_id='90000000-0000-4000-8000-000000000001')
 <= (select revision from before_revision) then raise exception 'Old Task did not bump input revision'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.tasks where user_id='90000000-0000-4000-8000-000000000001')
 then raise exception 'Cross-owner Task read leak after upgrade'; end if;
 if (select count(*) from public.tasks where user_id='90000000-0000-4000-8000-000000000002') <> 1
 then raise exception 'Owner Task read regression after upgrade'; end if;
end $$;
reset role;
rollback;
