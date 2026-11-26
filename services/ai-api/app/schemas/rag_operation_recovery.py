from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


RagOperation = Literal["ask", "new_chat"]
RagOperationStatus = Literal["unknown", "processing", "completed", "failed", "expired", "access_unavailable"]


class RagOperationStatusRequest(BaseModel):
    user_id: UUID
    focus_session_id: UUID
    client_request_id: UUID
    operation: RagOperation
    recover_expired: bool = False

    @model_validator(mode="after")
    def validate_expiry_operation(self):
        if self.recover_expired and self.operation != "ask":
            raise ValueError("Only Ask operations can recover an expired lease.")
        return self


class RagOperationStatusResponse(BaseModel):
    operation: RagOperation
    status: RagOperationStatus
    session_id: UUID | None = None
    session_status: Literal["active", "closed"] | None = None
    turn_id: UUID | None = None
    turn_index: int | None = Field(default=None, gt=0)
    completed_turn_count: int | None = Field(default=None, ge=0)
    source_session_id: UUID | None = None
    target_session_id: UUID | None = None
    lease_expires_at: datetime | None = None


class RagPendingOperation(BaseModel):
    operation: Literal["ask"]
    status: Literal["processing", "expired"]
    client_request_id: UUID
    lease_expires_at: datetime
