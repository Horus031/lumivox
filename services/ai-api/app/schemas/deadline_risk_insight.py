from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DeadlineRiskInsightEvidenceItem(BaseModel):
    feature: str = Field(..., min_length=1)
    direction: Literal[
        "increases_risk",
        "decreases_risk",
    ]
    student_friendly_explanation: str = Field(..., min_length=1)


class DeadlineRiskRecommendedAction(BaseModel):
    action: str = Field(..., min_length=1)
    rationale: str = Field(..., min_length=1)


class GeminiDeadlineRiskInsightOutput(BaseModel):
    title: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    risk_interpretation: str = Field(..., min_length=1)

    evidence: list[DeadlineRiskInsightEvidenceItem] = Field(
        ...,
        min_length=1,
        max_length=5,
    )

    recommended_actions: list[DeadlineRiskRecommendedAction] = Field(
        ...,
        min_length=1,
        max_length=3,
    )

    confidence_note: str = Field(..., min_length=1)


class GenerateDeadlineRiskInsightRequest(BaseModel):
    prediction_id: UUID
    persist_insight: bool = True


class GenerateDeadlineRiskInsightResponse(BaseModel):
    insight_id: UUID | None

    prediction_id: UUID
    llm_model: str
    prompt_version: str

    insight: GeminiDeadlineRiskInsightOutput