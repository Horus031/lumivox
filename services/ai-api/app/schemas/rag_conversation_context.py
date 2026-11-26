from typing import Literal

from pydantic import BaseModel, Field


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
    summary: dict | None = None


class RagContextMetadata(BaseModel):
    estimated_prompt_tokens: int = Field(ge=0)
    history_turns_used: int = Field(ge=0)
    retrieved_chunks_used: int = Field(ge=0)
    context_truncated: bool
    retrieval_strategy: RagRetrievalStrategy
    generation_attempts: int = Field(default=0, ge=0)
