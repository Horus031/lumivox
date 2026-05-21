from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DeadlineRiskFeaturePayload(BaseModel):
    assessment_weight: float = Field(..., ge=0)

    engagement_events_total: float = Field(..., ge=0)
    active_days_total: float = Field(..., ge=0)

    engagement_events_last_7d: float = Field(..., ge=0)
    active_days_last_7d: float = Field(..., ge=0)

    prior_deadline_items_count: float = Field(..., ge=0)
    prior_submissions_count: float = Field(..., ge=0)
    prior_late_submissions_count: float = Field(..., ge=0)

    prior_submission_rate: float = Field(..., ge=0, le=1)
    prior_late_rate: float = Field(..., ge=0, le=1)


class DeadlineRiskPredictionRequest(BaseModel):
    user_id: UUID | None = None
    task_id: UUID | None = None

    input_mode: Literal["oulad_compatible_features"] = (
        "oulad_compatible_features"
    )

    persist_prediction: bool = True

    features: DeadlineRiskFeaturePayload


class DeadlineRiskFeatureAttributionResponse(BaseModel):
    feature: str
    feature_value: float
    shap_value: float
    effect: Literal[
        "increases_risk",
        "decreases_risk",
        "neutral",
    ]


class DeadlineRiskExplanationResponse(BaseModel):
    baseline_expected_value: float
    top_positive_contributors: list[DeadlineRiskFeatureAttributionResponse]
    top_negative_contributors: list[DeadlineRiskFeatureAttributionResponse]


class DeadlineRiskPredictionResponse(BaseModel):
    prediction_id: UUID | None

    model_key: str
    model_version: str

    risk_probability: float
    predicted_label: bool
    decision_threshold: float

    explanation: DeadlineRiskExplanationResponse