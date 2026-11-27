begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('f6600000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;

insert into auth.users (id,email)
values (pg_temp.id(1),'rag-release-owner@example.test'),(pg_temp.id(2),'rag-release-peer@example.test');
insert into public.profiles (id) values (pg_temp.id(1)),(pg_temp.id(2)) on conflict do nothing;
insert into public.tasks (id,user_id,title) values (pg_temp.id(11),pg_temp.id(1),'RAG release fixture');
insert into public.learning_documents (id,owner_id,task_id,file_name,file_path,mime_type,file_size_bytes,visibility)
values (pg_temp.id(21),pg_temp.id(1),pg_temp.id(11),'note.txt','fixture/note.txt','text/plain',14,'shared');
insert into public.learning_document_permissions (document_id,user_email,created_by)
values (pg_temp.id(21),'rag-release-peer@example.test',pg_temp.id(1));
insert into public.document_chunks (document_id,owner_id,chunk_index,content,content_char_count)
values (pg_temp.id(21),pg_temp.id(1),0,'Existing chunk',14);
insert into public.rag_chat_sessions(id,user_id,conversation_version,title)
values (pg_temp.id(31),pg_temp.id(1),1,'Legacy topic');

set local role anon;
select throws_ok('select * from public.rag_document_processing_jobs','42501',null,'Anonymous job read denied');
reset role;
set local role authenticated;
select throws_ok('select public.rag_begin_document_processing(null,null,null)','42501',null,'Internal ingestion RPC is service-only');
select throws_ok('select public.rag_assert_legacy_dispatch(null,null,null,null)','42501',null,'Internal legacy RPC is service-only');
reset role;

set local role service_role;
select ok(public.rag_assert_legacy_dispatch(pg_temp.id(2),null,null,array[pg_temp.id(21)]),
  'Legacy user can read current shared scope');
select throws_ok('select public.rag_assert_legacy_dispatch(pg_temp.id(2),pg_temp.id(31),null,null)',
  'P0001','RAG_SESSION_NOT_FOUND','Legacy session is scoped to its owner');
select throws_ok('select public.rag_begin_document_processing(pg_temp.id(21),pg_temp.id(2),pg_temp.id(41))',
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','Shared read access does not authorize indexing');
delete from public.learning_document_permissions where document_id=pg_temp.id(21);
select throws_ok('select public.rag_assert_legacy_dispatch(pg_temp.id(2),null,null,array[pg_temp.id(21)])',
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','Legacy scope requires current access after revocation');

select is(public.rag_begin_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(41))->>'file_path',
  'fixture/note.txt','Owner reserves a processing identity');
select ok(public.rag_assert_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(41)),
  'Current operation may dispatch');
select is((select content from public.document_chunks where document_id=pg_temp.id(21)), 'Existing chunk',
  'Previously indexed chunk stays until successful finalization');
do $$ begin perform public.rag_begin_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(42)); end $$;
select throws_ok('select public.rag_assert_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(41))',
  'P0001','RAG_DOCUMENT_PROCESSING_STALE','Superseded worker cannot dispatch another embedding');
select throws_ok('select public.rag_finish_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(41),''failed'',null,null)',
  'P0001','RAG_DOCUMENT_PROCESSING_STALE','Superseded worker cannot update replacement status');
select throws_ok($sql$
  select public.rag_finish_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(42),'completed','test',
    '[{"chunk_index":0,"content":"Replacement","token_estimate":2,"embedding":"[0.1]","embedding_model":"fixture","metadata":{}}]')
$sql$, '22000',null,'Invalid chunk write aborts finalization');
select is((select content from public.document_chunks where document_id=pg_temp.id(21)), 'Existing chunk',
  'Failed replacement rolls back its deletion');
select is(public.rag_finish_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(42),'completed','new preview',
  jsonb_build_array(jsonb_build_object('chunk_index',0,'content','Replacement','token_estimate',2,
    'embedding',(array_fill(0.1::real,array[768])::extensions.vector(768))::text,'embedding_model','fixture','metadata','{}'::jsonb))),
  1,'Current worker can atomically replace chunks');
select is((select extracted_text_status from public.learning_documents where id=pg_temp.id(21)),
  'completed','Document status commits with replacement');
do $$ begin perform public.rag_begin_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(43)); end $$;
delete from public.learning_documents where id=pg_temp.id(21);
select throws_ok('select public.rag_finish_document_processing(pg_temp.id(21),pg_temp.id(1),pg_temp.id(43),''completed'',null,''[]'')',
  'P0001','RAG_DOCUMENT_ACCESS_DENIED','Deleted document rejects late finalization');
select is((select count(*)::integer from public.document_chunks where document_id=pg_temp.id(21)),0,
  'Deletion creates no orphan chunks');

select * from finish();
rollback;
