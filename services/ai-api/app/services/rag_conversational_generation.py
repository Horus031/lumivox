from dataclasses import dataclass
from typing import Any, Literal

from app.clients.rag_llm_client import RagChatGeneration, generate_rag_chat
from app.core.config import settings
from app.schemas.rag_conversation_context import (
    RagContextMetadata,
    RagConversationContext,
    RagRetrievalStrategy,
)
from app.services.rag_chat_service import _generate_query_embedding, _retrieve_chunks
from app.services.rag_context_builder import build_conversational_context
from app.services.rag_retrieval_context import build_retrieval_query


@dataclass(frozen=True)
class RagConversationalAnswer:
    answer: str
    sources: list[dict[str, Any]]
    generation: RagChatGeneration | None
    context: RagContextMetadata


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
) -> RagConversationalAnswer:
    document_mode = bool(selected_document_ids)
    strategy: RagRetrievalStrategy = "none"
    sources: list[dict[str, Any]] = []
    if document_mode:
        query = build_retrieval_query(
            question,
            context.recent_turns,
            context.summary if settings.rag_rolling_summary_enabled else None,
        )
        strategy = query.strategy
        sources = _retrieve_chunks(
            supabase,
            user_id=user_id,
            query_embedding=_generate_query_embedding(query.text),
            selected_document_ids=selected_document_ids,
            top_k=top_k,
        )

    built = build_conversational_context(
        question=question,
        context=context,
        sources=sources,
        document_mode=document_mode,
        prompt_variant=prompt_variant,
        preferred_locale=preferred_locale,
        retrieval_strategy=strategy,
    )

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
                    "generation_attempts": 0,
                }
            ),
        )

    generation = generate_rag_chat(built.messages)
    return RagConversationalAnswer(
        answer=generation.text,
        sources=built.sources,
        generation=generation,
        context=built.metadata.model_copy(update={"generation_attempts": generation.attempts}),
    )
