begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

insert into auth.users (id, email) values
  ('f4100000-0000-4000-8000-000000000001', 'rag-summary-a@example.test'),
  ('f4100000-0000-4000-8000-000000000002', 'rag-summary-b@example.test');
insert into public.profiles (id) values
  ('f4100000-0000-4000-8000-000000000001'),
  ('f4100000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.focus_sessions (id, user_id, planned_minutes)
values ('f4100000-0000-4000-8000-000000000011', 'f4100000-0000-4000-8000-000000000001', 25);
insert into public.tasks (id, user_id, title)
values ('f4100000-0000-4000-8000-000000000021', 'f4100000-0000-4000-8000-000000000002', 'Summary fixture');
insert into public.learning_documents (
  id, owner_id, task_id, file_name, file_path, mime_type, file_size_bytes, visibility
) values (
  'f4100000-0000-4000-8000-000000000031', 'f4100000-0000-4000-8000-000000000002',
  'f4100000-0000-4000-8000-000000000021', 'notes.pdf', 'summary-test/notes.pdf',
  'application/pdf', 10, 'shared'
);
insert into public.learning_document_permissions (document_id, user_email, created_by)
values ('f4100000-0000-4000-8000-000000000031', 'rag-summary-a@example.test',
        'f4100000-0000-4000-8000-000000000002');

create temporary table summary_results (name text primary key, body jsonb not null);
grant select, insert on summary_results to service_role;

create function pg_temp.summary_owner() returns uuid language sql immutable as $$
  select 'f4100000-0000-4000-8000-000000000001'::uuid;
$$;
create function pg_temp.reserve_summary_turn(request_no integer) returns jsonb language sql as $$
  select public.rag_v2_reserve_turn(
    pg_temp.summary_owner(), null, 'f4100000-0000-4000-8000-000000000011',
    ('f4110000-0000-4000-8000-' || lpad(request_no::text, 12, '0'))::uuid,
    jsonb_build_object('question', 'Question ' || request_no,
      'selected_document_ids', '["f4100000-0000-4000-8000-000000000031"]'::jsonb,
      'top_k', 5, 'prompt_variant', 'grounded_rule', 'preferred_locale', 'en')
  );
$$;
create function pg_temp.complete_summary_turn(reservation jsonb, usage jsonb default '{}')
returns jsonb language sql as $$
  select public.rag_v2_complete_turn(pg_temp.summary_owner(), (reservation->>'turn_id')::uuid,
    (reservation->>'lease_token')::uuid, 'Fixture answer', '[]', 'fixture', 'fixture-model', 10, usage);
$$;
create function pg_temp.processing_id(field text) returns uuid language sql as $$
  select (body->>field)::uuid from pg_temp.summary_results where name = 'processing';
$$;
create function pg_temp.summary_input(
  owner uuid default 'f4100000-0000-4000-8000-000000000001',
  lease uuid default pg_temp.processing_id('lease_token'), batch_size integer default 8
) returns jsonb language sql as $$
  select public.rag_v2_get_summary_input(owner, pg_temp.processing_id('session_id'),
    pg_temp.processing_id('turn_id'), lease, 4, batch_size);
$$;
create function pg_temp.summary_payload(topic text default 'Study topic') returns jsonb language sql as $$
  select jsonb_build_object('main_topic', topic, 'learning_objective', '',
    'covered_concepts', '[]'::jsonb, 'important_user_context', '[]'::jsonb,
    'unresolved_questions', '[]'::jsonb, 'document_references', '[]'::jsonb,
    'uncertainties', '[]'::jsonb, 'continuation_hint', '');
$$;
create function pg_temp.save_summary(
  expected integer, coverage integer, payload jsonb default pg_temp.summary_payload(),
  metadata jsonb default '{"schema_version":1,"input_turn_count":2,"batch_size":8}'
) returns jsonb language sql as $$
  select public.rag_v2_save_summary(pg_temp.summary_owner(), pg_temp.processing_id('session_id'),
    pg_temp.processing_id('turn_id'), pg_temp.processing_id('lease_token'), expected, coverage,
    4, payload, 50, 'extractive', metadata);
$$;
create function pg_temp.summary_context() returns jsonb language sql as $$
  select public.rag_v2_get_context(pg_temp.summary_owner(), pg_temp.processing_id('session_id'),
    pg_temp.processing_id('turn_id'), pg_temp.processing_id('lease_token'), 4);
$$;

set local role anon;
select throws_ok('select * from public.rag_chat_summaries', '42501', null, 'SUM01 anonymous table read denied');
reset role;
set local role authenticated;
select throws_ok('select public.rag_v2_get_summary_input(null,null,null,null,4,8)',
  '42501', null, 'SUM02 authenticated input RPC denied');
select throws_ok('select public.rag_v2_save_summary(null,null,null,null,0,1,4,null,50,null,null)',
  '42501', null, 'SUM03 authenticated save RPC denied');
reset role;
set local role service_role;

do $$
declare
  request_no integer;
  reservation jsonb;
begin
  for request_no in 1..7 loop
    reservation := pg_temp.reserve_summary_turn(request_no);
    if request_no = 2 then
      if not public.rag_v2_fail_turn(pg_temp.summary_owner(), (reservation->>'turn_id')::uuid,
          (reservation->>'lease_token')::uuid, 'generation_failed') then
        raise exception 'Failed turn fixture could not be created';
      end if;
    else
      perform pg_temp.complete_summary_turn(reservation);
    end if;
  end loop;
end;
$$;
insert into summary_results values ('processing', pg_temp.reserve_summary_turn(8));
select throws_ok($$select pg_temp.summary_input('f4100000-0000-4000-8000-000000000002')$$,
  'P0001', 'RAG_CONTEXT_UNAVAILABLE', 'SUM04 another user cannot load summary input');
select throws_ok($$select pg_temp.summary_input(pg_temp.summary_owner(),gen_random_uuid())$$,
  'P0001', 'RAG_CONTEXT_UNAVAILABLE', 'SUM05 wrong lease denied');
update public.rag_chat_turns set lease_expires_at = clock_timestamp() - interval '1 second'
where id = pg_temp.processing_id('turn_id');
select throws_ok('select pg_temp.summary_input()', 'P0001', 'RAG_CONTEXT_UNAVAILABLE',
  'SUM06 expired lease cannot load input');
select throws_ok('select pg_temp.save_summary(0,3)', 'P0001', 'RAG_INVALID_LEASE',
  'SUM22 expired lease cannot save');
update public.rag_chat_turns set lease_expires_at = clock_timestamp() + interval '3 minutes'
where id = pg_temp.processing_id('turn_id');
select is(jsonb_path_query_array(pg_temp.summary_input(), '$.turns[*].turn_index'), '[1,3]'::jsonb,
  'SUM08 only earliest newly eligible completed pairs are returned');
select is(jsonb_path_query_array(pg_temp.summary_input(batch_size => 1), '$.turns[*].turn_index'), '[1]'::jsonb,
  'SUM08 authorized batch size limits coverage');
select throws_ok('select pg_temp.save_summary(0,4)', 'P0001', 'RAG_INVALID_REQUEST',
  'SUM15 recent window cannot be summarized');
select throws_ok('select pg_temp.save_summary(0,8)', 'P0001', 'RAG_SUMMARY_CONFLICT',
  'SUM14 current turn cannot be summarized');
select throws_ok($$select pg_temp.save_summary(0,3,'{"main_topic":"invalid"}')$$,
  'P0001', 'RAG_INVALID_REQUEST', 'SUM16 invalid summary shape rejected');
select throws_ok($$select pg_temp.save_summary(0,3,pg_temp.summary_payload(),
    '{"schema_version":1,"input_turn_count":2,"batch_size":1}')$$,
  'P0001', 'RAG_INVALID_REQUEST', 'SUM16 write cannot cover more than authorized batch');
select throws_ok($test$do $fixture$ begin
  delete from public.rag_chat_messages
  where role = 'assistant' and turn_id = (select id from public.rag_chat_turns
    where session_id = pg_temp.processing_id('session_id') and turn_index = 1);
  perform pg_temp.save_summary(0,3);
end; $fixture$;$test$, 'P0001', 'RAG_INVALID_REQUEST', 'SUM16 write rejects a missing message in coverage');
insert into summary_results values ('first', pg_temp.save_summary(0,3));
select results_eq($$select (body->>'version')::integer, (body->>'covered_turn_count')::integer,
    (body->>'input_turn_count')::integer from summary_results where name = 'first'$$,
  'values (1,2,2)', 'SUM09 first version covers two completed turns despite failed index');
select is(pg_temp.save_summary(0,3), (select body from summary_results where name = 'first'),
  'SUM21 exact retry after uncertain commit replays the persisted row');
select throws_ok($$select pg_temp.save_summary(0,3,pg_temp.summary_payload('Different topic'))$$,
  'P0001', 'RAG_SUMMARY_CONFLICT', 'SUM12 duplicate coverage with different payload conflicts');
select throws_ok('select pg_temp.save_summary(1,1)', 'P0001', 'RAG_SUMMARY_CONFLICT',
  'SUM13 previous coverage cannot decrease');

select is((pg_temp.summary_context()->'summary'->>'version')::integer, 1,
  'SUM17 authorized context includes the persisted summary');
select is(jsonb_path_query_array(pg_temp.summary_context(), '$.recent_turns[*].turn_index'), '[4,5,6,7]'::jsonb,
  'SUM18 persisted summary leaves complete raw recent history available');
insert into summary_results
select 'completion', pg_temp.complete_summary_turn(body,
  '{"context":{"summary_version_used":1,"summary_tokens_used":60,
      "summary_covered_turn_index":3,"summary_generation_method":"extractive",
      "history_turns_used":4,"retrieved_chunks_used":0,"estimated_prompt_tokens":600,
      "retrieval_strategy":"none","context_truncated":true,"generation_attempts":1}}')
