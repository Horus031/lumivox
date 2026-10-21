from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateFocusV2Request(BaseModel):
    user_id: UUID
    task_id: UUID | None = None
    focus_minutes: int = Field(ge=5, le=120)
    short_break_minutes: int = Field(ge=1, le=30)
    long_break_minutes: int = Field(ge=5, le=60)
    round_count: int = Field(ge=1, le=8)
    long_break_every: int = Field(ge=2, le=8)
    auto_start_breaks: bool
    auto_start_focus: bool


class CreateFocusV2Response(BaseModel):
    session_id: UUID


class TransitionFocusV2Request(BaseModel):
    user_id: UUID
    session_id: UUID
    action: Literal["pause", "resume", "complete", "skip_break", "start_next", "cancel"]
    expected_segment_id: UUID | None = None


class TransitionFocusV2Response(BaseModel):
    parentStatus: Literal["ongoing", "paused", "completed", "cancelled"]
    segmentId: UUID | None
    nextSegmentId: UUID | None
    parentCompleted: bool
    nextStarted: bool | None = None
