import time
from dataclasses import dataclass

from app.clients.rag_llm_client import RagLLMError
from app.clients.rag_summary_client import generate_rag_summary
from app.core.config import settings
from app.core.rag_execution_context import RagExecutionContext
from app.core.rag_token_budget import RagTokenBudgetError
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.schemas.rag_conversation_summary import (
    RagConversationSummary,
    RagSummaryMethod,
    SUMMARY_LIST_FIELDS,
    SUMMARY_TEXT_FIELDS,
)
from app.services.rag_conversation_store import RagConversationError
from app.security.rag_dispatch import require_rag_dispatch_authorization
from app.services.rag_summary_builder import (
    build_extractive_summary,
    build_summary_messages,
    fit_summary_to_budget,
    summary_token_count,
)


@dataclass(frozen=True)
class RagBuiltHandoff:
    summary: RagConversationSummary
    generation_method: RagSummaryMethod
    token_count: int
    latency_ms: int
    provider: str | None = None
    model_name: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


def merge_summary_seeds(
    inherited: RagConversationSummary | None, rolling: RagConversationSummary | None,
) -> RagConversationSummary | None:
    if inherited is None or rolling is None:
        return rolling or inherited
    earlier = inherited.model_dump()
    current = rolling.model_dump()
    for field in SUMMARY_TEXT_FIELDS:
        current[field] = current[field] or earlier[field]
    for field, limit in zip(SUMMARY_LIST_FIELDS, (12, 6, 8, 12, 8)):
        local = current[field]
        current[field] = list(dict.fromkeys([*(item for item in earlier[field] if item not in local), *local]))[-limit:]
    if inherited.main_topic and rolling.main_topic and inherited.main_topic != rolling.main_topic:
        note = "The previous conversation had a different study topic. Prefer the current topic."
        current["uncertainties"] = [*current["uncertainties"][-7:], note]
    return RagConversationSummary.model_validate(current)


def build_final_handoff(
    *,
    inherited: RagConversationSummary | None,
    rolling: RagConversationSummary | None,
    turns: list[RagCompletedTurn],
    execution_context: RagExecutionContext | None = None,
) -> RagBuiltHandoff:
    starts = time.monotonic()
    deadline = starts + settings.rag_handoff_deadline_seconds
    if execution_context is not None:
        deadline = min(deadline, execution_context.deadline.expires_at - settings.rag_completion_reserve_seconds)
    budget = settings.rag_handoff_max_tokens
    if len(turns) > settings.rag_handoff_max_input_turns:
        raise RagConversationError("RAG_INVALID_REQUEST", 400)
    summary = merge_summary_seeds(inherited, rolling)
    if summary is None and not turns:
        raise RagConversationError("RAG_HANDOFF_EMPTY_CONTEXT", 409)
    if summary is not None:
        summary = fit_summary_to_budget(summary, budget)

    batch_size = settings.rag_summary_max_batch_turns
    provider_failed = False
    method: RagSummaryMethod = "llm" if turns else "extractive"
    provider = None
    models: list[str] = []
    usage: dict[str, int] = {}
    for offset in range(0, len(turns), batch_size):
        batch = turns[offset:offset + batch_size]
        if not provider_failed and time.monotonic() < deadline:
            try:
                messages = build_summary_messages(
                    previous_summary=summary,
                    turns=batch,
                    additional_instructions=(
                        " Create a handoff for the learner's next conversation. The previous summary "
                        "does not cover the new exchanges. Update the memory with what was learned in "
                        "completed_turns and give the latest study context priority. In continuation_hint "
                        "record the most recent worked exercise, including exact inputs and the result "
                        "when they are needed to continue that exercise. "
                        "Keep unresolved questions and mark unresolved conflicts as uncertainties."
                    ),
                )
                require_rag_dispatch_authorization()
                generation = generate_rag_summary(messages, deadline_at=deadline, **(
                    {"execution_context": execution_context, "stage": "handoff"} if execution_context else {}
                ))
                summary = fit_summary_to_budget(generation.summary, budget)
                provider = generation.provider
                if generation.model not in models:
                    models.append(generation.model)
                for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    value = getattr(generation.usage, field)
                    if value is not None:
                        usage[field] = usage.get(field, 0) + value
                continue
            except (RagLLMError, RagTokenBudgetError):
                provider_failed = True
        method = "extractive"
        summary = build_extractive_summary(previous_summary=summary, turns=batch, max_tokens=budget)

    assert summary is not None
    return RagBuiltHandoff(
        summary=summary,
        generation_method=method,
        token_count=summary_token_count(summary),
        latency_ms=round((time.monotonic() - starts) * 1000),
        provider=provider,
        model_name=", ".join(models) if models else None,
        **usage,
    )
