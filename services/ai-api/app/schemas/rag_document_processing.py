from pydantic import BaseModel, Field


class ProcessLearningDocumentRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)


class ProcessLearningDocumentResponse(BaseModel):
    document_id: str
    status: str
    chunk_count: int
    message: str