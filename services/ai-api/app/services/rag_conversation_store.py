
from __future__ import annotations

from typing import Any, Literal

from postgrest.exceptions import APIError

from app.core.rag_telemetry import timed_stage


ERROR_STATUS = {
    "RAG_INVALID_REQUEST": 400,
    "RAG_SESSION_NOT_FOUND": 404,
    "RAG_DOCUMENT_ACCESS_DENIED": 403,
    "RAG_DOCUMENT_PROCESSING_STALE": 409,
    "RAG_IDEMPOTENCY_CONFLICT": 409,
    "RAG_TURN_IN_PROGRESS": 409,
    "RAG_SESSION_CLOSED": 409,
    "RAG_CONTEXT_CHANGED": 409,
    "RAG_INVALID_LEASE": 409,
    "RAG_MEMORY_QUARANTINED": 409,
    "RAG_INVALID_RESPONSE": 500,
    "RAG_CONTEXT_UNAVAILABLE": 409,
    "RAG_SUMMARY_CONFLICT": 409,
    "RAG_RECOVERY_DISABLED": 409,
    "RAG_NEW_CHAT_IN_PROGRESS": 409,
    "RAG_NEW_CHAT_PREPARATION_FAILED": 409,
    "RAG_NEW_CHAT_DISABLED": 409,
    "RAG_HANDOFF_DISABLED": 409,
    "RAG_HANDOFF_SOURCE_CHANGED": 409,
    "RAG_HANDOFF_SCOPE_CHANGED": 409,
    "RAG_HANDOFF_EMPTY_CONTEXT": 409,
    "RAG_CONVERSATION_LIMIT_REACHED": 409,
}


class RagConversationError(RuntimeError):
    def __init__(
        self,
        code: str,
        status_code: int,
        *,
        session_id: str | None = None,
        outcome: Literal["failed", "unknown"] | None = None,
    ) -> None:
        self.code = code
        self.status_code = status_code
        self.session_id = session_id
        self.outcome = outcome
        super().__init__(code)


def _call_rpc(
    supabase: Any,
    name: str,
    params: dict[str, Any],
) -> Any:
    try:
        response = supabase.rpc(
            name,
            params,
        ).execute()

        return response.data

    except APIError as error:
        message = str(
            getattr(error, "message", "")
        )

        if message in ERROR_STATUS:
            raise RagConversationError(
                message,
                ERROR_STATUS[message],
            ) from None

        raise RagConversationError(
            "RAG_PERSISTENCE_UNAVAILABLE",
            503,
        ) from None

    except Exception:
        raise RagConversationError(
            "RAG_PERSISTENCE_UNAVAILABLE",
            503,
        ) from None


def assert_turn_authorized(supabase: Any, *, user_id: str, session_id: str, turn_id: str, lease_token: str) -> None:
    result = _call_rpc(supabase, "rag_v2_assert_turn_authorized", {
        "p_user_id": user_id, "p_session_id": session_id, "p_turn_id": turn_id, "p_lease_token": lease_token,
    })
    if result is not True:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)


def assert_preparation_authorized(
    supabase: Any, *, user_id: str, preparation_id: str, lease_token: str, expected_revision: dict,
) -> None:
    result = _call_rpc(supabase, "rag_v2_assert_preparation_authorized", {
        "p_user_id": user_id, "p_preparation_id": preparation_id, "p_lease_token": lease_token,
        "p_expected_revision": expected_revision,
    })
    if result is not True:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)


def load_conversation_context(
    supabase: Any,
    *,
    user_id: str,
    session_id: str,
    turn_id: str,
    lease_token: str,
    recent_turns: int,
) -> dict[str, Any]:
    result = _call_rpc(
        supabase,
        "rag_v2_get_context",
        {
            "p_user_id": user_id,
            "p_session_id": session_id,
            "p_turn_id": turn_id,
            "p_lease_token": lease_token,
            "p_recent_turns": recent_turns,
        },
    )
    if not isinstance(result, dict):
        raise RagConversationError("RAG_CONTEXT_UNAVAILABLE", 409)
    return result


