from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class GeneratePBISnapshotRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class PBIComponentsResponse(BaseModel):
    task_completion_rate: float
    focus_quality_score: float
    deadline_adherence_score: float
    goal_momentum_score: float
    consistency_score: float


class GeneratePBISnapshotResponse(BaseModel):
    user_id: str
    period_start: date
    period_end: date

    standard_pbi: float
    personalized_pbi: float

    components: PBIComponentsResponse

    metadata: dict[str, Any]
    explanation_payload: dict[str, Any]