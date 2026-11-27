begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

-- Same local fixture conventions as rag_conversation_v2.test.sql.
insert into auth.users (id, email) values
  ('f3100000-0000-4000-8000-000000000001', 'rag-context-a@example.test'),
  ('f3100000-0000-4000-8000-000000000002', 'rag-context-b@example.test');
insert into public.profiles (id) values
  ('f3100000-0000-4000-8000-000000000001'),
  ('f3100000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.focus_sessions (id, user_id, planned_minutes) values
  ('f3100000-0000-4000-8000-000000000011', 'f3100000-0000-4000-8000-000000000001', 25),
  ('f3100000-0000-4000-8000-000000000012', 'f3100000-0000-4000-8000-000000000002', 25);
insert into public.tasks (id, user_id, title)
values ('f3100000-0000-4000-8000-000000000021', 'f3100000-0000-4000-8000-000000000002', 'Context fixture');
insert into public.learning_documents (
  id, owner_id, task_id, file_name, file_path, mime_type, file_size_bytes, visibility
) values (
  'f3100000-0000-4000-8000-000000000031', 'f3100000-0000-4000-8000-000000000002',
  'f3100000-0000-4000-8000-000000000021', 'notes.pdf', 'rag-context-test/notes.pdf',
  'application/pdf', 10, 'shared'
);
insert into public.learning_document_permissions (document_id, user_email, created_by)
values ('f3100000-0000-4000-8000-000000000031', 'rag-context-a@example.test',
        'f3100000-0000-4000-8000-000000000002');
insert into public.rag_chat_sessions (id, user_id, conversation_version)
values ('f3100000-0000-4000-8000-000000000041', 'f3100000-0000-4000-8000-000000000001', 2);

create temporary table context_results (name text primary key, body jsonb not null);
grant select, insert on context_results to service_role;

create function pg_temp.reserve(request_no integer, question text, document_mode boolean default true)
returns jsonb language sql as $$
  select public.rag_v2_reserve_turn(
    'f3100000-0000-4000-8000-000000000001',
    case when not document_mode then 'f3100000-0000-4000-8000-000000000041'::uuid end,
    case when document_mode then 'f3100000-0000-4000-8000-000000000011'::uuid end,
    ('f3110000-0000-4000-8000-' || lpad(request_no::text, 12, '0'))::uuid,
    jsonb_build_object(
      'question', question,
      'selected_document_ids', case when document_mode
        then '["f3100000-0000-4000-8000-000000000031"]'::jsonb else '[]'::jsonb end,
      'top_k', 5, 'prompt_variant', 'grounded_rule', 'preferred_locale', 'en'
    )
  );
$$;

create function pg_temp.result_id(result_name text, field text)
returns uuid language sql as $$
  select (r.body->>field)::uuid from pg_temp.context_results r where r.name = result_name;
$$;

create function pg_temp.complete(reservation jsonb, answer text, usage jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select public.rag_v2_complete_turn(
    'f3100000-0000-4000-8000-000000000001', (reservation->>'turn_id')::uuid,
    (reservation->>'lease_token')::uuid, answer, '[]', 'fixture', 'fixture-model', 10, usage
  );
$$;

create function pg_temp.context(recent_turns integer default 4)
returns jsonb language sql as $$
  select public.rag_v2_get_context(
    'f3100000-0000-4000-8000-000000000001',
    pg_temp.result_id('processing', 'session_id'), pg_temp.result_id('processing', 'turn_id'),
    pg_temp.result_id('processing', 'lease_token'), recent_turns
  );
$$;

set local role authenticated;
select throws_ok($$select public.rag_v2_get_context(null,null,null,null,4)$$,
  '42501', null, 'CTX01 authenticated cannot execute context RPC');
reset role;
set local role anon;
select throws_ok($$select public.rag_v2_restore_context(null,null)$$,
  '42501', null, 'CTX02 anonymous cannot execute restore RPC');
reset role;
set local role service_role;

insert into context_results values ('first', pg_temp.reserve(1, 'First question'));
insert into context_results values (
  'first_response', pg_temp.complete((select body from context_results where name = 'first'), 'First answer')
);
insert into context_results values ('failed', pg_temp.reserve(2, 'Failed question'));
do $$
begin
  if not public.rag_v2_fail_turn(
    'f3100000-0000-4000-8000-000000000001',
    pg_temp.result_id('failed', 'turn_id'), pg_temp.result_id('failed', 'lease_token'), 'generation_failed'
  ) then
    raise exception 'Failed turn fixture could not be created';
  end if;
end;
$$;
insert into context_results values ('third', pg_temp.reserve(3, 'Third question'));
insert into context_results values (
  'third_response', pg_temp.complete(
    (select body from context_results where name = 'third'), 'Third answer',
    '{"prompt_tokens":510,"completion_tokens":22,"total_tokens":532,
      "context":{"estimated_prompt_tokens":615,"history_turns_used":1,
      "retrieved_chunks_used":0,"generation_attempts":2,
      "retrieval_strategy":"history_augmented","context_truncated":true}}'
  )
);
insert into context_results values ('processing', pg_temp.reserve(4, 'Processing question'));

select throws_ok(
  $$select public.rag_v2_get_context('f3100000-0000-4000-8000-000000000002',
    pg_temp.result_id('processing','session_id'), pg_temp.result_id('processing','turn_id'),
    pg_temp.result_id('processing','lease_token'), 4)$$,
  'P0001', 'RAG_CONTEXT_UNAVAILABLE', 'CTX03 another user cannot load context'
);
select throws_ok(
  $$select public.rag_v2_restore_context('f3100000-0000-4000-8000-000000000002',
    'f3100000-0000-4000-8000-000000000011')$$,
  'P0001', 'RAG_SESSION_NOT_FOUND', 'CTX03 another user cannot restore the focus'
);
select throws_ok(
  $$select public.rag_v2_get_context('f3100000-0000-4000-8000-000000000001',
    pg_temp.result_id('processing','session_id'), pg_temp.result_id('processing','turn_id'),
    gen_random_uuid(), 4)$$,
  'P0001', 'RAG_CONTEXT_UNAVAILABLE', 'CTX04 wrong lease cannot load context'
);
update public.rag_chat_turns set lease_expires_at = clock_timestamp() - interval '1 second'
where id = pg_temp.result_id('processing', 'turn_id');
select throws_ok($$select pg_temp.context()$$,
  'P0001', 'RAG_CONTEXT_UNAVAILABLE', 'CTX05 expired lease cannot load context');
update public.rag_chat_turns set lease_expires_at = clock_timestamp() + interval '3 minutes'
where id = pg_temp.result_id('processing', 'turn_id');

insert into context_results values ('snapshot', pg_temp.context());
select ok(
  (select not jsonb_path_exists(body, '$.recent_turns[*] ? (@.turn_index == 2)') from context_results where name = 'snapshot'),
  'CTX06 failed turn is excluded'
);
select ok(
  (select not jsonb_path_exists(body, '$.recent_turns[*] ? (@.turn_index == 4)') from context_results where name = 'snapshot'),
  'CTX07 processing turn is excluded'
);
select is(
  (select body->'recent_turns' from context_results where name = 'snapshot'),
  '[{"turn_index":1,"question":"First question","answer":"First answer"},
    {"turn_index":3,"question":"Third question","answer":"Third answer"}]'::jsonb,
  'CTX08 completed pairs are chronological'
);
select is((select body->'summary' from context_results where name = 'snapshot'), 'null'::jsonb,
  'CTX08 summary is reserved for Phase 4');
