begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(44);

-- Follow the existing focus pgTAP fixtures. All data rolls back below.
insert into auth.users (id, email) values
  ('f2100000-0000-4000-8000-000000000001', 'rag-v2-a@example.test'),
  ('f2100000-0000-4000-8000-000000000002', 'rag-v2-b@example.test');
insert into public.profiles (id) values
  ('f2100000-0000-4000-8000-000000000001'),
  ('f2100000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.focus_sessions (id, user_id, planned_minutes) values
  ('f2100000-0000-4000-8000-000000000011', 'f2100000-0000-4000-8000-000000000001', 25),
  ('f2100000-0000-4000-8000-000000000012', 'f2100000-0000-4000-8000-000000000002', 25);
insert into public.tasks (id, user_id, title)
values ('f2100000-0000-4000-8000-000000000021', 'f2100000-0000-4000-8000-000000000002', 'RAG notes');
insert into public.learning_documents (
  id, owner_id, task_id, file_name, file_path, mime_type, file_size_bytes, visibility
) values (
  'f2100000-0000-4000-8000-000000000031', 'f2100000-0000-4000-8000-000000000002',
  'f2100000-0000-4000-8000-000000000021', 'notes.pdf', 'rag-v2-test/notes.pdf', 'application/pdf', 10, 'shared'
);
insert into public.rag_chat_sessions (id, user_id, focus_session_id)
values ('f2100000-0000-4000-8000-000000000040', 'f2100000-0000-4000-8000-000000000001',
        'f2100000-0000-4000-8000-000000000011');
insert into public.rag_chat_sessions (id, user_id, focus_session_id, conversation_version)
values ('f2100000-0000-4000-8000-000000000041', 'f2100000-0000-4000-8000-000000000002',
        'f2100000-0000-4000-8000-000000000012', 2);
insert into public.rag_chat_messages (session_id, user_id, role, content)
values ('f2100000-0000-4000-8000-000000000041', 'f2100000-0000-4000-8000-000000000002',
        'assistant', 'Private answer');

create temporary table rag_test_results (name text primary key, body jsonb not null);
grant select, insert on rag_test_results to service_role;

create function pg_temp.request(question text, include_document boolean default true)
returns jsonb language sql as $$
  select jsonb_build_object(
    'question', question,
    'selected_document_ids', case when include_document
      then '["f2100000-0000-4000-8000-000000000031"]'::jsonb else '[]'::jsonb end,
    'top_k', 5, 'prompt_variant', 'grounded_rule', 'preferred_locale', 'en'
  );
$$;

create function pg_temp.reserve(request_no integer, payload jsonb, session_id uuid default null)
returns jsonb language sql as $$
  select public.rag_v2_reserve_turn(
    'f2100000-0000-4000-8000-000000000001', session_id,
    'f2100000-0000-4000-8000-000000000011',
    ('f2110000-0000-4000-8000-' || lpad(request_no::text, 12, '0'))::uuid, payload
  );
$$;

create function pg_temp.reservation_id(result_name text, field text)
returns uuid language sql as $$
  select (r.body->>field)::uuid from pg_temp.rag_test_results r where r.name = result_name;
$$;

create function pg_temp.complete(reservation text, usage jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select public.rag_v2_complete_turn(
    'f2100000-0000-4000-8000-000000000001',
    pg_temp.reservation_id(reservation, 'turn_id'), pg_temp.reservation_id(reservation, 'lease_token'),
    'Stored study answer', '[]', 'fixture', 'fixture-model', 10, usage
  );
$$;

set local role anon;
select throws_ok(
  $$select public.rag_v2_reserve_turn(null, null, null, null, '{}'::jsonb)$$,
  '42501', null, 'DB01 anonymous cannot execute reserve'
);
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2100000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.rag_v2_complete_turn(null, null, null, 'answer', '[]', null, null, 0, '{}')$$,
  '42501', null, 'DB02 authenticated cannot execute complete'
);
select throws_ok(
  $$insert into public.rag_chat_messages (session_id, user_id, role, content)
    values ('f2100000-0000-4000-8000-000000000040', auth.uid(), 'assistant', 'Fabricated answer')$$,
  '42501', null, 'DB03 authenticated cannot insert an assistant message'
);
select is(
  (select count(*) from public.rag_chat_messages where session_id = 'f2100000-0000-4000-8000-000000000041'),
  0::bigint, 'DB04 user A cannot read an existing message owned by B'
);
reset role;

set local role service_role;
select throws_ok(
  $$select pg_temp.reserve(1, pg_temp.request('Other session', false), 'f2100000-0000-4000-8000-000000000041')$$,
  'P0001', 'RAG_SESSION_NOT_FOUND', 'DB05 reject another user''s RAG session'
);
select throws_ok(
  $$select public.rag_v2_reserve_turn('f2100000-0000-4000-8000-000000000001', null,
    'f2100000-0000-4000-8000-000000000012', 'f2110000-0000-4000-8000-000000000001',
    pg_temp.request('Other focus session', false))$$,
  'P0001', 'RAG_SESSION_NOT_FOUND', 'DB06 reject another user''s Focus Session'
);
select throws_ok(
  $$select pg_temp.reserve(1, pg_temp.request('Explain binary search'))$$,
  'P0001', 'RAG_DOCUMENT_ACCESS_DENIED', 'DB07 reject an unauthorized document'
);
select is((
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'match_learning_document_chunks'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), 0::bigint, 'DB07 no browser role may supply a user ID to retrieval RPC');
select ok(has_function_privilege('service_role',
  'public.match_learning_document_chunks(extensions.vector,integer,uuid[],uuid)', 'EXECUTE'),
  'DB07 internal service can execute retrieval');
reset role;
insert into public.learning_document_permissions (document_id, user_email, created_by)
values ('f2100000-0000-4000-8000-000000000031', 'rag-v2-a@example.test', 'f2100000-0000-4000-8000-000000000002');

set local role service_role;
insert into rag_test_results values ('first', pg_temp.reserve(1, pg_temp.request('Explain binary search')));
select is((select body->>'outcome' from rag_test_results where name = 'first'),
  'reserved', 'DB08 first request reserves a turn');
insert into rag_test_results values ('duplicate', pg_temp.reserve(1, pg_temp.request('Explain binary search')));
select is((select body->>'outcome' from rag_test_results where name = 'duplicate'),
  'processing', 'DB09 duplicate ID sees processing');
select is(pg_temp.reservation_id('duplicate', 'turn_id'), pg_temp.reservation_id('first', 'turn_id'),
  'DB09 duplicate ID refers to the same turn');
select is((select count(*) from public.rag_chat_turns where session_id = pg_temp.reservation_id('first', 'session_id')),
  1::bigint, 'DB09 no additional turn was inserted');
select throws_ok(
  $$select pg_temp.reserve(1, pg_temp.request('Altered payload'))$$,
  'P0001', 'RAG_IDEMPOTENCY_CONFLICT', 'DB10 same ID with changed payload conflicts'
);
select throws_ok(
  $$select pg_temp.reserve(2, pg_temp.request('Second question'), pg_temp.reservation_id('first', 'session_id'))$$,
  'P0001', 'RAG_TURN_IN_PROGRESS', 'DB11 distinct request conflicts while a turn is processing'
);
insert into rag_test_results values ('completed', pg_temp.complete('first'));
select results_eq(
  $$select role::text, content from public.rag_chat_messages
    where turn_id = pg_temp.reservation_id('first', 'turn_id') order by role::text desc$$,
  $$values ('user'::text, 'Explain binary search'::text), ('assistant'::text, 'Stored study answer'::text)$$,
  'DB12 completion stores both messages'
);
select is((select body->>'completed_turn_count' from rag_test_results where name = 'completed'),
  '1', 'DB12 completion records one successful turn');
select is(pg_temp.complete('first'), (select body from rag_test_results where name = 'completed'),
  'DB13 duplicate completion replays the stored response');
select is((select completed_turn_count from public.rag_chat_sessions where id = pg_temp.reservation_id('first', 'session_id')),
  1, 'DB13 duplicate completion does not increment the count');
select is((select count(*) from public.rag_chat_messages where turn_id = pg_temp.reservation_id('first', 'turn_id')),
  2::bigint, 'DB13 duplicate completion does not add messages');

insert into rag_test_results values ('failed', pg_temp.reserve(2, pg_temp.request('Second question')));
select throws_ok(
  $$select public.rag_v2_complete_turn('f2100000-0000-4000-8000-000000000001',
    pg_temp.reservation_id('failed', 'turn_id'), gen_random_uuid(), 'Answer', '[]', null, null, 10, '{}')$$,
  'P0001', 'RAG_INVALID_LEASE', 'DB14 wrong lease token cannot complete'
);
select ok(public.rag_v2_fail_turn('f2100000-0000-4000-8000-000000000001',
  pg_temp.reservation_id('failed', 'turn_id'), pg_temp.reservation_id('failed', 'lease_token'), 'generation_failed'),
  'DB15 valid lease can mark a turn failed');
select is((select status from public.rag_chat_turns where id = pg_temp.reservation_id('failed', 'turn_id')),
  'failed', 'DB15 failed turn has the expected state');
select is((select count(*) from public.rag_chat_messages where turn_id = pg_temp.reservation_id('failed', 'turn_id')),
  0::bigint, 'DB15 failed turn has no persisted messages');

insert into rag_test_results values ('expired', pg_temp.reserve(3, pg_temp.request('Expired reservation')));
update public.rag_chat_turns set lease_expires_at = clock_timestamp() - interval '1 second'
where id = pg_temp.reservation_id('expired', 'turn_id');
select throws_ok($$select pg_temp.complete('expired')$$,
  'P0001', 'RAG_INVALID_LEASE', 'DB16 expired reservation cannot complete');
insert into rag_test_results values ('after_expiry', pg_temp.reserve(4, pg_temp.request('New reservation')));
select is((select body->>'outcome' from rag_test_results where name = 'after_expiry'),
  'reserved', 'DB17 new turn can reserve after lease expiry');
select is((select status from public.rag_chat_turns where id = pg_temp.reservation_id('expired', 'turn_id')),
  'failed', 'DB17 stale processing turn was marked failed');

insert into rag_test_results values ('replay', pg_temp.reserve(1, pg_temp.request('Explain binary search')));
select is((select body->>'outcome' from rag_test_results where name = 'replay'),
  'completed', 'DB18 reserve reports a completed replay');
select is((select body->'response' from rag_test_results where name = 'replay'),
  (select body from rag_test_results where name = 'completed'), 'DB18 replay returns the persisted response');
select ok((select not (body ? 'lease_token') from rag_test_results where name = 'replay'),
  'DB18 replay has no generation lease');

reset role;
set local role authenticated;
select is((select count(*) from public.rag_chat_messages where content = 'Stored study answer'),
  1::bigint, 'DB19 owner can read a document answer while access is granted');
reset role;
delete from public.learning_document_permissions where document_id = 'f2100000-0000-4000-8000-000000000031';
set local role authenticated;
select is((select count(*) from public.rag_chat_messages where content = 'Stored study answer'),
  0::bigint, 'DB19 revoked document access blocks direct authenticated reads');
reset role;
set local role service_role;
select throws_ok($$select pg_temp.reserve(1, pg_temp.request('Explain binary search'))$$,
  'P0001', 'RAG_DOCUMENT_ACCESS_DENIED', 'DB19 revoked permission blocks replay');
select throws_ok(
  $$select public.rag_v2_validate_scope('f2100000-0000-4000-8000-000000000001',
    'f2100000-0000-4000-8000-000000000011',
    (select selected_document_ids from public.rag_chat_sessions where id = pg_temp.reservation_id('first', 'session_id')))$$,
  'P0001', 'RAG_DOCUMENT_ACCESS_DENIED', 'DB19 scope validation used by restore rejects revoked permission'
);
select throws_ok($$select pg_temp.complete('after_expiry')$$,
  'P0001', 'RAG_DOCUMENT_ACCESS_DENIED', 'DB19 revoked permission blocks completion');
reset role;
insert into public.learning_document_permissions (document_id, user_email, created_by)
values ('f2100000-0000-4000-8000-000000000031', 'rag-v2-a@example.test', 'f2100000-0000-4000-8000-000000000002');

set local role service_role;
select is((select conversation_version from public.rag_chat_sessions where id = 'f2100000-0000-4000-8000-000000000040'),
  1::smallint, 'DB21 legacy session stays version 1 when a V2 session is created for the same focus');
select isnt(pg_temp.reservation_id('first', 'session_id'), 'f2100000-0000-4000-8000-000000000040'::uuid,
  'DB21 V2 uses a separate session');

-- Negative usage violates a constraint after both message inserts.
select throws_ok($$select pg_temp.complete('after_expiry', '{"prompt_tokens":-1}')$$,
  '23514', null, 'DB22 late completion constraint violation aborts the statement');
select is((select count(*) from public.rag_chat_messages where turn_id = pg_temp.reservation_id('after_expiry', 'turn_id')),
  0::bigint, 'DB22 both message inserts roll back');
select is((select status from public.rag_chat_turns where id = pg_temp.reservation_id('after_expiry', 'turn_id')),
  'processing', 'DB22 the failed statement leaves the reservation unchanged');
select is((select completed_turn_count from public.rag_chat_sessions where id = pg_temp.reservation_id('first', 'session_id')),
  1, 'DB22 rollback leaves the completed turn count unchanged');

insert into public.rag_chat_summaries (session_id, user_id, version, covered_turn_index, summary)
values (pg_temp.reservation_id('first', 'session_id'), 'f2100000-0000-4000-8000-000000000001', 1, 1, '{}');
delete from public.rag_chat_sessions where id = pg_temp.reservation_id('first', 'session_id');
select is((select count(*) from public.rag_chat_turns where session_id = pg_temp.reservation_id('first', 'session_id')),
  0::bigint, 'DB20 deleting a session cascades to turns');
select is((select count(*) from public.rag_chat_messages where session_id = pg_temp.reservation_id('first', 'session_id')),
  0::bigint, 'DB20 deleting a session cascades to messages');
select is((select count(*) from public.rag_chat_summaries where session_id = pg_temp.reservation_id('first', 'session_id')),
  0::bigint, 'DB20 deleting a session cascades to summaries');
reset role;

select * from finish();
rollback;
