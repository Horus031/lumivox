import time
from typing import Any, Literal

from google.genai import types

from app.clients.gemini_client import get_gemini_client
from app.clients.llm_client import LLMTextGeneration, generate_text
from app.clients.supabase_client import get_supabase_client
from app.clients.supabase_client import bounded_rag_supabase
from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext, RagProviderAttempt
from app.security.rag_dispatch import before_rag_dispatch
from app.security.rag_privacy import sanitize_rag_text
from app.services.rag_provider_execution import RagProviderExecutionError
from app.services.rag_conversation_store import RagConversationError


MARKDOWN_FORMATTING_RULES = r"""Formatting:
- Use CommonMark and GitHub Flavored Markdown.
- Prefer concise headings, paragraphs, and lists.
- Use **bold** for key concepts or conclusions.
- Use Markdown tables for meaningful comparisons.
- Include a header row and a valid delimiter row
  in every Markdown table.
- Keep table cells concise when possible.
- Put executable code and commands in fenced code
  blocks with an appropriate language identifier,
  such as python, javascript, sql, or bash.
- Use inline code for identifiers, variables,
  filenames, and short commands.
- Use $...$ for inline mathematical expressions.
- Use $$ delimiters on separate lines for display
  equations, with the expression on its own line.
- Do not put mathematical expressions inside code
  fences when they should be rendered as equations.
- Escape literal dollar signs when they represent
  currency rather than mathematical notation.
- Use nested lists when explaining hierarchical
  concepts or multi-step procedures.
- Do not generate raw HTML, embedded images,
  iframes, scripts, or executable interactive content.
- Do not wrap the entire answer in a code fence.
- Choose formatting based on the educational value
  of the answer; do not force tables or equations
  when plain explanations are more appropriate.
""".strip()

def _locale_instruction(preferred_locale: str | None) -> str:
    if preferred_locale == "vi":
        return (
            "Respond STRICTLY in Vietnamese. "
            "Technical terms may remain in English if needed, but explain them in Vietnamese."
        )

    if preferred_locale == "en":
        return "Respond STRICTLY in English."

    return (
        "Detect the language of the user's question and respond strictly in that same language."
    )


def _normalize_top_k(top_k: int) -> int:
    allowed = [3, 5, 7]

    if top_k in allowed:
        return top_k

    return min(allowed, key=lambda value: abs(value - top_k))


def _generate_query_embedding(
    question: str, *, deadline: RagDeadline | None = None, execution_context: RagExecutionContext | None = None,
) -> list[float]:
    client = get_gemini_client()

    model_name = settings.gemini_embedding_model

    if execution_context and not execution_context.has_provider_budget("embedding"):
        raise RagProviderExecutionError("provider_call_budget_exceeded")
    before_rag_dispatch(question, deadline=deadline)
    http_options = None
    if deadline:
        http_options = types.HttpOptions(
            timeout=max(1, int(deadline.require_remaining() * 1_000)),
            retry_options=types.HttpRetryOptions(attempts=1),
        )
    attempt = None
    if execution_context:
        attempt = RagProviderAttempt("embedding", "google", model_name)
        execution_context.attempts.append(attempt)
    started = time.monotonic()
    try:
        result = client.models.embed_content(
            model=model_name, contents=question,
            config=types.EmbedContentConfig(output_dimensionality=768, http_options=http_options),
        )
        if deadline:
            deadline.require_remaining()
        if not result.embeddings or len(result.embeddings) != 1:
            raise RuntimeError("Gemini did not return one embedding.")
        values = result.embeddings[0].values
        if not values or len(values) != 768:
            raise RuntimeError("Gemini returned an invalid embedding dimension.")
        if attempt:
            attempt.outcome = "success"
        return values
    except Exception as error:
        if attempt:
            attempt.outcome = "failed" if isinstance(getattr(error, "code", None), int) else "unknown"
            attempt.error_code = "embedding_failed"
        raise
    finally:
        if attempt:
            attempt.latency_ms = max(0, round((time.monotonic() - started) * 1_000))


def _to_pgvector_literal(values: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in values) + "]"


def _get_or_create_session(
    supabase: Any,
    *,
    user_id: str,
    session_id: str | None,
    focus_session_id: str | None,
    prompt_variant: str,
    context_mode: str,
    selected_document_ids: list[str],
    top_k: int,
    question: str,
    preferred_locale: str | None,
) -> str:
    if session_id is not None:
        if not session_id:
            raise RagConversationError("RAG_SESSION_NOT_FOUND", 404)

        response = (
            supabase.table("rag_chat_sessions")
            .select("id,user_id")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .eq("conversation_version", 1)
            .maybe_single()
            .execute()
        )

        if response is not None and response.data:
            return response.data["id"]

        raise RagConversationError("RAG_SESSION_NOT_FOUND", 404)

    insert_response = (
        supabase.table("rag_chat_sessions")
        .insert(
            {
                "user_id": user_id,
                "focus_session_id": focus_session_id,
                "title": question[:80],
                "prompt_variant": prompt_variant,
                "context_mode": context_mode,
                "selected_document_ids": selected_document_ids,
                "top_k": top_k,
                "preferred_locale": preferred_locale or "auto",
            }
        )
        .execute()
    )

    data = insert_response.data

    if not data:
        raise RuntimeError("Failed to create RAG chat session.")

    return data[0]["id"]


