
from __future__ import annotations

import logging
import time
from contextlib import nullcontext
from dataclasses import asdict

from typing import Any, Literal

from app.clients.supabase_client import (
    get_supabase_client,
    bounded_rag_supabase,
    rag_supabase_summary_deadline,
)
from app.clients.rag_llm_client import RagLLMError

from app.core.config import settings
from app.core.rag_deadline import RagDeadline, RagDeadlineExceeded
from app.security.rag_dispatch import rag_dispatch_authorization
from app.core.rag_execution_context import RagExecutionContext
from app.core.rag_model_registry import validate_rag_configuration
from app.schemas.rag_conversation_context import RagConversationContext
from app.services.rag_chat_service import _normalize_top_k
from app.services.rag_conversational_generation import generate_conversational_answer
from app.services.rag_summary_service import maybe_refresh_summary

from app.services.rag_conversation_store import (
    RagConversationError,
    assert_turn_authorized,
    reserve_turn,
    complete_turn,
    fail_turn,
    load_conversation_context,
    load_restore_snapshot,
)


logger = logging.getLogger(__name__)


def ask_rag_conversation_question(
    *,
    user_id: str,
    question: str,
    selected_document_ids: list[str],
    focus_session_id: str | None,
    session_id: str | None,
    client_request_id: str,
    top_k: int,
    prompt_variant: Literal[
        "no_rule", "grounded_rule"
    ],
    preferred_locale: Literal[
        "auto", "en", "vi"
    ] = "auto",
) -> dict:
    started_at = time.perf_counter()

    question = question.strip()

    if not question:
        raise RagConversationError(
            "RAG_INVALID_REQUEST",
            400,
        )

    validate_rag_configuration()
    document_ids = sorted(
        set(selected_document_ids)
    )
    if session_id is None and len(document_ids) > settings.rag_max_selected_documents:
        raise RagConversationError("RAG_INVALID_REQUEST", 400)

    top_k = _normalize_top_k(top_k)

    execution = None
    if settings.rag_resource_control_enabled:
        max_calls = settings.rag_max_provider_calls_per_ask
        execution = RagExecutionContext(
            RagDeadline.start(settings.rag_request_deadline_seconds), max_calls,
            answer_call_reserve=min(2, max_calls - int(bool(document_ids))),
            needs_embedding=bool(document_ids),
        )
    db = bounded_rag_supabase(
        execution.deadline, completion_reserve=settings.rag_completion_reserve_seconds,
        answer_reserve=settings.rag_answer_reserve_seconds,
    ) if execution else nullcontext(get_supabase_client())
    with db as supabase:
        return _run_ask(
            supabase, user_id=user_id, question=question, document_ids=document_ids,
            focus_session_id=focus_session_id, session_id=session_id, client_request_id=client_request_id,
            top_k=top_k, prompt_variant=prompt_variant, preferred_locale=preferred_locale,
            started_at=started_at, execution=execution,
        )


