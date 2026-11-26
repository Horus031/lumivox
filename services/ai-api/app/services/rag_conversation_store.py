
from __future__ import annotations

from typing import Any

from postgrest.exceptions import APIError


ERROR_STATUS = {
    "RAG_INVALID_REQUEST": 400,
    "RAG_SESSION_NOT_FOUND": 404,
    "RAG_DOCUMENT_ACCESS_DENIED": 403,
    "RAG_IDEMPOTENCY_CONFLICT": 409,
    "RAG_TURN_IN_PROGRESS": 409,
    "RAG_SESSION_CLOSED": 409,
    "RAG_CONTEXT_CHANGED": 409,
    "RAG_INVALID_LEASE": 409,
    "RAG_INVALID_RESPONSE": 500,
}


class RagConversationError(RuntimeError):
    def __init__(
        self,
        code: str,
        status_code: int,
        *,
        session_id: str | None = None,
    ) -> None:
        self.code = code
        self.status_code = status_code
        self.session_id = session_id
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


def validate_scope(
    supabase: Any,
    *,
    user_id: str,
    focus_session_id: str,
    selected_document_ids: list[str],
) -> None:
    _call_rpc(
        supabase,
        "rag_v2_validate_scope",
        {
            "p_user_id": user_id,
            "p_focus_session_id": focus_session_id,
            "p_document_ids": selected_document_ids,
        },
    )


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


def fail_turn(
    supabase: Any,
    *,
    user_id: str,
    turn_id: str,
    lease_token: str,
    error_code: str,
) -> bool:
    return bool(
        _call_rpc(
            supabase,
            "rag_v2_fail_turn",
            {
                "p_user_id": user_id,
                "p_turn_id": turn_id,
                "p_lease_token": lease_token,
                "p_error_code": error_code,
            },
        )
    )
