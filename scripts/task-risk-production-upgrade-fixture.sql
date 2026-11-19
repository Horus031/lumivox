-- Local-only: run after exactly the first 70 migrations, before the 29-file upgrade.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_setting('app.rehearsal_target',true) is distinct from 'lumivox-risk9-upgrade' or inet_server_addr() is not null
  then raise exception 'Only the named local Unix-socket rehearsal is allowed'; end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 70 or
     (select max(version) from supabase_migrations.schema_migrations) <> '20261022062822'
  then raise exception 'Expected exact 70-migration rehearsal baseline'; end if;
end $$;
insert into auth.users(id,email) values
 ('90000000-0000-4000-8000-000000000001','upgrade-a@example.invalid'),
 ('90000000-0000-4000-8000-000000000002','upgrade-b@example.invalid');
insert into public.profiles(id,full_name,timezone) values
 ('90000000-0000-4000-8000-000000000001','Upgrade A','Asia/Ho_Chi_Minh'),
 ('90000000-0000-4000-8000-000000000002','Upgrade B','America/New_York')
on conflict (id) do update set full_name=excluded.full_name, timezone=excluded.timezone;
insert into public.goals(id,user_id,title,goal_type) values
 ('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000001','Preserve goal','short_term');
insert into public.tasks(id,user_id,goal_id,title,status,due_at,estimated_minutes)
select ('90000000-0000-4000-8000-0000000000'||n)::uuid,
 '90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000010',
 'Preserve '||status,status::public.task_status,now()+interval '14 days',60
from (values (11,'todo'),(12,'in_progress'),(13,'completed'),(14,'cancelled'),(15,'overdue'),(16,'in_review')) v(n,status);
insert into public.tasks(id,user_id,parent_task_id,title,due_at,estimated_minutes) values
 ('90000000-0000-4000-8000-000000000017','90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000011','Preserve subtask',now()+interval '7 days',25),
 ('90000000-0000-4000-8000-000000000018','90000000-0000-4000-8000-000000000002',null,'Preserve other owner',now()+interval '7 days',45);
insert into public.focus_sessions(id,user_id,task_id,status,session_mode,planned_minutes,actual_focus_minutes,started_at,ended_at)
values ('90000000-0000-4000-8000-000000000021','90000000-0000-4000-8000-000000000001',
 '90000000-0000-4000-8000-000000000011','completed','legacy',25,25,now()-interval '1 day 25 minutes',now()-interval '1 day');
insert into public.distraction_events(id,user_id,session_id,distraction_type,duration_seconds,note) values
 ('90000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000001',
 '90000000-0000-4000-8000-000000000021','other',10,'Preserve history');
select public.focus_v2_create_session('90000000-0000-4000-8000-000000000002',
 '90000000-0000-4000-8000-000000000018',25,5,15,1,2,false,false);
insert into public.ml_model_versions(id,model_key,version,algorithm,training_dataset,artifact_path,is_active) values
 ('90000000-0000-4000-8000-000000000031','native_task_delay_risk_classifier','upgrade-fixture',
 'logistic_regression_balanced','synthetic','fixture',true);
insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload,prediction_metadata) values
 ('90000000-0000-4000-8000-000000000032','90000000-0000-4000-8000-000000000001',
 '90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000031',
 'lumivox_native_features',0.7,true,'{}','{"prediction_mode":"native_ml","risk_band":"high"}');

-- Snapshot every pre-existing public table using only its pre-upgrade columns.
create schema rehearsal_guard;
create table rehearsal_guard.snapshots(table_name text primary key, query text not null, rows jsonb not null);
do $$ declare t record; cols text; q text; data jsonb;
begin
 for t in select tablename from pg_tables where schemaname='public' order by tablename loop
  select string_agg(quote_ident(column_name),',' order by ordinal_position) into cols
   from information_schema.columns where table_schema='public' and table_name=t.tablename;
  q := format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from (select %s from public.%I) x',cols,t.tablename);
  execute q into data;
  insert into rehearsal_guard.snapshots values(t.tablename,q,data);
 end loop;
end $$;
select jsonb_build_object('baseline_migrations',70,'tables_snapshotted',count(*),
 'nonempty_tables',count(*) filter(where jsonb_array_length(rows)>0),
 'rows_snapshotted',sum(jsonb_array_length(rows))) from rehearsal_guard.snapshots;
commit;
