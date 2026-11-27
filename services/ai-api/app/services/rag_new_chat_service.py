from dataclasses import asdict
from contextlib import nullcontext
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from app.clients.supabase_client import bounded_rag_supabase, get_supabase_client
from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.core.rag_model_registry import validate_rag_configuration
from app.security.rag_dispatch import rag_dispatch_authorization
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.schemas.rag_conversation_handoff import (
    RagHandoffRevision, RagNewChatRequest, RagNewChatResponse, RagStoredHandoff,
)
from app.schemas.rag_conversation_summary import RagStoredSummary
from app.services.rag_conversation_store import (
    RagConversationError, assert_preparation_authorized, commit_new_chat, commit_prepared_new_chat,
    fail_new_chat_preparation, prepare_new_chat,
)
from app.services.rag_handoff_builder import build_final_handoff


class _PreparedChat(BaseModel):
    outcome: Literal["prepared"]
    source_session_id: UUID
    revision: RagHandoffRevision
    previous_summary: RagStoredSummary | None
    inherited_memory: RagStoredHandoff | None
    uncovered_turns: list[RagCompletedTurn] = Field(max_length=100)


class _CompletedChat(RagNewChatResponse):
    outcome: Literal["completed"]

class _ReservedChat(BaseModel):
    outcome: Literal["reserved"]
    source_session_id: UUID
    revision: RagHandoffRevision
    previous_summary: RagStoredSummary | None
    inherited_memory: RagStoredHandoff | None
    uncovered_turns: list[RagCompletedTurn] = Field(max_length=100)
    preparation_id: UUID
    lease_token: UUID


class _PreparationStatus(BaseModel):
    outcome: Literal["processing", "failed"]
    preparation_id: UUID


_PREPARE_RESPONSE = TypeAdapter(Annotated[
    _PreparedChat | _ReservedChat | _PreparationStatus | _CompletedChat, Field(discriminator="outcome"),
])

_KNOWN_COMMIT_REJECTIONS = {
    "RAG_HANDOFF_SOURCE_CHANGED", "RAG_HANDOFF_SCOPE_CHANGED", "RAG_HANDOFF_EMPTY_CONTEXT",
    "RAG_DOCUMENT_ACCESS_DENIED", "RAG_INVALID_REQUEST", "RAG_INVALID_RESPONSE", "RAG_SESSION_CLOSED",
    "RAG_SESSION_NOT_FOUND", "RAG_TURN_IN_PROGRESS",
}


def start_new_conversation(request: RagNewChatRequest) -> RagNewChatResponse:
    if not settings.rag_conversation_v2_enabled or not settings.rag_new_chat_enabled:
        raise RagConversationError("RAG_NEW_CHAT_DISABLED", 409)
    validate_rag_configuration()
    if request.mode == "continue" and not settings.rag_handoff_enabled:
        raise RagConversationError("RAG_HANDOFF_DISABLED", 409)

    payload = request.model_dump(mode="json", exclude={"user_id", "client_request_id"})
    payload["selected_document_ids"] = sorted(set(payload["selected_document_ids"]))
    if request.mode == "fresh" and len(payload["selected_document_ids"]) > settings.rag_max_selected_documents:
        raise RagConversationError("RAG_INVALID_REQUEST", 400)
    args = {
        "user_id": str(request.user_id), "focus_session_id": str(request.focus_session_id),
        "source_session_id": str(request.source_session_id), "client_request_id": str(request.client_request_id),
        "request_payload": payload,
        "include_rolling_summary": settings.rag_rolling_summary_enabled,
    }
    execution = None
    if settings.rag_resource_control_enabled:
        execution = RagExecutionContext(
            RagDeadline.start(settings.rag_request_deadline_seconds), settings.rag_max_provider_calls_per_handoff,
        )
    db = bounded_rag_supabase(execution.deadline, completion_reserve=settings.rag_completion_reserve_seconds) \
        if execution else nullcontext(get_supabase_client())
    with db as supabase:
        return _run_transition(supabase, request, args, execution)


