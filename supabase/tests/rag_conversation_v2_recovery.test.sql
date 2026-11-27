begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(33);

insert into auth.users (id,email) values
  ('f6100000-0000-4000-8000-000000000001','rag-recovery-a@example.test'),
  ('f6100000-0000-4000-8000-000000000002','rag-recovery-b@example.test');
insert into public.profiles (id) values
  ('f6100000-0000-4000-8000-000000000001'),
  ('f6100000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at) values
  ('f6100000-0000-4000-8000-000000000011','f6100000-0000-4000-8000-000000000001',25,'completed',now()),
  ('f6100000-0000-4000-8000-000000000012','f6100000-0000-4000-8000-000000000002',25,'completed',now()),
  ('f6100000-0000-4000-8000-000000000013','f6100000-0000-4000-8000-000000000001',25,'completed',now());
insert into public.tasks (id,user_id,title) values
  ('f6100000-0000-4000-8000-000000000021','f6100000-0000-4000-8000-000000000002','Recovery fixture');
insert into public.learning_documents (id,owner_id,task_id,file_name,file_path,mime_type,file_size_bytes,visibility)
values ('f6100000-0000-4000-8000-000000000031','f6100000-0000-4000-8000-000000000002',
  'f6100000-0000-4000-8000-000000000021','notes.pdf','recovery-test/notes.pdf','application/pdf',10,'shared');
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6100000-0000-4000-8000-000000000031','rag-recovery-a@example.test',
  'f6100000-0000-4000-8000-000000000002');

create temp table recovery_results (name text primary key, body jsonb not null);
grant all on recovery_results to service_role;
create function pg_temp.uid() returns uuid language sql immutable as $$
  select 'f6100000-0000-4000-8000-000000000001'::uuid
$$;
create function pg_temp.focus() returns uuid language sql immutable as $$
  select 'f6100000-0000-4000-8000-000000000011'::uuid
$$;
create function pg_temp.req(n integer) returns uuid language sql immutable as $$
  select ('f6110000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.documents(scoped boolean) returns jsonb language sql immutable as $$
  select case when scoped then '["f6100000-0000-4000-8000-000000000031"]'::jsonb else '[]'::jsonb end
$$;
create function pg_temp.result(field text, key text) returns uuid language sql as $$
  select (body->>key)::uuid from recovery_results where name=field
$$;
create function pg_temp.ask(n integer, source uuid default null, scoped boolean default true,
  question text default null) returns jsonb language sql as $$
  select public.rag_v2_reserve_turn(pg_temp.uid(),source,pg_temp.focus(),pg_temp.req(n),
    jsonb_build_object('question',coalesce(question,'Recovery study question ' || n),
      'selected_document_ids',pg_temp.documents(scoped),'top_k',5,
      'prompt_variant','grounded_rule','preferred_locale','en'))
$$;
create function pg_temp.complete(turn jsonb) returns jsonb language sql as $$
  select public.rag_v2_complete_turn(pg_temp.uid(),(turn->>'turn_id')::uuid,(turn->>'lease_token')::uuid,
    'Synthetic answer','[]','fixture','fixture',1,'{}')
$$;
create function pg_temp.fail(turn jsonb) returns boolean language sql as $$
  select public.rag_v2_fail_turn(pg_temp.uid(),(turn->>'turn_id')::uuid,(turn->>'lease_token')::uuid,
    'generation_failed')
$$;
create function pg_temp.status(n integer, operation text default 'ask') returns jsonb language sql as $$
  select public.rag_v2_get_operation_status(pg_temp.uid(),pg_temp.focus(),pg_temp.req(n),operation)
$$;
create function pg_temp.recover(n integer) returns jsonb language sql as $$
  select public.rag_v2_recover_expired_turn(pg_temp.uid(),pg_temp.focus(),pg_temp.req(n))
$$;
create function pg_temp.payload(source uuid, mode text, scoped boolean) returns jsonb language sql as $$
  select jsonb_build_object('source_session_id',source,'focus_session_id',pg_temp.focus(),
    'mode',mode,'selected_document_ids',pg_temp.documents(scoped),'top_k',5,
    'prompt_variant','grounded_rule','preferred_locale','en')
$$;
create function pg_temp.memory() returns jsonb language sql immutable as $$
  select '{"schema_version":1,"generation_method":"extractive","token_count":72,
    "summary":{"main_topic":"Binary search","learning_objective":"Understand sorted arrays",
    "covered_concepts":[],"important_user_context":[],"unresolved_questions":[],
    "document_references":[],"uncertainties":[],"continuation_hint":""}}'::jsonb
