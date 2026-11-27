begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

insert into auth.users (id,email) values
  ('f5100000-0000-4000-8000-000000000001','rag-handoff-a@example.test'),
  ('f5100000-0000-4000-8000-000000000002','rag-handoff-b@example.test');
insert into public.profiles (id) values
  ('f5100000-0000-4000-8000-000000000001'),
  ('f5100000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.focus_sessions (id,user_id,planned_minutes) values
  ('f5100000-0000-4000-8000-000000000011','f5100000-0000-4000-8000-000000000001',25),
  ('f5100000-0000-4000-8000-000000000012','f5100000-0000-4000-8000-000000000002',25);
insert into public.tasks (id,user_id,title) values
  ('f5100000-0000-4000-8000-000000000021','f5100000-0000-4000-8000-000000000002','History fixture');
insert into public.learning_documents (
  id,owner_id,task_id,file_name,file_path,mime_type,file_size_bytes,visibility
) values ('f5100000-0000-4000-8000-000000000031','f5100000-0000-4000-8000-000000000002',
  'f5100000-0000-4000-8000-000000000021','notes.pdf','handoff-test/notes.pdf','application/pdf',10,'shared');
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f5100000-0000-4000-8000-000000000031','rag-handoff-a@example.test',
  'f5100000-0000-4000-8000-000000000002');

create temp table phase5_results (name text primary key, body jsonb not null);
grant all on phase5_results to service_role;
create function pg_temp.uid() returns uuid language sql immutable as $$
  select 'f5100000-0000-4000-8000-000000000001'::uuid
$$;
create function pg_temp.focus() returns uuid language sql immutable as $$
  select 'f5100000-0000-4000-8000-000000000011'::uuid
$$;
create function pg_temp.request_id(n integer) returns uuid language sql immutable as $$
  select ('f5110000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.doc() returns uuid language sql immutable as $$
  select 'f5100000-0000-4000-8000-000000000031'::uuid
$$;
create function pg_temp.result(name_arg text, key text) returns uuid language sql as $$
  select (body->>key)::uuid from phase5_results where name=name_arg
$$;
create function pg_temp.ask(n integer, source uuid default null, scoped boolean default true)
returns jsonb language sql as $$
  select public.rag_v2_reserve_turn(pg_temp.uid(),source,pg_temp.focus(),pg_temp.request_id(n),
    jsonb_build_object('question','Synthetic study question ' || n,'selected_document_ids',
      case when scoped then to_jsonb(array[pg_temp.doc()]) else '[]'::jsonb end,
      'top_k',5,'prompt_variant','grounded_rule','preferred_locale','en'))
$$;
create function pg_temp.complete(turn jsonb, usage jsonb default '{}') returns jsonb language sql as $$
  select public.rag_v2_complete_turn(pg_temp.uid(),(turn->>'turn_id')::uuid,(turn->>'lease_token')::uuid,
    'Synthetic answer','[]','fixture','fixture',1,usage)
$$;
create function pg_temp.payload(source uuid, mode text, scoped boolean) returns jsonb language sql as $$
  select jsonb_build_object('source_session_id',source,'focus_session_id',pg_temp.focus(),
    'mode',mode,'selected_document_ids',case when scoped then to_jsonb(array[pg_temp.doc()]) else '[]'::jsonb end,
    'top_k',5,'prompt_variant','grounded_rule','preferred_locale','en')
$$;
create function pg_temp.prepare(source uuid, n integer, mode text, scoped boolean)
returns jsonb language sql as $$
  select public.rag_v2_prepare_new_chat(pg_temp.uid(),pg_temp.focus(),source,pg_temp.request_id(n),
    pg_temp.payload(source,mode,scoped))
$$;
create function pg_temp.memory() returns jsonb language sql immutable as $$
  select '{"schema_version":1,"generation_method":"extractive","token_count":72,
    "summary":{"main_topic":"Binary search","learning_objective":"Understand sorted arrays",
      "covered_concepts":[],"important_user_context":[],"unresolved_questions":[],
      "document_references":[],"uncertainties":[],"continuation_hint":""}}'::jsonb
