from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


RiskBand = Literal["low", "moderate", "elevated", "high"]
PredictionMode = Literal["native_ml", "deterministic_fallback"]


class NativeTaskRiskPredictRequest(BaseModel):
    user_id: str
    task_id: str
    persist: bool = True


class NativeTaskRiskReason(BaseModel):
    feature_name: str
    feature_value: float
    contribution: float
    effect: Literal["increases_risk", "decreases_risk", "neutral"]
    reason: str


class NativeTaskRiskPredictResponse(BaseModel):
    user_id: str
    task_id: str
    goal_id: str | None = None

    prediction_mode: PredictionMode

    model_key: str
    model_version: str
    model_name: str

    risk_probability: float = Field(ge=0, le=1)
    risk_score: float = Field(ge=0, le=100)
    risk_band: RiskBand
    predicted_late: bool
    decision_threshold: float

    days_until_due: int | None = None
    due_at: str | None = None

    features: dict[str, float]
    reasons: list[NativeTaskRiskReason]

    prediction_id: str | None = None