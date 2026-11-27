begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

insert into auth.users (id,email) values
  ('f6200000-0000-4000-8000-000000000001','rag-resource-a@example.test'),
  ('f6200000-0000-4000-8000-000000000002','rag-resource-b@example.test');
insert into public.profiles (id) values
  ('f6200000-0000-4000-8000-000000000001'),
  ('f6200000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at) values
  ('f6200000-0000-4000-8000-000000000011','f6200000-0000-4000-8000-000000000001',25,'completed',now()),
  ('f6200000-0000-4000-8000-000000000012','f6200000-0000-4000-8000-000000000002',25,'completed',now()),
  ('f6200000-0000-4000-8000-000000000013','f6200000-0000-4000-8000-000000000001',25,'completed',now());
insert into public.tasks (id,user_id,title) values
  ('f6200000-0000-4000-8000-000000000021','f6200000-0000-4000-8000-000000000002','Recovery fixture');
insert into public.learning_documents (id,owner_id,task_id,file_name,file_path,mime_type,file_size_bytes,visibility)
values ('f6200000-0000-4000-8000-000000000031','f6200000-0000-4000-8000-000000000002',
  'f6200000-0000-4000-8000-000000000021','notes.pdf','recovery-test/notes.pdf','application/pdf',10,'shared');
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6200000-0000-4000-8000-000000000031','rag-resource-a@example.test',
  'f6200000-0000-4000-8000-000000000002');

create temp table recovery_results (name text primary key, body jsonb not null);
grant all on recovery_results to service_role;
create function pg_temp.uid() returns uuid language sql immutable as $$
  select 'f6200000-0000-4000-8000-000000000001'::uuid
$$;
create function pg_temp.focus() returns uuid language sql immutable as $$
  select 'f6200000-0000-4000-8000-000000000011'::uuid
