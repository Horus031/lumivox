from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.rag_conversation_summary import RagStoredSummary, RagSummaryMethod
from app.schemas.rag_conversation_handoff import RagStoredHandoff

RagRetrievalStrategy = Literal["none", "current_question", "history_augmented"]


class RagCompletedTurn(BaseModel):
    turn_index: int = Field(gt=0)
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class RagConversationContext(BaseModel):
    session_id: str
    current_turn_index: int = Field(gt=0)
    completed_turn_count: int = Field(ge=0)
    recent_turns: list[RagCompletedTurn] = Field(default_factory=list, max_length=12)
    summary: RagStoredSummary | None = None
    handoff: RagStoredHandoff | None = None


class RagSummaryInput(BaseModel):
    session_id: str
    completed_turn_count: int = Field(ge=0)
    selected_document_ids: list[str] = Field(default_factory=list)
    previous_summary: RagStoredSummary | None = None
    turns: list[RagCompletedTurn] = Field(default_factory=list, max_length=24)


class RagContextMetadata(BaseModel):
    estimated_prompt_tokens: int = Field(ge=0)
    history_turns_used: int = Field(ge=0)
    retrieved_chunks_used: int = Field(ge=0)
    context_truncated: bool
    retrieval_strategy: RagRetrievalStrategy
    generation_attempts: int = Field(default=0, ge=0)
    summary_version_used: int | None = Field(default=None, gt=0)
    summary_tokens_used: int = Field(default=0, ge=0)
    summary_covered_turn_index: int | None = Field(default=None, gt=0)
    summary_generation_method: RagSummaryMethod | None = None
    handoff_used: bool = False
    handoff_tokens_used: int = Field(default=0, ge=0)
    handoff_id: str | None = Field(default=None, exclude=True)
