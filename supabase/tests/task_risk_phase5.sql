begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users(id,email) values
 ('50000000-0000-4000-8000-000000000001','risk5-a@example.test'),
 ('50000000-0000-4000-8000-000000000002','risk5-b@example.test');
insert into public.profiles(id) values
 ('50000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.tasks(id,user_id,title,due_at,estimated_minutes) values
 ('50000000-0000-4000-8000-000000000011','50000000-0000-4000-8000-000000000001','Root A',now()+interval '1 day',60),
 ('50000000-0000-4000-8000-000000000012','50000000-0000-4000-8000-000000000002','Root B',now()+interval '1 day',60);

update public.ml_model_versions set is_active=false where model_key='native_task_delay_risk_classifier' and is_active;
insert into public.ml_model_versions(id,model_key,version,algorithm,training_dataset,artifact_path,is_active)
values ('50000000-0000-4000-8000-000000000021','native_task_delay_risk_classifier','pgtap-phase5',
 'logistic_regression_balanced','fixture','fixture',true);

insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload,prediction_metadata)
select '50000000-0000-4000-8000-000000000031',t.user_id,t.id,'50000000-0000-4000-8000-000000000021',
 'lumivox_native_features',0.76,true,'{}',jsonb_build_object(
  'prediction_mode','native_ml','feature_schema_version','native-task-risk-v2',
  'input_revision',r.revision,'due_at',t.due_at,'risk_band','high',
  'recommended_actions','[{"action_type":"split_task","priority":1},{"action_type":"start_focus"},{"action_type":"reschedule"}]'::jsonb
 )
from public.tasks t join public.native_task_risk_input_revisions r on r.user_id=t.user_id
where t.id='50000000-0000-4000-8000-000000000011';

create function pg_temp.begin_recovery(action text, key_number int, actor uuid default '50000000-0000-4000-8000-000000000001')
returns uuid language sql as $$
 select public.start_verified_task_risk_recovery(actor,'50000000-0000-4000-8000-000000000011',
  '50000000-0000-4000-8000-000000000031',action, ('50000000-0000-4000-8000-0000000000'||key_number)::uuid);
$$;
select throws_ok($$select pg_temp.begin_recovery('split_task',41,'50000000-0000-4000-8000-000000000002')$$,
 '22023','Prediction unavailable or stale','actor cannot use another owner prediction');
select throws_ok($$select pg_temp.begin_recovery('reduce_scope',48)$$,
 '22023','Prediction unavailable or stale','valid recovery action absent from recommendations is rejected');

update public.deadline_risk_predictions
set prediction_metadata = jsonb_set(prediction_metadata, '{risk_band}', '"low"')
where id = '50000000-0000-4000-8000-000000000031';
select throws_ok($$select pg_temp.begin_recovery('split_task',49)$$,
 '22023','Prediction unavailable or stale','low risk rejects an otherwise recommended action');

update public.deadline_risk_predictions
set prediction_metadata = jsonb_set(prediction_metadata, '{risk_band}', '"high"')
  || jsonb_build_object('recommended_actions', prediction_metadata->'recommended_actions'
    || '[{"action_type":"reduce_scope"}]'::jsonb)
where id = '50000000-0000-4000-8000-000000000031';
select ok(pg_temp.begin_recovery('split_task',41) is not null,
 'recommended action with an eligible risk band creates an attempt');
select pg_temp.begin_recovery('start_focus',42);
select pg_temp.begin_recovery('start_focus',43);
select pg_temp.begin_recovery('reschedule',44);
select pg_temp.begin_recovery('reduce_scope',45);
select pg_temp.begin_recovery('split_task',46);
select is(pg_temp.begin_recovery('split_task',41),
 (select id from task_risk_recovery_attempts where idempotency_key='50000000-0000-4000-8000-000000000041'),
 'exact key replay returns same id');
select throws_ok($$select pg_temp.begin_recovery('reschedule',41)$$,
 '22023','Recovery key reused with different request','changed key payload rejected');
select is((select count(*) from task_risk_recovery_attempts where status='initiated'),6::bigint,'review only creates initiated');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select is((select count(*) from task_risk_recovery_attempts),0::bigint,'owner B cannot read owner A attempts');
select throws_ok($$insert into task_risk_recovery_attempts default values$$,'42501',null,'browser cannot create attempt directly');
select throws_ok($$update task_risk_recovery_attempts set status='applied'$$,'42501',null,'browser cannot update attempt');
select throws_ok($$select public.complete_verified_task_risk_recovery(null,null,null,null)$$,'42501',null,'browser cannot execute completion RPC');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
select is((select count(*) from task_risk_recovery_attempts),6::bigint,'owner A reads own history');
reset role;

