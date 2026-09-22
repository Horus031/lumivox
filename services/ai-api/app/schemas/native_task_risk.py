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
    reason_summaries: list[NativeTaskRiskReasonSummary] = []
    recommended_actions: list[NativeTaskRiskRecommendedAction] = []
    predicted_late: bool
    decision_threshold: float

    days_until_due: int | None = None
    due_at: str | None = None

    features: dict[str, float]
    reasons: list[NativeTaskRiskReason]

    prediction_id: str | None = None

class NativeTaskRiskBatchPredictRequest(BaseModel):
    user_id: str
    task_ids: list[str] = Field(min_length=1, max_length=20)
    persist: bool = True


class NativeTaskRiskBatchError(BaseModel):
    task_id: str
    error: str


class NativeTaskRiskBatchPredictResponse(BaseModel):
    predictions: list[NativeTaskRiskPredictResponse]
    errors: list[NativeTaskRiskBatchError] = []


class NativeTaskRiskReasonSummary(BaseModel):
    title: str
    description: str
    severity: Literal["info", "warning", "critical"] = "info"


class NativeTaskRiskRecommendedAction(BaseModel):
    action_id: str
    label: str
    description: str
    action_type: Literal[
        "start_focus",
        "reschedule",
        "split_task",
        "reduce_scope",
        "view_task",
    ]
    priority: int = Field(ge=1, le=5)
    payload: dict = {}

class NativeTaskRiskCronRefreshRequest(BaseModel):
    horizon_days: int = Field(default=14, ge=1, le=60)
    max_users: int = Field(default=50, ge=1, le=200)
    max_tasks_per_user: int = Field(default=8, ge=1, le=20)
    skip_recent_hours: int = Field(default=6, ge=1, le=48)


class NativeTaskRiskCronRefreshResponse(BaseModel):
    candidates: int
    predictions_created: int
    errors: list[NativeTaskRiskBatchError] = []