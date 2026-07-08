from pydantic import BaseModel, Field
from typing import Literal



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