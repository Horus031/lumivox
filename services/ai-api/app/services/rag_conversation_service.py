
from __future__ import annotations

import logging
import time

from typing import Literal

from app.clients.supabase_client import (
    get_supabase_client,
)

from app.services.rag_chat_service import (
    _normalize_top_k,
    generate_rag_answer,
)

from app.services.rag_conversation_store import (
    RagConversationError,
    reserve_turn,
    complete_turn,
    fail_turn,
    validate_scope,
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

    try:
        answer, sources, generation = (
            generate_rag_answer(
                supabase=supabase,
                user_id=user_id,
                question=question,
                selected_document_ids=document_ids,
                top_k=top_k,
                prompt_variant=prompt_variant,
                preferred_locale=preferred_locale,
            )
        )

        if not answer.strip():
            raise RuntimeError(
                "Empty generated answer"
            )

    except Exception:
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

    return complete_turn(
        supabase,
        user_id=user_id,
        turn_id=turn_id,
        lease_token=lease_token,
        answer=answer,
        sources=sources,
        provider=(
            generation.provider
            if generation else None
        ),
        model_name=(
            generation.model
            if generation else None
        ),
        latency_ms=latency_ms,
        usage=None,
    )


def restore_rag_conversation(
    *,
    user_id: str,
    focus_session_id: str,
) -> dict:
    supabase = get_supabase_client()

    scope = (
        supabase.table("focus_sessions")
        .select("id")
        .eq("id", focus_session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not scope.data:
        raise RagConversationError(
            "RAG_SESSION_NOT_FOUND",
            404,
        )

    sessions = (
        supabase.table("rag_chat_sessions")
        .select(
            "id,completed_turn_count,"
            "selected_document_ids,top_k,"
            "prompt_variant"
        )
        .eq("user_id", user_id)
        .eq("focus_session_id", focus_session_id)
        .eq("conversation_version", 2)
        .eq("status", "active")
        .limit(1)
        .execute()
    ).data or []

    if not sessions:
        return {"enabled": True}

    session = sessions[0]
    session_id = session["id"]

    document_ids = (
        session["selected_document_ids"] or []
    )

    # Revalidate access before returning
    # document-derived conversation content.
    validate_scope(
        supabase,
        user_id=user_id,
        focus_session_id=focus_session_id,
        selected_document_ids=document_ids,
    )

    turns = (
        supabase.table("rag_chat_turns")
        .select("id,turn_index")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .eq("status", "completed")
        .order("turn_index", desc=True)
        .limit(100)
        .execute()
    ).data or []

    if not turns:
        return {
            "enabled": True,
            "session_id": session_id,
            "completed_turn_count": 0,
            "selected_document_ids": document_ids,
            "top_k": session["top_k"],
            "prompt_variant": session["prompt_variant"],
            "messages": [],
        }

    turn_indexes = {
        turn["id"]: turn["turn_index"]
        for turn in turns
    }

    rows = (
        supabase.table("rag_chat_messages")
        .select("id,turn_id,role,content")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .in_("turn_id", list(turn_indexes))
        .limit(200)
        .execute()
    ).data or []

    messages = [
        {
            **row,
            "turn_index": turn_indexes[row["turn_id"]],
        }
        for row in rows
        if row["role"] in ("user", "assistant")
    ]

    messages.sort(
        key=lambda row: (
            row["turn_index"],
            0 if row["role"] == "user" else 1,
        )
    )

    return {
        "enabled": True,
        "session_id": session_id,
        "completed_turn_count": session[
            "completed_turn_count"
        ],
        "selected_document_ids": document_ids,
        "top_k": session["top_k"],
        "prompt_variant": session["prompt_variant"],
        "messages": messages,
    }