$$;
create function pg_temp.commit_chat(source uuid,n integer,mode text,scoped boolean,revision jsonb, memory jsonb)
returns jsonb language sql as $$
  select public.rag_v2_commit_new_chat(pg_temp.uid(),pg_temp.focus(),source,pg_temp.request_id(n),
    pg_temp.payload(source,mode,scoped),revision,memory)
$$;
create function pg_temp.source() returns uuid language sql as $$
  select pg_temp.result('first','session_id')
$$;
create function pg_temp.target() returns uuid language sql as $$
  select pg_temp.result('continued','target_session_id')
$$;

set local role anon;
select throws_ok('select public.rag_v2_prepare_new_chat(null,null,null,null,null)', '42501', null,
  'CHAT01 anonymous cannot prepare a transition');
select throws_ok('select public.rag_v2_commit_new_chat(null,null,null,null,null,null,null)', '42501', null,
  'CHAT01 anonymous cannot commit a transition');
reset role;
set local role authenticated;
select throws_ok('select * from public.rag_chat_handoffs','42501',null,'CHAT02 raw handoff is backend-only');
reset role;
set local role service_role;

insert into phase5_results values ('first',pg_temp.ask(1));
select throws_ok($$select pg_temp.prepare(pg_temp.source(),41,'continue',true)$$,
  'P0001','RAG_TURN_IN_PROGRESS','CHAT12 live processing blocks preparation');
do $$
declare
  n integer;
  reservation jsonb;
begin
  perform pg_temp.complete(body) from phase5_results where name='first';
  reservation := pg_temp.ask(2, pg_temp.source());
  perform public.rag_v2_fail_turn(pg_temp.uid(),(reservation->>'turn_id')::uuid,
    (reservation->>'lease_token')::uuid,'generation_failed');
  for n in 3..7 loop
    perform pg_temp.complete(pg_temp.ask(n,pg_temp.source()));
  end loop;
end;
$$;
select throws_ok($$select public.rag_v2_prepare_new_chat(
    'f5100000-0000-4000-8000-000000000002','f5100000-0000-4000-8000-000000000012',
    pg_temp.source(),pg_temp.request_id(41),pg_temp.payload(pg_temp.source(),'fresh',false) ||
      jsonb_build_object('focus_session_id','f5100000-0000-4000-8000-000000000012'::uuid))$$,
  'P0001','RAG_SESSION_NOT_FOUND','CHAT03 source belongs to a different user');
select throws_ok($$select public.rag_v2_prepare_new_chat(pg_temp.uid(),
    'f5100000-0000-4000-8000-000000000012',pg_temp.source(),pg_temp.request_id(41),
    pg_temp.payload(pg_temp.source(),'fresh',false) ||
      jsonb_build_object('focus_session_id','f5100000-0000-4000-8000-000000000012'::uuid))$$,
  'P0001','RAG_SESSION_NOT_FOUND','CHAT04 wrong focus rejected');
select throws_ok($$select pg_temp.prepare(pg_temp.source(),41,'continue',false)$$,
  'P0001','RAG_HANDOFF_SCOPE_CHANGED','CHAT17 continue cannot change documents');
select is(jsonb_path_query_array(pg_temp.prepare(pg_temp.source(),41,'continue',true),
    '$.uncovered_turns[*].turn_index'),'[1,3,4,5,6,7]'::jsonb,'CHAT24 failed turn excluded from handoff');