$$;
create function pg_temp.req(n integer) returns uuid language sql immutable as $$
  select ('f6210000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.documents(scoped boolean) returns jsonb language sql immutable as $$
  select case when scoped then '["f6200000-0000-4000-8000-000000000031"]'::jsonb else '[]'::jsonb end
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

create function pg_temp.reservation(n integer, mode text default 'continue') returns jsonb language sql as $$
  select public.rag_v2_reserve_new_chat_preparation(pg_temp.uid(),pg_temp.focus(),s,pg_temp.req(n),
    pg_temp.payload(s,mode,true),false)
  from (select pg_temp.result('first','session_id') s) source
$$;
create function pg_temp.saved(label text) returns jsonb language sql as $$
  select body from recovery_results where name=label
$$;
create function pg_temp.commit(label text, token uuid default null, attempts jsonb default null)
returns jsonb language sql as $$
  select public.rag_v2_commit_prepared_new_chat(pg_temp.uid(),(body->>'preparation_id')::uuid,
    coalesce(token,(body->>'lease_token')::uuid),body->'revision',pg_temp.memory(),attempts)
  from recovery_results where name=label
$$;
create function pg_temp.fail_preparation(label text) returns boolean language sql as $$
  select public.rag_v2_fail_new_chat_preparation(pg_temp.uid(),(body->>'preparation_id')::uuid,
    (body->>'lease_token')::uuid,'generation_failed') from recovery_results where name=label
$$;

set local role anon;
select throws_ok('select public.rag_v2_reserve_new_chat_preparation(null,null,null,null,null,null)',
  '42501',null,'PREP01 anonymous reservation denied');
reset role;
set local role authenticated;
select throws_ok('select count(*) from public.rag_chat_preparations','42501',null,'PREP02 authenticated table access denied');
reset role;
set local role service_role;

insert into recovery_results values ('first',pg_temp.ask(1));
do $$ begin perform pg_temp.complete(pg_temp.saved('first')); end $$;
select throws_ok($$select public.rag_v2_reserve_new_chat_preparation('f6200000-0000-4000-8000-000000000002',
  'f6200000-0000-4000-8000-000000000012',pg_temp.result('first','session_id'),pg_temp.req(21),'{}',false)$$,
  'P0001','RAG_SESSION_NOT_FOUND','PREP03 another user cannot reserve source');
insert into recovery_results values ('live-ask',pg_temp.ask(2,pg_temp.result('first','session_id')));
select throws_ok('select pg_temp.reservation(21)','P0001','RAG_TURN_IN_PROGRESS','PREP08 active Ask blocks preparation');
do $$ begin perform pg_temp.fail(pg_temp.saved('live-ask')); end $$;

insert into recovery_results values ('preparation',pg_temp.reservation(21));
select ok(pg_temp.saved('preparation')->>'outcome'='reserved'
  and pg_temp.result('preparation','lease_token') is not null,'PREP04 reservation grants one generation lease');
select is(pg_temp.reservation(21),jsonb_build_object('outcome','processing',
  'preparation_id',pg_temp.result('preparation','preparation_id')),'PREP05 duplicate receives processing without lease');
select throws_ok($$select pg_temp.reservation(21,'fresh')$$,'P0001','RAG_IDEMPOTENCY_CONFLICT','PREP06 changed payload conflicts');
select throws_ok('select pg_temp.reservation(22)','P0001','RAG_NEW_CHAT_IN_PROGRESS','PREP07 distinct request blocked');
select throws_ok($$select pg_temp.ask(3,pg_temp.result('first','session_id'))$$,
  'P0001','RAG_NEW_CHAT_IN_PROGRESS','PREP09 new Ask blocked while preparing');
select is(pg_temp.ask(1)->>'outcome','completed','PREP10 completed Ask remains replayable');
select throws_ok($$select pg_temp.commit('preparation','00000000-0000-0000-0000-000000000001')$$,
  'P0001','RAG_INVALID_LEASE','PREP11 wrong lease rejected');
select is(public.rag_v2_restore_context(pg_temp.uid(),pg_temp.focus())->'pending_operation'->>'operation','new_chat',
  'PREP20 restore discovers canonical pending New Chat');
select is(public.rag_v2_pending_new_chat(pg_temp.uid(),'f6200000-0000-4000-8000-000000000013'),null::jsonb,
  'PREP21 pending metadata is isolated by focus');
select ok(not (public.rag_v2_restore_context(pg_temp.uid(),pg_temp.focus())->'pending_operation'
  ?| array['lease_token','request_payload','preparation_id']),'PREP22 restore omits credentials and payload');
select throws_ok($$select public.rag_v2_commit_new_chat_recovery(pg_temp.uid(),pg_temp.focus(),s,pg_temp.req(22),
  pg_temp.payload(s,'fresh',true),null,null,false) from (select pg_temp.result('first','session_id') s) source$$,
  'P0001','RAG_NEW_CHAT_IN_PROGRESS','PREP23 legacy commit cannot bypass a live preparation');

update public.rag_chat_preparations set lease_expires_at=clock_timestamp()-interval '1 second'
where id=pg_temp.result('preparation','preparation_id');
select throws_ok($$select pg_temp.commit('preparation')$$,'P0001','RAG_INVALID_LEASE','PREP12 expired lease rejected');
select is(public.rag_v2_recover_expired_preparation(pg_temp.uid(),pg_temp.focus(),pg_temp.req(21))->>'status',
  'failed','PREP18 recovery terminally fails expired preparation');
select throws_ok($$select pg_temp.commit('preparation')$$,'P0001','RAG_INVALID_LEASE','PREP19 late worker cannot commit');

insert into recovery_results values ('revoked',pg_temp.reservation(22));
reset role;
delete from public.learning_document_permissions where document_id='f6200000-0000-4000-8000-000000000031';
set local role service_role;
select throws_ok($$select pg_temp.commit('revoked')$$,'P0001','RAG_DOCUMENT_ACCESS_DENIED','PREP13 ACL rechecked at commit');
select ok(pg_temp.fail_preparation('revoked') and
  (select status from public.rag_chat_sessions where id=pg_temp.result('first','session_id'))='active',
  'PREP14 known failure preserves the active source');
reset role;
insert into public.learning_document_permissions (document_id,user_email,created_by)
values ('f6200000-0000-4000-8000-000000000031','rag-resource-a@example.test','f6200000-0000-4000-8000-000000000002');
alter table public.rag_chat_handoffs add constraint phase6b_injected_failure check (false) not valid;
set local role service_role;
insert into recovery_results values ('commit',pg_temp.reservation(23));
select throws_ok($$select pg_temp.commit('commit')$$,'23514',null,'PREP17 handoff insert failure rolls back commit');
select ok((select status from public.rag_chat_sessions where id=pg_temp.result('first','session_id'))='active'
  and (select count(*) from public.rag_chat_sessions where focus_session_id=pg_temp.focus())=1
  and (select status from public.rag_chat_preparations where id=pg_temp.result('commit','preparation_id'))='processing',
  'PREP17 rollback leaves the source and preparation in their original state');
reset role;
alter table public.rag_chat_handoffs drop constraint phase6b_injected_failure;
set local role service_role;
select throws_ok($$select pg_temp.commit('commit',null,'[{"raw_prompt":"not allowed"}]')$$,
  'P0001','RAG_INVALID_RESPONSE','PREP24 provider attempt metadata has an explicit whitelist');
select throws_ok($$select pg_temp.commit('commit',null,(select jsonb_agg(
  '{"stage":"handoff","provider":"groq","model":"fixture","outcome":"unknown","latency_ms":10}'::jsonb)
  from generate_series(1,17)))$$,'P0001','RAG_INVALID_RESPONSE','PREP24 oversized metadata is rejected');
insert into recovery_results values ('committed',pg_temp.commit('commit',null,'[
  {"stage":"handoff","provider":"groq","model":"fixture","outcome":"failed","latency_ms":5,"total_tokens":17},
  {"stage":"handoff","provider":"groq","model":"fixture","outcome":"unknown","latency_ms":10,"total_tokens":null}
]'));
select results_eq($$select provider_calls_total,known_provider_tokens,unknown_usage_attempts
  from public.rag_chat_preparations where id=pg_temp.result('commit','preparation_id')$$,
  $$values (2,17,1)$$,'PREP24 incomplete and unknown usage remain distinct in storage');
select results_eq($$select status from public.rag_chat_sessions where id in
  (pg_temp.result('first','session_id'),pg_temp.result('committed','target_session_id')) order by status$$,
  $$values ('active'::text),('closed'::text)$$,'PREP15 source closes and exactly one target becomes active');
select is(pg_temp.commit('commit')->>'target_session_id',pg_temp.saved('committed')->>'target_session_id',
  'PREP16 duplicate commit replays the same target');

select * from finish();
rollback;
