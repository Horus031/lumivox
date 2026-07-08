# RAG Evaluation SQL Queries

## 1. Check Processed Documents

```sql
select
  doc.id,
  doc.file_name,
  doc.extracted_text_status,
  count(chunk.id) as chunk_count,
  count(chunk.embedding) as embedding_count
from public.learning_documents doc
left join public.document_chunks chunk
  on chunk.document_id = doc.id
where doc.extracted_text_status = 'completed'
group by doc.id, doc.file_name, doc.extracted_text_status
order by chunk_count desc;
```

## 2. Check RAG Chat Sessions

```sql
select
  id,
  user_id,
  context_mode,
  prompt_variant,
  selected_document_ids,
  top_k,
  title,
  created_at
from public.rag_chat_sessions
order by created_at desc
limit 20;
```

## 3. Check RAG Assistant Messages

```sql
select
  id,
  session_id,
  role,
  context_mode,
  prompt_variant,
  selected_document_ids,
  top_k,
  array_length(retrieved_chunk_ids, 1) as retrieved_chunks,
  latency_ms,
  left(content, 300) as content_preview,
  created_at
from public.rag_chat_messages
order by created_at desc
limit 30;
```

## 4. Check Source Details for One Assistant Message

```sql
select
  id,
  role,
  retrieved_context
from public.rag_chat_messages
where id = 'MESSAGE_ID';
```