def load_summary_input(
    supabase: Any,
    *,
    user_id: str,
    session_id: str,
    turn_id: str,
    lease_token: str,
    recent_turns: int,
    batch_size: int,
) -> dict[str, Any]:
    result = _call_rpc(supabase, "rag_v2_get_summary_input", {
        "p_user_id": user_id,
        "p_session_id": session_id,
        "p_turn_id": turn_id,
        "p_lease_token": lease_token,
        "p_recent_turns": recent_turns,
        "p_batch_size": batch_size,
    })
    if not isinstance(result, dict):
        raise RagConversationError("RAG_CONTEXT_UNAVAILABLE", 409)
    return result


def save_conversation_summary(
    supabase: Any,
    *,
    user_id: str,
    session_id: str,
    turn_id: str,
    lease_token: str,
    expected_version: int,
    covered_turn_index: int,
    recent_turns: int,
    summary: dict[str, Any],
    token_count: int,
    generation_method: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    result = _call_rpc(supabase, "rag_v2_save_summary", {
        "p_user_id": user_id,
        "p_session_id": session_id,
        "p_turn_id": turn_id,
        "p_lease_token": lease_token,
        "p_expected_version": expected_version,
        "p_covered_turn_index": covered_turn_index,
        "p_recent_turns": recent_turns,
        "p_summary": summary,
        "p_token_count": token_count,
        "p_generation_method": generation_method,
        "p_metadata": metadata,
    })
    if not isinstance(result, dict):
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
    return result


def _conversation_object(supabase: Any, name: str, params: dict[str, Any]) -> dict[str, Any]:
    result = _call_rpc(supabase, name, params)
    if not isinstance(result, dict):
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
    return result


def load_operation_status(
    supabase: Any, *, user_id: str, focus_session_id: str, client_request_id: str, operation: str,
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_get_operation_status", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id,
        "p_client_request_id": client_request_id, "p_operation": operation,
    })


def recover_expired_turn(
    supabase: Any, *, user_id: str, focus_session_id: str, client_request_id: str,
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_recover_expired_turn", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id, "p_client_request_id": client_request_id,
    })


def recover_expired_preparation(
    supabase: Any, *, user_id: str, focus_session_id: str, client_request_id: str,
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_recover_expired_preparation", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id, "p_client_request_id": client_request_id,
    })


def load_pending_new_chat(supabase: Any, *, user_id: str, focus_session_id: str) -> dict | None:
    result = _call_rpc(supabase, "rag_v2_pending_new_chat", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id,
    })
    if result is not None and not isinstance(result, dict):
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
    return result


@timed_stage("preparation")
def prepare_new_chat(
    supabase: Any, *, user_id: str, focus_session_id: str, source_session_id: str,
    client_request_id: str, request_payload: dict[str, Any], include_rolling_summary: bool,
    reserve: bool = False,
) -> dict[str, Any]:
    name = "rag_v2_reserve_new_chat_preparation" if reserve else "rag_v2_prepare_new_chat_recovery"
    return _conversation_object(supabase, name, {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id,
        "p_source_session_id": source_session_id, "p_client_request_id": client_request_id,
        "p_request": request_payload,
        "p_include_rolling_summary": include_rolling_summary,
    })


@timed_stage("transition_commit")
def commit_new_chat(
    supabase: Any, *, user_id: str, focus_session_id: str, source_session_id: str,
    client_request_id: str, request_payload: dict[str, Any],
    expected_revision: dict[str, Any], handoff: dict[str, Any] | None, include_rolling_summary: bool,
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_commit_new_chat_recovery", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id,
        "p_source_session_id": source_session_id, "p_client_request_id": client_request_id,
        "p_request": request_payload, "p_expected_revision": expected_revision, "p_handoff": handoff,
        "p_include_rolling_summary": include_rolling_summary,
    })


