import logging
import time
from dataclasses import asdict
from typing import Any

from app.clients.rag_llm_client import RagLLMError
from app.clients.rag_summary_client import generate_rag_summary
from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.core.rag_telemetry import timed_stage
from app.core.rag_token_budget import RagTokenBudgetError
from app.schemas.rag_conversation_context import RagConversationContext, RagSummaryInput
from app.schemas.rag_conversation_summary import RagStoredSummary, RagSummaryMethod
from app.security.rag_dispatch import require_rag_dispatch_authorization
from app.services.rag_conversation_store import load_summary_input, save_conversation_summary
from app.services.rag_summary_builder import (
    build_extractive_summary,
    build_summary_messages,
    fit_summary_to_budget,
    summary_token_count,
)


logger = logging.getLogger(__name__)


@timed_stage("rolling_summary")
def maybe_refresh_summary(
    *,
    supabase: Any,
    user_id: str,
    session_id: str,
    turn_id: str,
    lease_token: str,
    context: RagConversationContext,
    deadline: RagDeadline | None = None,
    execution_context: RagExecutionContext | None = None,
) -> RagConversationContext:
    if not settings.rag_rolling_summary_enabled:
        return context.model_copy(update={"summary": None})
    if context.completed_turn_count < settings.rag_summary_start_turns:
        return context
    if deadline and deadline.remaining() <= 0.1:
        return context

    batch_size = settings.rag_summary_max_batch_turns
    snapshot = RagSummaryInput.model_validate(load_summary_input(
        supabase,
        user_id=user_id,
        session_id=session_id,
        turn_id=turn_id,
        lease_token=lease_token,
        recent_turns=settings.rag_recent_turns,
        batch_size=batch_size,
    ))
    current = snapshot.previous_summary
    context = context.model_copy(update={"summary": current})
    if not snapshot.turns or (
        current and len(snapshot.turns) < settings.rag_summary_update_interval
    ):
        return context

    previous = current.summary if current else None
    max_tokens = settings.rag_max_summary_tokens
    method: RagSummaryMethod = "llm"
    metadata: dict[str, Any] = {
        "schema_version": 1,
        "input_turn_count": len(snapshot.turns),
        "batch_size": batch_size,
    }
    try:
        messages = build_summary_messages(previous_summary=previous, turns=snapshot.turns)
        require_rag_dispatch_authorization()
        generation = generate_rag_summary(messages, **(
            {"deadline_at": deadline.expires_at, "execution_context": execution_context} if deadline else {}
        ))
        summary = fit_summary_to_budget(generation.summary, max_tokens)
        metadata.update(
            provider=generation.provider,
            model_name=generation.model,
            latency_ms=generation.latency_ms,
            **asdict(generation.usage),
        )
    except (RagLLMError, RagTokenBudgetError):
        if deadline and deadline.remaining() <= 0.1:
            return context
        method = "extractive"
        started = time.monotonic()
        try:
            summary = build_extractive_summary(
                previous_summary=previous, turns=snapshot.turns, max_tokens=max_tokens,
            )
        except RagTokenBudgetError:
            logger.warning("RAG summary exceeded its budget after extractive fallback.")
            return context
        metadata["latency_ms"] = round((time.monotonic() - started) * 1000)

    if deadline and deadline.remaining() <= 0.1:
        return context
    saved = save_conversation_summary(
        supabase,
        user_id=user_id,
        session_id=session_id,
        turn_id=turn_id,
        lease_token=lease_token,
        expected_version=current.version if current else 0,
        covered_turn_index=snapshot.turns[-1].turn_index,
        recent_turns=settings.rag_recent_turns,
        summary=summary.model_dump(),
        token_count=summary_token_count(summary),
        generation_method=method,
        metadata=metadata,
    )
    return context.model_copy(update={"summary": RagStoredSummary.model_validate(saved)})