create function pg_temp.complete_recovery(key_number int, entity uuid default null, changed_at timestamptz default null,
 previous_due timestamptz default null, previous_minutes integer default null)
returns boolean language sql as $$
 select public.complete_verified_task_risk_recovery(user_id,id,task_id,action_type,entity,changed_at,previous_due,previous_minutes)
 from public.task_risk_recovery_attempts where idempotency_key=('50000000-0000-4000-8000-0000000000'||key_number)::uuid;
$$;
select ok(not pg_temp.complete_recovery(41,'50000000-0000-4000-8000-000000000012'),'wrong parent or owner is not evidence');
select is((select status from task_risk_recovery_attempts where idempotency_key='50000000-0000-4000-8000-000000000041'),'initiated','failed evidence leaves attempt initiated');
-- Task timestamps use transaction time. Move the fixture attempts to that
-- boundary so unchanged fields are tested independently of the time check.
update task_risk_recovery_attempts set initiated_at=transaction_timestamp()
where action_type in ('reschedule','reduce_scope');
select ok(not pg_temp.complete_recovery(44,null,(select updated_at from tasks where id='50000000-0000-4000-8000-000000000011'),
 (select due_at from tasks where id='50000000-0000-4000-8000-000000000011')), 'unchanged deadline cannot apply');
update task_risk_recovery_attempts set status='abandoned' where idempotency_key='50000000-0000-4000-8000-000000000046';

insert into tasks(id,user_id,parent_task_id,title,created_at)
values ('50000000-0000-4000-8000-000000000013','50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000011','Subtask',clock_timestamp());
select ok(pg_temp.complete_recovery(41,'50000000-0000-4000-8000-000000000013'),'committed subtask applies its attempt');
select ok(pg_temp.complete_recovery(41,'50000000-0000-4000-8000-000000000013'),'exact completion replay succeeds');
select is((select applied_entity_id from task_risk_recovery_attempts where idempotency_key='50000000-0000-4000-8000-000000000041'),
 '50000000-0000-4000-8000-000000000013'::uuid,'replay leaves evidence unchanged');
select ok(not pg_temp.complete_recovery(46,'50000000-0000-4000-8000-000000000013'),'abandoned cannot apply');

-- Defaults use the transaction timestamp, so set created_at to simulate
-- the separate committed mutation requests of the application.
insert into focus_sessions(id,user_id,task_id,status,session_mode,planned_minutes,actual_focus_minutes,started_at,created_at)
values ('50000000-0000-4000-8000-000000000051','50000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000011','ongoing','legacy',25,0,clock_timestamp(),clock_timestamp());
select ok(pg_temp.complete_recovery(42,'50000000-0000-4000-8000-000000000051'),'Legacy Focus session verifies entity');
delete from focus_sessions where id='50000000-0000-4000-8000-000000000051';
create temp table recovery_v2 as select public.focus_v2_create_session(
 '50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000011',25,5,15,1,2,false,false) id;
update focus_sessions set created_at=clock_timestamp() where id=(select id from recovery_v2);
select ok(pg_temp.complete_recovery(43,(select id from recovery_v2)),'Focus V2 verifies its parent session ID');

update tasks set due_at=due_at+interval '1 day',estimated_minutes=30 where id='50000000-0000-4000-8000-000000000011';
select ok(pg_temp.complete_recovery(44,null,(select updated_at from tasks where id='50000000-0000-4000-8000-000000000011'),now()+interval '1 day'),'changed deadline applies');
select ok(pg_temp.complete_recovery(45,null,(select updated_at from tasks where id='50000000-0000-4000-8000-000000000011'),null,60),'decreased estimate applies');
select ok(not pg_temp.complete_recovery(44,null,now()+interval '1 second',now()+interval '1 day'),
 'different task update is not a completion replay');
select is((select original_due_at from task_risk_recovery_attempts where action_type='reschedule'),now()+interval '1 day','original deadline retained');
select throws_ok($$select pg_temp.begin_recovery('split_task',47)$$,'22023','Prediction unavailable or stale','stale prediction cannot initiate');
select * from finish();
rollback;
