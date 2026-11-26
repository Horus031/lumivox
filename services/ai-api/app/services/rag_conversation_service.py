
from __future__ import annotations

import logging
import time
from dataclasses import asdict

from typing import Literal

from app.clients.supabase_client import (
    get_supabase_client,
)

from app.core.config import settings
from app.core.rag_model_registry import validate_rag_configuration
from app.schemas.rag_conversation_context import RagConversationContext
from app.services.rag_chat_service import _normalize_top_k
from app.services.rag_conversational_generation import generate_conversational_answer
from app.services.rag_summary_service import maybe_refresh_summary

from app.services.rag_conversation_store import (
    RagConversationError,
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

    top_k = _normalize_top_k(top_k)

    supabase = get_supabase_client()

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

    try:
        snapshot = load_conversation_context(
            supabase,
            user_id=user_id,
            session_id=reserved_session_id,
            turn_id=turn_id,
            lease_token=lease_token,
            recent_turns=settings.rag_recent_turns,
        )
        if not settings.rag_rolling_summary_enabled:
            snapshot = {**snapshot, "summary": None}
        context = RagConversationContext.model_validate(snapshot)
        if context.completed_turn_count >= settings.rag_hard_turn_limit:
            raise RagConversationError(
                "RAG_CONVERSATION_LIMIT_REACHED", 409, session_id=reserved_session_id,
            )
        if settings.rag_rolling_summary_enabled:
            try:
                context = maybe_refresh_summary(
                    supabase=supabase,
                    user_id=user_id,
                    session_id=reserved_session_id,
                    turn_id=turn_id,
                    lease_token=lease_token,
                    context=context,
                )
            except Exception as summary_error:
                if isinstance(summary_error, RagConversationError) and summary_error.code in {
                    "RAG_DOCUMENT_ACCESS_DENIED",
                    "RAG_INVALID_LEASE",
                    "RAG_SESSION_NOT_FOUND",
                }:
                    raise
                logger.warning("RAG summary refresh unavailable; reloading authorized context.")
                context = RagConversationContext.model_validate(load_conversation_context(
                    supabase,
                    user_id=user_id,
                    session_id=reserved_session_id,
                    turn_id=turn_id,
                    lease_token=lease_token,
                    recent_turns=settings.rag_recent_turns,
                ))
        generated = generate_conversational_answer(
            supabase=supabase,
            user_id=user_id,
            question=question,
            selected_document_ids=document_ids,
            top_k=top_k,
            prompt_variant=prompt_variant,
            preferred_locale=preferred_locale,
            context=context,
        )

        if not generated.answer.strip():
            raise RuntimeError(
                "Empty generated answer"
            )

    except Exception as error:
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
            )
        except RagConversationError:
            logger.warning(
                "Unable to mark RAG turn failed: %s",
                turn_id,
            )

        if marked_failed:
            if isinstance(error, RagConversationError):
                raise error from None
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

    # Do not mark the turn failed automatically
    # if completion has an uncertain outcome.
    # A network timeout may occur after DB commit.

    generation = generated.generation
    usage = asdict(generation.usage) if generation is not None else {}
    usage["context"] = generated.context.model_dump()
    if generated.context.handoff_id:
        usage["context"]["handoff_id"] = generated.context.handoff_id
    return complete_turn(
        supabase,
        user_id=user_id,
        turn_id=turn_id,
        lease_token=lease_token,
        answer=generated.answer,
        sources=generated.sources,
        provider=(
            generation.provider
            if generation else None
        ),
        model_name=(
            generation.model
            if generation else None
        ),
        latency_ms=latency_ms,
        usage=usage,
    )


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