select is(jsonb_path_query_array(pg_temp.context(1), '$.recent_turns[*].turn_index'), '[3]'::jsonb,
  'CTX09 context returns the newest requested completed turns');
select throws_ok($$select pg_temp.context(25)$$,
  'P0001', 'RAG_INVALID_REQUEST', 'CTX09 out-of-range recent turn request is rejected');

insert into context_results values ('restore', public.rag_v2_restore_context(
  'f3100000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000011'
));
select is((select body->>'completed_turn_count' from context_results where name = 'restore'), '2',
  'CTX11 restore count matches two completed turns');
select is((select jsonb_path_query_array(body, '$.messages[*].content') from context_results where name = 'restore'),
  '["First question","First answer","Third question","Third answer"]'::jsonb,
  'CTX11 restore returns just the four ordered completed messages');
select is(public.rag_v2_restore_context(
  'f3100000-0000-4000-8000-000000000002', 'f3100000-0000-4000-8000-000000000012'
), '{"enabled":true}'::jsonb, 'CTX12 owned focus without conversation restores empty');

reset role;
delete from public.learning_document_permissions where document_id = 'f3100000-0000-4000-8000-000000000031';
set local role service_role;
select throws_ok($$select pg_temp.context()$$,
  'P0001', 'RAG_CONTEXT_UNAVAILABLE', 'CTX10 revoked document blocks context');
select throws_ok(
  $$select public.rag_v2_restore_context('f3100000-0000-4000-8000-000000000001',
    'f3100000-0000-4000-8000-000000000011')$$,
  'P0001', 'RAG_DOCUMENT_ACCESS_DENIED', 'CTX10 revoked document blocks restore'
);

do $$
declare
  request_no integer;
  reservation jsonb;
  response jsonb;
begin
  for request_no in 101..124 loop
    reservation := pg_temp.reserve(request_no, 'Limit fixture ' || request_no, false);
    response := pg_temp.complete(reservation, 'Limit fixture answer');
  end loop;
  insert into context_results values ('last_response', response);
end;
$$;
select throws_ok($$select pg_temp.reserve(125, 'Question beyond the hard limit', false)$$,
  'P0001', 'RAG_CONVERSATION_LIMIT_REACHED', 'CTX13 a new reservation is blocked at 24 completions');
select is((select count(*) from public.rag_chat_turns where session_id = 'f3100000-0000-4000-8000-000000000041'),
  24::bigint, 'CTX13 hard limit inserts no additional turn');
select is(pg_temp.reserve(124, 'Limit fixture 124', false)->'response',
  (select body from context_results where name = 'last_response'), 'CTX14 existing completion replays at hard limit');

select results_eq(
  $$select estimated_prompt_tokens, history_turns_used, retrieved_chunks_used, generation_attempts,
    retrieval_strategy, context_truncated, prompt_tokens, completion_tokens, total_tokens
    from public.rag_chat_turns where id = pg_temp.result_id('third','turn_id')$$,
  $$values (615, 1, 0, 2, 'history_augmented'::text, true, 510, 22, 532)$$,
  'CTX15 context metadata and provider usage persist together'
);
select is((select (body->'context'->>'estimated_prompt_tokens')::integer from context_results where name = 'third_response'),
  615, 'CTX15 completed response includes context metadata');
select is((select count(*) from public.rag_chat_messages where turn_id = pg_temp.result_id('third','turn_id')),
  2::bigint, 'CTX15 completion stores both messages');
select ok(
  (select estimated_prompt_tokens is null and history_turns_used is null and not context_truncated
    from public.rag_chat_turns where id = pg_temp.result_id('first','turn_id')),
  'CTX16 Phase 2 completion works without optional metadata'
);
reset role;
select * from finish();
rollback;