$$;

set local role anon;
select throws_ok('select public.rag_v2_get_operation_status(null,null,null,null)','42501',null,
  'REC01 anonymous status is denied');
select throws_ok('select public.rag_v2_recover_expired_turn(null,null,null)','42501',null,
  'REC01 anonymous recovery is denied');
reset role;
set local role authenticated;
select throws_ok('select public.rag_v2_get_operation_status(null,null,null,null)','42501',null,
  'REC02 authenticated status is denied');
reset role;
set local role service_role;

insert into recovery_results values ('first',pg_temp.ask(1));
do $$ begin
  perform pg_temp.complete(body) from recovery_results where name='first';
  perform pg_temp.fail(pg_temp.ask(2,pg_temp.result('first','session_id')));
end; $$;
insert into recovery_results values ('expires',pg_temp.ask(3,pg_temp.result('first','session_id')));
select is(public.rag_v2_get_operation_status('f6100000-0000-4000-8000-000000000002',
  'f6100000-0000-4000-8000-000000000012',pg_temp.req(1),'ask'), '{"operation":"ask","status":"unknown"}'::jsonb,
  'REC03 another owner cannot look up a real request ID');
select is(public.rag_v2_get_operation_status(pg_temp.uid(),'f6100000-0000-4000-8000-000000000013',
  pg_temp.req(1),'ask')->>'status','unknown','REC04 a different owned focus returns no request');
select is(pg_temp.status(1)->>'status','completed','REC05 completed Ask is visible as metadata');
select ok(not (pg_temp.status(1) ?| array['request_payload','response_payload','lease_token','question','answer']),
  'REC05 completed status cannot disclose content or lease credentials');
select is(pg_temp.status(2)->>'status','failed','REC06 failed Ask remains failed');
select is(pg_temp.status(3)->>'status','processing','REC07 a live lease is processing');
select is(pg_temp.status(35)->>'status','unknown','REC09 missing Ask returns unknown');
select is(pg_temp.status(40,'new_chat')->>'status','unknown','REC11 uncommitted New Chat returns unknown');
select is(pg_temp.recover(3)->>'status','processing','REC14 active lease recovery does not mutate the turn');
select is(pg_temp.recover(1)->>'status','completed','REC15 completed turn recovery does not mutate the turn');
select is((public.rag_v2_restore_context(pg_temp.uid(),pg_temp.focus())->'pending_operation'->>'client_request_id')::uuid,
  pg_temp.req(3),'REC18 restore discovers processing without a browser journal');
select ok(not (public.rag_v2_restore_context(pg_temp.uid(),pg_temp.focus())->'pending_operation'
  ?| array['lease_token','question','request_payload']),'REC19 restore only returns pending metadata');
update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second'
where id=pg_temp.result('expires','turn_id');
select is(pg_temp.status(3)->>'status','expired','REC08 lease expiry is reported before mutation');
select is(pg_temp.recover(3)->>'status','failed','REC13 recovering an expired lease marks the turn failed');
select is((select error_code from public.rag_chat_turns where id=pg_temp.result('expires','turn_id')),
  'lease_expired','REC13 expiration is the durable terminal reason');
select is(pg_temp.recover(3)->>'status','failed','REC16 another recovery is idempotent');
select throws_ok($$select pg_temp.complete(body) from recovery_results where name='expires'$$,
  'P0001','RAG_INVALID_LEASE','REC17 late completion cannot overwrite expiry');

do $$ declare n integer; reservation jsonb;
begin
  for n in 4..8 loop
    perform pg_temp.complete(pg_temp.ask(n,pg_temp.result('first','session_id')));
  end loop;
  reservation := pg_temp.ask(9,pg_temp.result('first','session_id'));
  perform public.rag_v2_save_summary(pg_temp.uid(),pg_temp.result('first','session_id'),
    (reservation->>'turn_id')::uuid,(reservation->>'lease_token')::uuid,0,4,4,pg_temp.memory()->'summary',72,
    'extractive','{"schema_version":1,"input_turn_count":2,"batch_size":8}');
  perform pg_temp.fail(reservation);
