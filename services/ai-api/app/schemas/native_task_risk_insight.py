from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class NativeTaskRiskInsightEvidenceItem(BaseModel):
    evidence_key: str = Field(..., min_length=1)
    student_friendly_explanation: str = Field(..., min_length=1)


class NativeTaskRiskRecommendedAction(BaseModel):
    action: str = Field(..., min_length=1)
    rationale: str = Field(..., min_length=1)


class GeminiNativeTaskRiskInsightOutput(BaseModel):
    title: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    risk_interpretation: str = Field(..., min_length=1)

    evidence: list[NativeTaskRiskInsightEvidenceItem] = Field(
        ...,
        min_length=1,
        max_length=5,
    )

    recommended_actions: list[NativeTaskRiskRecommendedAction] = Field(
        ...,
        min_length=1,
        max_length=3,
    )

    confidence_note: str = Field(..., min_length=1)


class GenerateNativeTaskRiskInsightRequest(BaseModel):
    assessment_id: UUID
    persist_insight: bool = True


class GenerateNativeTaskRiskInsightResponse(BaseModel):
    insight_id: UUID | None

    assessment_id: UUID
    llm_model: str
    prompt_version: str

    insight: GeminiNativeTaskRiskInsightOutput