insert into phase5_results values ('stale',pg_temp.prepare(pg_temp.source(),41,'continue',true));
insert into phase5_results values ('expired',pg_temp.ask(8,pg_temp.source()));
do $$
begin
  perform public.rag_v2_save_summary(pg_temp.uid(),pg_temp.source(),pg_temp.result('expired','turn_id'),
    pg_temp.result('expired','lease_token'),0,3,4,pg_temp.memory()->'summary',72,'extractive',
    '{"schema_version":1,"input_turn_count":2,"batch_size":8}');
end;
$$;
update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second'
where id=pg_temp.result('expired','turn_id');
select throws_ok($$select pg_temp.commit_chat(pg_temp.source(),41,'continue',true,
    (select body->'revision' from phase5_results where name='stale'),pg_temp.memory())$$,
  'P0001','RAG_HANDOFF_SOURCE_CHANGED','CHAT14 newly saved rolling summary changes the revision');
insert into phase5_results values ('ready',pg_temp.prepare(pg_temp.source(),41,'continue',true));
select is(jsonb_path_query_array((select body from phase5_results where name='ready'),
    '$.uncovered_turns[*].turn_index'),'[4,5,6,7]'::jsonb,
  'CHAT25 covered count and index handle a failed gap');
select throws_ok($$select pg_temp.commit_chat(pg_temp.source(),41,'continue',true,
    (select body->'revision' from phase5_results where name='ready'), '{}'::jsonb)$$,
  'P0001','RAG_INVALID_REQUEST','CHAT19 invalid handoff rejects the transaction');
select is((select status from public.rag_chat_sessions where id=pg_temp.source()),'active',
  'CHAT19 invalid handoff left the source active');
insert into phase5_results values ('continued',pg_temp.commit_chat(pg_temp.source(),41,'continue',true,
    (select body->'revision' from phase5_results where name='ready'),pg_temp.memory()));
select is((select count(*) from public.rag_chat_handoffs where target_session_id=pg_temp.target()),1::bigint,
  'CHAT06 one handoff saved');
select is((select completed_turn_count from public.rag_chat_sessions where id=pg_temp.target()),0,
  'CHAT07 new conversation starts at zero');
select is((select count(*) from public.rag_chat_messages where session_id=pg_temp.source()),12::bigint,
  'CHAT08 closed source messages preserved');
select is((select count(*) from public.rag_chat_messages where session_id=pg_temp.target()),0::bigint,
  'CHAT09 raw messages are not copied');
select is((pg_temp.prepare(pg_temp.source(),41,'continue',true)->>'target_session_id')::uuid,pg_temp.target(),
  'CHAT10 replay returns the original target');
select throws_ok($$select pg_temp.prepare(pg_temp.source(),41,'fresh',true)$$,'P0001','RAG_IDEMPOTENCY_CONFLICT',
  'CHAT11 same request ID and changed payload conflict');
select is((select error_code from public.rag_chat_turns where id=pg_temp.result('expired','turn_id')),
  'lease_expired','CHAT13 expired processing turn recovered during successful commit');
select throws_ok('select pg_temp.ask(70,pg_temp.source())','P0001','RAG_SESSION_CLOSED',
  'CHAT20 a closed source cannot receive new asks');
select is(pg_temp.ask(1,pg_temp.source())->>'outcome','completed','CHAT21 closed completed ask replays');
select throws_ok($$select public.rag_v2_get_history_detail(
    'f5100000-0000-4000-8000-000000000002','f5100000-0000-4000-8000-000000000012',pg_temp.source())$$,
  'P0001','RAG_SESSION_NOT_FOUND','CHAT22 cross-user history denied');
select is(jsonb_array_length(public.rag_v2_get_history_detail(pg_temp.uid(),pg_temp.focus(),pg_temp.source())->'messages'),
  12,'CHAT08 historical detail returns completed messages in the source');

insert into phase5_results values ('target_turn',pg_temp.ask(9,pg_temp.target()));
select is((public.rag_v2_get_context(pg_temp.uid(),pg_temp.target(),
    pg_temp.result('target_turn','turn_id'), pg_temp.result('target_turn','lease_token'),4)->'handoff'->>
      'source_completed_turn_count')::integer,6,'CHAT27 inherited coverage stays separate from local history');