def _retrieve_chunks(
    supabase: Any,
    *,
    user_id: str,
    query_embedding: list[float],
    selected_document_ids: list[str],
    top_k: int,
    deadline: RagDeadline | None = None,
) -> list[dict[str, Any]]:
    params = {
        "p_query_embedding": _to_pgvector_literal(query_embedding), "p_match_count": top_k,
        "p_document_ids": selected_document_ids, "p_user_id": user_id,
    }
    if deadline:
        deadline.require_remaining()
        with bounded_rag_supabase(deadline) as client:
            response = client.rpc("match_learning_document_chunks", params).execute()
        deadline.require_remaining()
    else:
        response = supabase.rpc("match_learning_document_chunks", params).execute()

    return response.data or []


def _build_general_prompt(question: str, preferred_locale: str | None) -> str:
    return f"""
You are Lumivox Study Assistant, a helpful AI tutor for students.

Rules:
1. Explain clearly and practically.
2. If the question is academic, break the answer into simple steps.
3. Encourage focused learning.
4. Do not claim that you used uploaded documents unless document context was provided.
5. Do not answer questions outside study scope, politely refusing users if you receive unrelevant questions.
6. {_locale_instruction(preferred_locale)}
7. Do not switch languages mid-response.
8. Technical terms may be kept in English but must be explained in user's language.

{MARKDOWN_FORMATTING_RULES}

User question:
{question}

Answer:
""".strip()


def _build_no_rule_prompt(
    *,
    question: str,
    chunks: list[dict[str, Any]],
    preferred_locale: str | None
) -> str:
    context = "\n\n".join(
        [
            f"[Source {index + 1}: {chunk['file_name']} - chunk {chunk['chunk_index']}]\n{chunk['content']}"
            for index, chunk in enumerate(chunks)
        ]
    )

    return f"""
You are a helpful study assistant.

Use the following document context if it is useful.

Context:
{context}

Question:
{question}

{MARKDOWN_FORMATTING_RULES}

{_locale_instruction(preferred_locale)}
Do not switch languages mid-response.

Answer the user's question clearly.
""".strip()


def _build_grounded_prompt(
    *,
    question: str,
    chunks: list[dict[str, Any]],
    preferred_locale: str | None
) -> str:
    context = "\n\n".join(
        [
            f"[Source {index + 1}: {chunk['file_name']} - chunk {chunk['chunk_index']}]\n{chunk['content']}"
            for index, chunk in enumerate(chunks)
        ]
    )

    return f"""
You are Lumivox Study Assistant. You must answer using only the retrieved document context below.

Rules:
1. Use only the information from the retrieved context.
2. If the context does not contain enough information, say: "I could not find enough information in the selected documents."
3. Do not invent facts, definitions, or examples not supported by the context.
4. Keep the answer concise and useful for a student.
5. Mention the most relevant source numbers at the end of the answer.
6. Do not answer questions outside study scope, politely refusing users if you receive unrelevant questions.
7. {_locale_instruction(preferred_locale)}
8. Do not switch languages mid-response.
9. Technical terms may be kept in English but must be explained in user's language.

{MARKDOWN_FORMATTING_RULES}

Retrieved context:
{context}

User question:
{question}

Answer:
""".strip()


def _generate_answer_from_prompt(prompt: str) -> LLMTextGeneration:
    before_rag_dispatch(prompt)
    return generate_text(prompt)


def _store_message(
    supabase: Any,
    *,
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    prompt_variant: str | None,
    context_mode: str,
    selected_document_ids: list[str],
    top_k: int | None,
    retrieved_chunks: list[dict[str, Any]] | None = None,
    model_name: str | None = None,
    latency_ms: int | None = None,
    content_locale: str | None = None,
    preferred_locale: str | None = None,
) -> None:
    retrieved_chunks = retrieved_chunks or []

    supabase.table("rag_chat_messages").insert(
        {
            "session_id": session_id,
            "user_id": user_id,
            "role": role,
            "content": content,
            "prompt_variant": prompt_variant,
            "context_mode": context_mode,
            "selected_document_ids": selected_document_ids,
            "top_k": top_k,
            "retrieved_chunk_ids": [
                chunk["chunk_id"] for chunk in retrieved_chunks
            ],
            "retrieved_context": retrieved_chunks,
            "model_name": model_name,
            "latency_ms": latency_ms,
            "content_locale": content_locale or "auto",
            "preferred_locale": preferred_locale or "auto",
        }
    ).execute()