from summary_results where name = 'processing';
select results_eq($$select summary_version_used, summary_tokens_used,
    summary_covered_turn_index, summary_generation_method from public.rag_chat_turns
    where id = pg_temp.processing_id('turn_id')$$,
  $$values (1,60,3,'extractive'::text)$$, 'SUM20 summary usage persists atomically with completion');
select is((select body->'context'->>'summary_version_used' from summary_results where name = 'completion'),
  '1', 'SUM20 response carries the same summary usage');
do $$ begin
  perform pg_temp.complete_summary_turn(pg_temp.reserve_summary_turn(9));
end; $$;
reset role;
delete from summary_results where name = 'processing';
set local role service_role;
insert into summary_results values ('processing', pg_temp.reserve_summary_turn(10));
select throws_ok('select pg_temp.save_summary(0,5)', 'P0001', 'RAG_SUMMARY_CONFLICT',
  'SUM11 stale expected version conflicts');
select is((pg_temp.save_summary(1,5)->>'version')::integer, 2,
  'SUM10 incremental save increments version');
select is((pg_temp.summary_context()->'summary'->>'covered_turn_count')::integer, 4,
  'SUM17 context now returns the latest version with cumulative count');
reset role;
insert into public.rag_chat_summaries (session_id, user_id, version, covered_turn_index, summary)
values (pg_temp.processing_id('session_id'), pg_temp.summary_owner(), 3, 5, '{"legacy":true}');
set local role service_role;
select is((pg_temp.summary_context()->'summary'->>'version')::integer, 2,
  'SUM17 summary without trusted coverage provenance remains ignored');
