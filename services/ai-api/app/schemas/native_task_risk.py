from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class GenerateNativeTaskRiskScanRequest(BaseModel):
    user_id: UUID
    task_id: UUID | None = None

    horizon_days: int = Field(default=14, ge=1, le=60)
    focus_window_days: int = Field(default=7, ge=1, le=30)
    history_window_days: int = Field(default=30, ge=1, le=180)

    persist_assessments: bool = True


class NativeTaskRiskEvidenceItem(BaseModel):
    key: str
    title: str
    message: str
    severity: Literal["neutral", "watch", "important"]


class NativeTaskRiskAssessmentResponse(BaseModel):
    assessment_id: UUID | None

    task_id: UUID
    task_title: str
    task_due_at: str | None
    task_priority: str

    risk_score: float
    risk_band: Literal["low", "moderate", "elevated", "high"]

    deadline_pressure_score: float
    priority_pressure_score: float
    focus_neglect_score: float
    deadline_reliability_risk_score: float
    workload_pressure_score: float

    evidence: list[NativeTaskRiskEvidenceItem]


class GenerateNativeTaskRiskScanResponse(BaseModel):
    assessed_task_count: int
    assessments: list[NativeTaskRiskAssessmentResponse]