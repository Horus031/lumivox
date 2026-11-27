from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.rag_conversation_summary import RagConversationSummary, RagSummaryMethod


RagNewChatMode = Literal["fresh", "continue"]


class RagHandoffRevision(BaseModel):
    source_completed_turn_count: int = Field(ge=0)
    source_last_completed_turn_index: int | None = Field(default=None, gt=0)
    source_summary_version: int | None = Field(default=None, gt=0)
    source_handoff_id: UUID | None = None


class RagStoredHandoff(BaseModel):
    id: UUID
    source_session_id: UUID
    target_session_id: UUID
    schema_version: Literal[1]
    source_completed_turn_count: int = Field(ge=0)
    source_last_completed_turn_index: int | None = Field(default=None, gt=0)
    source_summary_version: int | None = Field(default=None, gt=0)
    summary: RagConversationSummary
    generation_method: RagSummaryMethod
    token_count: int = Field(ge=1, le=500)


class RagNewChatRequest(BaseModel):
    user_id: UUID
    focus_session_id: UUID
    source_session_id: UUID
    client_request_id: UUID
    mode: RagNewChatMode
    selected_document_ids: list[UUID] = Field(default_factory=list, max_length=3000)
    top_k: int = Field(default=5, ge=1, le=9, strict=True)
    prompt_variant: Literal["grounded_rule", "no_rule"] = "grounded_rule"
    preferred_locale: Literal["auto", "en", "vi"] = "auto"


class RagNewChatResponse(BaseModel):
    source_session_id: UUID
    target_session_id: UUID
    mode: RagNewChatMode
    has_handoff: bool


class RagHistoryCursor(BaseModel):
    created_at: datetime
    id: UUID

    @model_validator(mode="after")
    def require_timezone(self):
        if self.created_at.utcoffset() is None:
            raise ValueError("History cursor requires a timezone.")
        return self


class RagHistoryRequest(BaseModel):
    user_id: UUID
    focus_session_id: UUID
    limit: int = Field(default=20, ge=1, le=50, strict=True)
    cursor: RagHistoryCursor | None = None


class RagHistoryDetailRequest(BaseModel):
    user_id: UUID
    focus_session_id: UUID
    session_id: UUID


class RagHistoryItem(BaseModel):
    id: UUID
    title: str | None
    status: Literal["active", "closed"]
    completed_turn_count: int = Field(ge=0)
    has_handoff: bool
    content_available: bool
    memory_quarantined: bool = False
    created_at: datetime
    updated_at: datetime


class RagHistoryResponse(BaseModel):
    conversations: list[RagHistoryItem]
    next_cursor: RagHistoryCursor | None


class RagConversationMessage(BaseModel):
    id: str
    turn_id: str
    role: Literal["user", "assistant"]
    content: str
    turn_index: int


class RagHistoryDetailResponse(BaseModel):
    session_id: UUID
    status: Literal["active", "closed"]
    completed_turn_count: int = Field(ge=0)
    messages: list[RagConversationMessage]
    read_only: bool
