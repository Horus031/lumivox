begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id,email) values
  ('f6300000-0000-4000-8000-000000000001','rag-quality-a@example.test'),
  ('f6300000-0000-4000-8000-000000000002','rag-quality-b@example.test');
insert into public.profiles (id) values
  ('f6300000-0000-4000-8000-000000000001'),
  ('f6300000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at) values
  ('f6300000-0000-4000-8000-000000000011','f6300000-0000-4000-8000-000000000001',25,'completed',now()),
  ('f6300000-0000-4000-8000-000000000012','f6300000-0000-4000-8000-000000000002',25,'completed',now()),
  ('f6300000-0000-4000-8000-000000000013','f6300000-0000-4000-8000-000000000001',25,'completed',now());
insert into public.tasks (id,user_id,title) values
  ('f6300000-0000-4000-8000-000000000021','f6300000-0000-4000-8000-000000000002','Recovery fixture');
insert into public.learning_documents (id,owner_id,task_id,file_name,file_path,mime_type,file_size_bytes,visibility)
values ('f6300000-0000-4000-8000-000000000031','f6300000-0000-4000-8000-000000000002',
  'f6300000-0000-4000-8000-000000000021','notes.pdf','recovery-test/notes.pdf','application/pdf',10,'shared');
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6300000-0000-4000-8000-000000000031','rag-quality-a@example.test',
  'f6300000-0000-4000-8000-000000000002');

create temp table recovery_results (name text primary key, body jsonb not null);
grant all on recovery_results to service_role;
create function pg_temp.uid() returns uuid language sql immutable as $$
  select 'f6300000-0000-4000-8000-000000000001'::uuid
$$;
create function pg_temp.focus() returns uuid language sql immutable as $$
  select 'f6300000-0000-4000-8000-000000000011'::uuid
$$;
create function pg_temp.req(n integer) returns uuid language sql immutable as $$
  select ('f6310000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.documents(scoped boolean) returns jsonb language sql immutable as $$
  select case when scoped then '["f6300000-0000-4000-8000-000000000031"]'::jsonb else '[]'::jsonb end
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
create function pg_temp.context_for(window_size integer, owner uuid default pg_temp.uid()) returns jsonb
language sql as $$
  select public.rag_v2_get_context(owner,pg_temp.result('first','session_id'),
    pg_temp.result('live','turn_id'),pg_temp.result('live','lease_token'),window_size)
$$;
create function pg_temp.metadata() returns jsonb language sql immutable as $$
  select '{"context_policy":"adaptive_v1","history_candidate_turns":13,"history_turns_used":2,
    "truncated_history_turns":1,"history_tokens_used":120,"summary_covered_turn_count":0,
    "omitted_history_turns":11,"estimated_prompt_tokens":900,"summary_tokens_used":0,
    "handoff_tokens_used":0,"sources_truncated":false}'::jsonb