def generate_rag_answer(
    *,
    supabase: Any,
    user_id: str,
    question: str,
    selected_document_ids: list[str],
    top_k: int,
    prompt_variant: Literal[
        "no_rule", "grounded_rule"
    ],
    preferred_locale: str,
) -> tuple[
    str,
    list[dict[str, Any]],
    LLMTextGeneration | None,
]:
    if settings.rag_privacy_filter_enabled:
        question = sanitize_rag_text(question, target="provider")
    if not selected_document_ids:
        prompt = _build_general_prompt(
            question,
            preferred_locale=preferred_locale,
        )

        generation = _generate_answer_from_prompt(
            prompt
        )

        return generation.text, [], generation

    query_embedding = _generate_query_embedding(
        question
    )

    sources = _retrieve_chunks(
        supabase,
        user_id=user_id,
        query_embedding=query_embedding,
        selected_document_ids=selected_document_ids,
        top_k=top_k,
    )

    if not sources:
        answer = (
            "Mình không tìm thấy thông tin phù hợp "
            "trong các tài liệu đã chọn."
            if preferred_locale == "vi"
            else
            "I could not find relevant information "
            "in the selected documents."
        )

        return answer, [], None

    builder = (
        _build_no_rule_prompt
        if prompt_variant == "no_rule"
        else _build_grounded_prompt
    )
    if settings.rag_privacy_filter_enabled:
        sources = [{**source, "content": sanitize_rag_text(source["content"], target="provider"),
                    "file_name": sanitize_rag_text(source["file_name"], target="provider")} for source in sources]

    prompt = builder(
        question=question,
        chunks=sources,
        preferred_locale=preferred_locale,
    )

    generation = _generate_answer_from_prompt(
        prompt
    )

    return generation.text, sources, generation


def ask_rag_question(
    *,
    user_id: str,
    question: str,
    selected_document_ids: list[str],
    focus_session_id: str | None,
    session_id: str | None,
    top_k: int,
    prompt_variant: Literal["no_rule", "grounded_rule"],
    preferred_locale: Literal["auto", "en", "vi"] = "auto",
) -> dict[str, Any]:
    started_at = time.perf_counter()
    supabase = get_supabase_client()

    normalized_top_k = _normalize_top_k(top_k)

    context_mode = (
        "document_rag"
        if len(selected_document_ids) > 0
        else "general"
    )

    chat_session_id = _get_or_create_session(
        supabase,
        user_id=user_id,
        session_id=session_id,
        focus_session_id=focus_session_id,
        prompt_variant=prompt_variant,
        context_mode=context_mode,
        selected_document_ids=selected_document_ids,
        top_k=normalized_top_k,
        question=question,
        preferred_locale=preferred_locale,
    )

    _store_message(
        supabase,
        session_id=chat_session_id,
        user_id=user_id,
        role="user",
        content=question,
        prompt_variant=prompt_variant,
        context_mode=context_mode,
        selected_document_ids=selected_document_ids,
        top_k=normalized_top_k if context_mode == "document_rag" else None,
        content_locale="auto",
        preferred_locale=preferred_locale,
    )

    generation: LLMTextGeneration | None = None

    if context_mode == "general":
        prompt = _build_general_prompt(question, preferred_locale=preferred_locale,)
        generation = _generate_answer_from_prompt(prompt)
        answer = generation.text
        sources: list[dict[str, Any]] = []

    else:
        query_embedding = _generate_query_embedding(question)

        sources = _retrieve_chunks(
            supabase,
            user_id=user_id,
            query_embedding=query_embedding,
            selected_document_ids=selected_document_ids,
            top_k=normalized_top_k,
        )

        if not sources:
            answer = (
                "I could not find relevant information in the selected documents. "
                "Please make sure the documents have been processed for AI."
            )
        else:
            if prompt_variant == "no_rule":
                prompt = _build_no_rule_prompt(
                    question=question,
                    chunks=sources,
                    preferred_locale=preferred_locale,
                )
            else:
                prompt = _build_grounded_prompt(
                    question=question,
                    chunks=sources,
                    preferred_locale=preferred_locale,
                )

            generation = _generate_answer_from_prompt(prompt)
            answer = generation.text

    latency_ms = int((time.perf_counter() - started_at) * 1000)

    _store_message(
        supabase,
        session_id=chat_session_id,
        user_id=user_id,
        role="assistant",
        content=answer,
        prompt_variant=prompt_variant,
        context_mode=context_mode,
        selected_document_ids=selected_document_ids,
        top_k=normalized_top_k if context_mode == "document_rag" else None,
        retrieved_chunks=sources,
        model_name=generation.model if generation else None,
        latency_ms=latency_ms,
        content_locale=preferred_locale,
        preferred_locale=preferred_locale,
    )

    return {
        "session_id": chat_session_id,
        "answer": answer,
        "sources": sources,
        "prompt_variant": prompt_variant,
        "context_mode": context_mode,
        "selected_document_ids": selected_document_ids,
        "top_k": normalized_top_k,
        "latency_ms": latency_ms,
        "preferred_locale": preferred_locale,
    }
