begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(32);

insert into auth.users(id,email) values
 ('60000000-0000-4000-8000-000000000001','risk6-a@example.test'),
 ('60000000-0000-4000-8000-000000000002','risk6-b@example.test');
insert into public.profiles(id) values
 ('60000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.tasks(id,user_id,title,due_at,estimated_minutes)
values ('60000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000001','Recovery Task',now()+interval '1 day',60);
update public.ml_model_versions set is_active=false where model_key='native_task_delay_risk_classifier' and is_active;
insert into public.ml_model_versions(id,model_key,version,algorithm,training_dataset,artifact_path,is_active)
values ('60000000-0000-4000-8000-000000000021','native_task_delay_risk_classifier','pgtap-phase6',
 'logistic_regression_balanced','fixture','fixture',true);
insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload,prediction_metadata)
values ('60000000-0000-4000-8000-000000000031','60000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000021',
 'lumivox_native_features',0.76,true,'{}','{"prediction_mode":"native_ml","feature_schema_version":"native-task-risk-v2"}');

insert into task_risk_recovery_attempts(id,user_id,task_id,source_prediction_id,action_type,idempotency_key,original_due_at,receipt_required)
select ('60000000-0000-4000-8000-0000000000'||test.n)::uuid,t.user_id,t.id,
 '60000000-0000-4000-8000-000000000031',test.action,('60000000-0000-4000-8000-0000000000'||test.n)::uuid,t.due_at,true
from tasks t cross join (values (41,'split_task'),(42,'start_focus'),(43,'start_focus'),(44,'reschedule'),
 (45,'reduce_scope'),(46,'split_task'),(47,'split_task')) test(n,action)
where t.id='60000000-0000-4000-8000-000000000011';

select is(public.reconcile_task_risk_recovery(50),0,'unverified attempts are left alone');
select throws_ok($$update public.task_risk_recovery_attempts set status='applied',applied_at=clock_timestamp()
 where id='60000000-0000-4000-8000-000000000041'$$,
 '22023','Recovery receipt required','timestamp alone cannot mark an attempt applied');
select throws_ok($$insert into tasks(user_id,parent_task_id,title,recovery_attempt_id)
 values ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000011',null,
 '60000000-0000-4000-8000-000000000041')$$,
 '23502',null,'failed entity insert rolls back its receipt');
select is((select count(*) from task_risk_private.receipts),0::bigint,'no receipt survived failure');
insert into tasks(id,user_id,parent_task_id,title,recovery_attempt_id)
values ('60000000-0000-4000-8000-000000000051','60000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000011','Subtask','60000000-0000-4000-8000-000000000041');
select is((select status from task_risk_recovery_attempts where id='60000000-0000-4000-8000-000000000041'),
 'initiated','committed receipt and tracking are independently recoverable');
select throws_ok($$insert into tasks(user_id,parent_task_id,title,recovery_attempt_id)
 values ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000011','Duplicate',
 '60000000-0000-4000-8000-000000000041')$$,
 'PT409','Recovery attempt already resolved','duplicate subtask cannot run mutation again');

insert into focus_sessions(id,user_id,task_id,status,planned_minutes,actual_focus_minutes,started_at,recovery_attempt_id)
values ('60000000-0000-4000-8000-000000000052','60000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000011','ongoing',25,0,now(),'60000000-0000-4000-8000-000000000042');
select is((select entity_id from task_risk_private.receipts where attempt_id='60000000-0000-4000-8000-000000000042'),
 '60000000-0000-4000-8000-000000000052'::uuid,'Legacy Focus receipt has the correct entity');
delete from focus_sessions where id='60000000-0000-4000-8000-000000000052';

create function pg_temp.create_v2(minutes integer) returns uuid language sql as $$
 select public.create_recovery_focus_v2('60000000-0000-4000-8000-000000000043',
 '60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000011',minutes,5,15,1,2,false,false)
$$;
select pg_temp.create_v2(25);
select is(pg_temp.create_v2(25),(select entity_id from task_risk_private.receipts
 where attempt_id='60000000-0000-4000-8000-000000000043'),'Focus V2 retry returns the same session');
select throws_ok($$select pg_temp.create_v2(30)$$,'PT409','Recovery attempt already resolved','changed Focus V2 configuration conflicts');
select is((select count(*) from focus_sessions where task_id='60000000-0000-4000-8000-000000000011'),
 1::bigint,'Focus V2 retry creates one session');

