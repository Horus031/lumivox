from pydantic import BaseModel, Field
from typing import Literal
from uuid import UUID

from app.schemas.rag_conversation_context import RagContextMetadata
from app.schemas.rag_conversation_handoff import RagConversationMessage


class ProcessLearningDocumentRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)


class ProcessLearningDocumentResponse(BaseModel):
    document_id: str
    status: str
    chunk_count: int
    message: str
    
class RagAskRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=2000)

    selected_document_ids: list[str] = Field(default_factory=list)

    focus_session_id: str | None = None
    session_id: str | None = None

    top_k: int = Field(default=5, ge=1, le=9)
    prompt_variant: Literal["no_rule", "grounded_rule"] = "grounded_rule"
    preferred_locale: Literal["auto", "en", "vi"] = "auto"
    client_request_id: UUID | None = None


class RagSourceChunk(BaseModel):
    chunk_id: str
    document_id: str
    file_name: str
    chunk_index: int
    content: str
    similarity: float


class RagAskResponse(BaseModel):
    session_id: str
    answer: str
    sources: list[RagSourceChunk]
    prompt_variant: str
    context_mode: str
    selected_document_ids: list[str]
    top_k: int
    latency_ms: int
    turn_id: str | None = None
    turn_index: int | None = None
    completed_turn_count: int | None = None
    preferred_locale: str | None = None
    context: RagContextMetadata | None = None
    soft_turn_limit: int | None = None
    hard_turn_limit: int | None = None


class RagConversationRestoreRequest(BaseModel):
    user_id: UUID
    focus_session_id: UUID


class RagConversationRestoreResponse(BaseModel):
    enabled: bool
    new_chat_enabled: bool = False
    handoff_enabled: bool = False
    has_handoff: bool = False
    content_available: bool = True

    session_id: str | None = None

    completed_turn_count: int = 0
    soft_turn_limit: int | None = None
    hard_turn_limit: int | None = None

    selected_document_ids: list[str] = Field(
        default_factory=list
    )

    top_k: int = 5

    prompt_variant: Literal[
        "no_rule", "grounded_rule"
    ] = "grounded_rule"

    messages: list[RagConversationMessage] = Field(
        default_factory=list
    )
