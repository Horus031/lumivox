from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import shap

from app.core.config import settings


DEADLINE_RISK_FEATURE_NAMES = [
    "assessment_weight",
    "engagement_events_total",
    "active_days_total",
    "engagement_events_last_7d",
    "active_days_last_7d",
    "prior_deadline_items_count",
    "prior_submissions_count",
    "prior_late_submissions_count",
    "prior_submission_rate",
    "prior_late_rate",
]


@dataclass
class DeadlineRiskRuntime:
    pipeline: Any
    imputer: Any
    model: Any
    explainer: Any
    feature_names: list[str]


def load_deadline_risk_runtime() -> DeadlineRiskRuntime:
    model_path = Path(settings.deadline_risk_model_path)

    if not model_path.exists():
        raise FileNotFoundError(
            f"Deadline risk model artefact not found at: {model_path}"
        )

    pipeline = joblib.load(model_path)

    imputer = pipeline.named_steps["imputer"]
    model = pipeline.named_steps["model"]

    explainer = shap.TreeExplainer(model)

    return DeadlineRiskRuntime(
        pipeline=pipeline,
        imputer=imputer,
        model=model,
        explainer=explainer,
        feature_names=DEADLINE_RISK_FEATURE_NAMES,
    )