end; $$;
insert into recovery_results
select 'off',public.rag_v2_prepare_new_chat_recovery(pg_temp.uid(),pg_temp.focus(),source,pg_temp.req(40),
  pg_temp.payload(source,'continue',true),false)
from (select pg_temp.result('first','session_id') source) s;
insert into recovery_results
select 'on',public.rag_v2_prepare_new_chat_recovery(pg_temp.uid(),pg_temp.focus(),source,pg_temp.req(40),
  pg_temp.payload(source,'continue',true),true)
from (select pg_temp.result('first','session_id') source) s;
select results_eq($$select name,jsonb_array_length(body->'uncovered_turns'), body->'revision'->>'source_summary_version'
    from recovery_results where name in ('off','on') order by name$$,
  $$values ('off'::text,6,null::text),('on'::text,4,'1'::text)$$,'REC22 full completed history with rolling disabled');
select is((select body->'previous_summary' from recovery_results where name='off'),'null'::jsonb,
  'REC22 rolling-disabled snapshot omits persisted rolling memory');
select throws_ok($$select public.rag_v2_commit_new_chat_recovery(pg_temp.uid(),pg_temp.focus(),source,pg_temp.req(40),
    pg_temp.payload(source,'continue',true),(select body->'revision' from recovery_results where name='on'),
    pg_temp.memory(),false) from (select pg_temp.result('first','session_id') source) s$$,
  'P0001','RAG_HANDOFF_SOURCE_CHANGED','REC23 commit rejects a revision prepared with a different memory policy');
insert into recovery_results
select 'continued',public.rag_v2_commit_new_chat_recovery(pg_temp.uid(),pg_temp.focus(),source,pg_temp.req(40),
  pg_temp.payload(source,'continue',true),(select body->'revision' from recovery_results where name='off'),
  pg_temp.memory(),false) from (select pg_temp.result('first','session_id') source) s;
select is((select source_summary_version from public.rag_chat_handoffs
  where target_session_id=pg_temp.result('continued','target_session_id')),null::integer,
  'REC23 rolling-disabled commit does not record a rolling summary seed');
select is((pg_temp.status(40,'new_chat')->>'target_session_id')::uuid,pg_temp.result('continued','target_session_id'),
  'REC10 committed New Chat is discoverable');
do $$ begin
  perform pg_temp.fail(pg_temp.ask(41,pg_temp.result('continued','target_session_id')));
end; $$;
select is((select title from public.rag_chat_sessions where id=pg_temp.result('continued','target_session_id')),
  'Continued study conversation','REC21 a failed first turn leaves the generic title');
do $$ begin
  perform pg_temp.complete(pg_temp.ask(42,pg_temp.result('continued','target_session_id'),true,E'  Explain\n  binary search  '));
end; $$;
select is((select title from public.rag_chat_sessions where id=pg_temp.result('continued','target_session_id')),
  'Continued study conversation','REC20 first successful turn preserves the neutral title');
select is(pg_temp.status(42)->>'status','completed','REC05 committed status survives a missing client response');

insert into recovery_results
select 'fresh',public.rag_v2_commit_new_chat(pg_temp.uid(),pg_temp.focus(),source,pg_temp.req(43),
  pg_temp.payload(source,'fresh',false),null,null)
from (select pg_temp.result('continued','target_session_id') source) s;
select is((public.rag_v2_prepare_new_chat_recovery(pg_temp.uid(),pg_temp.focus(),
  pg_temp.result('continued','target_session_id'),pg_temp.req(43),
  pg_temp.payload(pg_temp.result('continued','target_session_id'),'fresh',false),false)->>'target_session_id')::uuid,
  pg_temp.result('fresh','target_session_id'),'REC25 new prepare replays a Phase 5 committed transition');

reset role;
delete from public.learning_document_permissions where user_email='rag-recovery-a@example.test';
set local role service_role;
select is(pg_temp.status(1),'{"operation":"ask","status":"access_unavailable"}'::jsonb,
  'REC12 revoked Ask exposes no metadata');
select is(pg_temp.status(40,'new_chat'),'{"operation":"new_chat","status":"access_unavailable"}'::jsonb,
  'REC12 revoked target scope exposes no transition metadata');
select is(pg_temp.status(43,'new_chat')->>'status','completed',
  'REC12 fresh recovery is independent of revoked source access');
select throws_ok('select pg_temp.ask(1,pg_temp.result(''first'',''session_id''))',
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','REC24 revoked scope blocks completed Ask replay');

select * from finish();
rollback;
