from __future__ import annotations
import os
from pathlib import Path

from app.clients.supabase_client import get_supabase_client

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
    model_path = ensure_deadline_risk_model_artifact()

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

def ensure_deadline_risk_model_artifact() -> Path:
    model_path = Path(
        os.getenv(
            "DEADLINE_RISK_MODEL_PATH",
            "ml/artifacts/deadline-risk/random_forest.joblib",
        )
    )

    if model_path.exists():
        return model_path

    bucket_name = os.getenv("ML_ARTIFACT_BUCKET")
    object_path = os.getenv("DEADLINE_RISK_MODEL_OBJECT_PATH")

    if not bucket_name or not object_path:
        raise FileNotFoundError(
            "Deadline risk model artifact was not found locally, and "
            "ML_ARTIFACT_BUCKET / DEADLINE_RISK_MODEL_OBJECT_PATH are not configured."
        )

    model_path.parent.mkdir(parents=True, exist_ok=True)

    supabase = get_supabase_client()

    try:
        artifact_bytes = (
            supabase.storage
            .from_(bucket_name)
            .download(object_path)
        )
    except Exception as error:
        raise FileNotFoundError(
            f"Failed to download deadline risk model artifact from "
            f"Supabase Storage bucket='{bucket_name}', path='{object_path}'. "
            f"Original error: {error}"
        ) from error

    tmp_path = model_path.with_suffix(model_path.suffix + ".tmp")
    tmp_path.write_bytes(artifact_bytes)
    tmp_path.replace(model_path)

    return model_path