do $$
begin
  perform pg_temp.complete(body, jsonb_build_object('context', jsonb_build_object(
    'handoff_used',true,'handoff_tokens_used',84,'handoff_id',
    (select id from public.rag_chat_handoffs where target_session_id=pg_temp.target()))))
  from phase5_results where name='target_turn';
end;
$$;
select ok((select handoff_used and handoff_tokens_used=84 and handoff_id_used is not null
  and not (response_payload->'context' ? 'handoff_id')
  from public.rag_chat_turns where id=pg_temp.result('target_turn','turn_id')),
  'CHAT27 completion persists verified usage and omits the internal ID from the response');
insert into phase5_results values ('chained',pg_temp.commit_chat(pg_temp.target(),42,'continue',true,
  pg_temp.prepare(pg_temp.target(),42,'continue',true)->'revision',pg_temp.memory()));
select is((select selected_document_ids from public.rag_chat_handoffs
    where target_session_id=pg_temp.result('chained','target_session_id')),
  array[pg_temp.doc()],'CHAT26 chained handoff retains the authorized scope');

reset role;
delete from public.learning_document_permissions where document_id=pg_temp.doc();
set local role service_role;
select throws_ok($$select pg_temp.prepare(pg_temp.result('chained','target_session_id'),43,'continue',true)$$,
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','CHAT15 revoked source cannot continue');
select throws_ok($$select pg_temp.prepare(pg_temp.result('chained','target_session_id'),43,'fresh',true)$$,
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','CHAT18 fresh target still requires authorization');
select throws_ok('select public.rag_v2_get_history_detail(pg_temp.uid(),pg_temp.focus(),pg_temp.source())',
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','CHAT23 historical content denied after revocation');
select ok(jsonb_path_exists(public.rag_v2_list_conversations(pg_temp.uid(),pg_temp.focus(),50,null,null),
   '$.conversations[*] ? (@.content_available == false && @.title == null)'),
  'CHAT23 historical list redacts restricted titles');
insert into phase5_results values ('fresh',pg_temp.commit_chat(pg_temp.result('chained','target_session_id'),
  43,'fresh',false,null,null));
select results_eq($$select status from public.rag_chat_sessions
    where id in (pg_temp.result('chained','target_session_id'),pg_temp.result('fresh','target_session_id'))
    order by status$$,$$values ('active'::text),('closed'::text)$$,
  'CHAT05 CHAT16 fresh closes the restricted source and succeeds without its documents');
select is((select count(*) from public.rag_chat_handoffs where target_session_id=pg_temp.result('fresh','target_session_id')),
  0::bigint,'CHAT05 no handoff is persisted for fresh mode');
do $$ declare n integer;
begin
  for n in 101..124 loop
    perform pg_temp.complete(pg_temp.ask(n,pg_temp.result('fresh','target_session_id'),false));
  end loop;
end; $$;
insert into phase5_results values ('limit',pg_temp.commit_chat(pg_temp.result('fresh','target_session_id'),
  44,'fresh',false,null,null));
select ok(pg_temp.result('limit','target_session_id') is not null,'CHAT28 hard limit permits a new chat');
select is((select count(*) from public.rag_chat_sessions where focus_session_id=pg_temp.focus() and status='active'),
  1::bigint,'CHAT29 a single active conversation remains');
select throws_ok($$insert into public.rag_chat_transitions
      (user_id,client_request_id,source_session_id,target_session_id,mode,request_payload)
    values ('f5100000-0000-4000-8000-000000000002',pg_temp.request_id(47),
      pg_temp.result('limit','target_session_id'),gen_random_uuid(),'fresh','{}')$$,
  '23503',null,'CHAT30 foreign keys reject mismatched owners');

select * from finish();
rollback;