def _run_ask(
    supabase: Any, *, user_id: str, question: str, document_ids: list[str], focus_session_id: str | None,
    session_id: str | None, client_request_id: str, top_k: int,
    prompt_variant: Literal["no_rule", "grounded_rule"], preferred_locale: Literal["auto", "en", "vi"],
    started_at: float, execution: RagExecutionContext | None,
) -> dict:
    request_payload = {
        "question": question,
        "selected_document_ids": document_ids,
        "top_k": top_k,
        "prompt_variant": prompt_variant,
        "preferred_locale": preferred_locale,
    }

    reservation = reserve_turn(
        supabase,
        user_id=user_id,
        session_id=session_id,
        focus_session_id=focus_session_id,
        client_request_id=client_request_id,
        request_payload=request_payload,
    )

    outcome = reservation.get("outcome")

    if outcome == "completed":
        return reservation["response"]

    if outcome == "processing":
        raise RagConversationError(
            "RAG_TURN_IN_PROGRESS",
            409,
        )

    if outcome == "failed":
        raise RagConversationError(
            "RAG_PREVIOUS_TURN_FAILED",
            409,
            session_id=reservation["session_id"],
        )

    if outcome != "reserved":
        raise RagConversationError(
            "RAG_PERSISTENCE_UNAVAILABLE",
            503,
        )

    turn_id = reservation["turn_id"]
    lease_token = reservation["lease_token"]
    reserved_session_id = reservation["session_id"]

    def authorize_dispatch() -> None:
        assert_turn_authorized(
            supabase, user_id=user_id, session_id=reserved_session_id, turn_id=turn_id, lease_token=lease_token,
        )

    history_window = (
        min(settings.rag_history_candidate_turns, settings.rag_hard_turn_limit)
        if settings.rag_context_quality_enabled else settings.rag_recent_turns
    )

    try:
        snapshot = load_conversation_context(
            supabase,
            user_id=user_id,
            session_id=reserved_session_id,
            turn_id=turn_id,
            lease_token=lease_token,
            recent_turns=history_window,
        )
        if not settings.rag_rolling_summary_enabled:
            snapshot = {**snapshot, "summary": None}
        context = RagConversationContext.model_validate(snapshot)
        if context.completed_turn_count >= settings.rag_hard_turn_limit:
            raise RagConversationError(
                "RAG_CONVERSATION_LIMIT_REACHED", 409, session_id=reserved_session_id,
            )
        summary_deadline = execution.deadline.bounded(
            settings.rag_summary_deadline_seconds,
            settings.rag_answer_reserve_seconds + settings.rag_completion_reserve_seconds,
        ) if execution else None
        if settings.rag_rolling_summary_enabled and (
            not execution or (summary_deadline.remaining() > 0.1 and execution.has_provider_budget("rolling_summary"))
        ):
            try:
                with rag_supabase_summary_deadline(summary_deadline), rag_dispatch_authorization(authorize_dispatch):
                    context = maybe_refresh_summary(
                        supabase=supabase,
                        user_id=user_id,
                        session_id=reserved_session_id,
                        turn_id=turn_id,
                        lease_token=lease_token,
                        context=context,
                        **({"deadline": summary_deadline, "execution_context": execution} if execution else {}),
                    )
            except Exception as summary_error:
                if isinstance(summary_error, RagConversationError) and summary_error.code in {
                    "RAG_DOCUMENT_ACCESS_DENIED",
                    "RAG_INVALID_LEASE",
                    "RAG_SESSION_NOT_FOUND",
                    "RAG_MEMORY_QUARANTINED",
                }:
                    raise
                logger.warning("RAG summary refresh unavailable; reloading authorized context.")
                context = RagConversationContext.model_validate(load_conversation_context(
                    supabase,
                    user_id=user_id,
                    session_id=reserved_session_id,
                    turn_id=turn_id,
                    lease_token=lease_token,
                    recent_turns=history_window,
                ))
        answer_deadline = execution.deadline.bounded(
            settings.rag_generation_deadline_seconds, settings.rag_completion_reserve_seconds,
        ) if execution else None
        with rag_dispatch_authorization(authorize_dispatch):
            generated = generate_conversational_answer(
                supabase=supabase,
                user_id=user_id,
                question=question,
                selected_document_ids=document_ids,
                top_k=top_k,
                prompt_variant=prompt_variant,
                preferred_locale=preferred_locale,
                context=context,
                **({"deadline": answer_deadline, "execution_context": execution} if execution else {}),
            )

        if not generated.answer.strip():
            raise RuntimeError(
                "Empty generated answer"
            )

    except Exception as error:
        if isinstance(error, RagConversationError) and error.code == "RAG_MEMORY_QUARANTINED":
            raise RagConversationError(error.code, 409, session_id=reserved_session_id, outcome="failed") from None
        logger.warning(
            "RAG generation failed for turn %s",
            turn_id,
        )

        marked_failed = False
        try:
            marked_failed = fail_turn(
                supabase,
                user_id=user_id,
                turn_id=turn_id,
                lease_token=lease_token,
                error_code="generation_failed",
                **({"attempts": execution.accounting()} if execution else {}),
            )
        except RagConversationError:
            logger.warning(
                "Unable to mark RAG turn failed: %s",
                turn_id,
            )

        if marked_failed:
            if isinstance(error, RagConversationError):
                raise error from None
            if isinstance(error, RagLLMError) and error.code in {
                "provider_busy", "provider_cooldown", "resource_control_unavailable", "provider_call_budget_exceeded",
            }:
                raise RagConversationError(
                    f"RAG_{error.code.upper()}", 503, session_id=reserved_session_id, outcome="failed",
                ) from None
            if execution and isinstance(error, RagDeadlineExceeded):
                raise RagConversationError(
                    "RAG_REQUEST_DEADLINE_EXCEEDED", 504, session_id=reserved_session_id, outcome="failed",
                ) from None
            raise RagConversationError(
                "RAG_GENERATION_FAILED",
                502,
                session_id=reservation["session_id"],
            ) from None

        raise RagConversationError(
            "RAG_TURN_OUTCOME_UNKNOWN",
            503,
        ) from None

    latency_ms = int(
        (
            time.perf_counter() - started_at
        ) * 1000
    )

    generation = generated.generation
    usage = asdict(generation.usage) if generation is not None else {}
    usage["context"] = generated.context.model_dump(
        exclude={
            "context_policy", "history_candidate_turns", "history_tokens_used", "summary_covered_turn_count",
            "omitted_history_turns", "truncated_history_turns", "sources_truncated",
        } if generated.context.context_policy == "legacy" else None,
    )
    if generated.context.handoff_id:
        usage["context"]["handoff_id"] = generated.context.handoff_id
    if execution:
        usage["provider_attempts"] = execution.accounting()
    try:
        return complete_turn(
            supabase,
            user_id=user_id,
            turn_id=turn_id,
            lease_token=lease_token,
            answer=generated.answer,
            sources=generated.sources,
            provider=generation.provider if generation else None,
            model_name=generation.model if generation else None,
            latency_ms=latency_ms,
            usage=usage,
        )
    except RagConversationError as error:
        if error.code == "RAG_MEMORY_QUARANTINED":
            raise RagConversationError(error.code, 409, session_id=reserved_session_id) from None
        failure_reason = {
            "RAG_DOCUMENT_ACCESS_DENIED": "document_access_denied",
            "RAG_INVALID_RESPONSE": "persistence_failed",
        }.get(error.code)
        if failure_reason is not None:
            try:
                marked_failed = fail_turn(
                    supabase, user_id=user_id, turn_id=turn_id, lease_token=lease_token,
                    error_code=failure_reason,
                    **({"attempts": execution.accounting()} if execution else {}),
                )
            except RagConversationError:
                marked_failed = False
            if marked_failed:
                raise RagConversationError(
                    error.code, error.status_code, session_id=reserved_session_id, outcome="failed",
                ) from None
        # A transport or lease error can arrive after the completion committed.
        raise RagConversationError("RAG_TURN_OUTCOME_UNKNOWN", 503, outcome="unknown") from None


def restore_rag_conversation(
    *,
    user_id: str,
    focus_session_id: str,
) -> dict:
    return load_restore_snapshot(
        get_supabase_client(),
        user_id=user_id,
        focus_session_id=focus_session_id,
    )
