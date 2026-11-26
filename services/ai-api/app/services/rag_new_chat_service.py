from dataclasses import asdict
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.core.rag_model_registry import validate_rag_configuration
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.schemas.rag_conversation_handoff import (
    RagHandoffRevision, RagNewChatRequest, RagNewChatResponse, RagStoredHandoff,
)
from app.schemas.rag_conversation_summary import RagStoredSummary
from app.services.rag_conversation_store import RagConversationError, commit_new_chat, prepare_new_chat
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


_PREPARE_RESPONSE = TypeAdapter(Annotated[_PreparedChat | _CompletedChat, Field(discriminator="outcome")])


def start_new_conversation(request: RagNewChatRequest) -> RagNewChatResponse:
    if not settings.rag_conversation_v2_enabled or not settings.rag_new_chat_enabled:
        raise RagConversationError("RAG_NEW_CHAT_DISABLED", 409)
    validate_rag_configuration()
    if request.mode == "continue" and not settings.rag_handoff_enabled:
        raise RagConversationError("RAG_HANDOFF_DISABLED", 409)

    payload = request.model_dump(mode="json", exclude={"user_id", "client_request_id"})
    payload["selected_document_ids"] = sorted(set(payload["selected_document_ids"]))
    args = {
        "user_id": str(request.user_id), "focus_session_id": str(request.focus_session_id),
        "source_session_id": str(request.source_session_id), "client_request_id": str(request.client_request_id),
        "request_payload": payload,
    }
    supabase = get_supabase_client()
    try:
        prepared = _PREPARE_RESPONSE.validate_python(prepare_new_chat(supabase, **args))
    except ValidationError:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503) from None
    if isinstance(prepared, _CompletedChat):
        return prepared

    handoff = None
    if request.mode == "continue":
        inherited = prepared.inherited_memory
        rolling = prepared.previous_summary
        expected_count = prepared.revision.source_completed_turn_count
        if rolling:
            expected_count -= rolling.covered_turn_count
        if len(prepared.uncovered_turns) != expected_count:
            raise RagConversationError("RAG_CONTEXT_UNAVAILABLE", 409)
        built = build_final_handoff(
            inherited=inherited.summary if inherited else None,
            rolling=rolling.summary if rolling else None,
            turns=prepared.uncovered_turns,
        )
        handoff = {**asdict(built), "schema_version": 1, "summary": built.summary.model_dump()}

    result = commit_new_chat(
        supabase, **args, expected_revision=prepared.revision.model_dump(mode="json"), handoff=handoff,
    )
    try:
        return _CompletedChat.model_validate(result)
    except ValidationError:
        raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503) from None