def _run_transition(
    supabase: Any, request: RagNewChatRequest, args: dict, execution: RagExecutionContext | None,
) -> RagNewChatResponse:
    reserve = execution is not None or request.mode == "continue"
    try:
        prepared = _PREPARE_RESPONSE.validate_python(prepare_new_chat(
            supabase, **args, **({"reserve": True} if reserve else {}),
        ))
    except ValidationError:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503) from None
    if isinstance(prepared, _CompletedChat):
        return prepared
    if isinstance(prepared, _PreparationStatus):
        if prepared.outcome == "processing":
            raise RagConversationError("RAG_NEW_CHAT_IN_PROGRESS", 409)
        raise RagConversationError("RAG_NEW_CHAT_PREPARATION_FAILED", 409, outcome="failed")

    revision = prepared.revision.model_dump(mode="json")
    if reserve:
        if not isinstance(prepared, _ReservedChat):
            raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
        identity = {
            "user_id": args["user_id"], "preparation_id": str(prepared.preparation_id),
            "lease_token": str(prepared.lease_token),
        }
        def authorize_dispatch() -> None:
            assert_preparation_authorized(supabase, **identity, expected_revision=revision)

        try:
            with rag_dispatch_authorization(authorize_dispatch):
                handoff = _build_handoff(prepared, args["include_rolling_summary"], execution) \
                    if request.mode == "continue" else None
        except Exception as error:
            known = error if isinstance(error, RagConversationError) else RagConversationError("RAG_GENERATION_FAILED", 502)
            if known.code == "RAG_MEMORY_QUARANTINED":
                raise RagConversationError(known.code, 409, outcome="failed") from None
            raise _terminate_preparation(supabase, identity, execution, known, "generation_failed") from None
        try:
            result = commit_prepared_new_chat(
                supabase, **identity, expected_revision=revision, handoff=handoff,
                attempts=execution.accounting() if execution else None,
            )
        except RagConversationError as error:
            if error.code == "RAG_MEMORY_QUARANTINED":
                raise RagConversationError(error.code, 409, outcome="failed") from None
            if error.code in _KNOWN_COMMIT_REJECTIONS:
                raise _terminate_preparation(supabase, identity, execution, error, "commit_rejected") from None
            raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503, outcome="unknown") from None
    else:
        handoff = _build_handoff(prepared, args["include_rolling_summary"], None) \
            if request.mode == "continue" else None
        result = commit_new_chat(supabase, **args, expected_revision=revision, handoff=handoff)
    try:
        return _CompletedChat.model_validate(result)
    except ValidationError:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503) from None


def _build_handoff(
    prepared: _PreparedChat | _ReservedChat, include_rolling: bool, execution: RagExecutionContext | None,
) -> dict:
    inherited, rolling = prepared.inherited_memory, prepared.previous_summary
    if rolling is not None and not include_rolling:
        raise RagConversationError("RAG_CONTEXT_UNAVAILABLE", 409)
    expected_count = prepared.revision.source_completed_turn_count - (rolling.covered_turn_count if rolling else 0)
    if len(prepared.uncovered_turns) != expected_count:
        raise RagConversationError("RAG_CONTEXT_UNAVAILABLE", 409)
    built = build_final_handoff(
        inherited=inherited.summary if inherited else None, rolling=rolling.summary if rolling else None,
        turns=prepared.uncovered_turns, **({"execution_context": execution} if execution else {}),
    )
    return {**asdict(built), "schema_version": 1, "summary": built.summary.model_dump()}


def _terminate_preparation(
    supabase: Any, identity: dict[str, str], execution: RagExecutionContext | None,
    error: RagConversationError, reason: str,
) -> RagConversationError:
    try:
        if fail_new_chat_preparation(supabase, **identity, error_code=reason,
                                     attempts=execution.accounting() if execution else None):
            return RagConversationError(error.code, error.status_code, outcome="failed")
    except RagConversationError:
        pass
    return RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503, outcome="unknown")
