begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.owner() returns uuid language sql immutable as $$
  select 'f6500000-0000-4000-8000-000000000001'::uuid
$$;
create function pg_temp.other_owner() returns uuid language sql immutable as $$
  select 'f6500000-0000-4000-8000-000000000002'::uuid
$$;
create function pg_temp.fixture_id(n integer) returns uuid language sql immutable as $$
  select ('f6500000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id,email)
values (pg_temp.owner(),'ledger-a@example.test'), (pg_temp.other_owner(),'ledger-b@example.test');
insert into public.profiles (id) values (pg_temp.owner()),(pg_temp.other_owner()) on conflict do nothing;
insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at)
values (pg_temp.fixture_id(11),pg_temp.owner(),25,'completed',now());
create temp table ledger_turn (body jsonb);
grant all on ledger_turn to service_role;
set local role service_role;
insert into ledger_turn select public.rag_v2_reserve_turn(pg_temp.owner(),null,pg_temp.fixture_id(11),
  pg_temp.fixture_id(21),'{"question":"Explain a loop","selected_document_ids":[],"top_k":5,"prompt_variant":"grounded_rule","preferred_locale":"en"}');
reset role;

create function pg_temp.begin_attempt(
  n integer, idx integer, actor uuid default pg_temp.owner(), model text default 'openai/gpt-oss-20b',
  token uuid default null, stage text default 'answer'
) returns text language sql as $$
  select public.rag_v2_begin_provider_attempt(pg_temp.fixture_id(n), actor, (body->>'turn_id')::uuid,
    null, coalesce(token,(body->>'lease_token')::uuid), null, 2, idx, stage, 'groq', model, 500, 1200)
  from ledger_turn
$$;
create function pg_temp.finish_attempt(n integer, actor uuid default pg_temp.owner(),
  status text default 'success', total integer default null
) returns boolean language sql as $$
  select public.rag_v2_finish_provider_attempt(pg_temp.fixture_id(n),actor,status,null,null,total,400,null)
$$;

set local role anon;
select throws_ok('select count(*) from public.rag_provider_attempts','42501',null,'Anonymous ledger read denied');
select throws_ok('select public.rag_v2_begin_provider_attempt(null,null,null,null,null,null,null,null,null,null,null,null,null)',
  '42501',null,'Anonymous intent RPC denied');
reset role;
set local role authenticated;
select throws_ok('delete from public.rag_provider_attempts','42501',null,'Authenticated ledger mutation denied');
select throws_ok('select public.rag_v2_finish_provider_attempt(null,null,null,null,null,null,null,null)',
  '42501',null,'Authenticated accounting RPC denied');
reset role;

set local role service_role;
select throws_ok('select pg_temp.begin_attempt(40,1,pg_temp.other_owner())','P0001','RAG_INVALID_LEASE','Parent owner enforced');
select throws_ok('select pg_temp.begin_attempt(40,1, pg_temp.owner(), ''model'', pg_temp.fixture_id(99))',
  'P0001','RAG_INVALID_LEASE','Lease identity enforced');
select throws_ok('select public.rag_v2_begin_provider_attempt(null,null,null,null,null,null,null,null,null,null,null,null,null)',
  'P0001','RAG_INVALID_REQUEST','Missing operation identity rejected');
select throws_ok('select pg_temp.begin_attempt(40,1,stage => ''handoff'')','P0001','RAG_INVALID_REQUEST','Stage must match parent type');
select is(pg_temp.begin_attempt(41,1),'created','Authorized intent recorded before dispatch');
select is(pg_temp.begin_attempt(41,1),'existing','Identical intent retry confirms record without redispatch');
select throws_ok('select pg_temp.begin_attempt(41,1,model => ''different-model'')',
  'P0001','RAG_INVALID_REQUEST','Conflicting intent is rejected');
