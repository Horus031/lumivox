begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

insert into auth.users (id,email) values
  ('f6400000-0000-4000-8000-000000000001','rag-security-a@example.test'),
  ('f6400000-0000-4000-8000-000000000002','rag-security-b@example.test');
insert into public.profiles (id) values
  ('f6400000-0000-4000-8000-000000000001'),
  ('f6400000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at) values
  ('f6400000-0000-4000-8000-000000000011','f6400000-0000-4000-8000-000000000001',25,'completed',now()),
  ('f6400000-0000-4000-8000-000000000012','f6400000-0000-4000-8000-000000000002',25,'completed',now()),
  ('f6400000-0000-4000-8000-000000000013','f6400000-0000-4000-8000-000000000001',25,'completed',now());
insert into public.tasks (id,user_id,title) values
  ('f6400000-0000-4000-8000-000000000021','f6400000-0000-4000-8000-000000000002','Recovery fixture');
insert into public.learning_documents (id,owner_id,task_id,file_name,file_path,mime_type,file_size_bytes,visibility)
values ('f6400000-0000-4000-8000-000000000031','f6400000-0000-4000-8000-000000000002',
  'f6400000-0000-4000-8000-000000000021','notes.pdf','recovery-test/notes.pdf','application/pdf',10,'shared');
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6400000-0000-4000-8000-000000000031','rag-security-a@example.test',
  'f6400000-0000-4000-8000-000000000002');

create temp table recovery_results (name text primary key, body jsonb not null);
grant all on recovery_results to service_role;
create function pg_temp.uid() returns uuid language sql immutable as $$
  select 'f6400000-0000-4000-8000-000000000001'::uuid
$$;
create function pg_temp.focus() returns uuid language sql immutable as $$
  select 'f6400000-0000-4000-8000-000000000011'::uuid