update tasks set title='Edited only', recovery_attempt_id='60000000-0000-4000-8000-000000000044'
where id='60000000-0000-4000-8000-000000000011';
select is((select receipt_recorded_at from task_risk_recovery_attempts where id='60000000-0000-4000-8000-000000000044'),
 null::timestamptz,'unrelated Task update is not a reschedule receipt');
update tasks set due_at=due_at+interval '1 day', recovery_attempt_id='60000000-0000-4000-8000-000000000044'
where id='60000000-0000-4000-8000-000000000011';
update tasks set estimated_minutes=30, recovery_attempt_id='60000000-0000-4000-8000-000000000045'
where id='60000000-0000-4000-8000-000000000011';
select is((select count(*) from task_risk_private.receipts),5::bigint,'all five committed mutations have a receipt');
select is((select count(*) from tasks where recovery_attempt_id is not null),0::bigint,'Task markers are consumed');

set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
select ok(not public.abandon_task_risk_recovery('60000000-0000-4000-8000-000000000046'),'another owner cannot abandon');
select throws_ok($$select public.reconcile_task_risk_recovery(50)$$,'42501',null,'browser cannot run worker');
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select ok(not public.abandon_task_risk_recovery('60000000-0000-4000-8000-000000000041'),'receipt prevents cancellation before tracking');
select ok(public.abandon_task_risk_recovery('60000000-0000-4000-8000-000000000046'),'owner can cancel unperformed action');
reset role;
select is(public.reconcile_task_risk_recovery(2),2,'worker observes bounded batch size');
select is(public.reconcile_task_risk_recovery(50),3,'subsequent batch recovers remaining receipts');
select is(public.reconcile_task_risk_recovery(50),0,'replay is idempotent');
select is((select count(*) from task_risk_recovery_attempts where status='applied'),5::bigint,'only verified attempts applied');

create function pg_temp.reserve(attempt integer, allow_dispatch boolean default true) returns jsonb language sql as $$
 select public.reserve_task_risk_reassessment('60000000-0000-4000-8000-000000000001',
 ('60000000-0000-4000-8000-0000000000'||attempt)::uuid,allow_dispatch)
$$;
select is(pg_temp.reserve(41,false),null::jsonb,'quota failure cannot dispatch inference');
create temp table job as select pg_temp.reserve(41) as data;
select is((select data->>'kind' from job),'dispatch','first attempt reserves a request');
select is(pg_temp.reserve(42),null::jsonb,'other attempt for this Task cannot reserve concurrently');
create function pg_temp.claim() returns boolean language sql as $$
 select public.claim_task_risk_reassessment('60000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000011',(select (data->>'id')::uuid from job))
$$;
select ok(pg_temp.claim(),'AI worker claims reservation');
select ok(not pg_temp.claim(),'duplicate AI worker cannot claim');
create function pg_temp.pair() returns boolean language sql as $$
 select public.pair_task_risk_reassessment('60000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000041',(select (data->>'id')::uuid from job))
$$;
select ok(not pg_temp.pair(),'without persisted evidence no prediction is paired');

insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,
 predicted_label,feature_payload,prediction_metadata,created_at)
select (job.data->>'id')::uuid,t.user_id,t.id,'60000000-0000-4000-8000-000000000021',
 'lumivox_native_features',0.54,true,'{}',jsonb_build_object('prediction_mode','native_ml',
 'feature_schema_version','native-task-risk-v2','input_revision',r.revision-1,'due_at',t.due_at),clock_timestamp()
from tasks t join native_task_risk_input_revisions r on r.user_id=t.user_id cross join job
where t.id='60000000-0000-4000-8000-000000000011';
select ok(not pg_temp.pair(),'stale persisted prediction cannot be paired');
update deadline_risk_predictions p set prediction_metadata=jsonb_set(prediction_metadata,'{input_revision}',to_jsonb(r.revision))
from native_task_risk_input_revisions r where p.id=(select (data->>'id')::uuid from job) and r.user_id=p.user_id;
select is(pg_temp.reserve(41,false)->>'id',(select data->>'id' from job),'committed prediction is recovered without quota or HTTP response');
select ok(pg_temp.pair(),'persisted prediction is paired');
select ok(pg_temp.pair(),'same historical pair is idempotent');
select is(pg_temp.reserve(41)->>'kind','done','paired attempt cannot dispatch again');

select * from finish();
rollback;
