from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


Locale = Literal["en", "vi"]
RoadmapLevel = Literal["beginner", "intermediate", "advanced", "custom"]
RoadmapNodeType = Literal["goal", "task", "subtask"]
Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class LearningRoadmapGenerateRequest(BaseModel):
    user_id: str

    topic: str = Field(min_length=2, max_length=160)
    subject_name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=2000)

    current_level: RoadmapLevel = "beginner"
    target_level: RoadmapLevel = "intermediate"
    custom_current_level: str | None = Field(default=None, max_length=240)
    custom_target_level: str | None = Field(default=None, max_length=240)

    start_date: date
    end_date: date

    study_days_per_week: int = Field(default=5, ge=1, le=7)
    available_weekdays: list[Weekday] = Field(default_factory=list)
    minutes_per_study_day: int = Field(default=60, ge=10, le=480)

    preferred_locale: Locale = "en"

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be greater than or equal to start_date.")

        return self


class AIRoadmapNode(BaseModel):
    temp_id: str = Field(min_length=1, max_length=80)
    parent_temp_id: str | None = Field(default=None, max_length=80)

    node_type: RoadmapNodeType

    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1000)

    estimated_hours: float = Field(default=1, gt=0, le=500)
    suggested_start_date: date | None = None
    suggested_end_date: date | None = None

    priority: int = Field(default=3, ge=1, le=5)
    sort_order: int = Field(default=0, ge=0)


class AIRoadmapOutput(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    nodes: list[AIRoadmapNode] = Field(min_length=3, max_length=120)


class LearningRoadmapNodeResponse(BaseModel):
    id: str
    roadmap_id: str
    parent_node_id: str | None
    node_type: RoadmapNodeType
    title: str
    description: str | None
    estimated_hours: float
    suggested_start_date: date | None
    suggested_end_date: date | None
    priority: int
    sort_order: int
    position_x: float
    position_y: float


class LearningRoadmapGenerateResponse(BaseModel):
    roadmap_id: str
    title: str
    description: str | None
    nodes: list[LearningRoadmapNodeResponse]
    provider: str | None = None
    model_name: str | None = None
    latency_ms: int | None = None