$$;
create function pg_temp.req(n integer) returns uuid language sql immutable as $$
  select ('f6410000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.documents(scoped boolean) returns jsonb language sql immutable as $$
  select case when scoped then '["f6400000-0000-4000-8000-000000000031"]'::jsonb else '[]'::jsonb end
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

create function pg_temp.quarantine(target uuid, reason text default 'security_review') returns integer language sql as $$
  select public.rag_v2_quarantine_memory(pg_temp.uid(), target, reason)
$$;
create function pg_temp.prepare_transition(source uuid, n integer, mode text, scoped boolean) returns jsonb language sql as $$
  select public.rag_v2_reserve_new_chat_preparation(pg_temp.uid(), pg_temp.focus(), source, pg_temp.req(n),
    pg_temp.payload(source,mode,scoped),false)
$$;
create function pg_temp.finish_transition(snapshot jsonb, mode text) returns jsonb language sql as $$
  select public.rag_v2_commit_prepared_new_chat(pg_temp.uid(),(snapshot->>'preparation_id')::uuid,
    (snapshot->>'lease_token')::uuid,snapshot->'revision',case when mode='continue' then pg_temp.memory() end)
$$;
create function pg_temp.authorize_turn(label text) returns boolean language sql as $$
  select public.rag_v2_assert_turn_authorized(pg_temp.uid(),pg_temp.result(label,'session_id'),
    pg_temp.result(label,'turn_id'),pg_temp.result(label,'lease_token'))
$$;
create function pg_temp.authorize_preparation(label text) returns boolean language sql as $$
  select public.rag_v2_assert_preparation_authorized(pg_temp.uid(),pg_temp.result(label,'preparation_id'),
    pg_temp.result(label,'lease_token'),body->'revision') from recovery_results where name=label
$$;

set local role anon;
select throws_ok('select public.rag_v2_quarantine_memory(null,null,null)','42501',null,'SECDB01 anon quarantine denied');
reset role;
set local role authenticated;
select throws_ok('select public.rag_v2_quarantine_memory(null,null,null)','42501',null,'SECDB02 authenticated quarantine denied');
select throws_ok('update public.rag_chat_sessions set memory_quarantined_at=null, memory_quarantine_reason=null',
  '42501',null,'Authenticated cannot mutate quarantine state');
select throws_ok('select memory_quarantine_reason from public.rag_chat_sessions','42501',null,
  'Administrative reason is private');
reset role;
set local role service_role;
insert into recovery_results values ('initial',pg_temp.ask(1,null,true,'password: synthetic-fixture'));
update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second'
where id=pg_temp.result('initial','turn_id');
select throws_ok($$select pg_temp.authorize_turn('initial')$$,'P0001','RAG_INVALID_LEASE','SECDB16 expired lease cannot dispatch');
update public.rag_chat_turns set lease_expires_at=clock_timestamp()+interval '90 seconds'
where id=pg_temp.result('initial','turn_id');
reset role;
delete from public.learning_document_permissions where document_id='f6400000-0000-4000-8000-000000000031';
set local role service_role;
select throws_ok($$select pg_temp.authorize_turn('initial')$$,'P0001','RAG_DOCUMENT_ACCESS_DENIED','SECDB17 current ACL checked before dispatch');
select throws_ok($$select public.rag_v2_get_history_detail(pg_temp.uid(),pg_temp.focus(),pg_temp.result('initial','session_id'))$$,
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','SECDB18 owner history still needs current ACL');
reset role;
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6400000-0000-4000-8000-000000000031','rag-security-a@example.test','f6400000-0000-4000-8000-000000000002');
set local role service_role;
select ok(pg_temp.authorize_turn('initial'),'Active authorized turn can dispatch');
do $$ begin perform pg_temp.complete(body) from recovery_results where name='initial'; end $$;
select is(pg_temp.ask(1,null,true,'password: synthetic-fixture')->>'outcome','completed','SECDB19 authorized completed replay retained');
select is((select title from public.rag_chat_sessions where id=pg_temp.result('initial','session_id')),
  'Document study conversation','SECDB20 neutral auto title excludes raw question');

insert into recovery_results values ('child',pg_temp.finish_transition(
  pg_temp.prepare_transition(pg_temp.result('initial','session_id'),10,'continue',true),'continue'));
insert into recovery_results values ('grandchild',pg_temp.finish_transition(
  pg_temp.prepare_transition(pg_temp.result('child','target_session_id'),11,'continue',true),'continue'));
insert into recovery_results values ('fresh_branch',pg_temp.finish_transition(
  pg_temp.prepare_transition(pg_temp.result('grandchild','target_session_id'),12,'fresh',false),'fresh'));
select throws_ok($$select public.rag_v2_quarantine_memory('f6400000-0000-4000-8000-000000000002',
    pg_temp.result('initial','session_id'),'security_review')$$,
  'P0001','RAG_SESSION_NOT_FOUND','SECDB04 another user cannot quarantine a target');
select throws_ok($$select pg_temp.quarantine(pg_temp.result('initial','session_id'),'unbounded raw incident')$$,
  'P0001','RAG_INVALID_REQUEST','SECDB05 reason is restricted to known codes');
select is(pg_temp.quarantine(pg_temp.result('initial','session_id')),3,'SECDB03 service role can quarantine the lineage');
select is(pg_temp.quarantine(pg_temp.result('initial','session_id'),'sensitive_data'),0,'SECDB06 duplicate quarantine is idempotent');
select is((select count(*) from public.rag_chat_sessions where id in (pg_temp.result('child','target_session_id'),
    pg_temp.result('grandchild','target_session_id')) and memory_quarantine_reason='security_review'),
  2::bigint,'SECDB07 all Continue descendants quarantined without overwriting reason');
select is((select memory_quarantined_at from public.rag_chat_sessions where id=pg_temp.result('fresh_branch','target_session_id')),
  null::timestamptz,'SECDB08 Fresh branch remains independent');
select throws_ok($$select pg_temp.ask(1,null,true,'password: synthetic-fixture')$$,
  'P0001','RAG_MEMORY_QUARANTINED','Quarantined completed answer withheld from Ask endpoint');

insert into recovery_results values ('live',pg_temp.ask(21,pg_temp.result('fresh_branch','target_session_id'),false));
do $$ begin perform pg_temp.quarantine(pg_temp.result('live','session_id')); end $$;
select is((select status||':'||error_code from public.rag_chat_turns where id=pg_temp.result('live','turn_id')),
  'failed:memory_quarantined','Quarantine terminally reconciles the active turn');
select is(public.rag_v2_restore_context(pg_temp.uid(),pg_temp.focus())->'memory_quarantined',
  'true'::jsonb,'Restore exposes quarantine capability without details');
select throws_ok($$select pg_temp.ask(22,pg_temp.result('live','session_id'),false)$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB09 blocked new Ask on quarantined conversation');
select throws_ok($$select public.rag_v2_get_summary_input(pg_temp.uid(),pg_temp.result('live','session_id'),
    pg_temp.result('live','turn_id'),pg_temp.result('live','lease_token'),4,8)$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB10 summary read blocked');
select throws_ok($$select public.rag_v2_save_summary(pg_temp.uid(),pg_temp.result('live','session_id'),
    pg_temp.result('live','turn_id'),pg_temp.result('live','lease_token'),0,1,4,pg_temp.memory()->'summary',72,
    'extractive','{"schema_version":1,"input_turn_count":1,"batch_size":8}')$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB10 summary write blocked');
select throws_ok($$select pg_temp.prepare_transition(pg_temp.result('live','session_id'),23,'continue',false)$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB11 Continue preparation blocked');
select throws_ok($$select pg_temp.complete(body) from recovery_results where name='live'$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB13 late answer rejected');
select throws_ok($$select public.rag_v2_prepare_new_chat(pg_temp.uid(),pg_temp.focus(),s,pg_temp.req(23),
    pg_temp.payload(s,'continue',false)) from (select pg_temp.result('live','session_id') s) source$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB15 old prepare cannot bypass quarantine');
select throws_ok($$select public.rag_v2_commit_new_chat(pg_temp.uid(),pg_temp.focus(),s,pg_temp.req(23),
    pg_temp.payload(s,'continue',false),'{}',pg_temp.memory()) from (select pg_temp.result('live','session_id') s) source$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB15 old commit cannot bypass quarantine');
insert into recovery_results values ('clean',pg_temp.finish_transition(
  pg_temp.prepare_transition(pg_temp.result('live','session_id'),24,'fresh',false),'fresh'));
select is((select body->>'outcome' from recovery_results where name='clean'),'completed','SECDB12 authorized Fresh recovery allowed');
do $$ begin perform pg_temp.complete(pg_temp.ask(25,pg_temp.result('clean','target_session_id'),false)); end $$;
insert into recovery_results values ('prep',pg_temp.prepare_transition(pg_temp.result('clean','target_session_id'),26,'continue',false));
select ok(pg_temp.authorize_preparation('prep'),'Live Continue lease authorizes a provider dispatch');
update public.rag_chat_preparations set lease_expires_at=clock_timestamp()-interval '1 second'
where id=pg_temp.result('prep','preparation_id');
select throws_ok($$select pg_temp.authorize_preparation('prep')$$,
  'P0001','RAG_INVALID_LEASE','Expired preparation lease cannot authorize a provider dispatch');
update public.rag_chat_preparations set lease_expires_at=clock_timestamp()+interval '90 seconds'
where id=pg_temp.result('prep','preparation_id');
do $$ begin perform pg_temp.quarantine(pg_temp.result('clean','target_session_id')); end $$;
select throws_ok($$select pg_temp.finish_transition(body,'continue') from recovery_results where name='prep'$$,
  'P0001','RAG_MEMORY_QUARANTINED','SECDB14 late handoff commit rejected');
select throws_ok($$select pg_temp.authorize_preparation('prep')$$,
  'P0001','RAG_MEMORY_QUARANTINED','Preparation dispatch denied after quarantine');

select * from finish();
rollback;
