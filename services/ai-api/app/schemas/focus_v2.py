from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FocusV2Configuration(BaseModel):
    user_id: UUID
    focus_minutes: int = Field(ge=5, le=120)
    short_break_minutes: int = Field(ge=1, le=30)
    long_break_minutes: int = Field(ge=5, le=60)
    round_count: int = Field(ge=1, le=8)
    long_break_every: int = Field(ge=2, le=8)
    auto_start_breaks: bool
    auto_start_focus: bool


class CreateFocusV2Request(FocusV2Configuration):
    task_id: UUID | None = None


class CreateStudyFocusRequest(FocusV2Configuration):
    model_config = ConfigDict(extra="forbid")

    study_session_id: UUID
    launch_request_id: UUID


class CreateFocusV2Response(BaseModel):
    session_id: UUID


class CreateStudyFocusResponse(CreateFocusV2Response):
    replay: bool


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