select throws_ok('select pg_temp.begin_attempt(42,1)','P0001','RAG_INVALID_REQUEST','Attempt position cannot change identity');
select is(pg_temp.begin_attempt(42,2),'created','Second attempt within configured ceiling');
select throws_ok('select pg_temp.begin_attempt(43,3)','P0001','RAG_INVALID_REQUEST','Attempt ceiling enforced');
select is((select count(*)::integer from public.rag_provider_attempts where status='dispatch_pending'),2,
  'Interrupted intents remain observable');
select throws_ok('select pg_temp.finish_attempt(41,pg_temp.other_owner())',
  'P0001','RAG_INVALID_REQUEST','Another user cannot finish the attempt');
select ok(pg_temp.finish_attempt(41),'Known outcome can have unknown usage');
select ok(pg_temp.finish_attempt(41),'Identical finish is idempotent');
select throws_ok('select pg_temp.finish_attempt(41,total => 500)',
  'P0001','RAG_INVALID_REQUEST','Conflicting terminal metadata rejected');
select is((select count(total_tokens)::integer from public.rag_provider_attempts),0,'Unknown usage remains null');

update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second'
where id = (select (body->>'turn_id')::uuid from ledger_turn);
select throws_ok('select pg_temp.begin_attempt(42,2)','P0001','RAG_INVALID_LEASE','Expired lease cannot begin or reacquire dispatch');
select is(public.rag_v2_quarantine_memory(pg_temp.owner(),(select (body->>'session_id')::uuid from ledger_turn),
  'security_review'),1,'Fixture is quarantined');
select throws_ok('select pg_temp.begin_attempt(42,2)','P0001','RAG_MEMORY_QUARANTINED','Quarantine blocks new intents');
select ok(pg_temp.finish_attempt(42,status => 'unknown'),'Observed outcome can be recorded after expiry and quarantine');
select is((select status from public.rag_chat_turns where id=(select (body->>'turn_id')::uuid from ledger_turn)),
  'failed','Finishing an attempt cannot complete the turn');

reset role;
insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at)
values (pg_temp.fixture_id(12),pg_temp.owner(),25,'completed',now());
create temp table handoff_source (body jsonb);
create temp table ledger_preparation (body jsonb);
grant all on handoff_source, ledger_preparation to service_role;
set local role service_role;
insert into handoff_source select public.rag_v2_reserve_turn(pg_temp.owner(),null,pg_temp.fixture_id(12),
  pg_temp.fixture_id(22),'{"question":"Explain a loop","selected_document_ids":[],"top_k":5,"prompt_variant":"grounded_rule","preferred_locale":"en"}');
do $$ begin
  perform public.rag_v2_complete_turn(pg_temp.owner(),(body->>'turn_id')::uuid,(body->>'lease_token')::uuid,
    'Synthetic answer','[]','fixture','fixture',1,'{}') from handoff_source;
end $$;
insert into ledger_preparation
select public.rag_v2_reserve_new_chat_preparation(pg_temp.owner(),pg_temp.fixture_id(12),
  (body->>'session_id')::uuid,pg_temp.fixture_id(23),
  jsonb_build_object('source_session_id',body->>'session_id','focus_session_id',pg_temp.fixture_id(12),
    'mode','continue','selected_document_ids','[]'::jsonb,'top_k',5,
    'prompt_variant','grounded_rule','preferred_locale','en'),false)
from handoff_source;
select is((select public.rag_v2_begin_provider_attempt(pg_temp.fixture_id(51),pg_temp.owner(),null,
  (body->>'preparation_id')::uuid,(body->>'lease_token')::uuid,body->'revision',
  6,1,'handoff','groq','openai/gpt-oss-20b',500,800) from ledger_preparation),
  'created','Continue lease authorizes a handoff intent');
select ok(pg_temp.finish_attempt(51,total => 350),'Handoff usage is recorded');
select is((select status from public.rag_chat_preparations where id =
  (select (body->>'preparation_id')::uuid from ledger_preparation)),
  'processing','Accounting cannot commit the handoff');
reset role;
delete from auth.users where id=pg_temp.owner();
select is((select count(*)::integer from public.rag_provider_attempts),0,'Account deletion cascades to attempt ledger');

select * from finish();
rollback;