$$;
create function pg_temp.quality_complete(metadata jsonb) returns jsonb language sql as $$
  select public.rag_v2_complete_turn(pg_temp.uid(),pg_temp.result('live','turn_id'),
    pg_temp.result('live','lease_token'),'Synthetic answer','[]','fixture','fixture',1,
    jsonb_build_object('context',metadata,'provider_attempts','[
      {"stage":"answer","provider":"groq","model":"fixture","outcome":"success","latency_ms":5,"total_tokens":17},
      {"stage":"answer","provider":"groq","model":"fixture","outcome":"unknown","latency_ms":10}
    ]'::jsonb))
$$;

set local role anon;
select throws_ok('select public.rag_v2_get_context(null,null,null,null,12)','42501',null,'Anonymous RPC denied');
reset role;
set local role authenticated;
select throws_ok('select public.rag_v2_get_context(null,null,null,null,24)','42501',null,'Authenticated RPC denied');
reset role;
set local role service_role;

insert into recovery_results values ('first',pg_temp.ask(1));
do $setup$
declare n integer;
begin
  perform pg_temp.complete(body) from recovery_results where name='first';
  perform pg_temp.fail(pg_temp.ask(2,pg_temp.result('first','session_id')));
  for n in 3..14 loop
    perform pg_temp.complete(pg_temp.ask(n,pg_temp.result('first','session_id')));
  end loop;
end;
$setup$;
insert into recovery_results values ('live',pg_temp.ask(15,pg_temp.result('first','session_id')));

select is(jsonb_array_length(pg_temp.context_for(4)->'recent_turns'),4,'CQ01 old four-turn window remains compatible');
select is(jsonb_array_length(pg_temp.context_for(12)->'recent_turns'),12,'CQ02 authorized 12 candidates');
select is(jsonb_array_length(pg_temp.context_for(24)->'recent_turns'),13,'CQ03 24-candidate limit returns all completed pairs');
select throws_ok('select pg_temp.context_for(25)','P0001','RAG_INVALID_REQUEST','CQ04 rejects 25 candidates');
update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second' where id=pg_temp.result('live','turn_id');
select throws_ok('select pg_temp.context_for(24)','P0001','RAG_CONTEXT_UNAVAILABLE','CQ05 rejects expired lease');
update public.rag_chat_turns set lease_expires_at=clock_timestamp()+interval '90 seconds' where id=pg_temp.result('live','turn_id');
select throws_ok($$select pg_temp.context_for(24,'f6300000-0000-4000-8000-000000000002')$$,
  'P0001','RAG_CONTEXT_UNAVAILABLE','CQ06 rejects cross-user context');
reset role;
delete from public.learning_document_permissions where document_id='f6300000-0000-4000-8000-000000000031';
set local role service_role;
select throws_ok('select pg_temp.context_for(24)','P0001','RAG_CONTEXT_UNAVAILABLE','CQ07 rechecks document ACL');
reset role;
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6300000-0000-4000-8000-000000000031','rag-quality-a@example.test','f6300000-0000-4000-8000-000000000002');
set local role service_role;
select ok(not jsonb_path_exists(pg_temp.context_for(24), '$.recent_turns[*] ? (@.turn_index == 2)'),
  'CQ08 failed turn excluded');
select ok(not jsonb_path_exists(pg_temp.context_for(24), '$.recent_turns[*] ? (@.turn_index == 15)'),
  'CQ09 current turn excluded');
select is((select context_policy from public.rag_chat_turns where id=pg_temp.result('first','turn_id')),
  null::text,'CQ10 absent optional metadata persists NULL');
select throws_ok($$select pg_temp.quality_complete(pg_temp.metadata() || '{"history_tokens_used":-1}')$$,
  'P0001','RAG_INVALID_RESPONSE','CQ11 negative metadata rejected');
select throws_ok($$select pg_temp.quality_complete(pg_temp.metadata() || '{"truncated_history_turns":3}')$$,
  'P0001','RAG_INVALID_RESPONSE','CQ12 cannot truncate more than selected');
select throws_ok($$select pg_temp.quality_complete(pg_temp.metadata() || '{"omitted_history_turns":10}')$$,
  'P0001','RAG_INVALID_RESPONSE','CQ12 rejects inconsistent total coverage');
select throws_ok($$select pg_temp.quality_complete(pg_temp.metadata() ||
    '{"omitted_history_turns":10,"summary_covered_turn_count":1,"summary_tokens_used":30,"summary_version_used":1,"summary_covered_turn_index":1}')$$,
  'P0001','RAG_INVALID_RESPONSE','CQ12 summary must belong to the current conversation');
select is(pg_temp.quality_complete(pg_temp.metadata())->'context',pg_temp.metadata(),'Adaptive metadata round-trips');
select results_eq($$select provider_calls_total,known_provider_tokens,unknown_usage_attempts
  from public.rag_chat_turns where id=pg_temp.result('live','turn_id')$$,
  $$values (2,17,1)$$,'CQ13 provider accounting preserved');
select is(pg_temp.quality_complete('{}')->'context',pg_temp.metadata(),'CQ14 legacy deployment can replay adaptive completion');

select * from finish();
rollback;