select ok(public.rag_v2_fail_turn(pg_temp.summary_owner(), pg_temp.processing_id('turn_id'),
  pg_temp.processing_id('lease_token'), 'generation_failed'),
  'SUM21 answer generation can fail after summary save');
reset role;
delete from summary_results where name = 'processing';
set local role service_role;
insert into summary_results values ('processing', pg_temp.reserve_summary_turn(11));
select is((pg_temp.summary_context()->'summary'->>'version')::integer, 2,
  'SUM21 a later reservation loads valid summary coverage after answer failure');
reset role;
delete from public.learning_document_permissions
where document_id = 'f4100000-0000-4000-8000-000000000031';
set local role service_role;
select throws_ok('select pg_temp.summary_input()', 'P0001', 'RAG_CONTEXT_UNAVAILABLE',
  'SUM07 revoked document blocks input');
select throws_ok('select pg_temp.save_summary(1,5)', 'P0001', 'RAG_DOCUMENT_ACCESS_DENIED',
  'SUM07 revoked document also blocks replay and save');
reset role;
delete from public.rag_chat_sessions where id = pg_temp.processing_id('session_id');
select is((select count(*) from public.rag_chat_summaries where session_id = pg_temp.processing_id('session_id')),
  0::bigint, 'SUM19 deleting a session cascades to its summaries');

select * from finish();
rollback;
