import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from app.clients.rag_llm_client import RagChatGeneration, generate_rag_chat
from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.schemas.rag_conversation_context import (
    RagContextMetadata,
    RagConversationContext,
    RagRetrievalStrategy,
)
from app.security.rag_citations import validate_rag_citations
from app.security.rag_dispatch import require_rag_dispatch_authorization
from app.security.rag_privacy import sanitize_rag_text
from app.services.rag_chat_service import _generate_query_embedding, _retrieve_chunks
from app.services.rag_context_builder import build_conversational_context
from app.services.rag_retrieval_context import build_retrieval_query


@dataclass(frozen=True)
class RagConversationalAnswer:
    answer: str
    sources: list[dict[str, Any]]
    generation: RagChatGeneration | None
    context: RagContextMetadata


@dataclass(frozen=True)
class RagRetrievalObservation:
    retrieved: tuple[tuple[str, str], ...]
    packed: tuple[tuple[str, str], ...]
    strategy: RagRetrievalStrategy
    latency_ms: int
    sources_truncated: bool


def generate_conversational_answer(
    *,
    supabase: Any,
    user_id: str,
    question: str,
    selected_document_ids: list[str],
    top_k: int,
    prompt_variant: Literal["grounded_rule", "no_rule"],
    preferred_locale: str,
    context: RagConversationContext,
    deadline: RagDeadline | None = None,
    execution_context: RagExecutionContext | None = None,
    observe_retrieval: Callable[[RagRetrievalObservation], None] | None = None,
    retrieval_only: bool = False,
) -> RagConversationalAnswer:
    require_rag_dispatch_authorization()
    provider_question = sanitize_rag_text(question, target="provider") if settings.rag_privacy_filter_enabled else question
    document_mode = bool(selected_document_ids)
    strategy: RagRetrievalStrategy = "none"
    sources: list[dict[str, Any]] = []
    retrieval_started = time.perf_counter()
    retrieval_latency_ms = 0
    if document_mode:
        summary = context.summary if settings.rag_rolling_summary_enabled else None
        if settings.rag_context_quality_enabled and summary and (
            summary.covered_turn_index >= context.current_turn_index
            or summary.covered_turn_count > context.completed_turn_count
        ):
            summary = None
        query = build_retrieval_query(
            provider_question,
            context.recent_turns,
            summary,
            context.handoff if settings.rag_new_chat_enabled and settings.rag_handoff_enabled else None,
        )
        strategy = query.strategy
        query_text = sanitize_rag_text(query.text, target="provider") if settings.rag_privacy_filter_enabled else query.text
        embedding = (
            _generate_query_embedding(query_text, deadline=deadline, execution_context=execution_context)
            if deadline or execution_context else _generate_query_embedding(query_text)
        )
        sources = _retrieve_chunks(
            supabase,
            user_id=user_id,
            query_embedding=embedding,
            selected_document_ids=selected_document_ids,
            top_k=top_k,
            **({"deadline": deadline} if deadline else {}),
        )
        retrieval_latency_ms = round((time.perf_counter() - retrieval_started) * 1000)

    if deadline:
        deadline.require_remaining()
    built = build_conversational_context(
        question=provider_question,
        context=context,
        sources=sources,
        document_mode=document_mode,
        prompt_variant=prompt_variant,
        preferred_locale=preferred_locale,
        retrieval_strategy=strategy,
    )

    if observe_retrieval is not None:
        observe_retrieval(RagRetrievalObservation(
            retrieved=tuple((source["chunk_id"], source["document_id"]) for source in sources),
            packed=tuple((source["chunk_id"], source["document_id"]) for source in built.sources),
            strategy=strategy,
            latency_ms=retrieval_latency_ms,
            sources_truncated=built.metadata.sources_truncated,
        ))
    if retrieval_only:
        return RagConversationalAnswer("", built.sources, None, built.metadata)

    if document_mode and prompt_variant == "grounded_rule" and not built.sources:
        answer = (
            "Mình không tìm thấy đủ thông tin phù hợp trong các tài liệu đã chọn."
            if preferred_locale == "vi"
            else "I could not find enough information in the selected documents."
        )
        return RagConversationalAnswer(
            answer=answer,
            sources=[],
            generation=None,
            context=built.metadata.model_copy(
                update={
                    "estimated_prompt_tokens": 0,
                    "history_turns_used": 0,
                    "summary_version_used": None,
                    "summary_tokens_used": 0,
                    "summary_covered_turn_index": None,
                    "summary_generation_method": None,
                    "handoff_used": False,
                    "handoff_tokens_used": 0,
                    "handoff_id": None,
                    "generation_attempts": 0,
                    "history_tokens_used": 0,
                    "summary_covered_turn_count": 0,
                    "truncated_history_turns": 0,
                    "omitted_history_turns": (
                        context.completed_turn_count if settings.rag_context_quality_enabled else 0
                    ),
                }
            ),
        )

    generation = (
        generate_rag_chat(built.messages, deadline_at=deadline.expires_at if deadline else None,
                          execution_context=execution_context)
        if deadline or execution_context else generate_rag_chat(built.messages)
    )
    answer, unsupported = validate_rag_citations(generation.text, len(built.sources))
    return RagConversationalAnswer(
        answer=answer,
        sources=built.sources,
        generation=generation,
        context=built.metadata.model_copy(update={"generation_attempts": generation.attempts,
                                                  "citation_validation": "unsupported" if unsupported else "valid"}),
    )