@timed_stage("transition_commit")
def commit_prepared_new_chat(
    supabase: Any, *, user_id: str, preparation_id: str, lease_token: str,
    expected_revision: dict[str, Any], handoff: dict[str, Any] | None, attempts: list[dict],
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_commit_prepared_new_chat", {
        "p_user_id": user_id, "p_preparation_id": preparation_id, "p_lease_token": lease_token,
        "p_expected_revision": expected_revision, "p_handoff": handoff, "p_attempts": attempts,
    })


@timed_stage("failure_persistence")
def fail_new_chat_preparation(
    supabase: Any, *, user_id: str, preparation_id: str, lease_token: str, error_code: str, attempts: list[dict],
) -> bool:
    result = _call_rpc(supabase, "rag_v2_fail_new_chat_preparation", {
        "p_user_id": user_id, "p_preparation_id": preparation_id, "p_lease_token": lease_token,
        "p_error_code": error_code, "p_attempts": attempts,
    })
    return result is True


def list_conversations(
    supabase: Any, *, user_id: str, focus_session_id: str, limit: int = 20,
    cursor_created_at: str | None = None, cursor_id: str | None = None,
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_list_conversations", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id, "p_limit": limit,
        "p_cursor_created_at": cursor_created_at, "p_cursor_id": cursor_id,
    })


def load_history_detail(
    supabase: Any, *, user_id: str, focus_session_id: str, session_id: str,
) -> dict[str, Any]:
    return _conversation_object(supabase, "rag_v2_get_history_detail", {
        "p_user_id": user_id, "p_focus_session_id": focus_session_id, "p_session_id": session_id,
    })


def load_restore_snapshot(
    supabase: Any, *, user_id: str, focus_session_id: str
) -> dict[str, Any]:
    result = _call_rpc(
        supabase, "rag_v2_restore_context",
        {"p_user_id": user_id, "p_focus_session_id": focus_session_id},
    )
    if not isinstance(result, dict):
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
    return result


@timed_stage("reservation")
def reserve_turn(
    supabase: Any,
    *,
    user_id: str,
    session_id: str | None,
    focus_session_id: str | None,
    client_request_id: str,
    request_payload: dict[str, Any],
) -> dict[str, Any]:
    result = _call_rpc(
        supabase,
        "rag_v2_reserve_turn",
        {
            "p_user_id": user_id,
            "p_session_id": session_id,
            "p_focus_session_id": focus_session_id,
            "p_client_request_id": client_request_id,
            "p_request": request_payload,
        },
    )

    if not isinstance(result, dict):
        raise RagConversationError(
            "RAG_PERSISTENCE_UNAVAILABLE",
            503,
        )

    return result


@timed_stage("completion")
def complete_turn(
    supabase: Any,
    *,
    user_id: str,
    turn_id: str,
    lease_token: str,
    answer: str,
    sources: list[dict[str, Any]],
    provider: str | None,
    model_name: str | None,
    latency_ms: int,
    usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = _call_rpc(
        supabase,
        "rag_v2_complete_turn",
        {
            "p_user_id": user_id,
            "p_turn_id": turn_id,
            "p_lease_token": lease_token,
            "p_answer": answer,
            "p_sources": sources,
            "p_provider": provider,
            "p_model_name": model_name,
            "p_latency_ms": latency_ms,
            "p_usage": usage or {},
        },
    )

    if not isinstance(result, dict):
        raise RagConversationError(
            "RAG_PERSISTENCE_UNAVAILABLE",
            503,
        )

    return result


@timed_stage("failure_persistence")
def fail_turn(
    supabase: Any,
    *,
    user_id: str,
    turn_id: str,
    lease_token: str,
    error_code: str,
    attempts: list[dict] | None = None,
) -> bool:
    return bool(
        _call_rpc(
            supabase,
            "rag_v2_fail_turn" if attempts is None else "rag_v2_fail_turn_with_usage",
            {
                "p_user_id": user_id,
                "p_turn_id": turn_id,
                "p_lease_token": lease_token,
                "p_error_code": error_code,
                **({"p_attempts": attempts} if attempts is not None else {}),
            },
        )
    )
