import os
import time
from typing import Any, Literal
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types
from supabase import create_client

from app.clients.llm_client import LLMTextGeneration, generate_text
from app.core.config import settings


MARKDOWN_FORMATTING_RULES = """
Formatting:
- Use Markdown for readability.
- Use short headings, bullet lists, and numbered steps when they make the answer easier to scan.
- Use **bold** for key terms or important conclusions.
- Use fenced code blocks with a language label for code, commands, formulas, or structured examples.
- Do not wrap the entire answer in a code block.
""".strip()


def _get_supabase_admin():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
        )

    return create_client(supabase_url, service_role_key)


def _configure_gemini():
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be configured.")

    return genai.Client(api_key=settings.gemini_api_key)


def _normalize_top_k(top_k: int) -> int:
    allowed = [3, 5, 7]

    if top_k in allowed:
        return top_k

    return min(allowed, key=lambda value: abs(value - top_k))


def _generate_query_embedding(question: str) -> list[float]:
    client = _configure_gemini()

    model_name = settings.gemini_embedding_model

    result = client.models.embed_content(
        model=model_name,
        contents=question,
        config=types.EmbedContentConfig(output_dimensionality=768)
    )

    [embedding] = result.embeddings
    embedding_length = len(embedding.values)
    
    if not embedding:
        raise RuntimeError("Gemini did not return an embedding.")

    if embedding_length != 768:
        raise RuntimeError(
            f"Embedding dimension mismatch. Expected 768, got {len(embedding_length)}. "
        )

    return embedding.values


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
) -> str:
    if session_id:
        response = (
            supabase.table("rag_chat_sessions")
            .select("id,user_id")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )

        if response.data:
            return response.data["id"]

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
) -> list[dict[str, Any]]:
    response = supabase.rpc(
        "match_learning_document_chunks",
        {
            "p_query_embedding": _to_pgvector_literal(query_embedding),
            "p_match_count": top_k,
            "p_document_ids": selected_document_ids,
            "p_user_id": user_id,
        },
    ).execute()

    return response.data or []


def _build_general_prompt(question: str) -> str:
    return f"""
You are Lumivox Study Assistant, a helpful AI tutor for students.

Rules:
1. Explain clearly and practically.
2. If the question is academic, break the answer into simple steps.
3. Encourage focused learning.
4. Do not claim that you used uploaded documents unless document context was provided.
5. Do not answer questions outside study scope, politely refusing users if you receive unrelevant questions.
6. Detect the language of the user's question and respond STRICTLY in that same language. Do not switch languages mid-response.
7. Technical terms may be kept in English but must be explained in user's language.

{MARKDOWN_FORMATTING_RULES}

User question:
{question}

Answer:
""".strip()


def _build_no_rule_prompt(
    *,
    question: str,
    chunks: list[dict[str, Any]],
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

Answer the user's question clearly.
""".strip()


def _build_grounded_prompt(
    *,
    question: str,
    chunks: list[dict[str, Any]],
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
7. Detect the language of the user's question and respond STRICTLY in that same language. Do not switch languages mid-response.
8. Technical terms may be kept in English but must be explained in user's language.

{MARKDOWN_FORMATTING_RULES}

Retrieved context:
{context}

User question:
{question}

Answer:
""".strip()


def _generate_answer_from_prompt(prompt: str) -> LLMTextGeneration:
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
        }
    ).execute()


def ask_rag_question(
    *,
    user_id: str,
    question: str,
    selected_document_ids: list[str],
    focus_session_id: str | None,
    session_id: str | None,
    top_k: int,
    prompt_variant: Literal["no_rule", "grounded_rule"],
) -> dict[str, Any]:
    started_at = time.perf_counter()
    supabase = _get_supabase_admin()

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
    )

    generation: LLMTextGeneration | None = None

    if context_mode == "general":
        prompt = _build_general_prompt(question)
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
                )
            else:
                prompt = _build_grounded_prompt(
                    question=question,
                    chunks=sources,
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
    }
