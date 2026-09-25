from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import shap

from app.clients.supabase_client import get_supabase_client


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

AI_API_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DEADLINE_RISK_MODEL_PATH = (
    "ml/artifacts/deadline-risk/random_forest.joblib"
)


@dataclass
class DeadlineRiskRuntime:
    pipeline: Any
    imputer: Any
    model: Any
    explainer: Any
    feature_names: list[str]


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return AI_API_DIR / path


def _is_native_task_risk_path(path: Path) -> bool:
    normalized = path.as_posix().lower()
    return (
        "/native-task-risk/" in normalized
        or path.name in {
            "native_task_risk_best_model.joblib",
            "logistic_regression_balanced.joblib",
        }
    )


def _configured_deadline_risk_path() -> Path:
    configured = os.getenv(
        "DEADLINE_RISK_MODEL_PATH",
        DEFAULT_DEADLINE_RISK_MODEL_PATH,
    )
    model_path = _resolve_path(configured)

    # Guard against a Render/env mix-up where the legacy OULAD runtime
    # accidentally points at the native task-risk artifact.
    if _is_native_task_risk_path(model_path):
        model_path = _resolve_path(DEFAULT_DEADLINE_RISK_MODEL_PATH)

    return model_path


def _unwrap_pipeline(loaded: Any) -> Any:
    if hasattr(loaded, "named_steps"):
        return loaded

    if isinstance(loaded, dict):
        for key in ("pipeline", "model"):
            candidate = loaded.get(key)
            if hasattr(candidate, "named_steps"):
                return candidate

    raise RuntimeError(
        "Deadline risk artifact has an unsupported format. "
        "Expected a scikit-learn Pipeline for the legacy OULAD model."
    )


def load_deadline_risk_runtime() -> DeadlineRiskRuntime:
    model_path = ensure_deadline_risk_model_artifact()
    loaded = joblib.load(model_path)
    pipeline = _unwrap_pipeline(loaded)

    feature_count = getattr(pipeline, "n_features_in_", None)
    expected_feature_count = len(DEADLINE_RISK_FEATURE_NAMES)

    if (
        feature_count is not None
        and int(feature_count) != expected_feature_count
    ):
        raise RuntimeError(
            "Deadline risk artifact feature mismatch: "
            f"expected {expected_feature_count}, got {feature_count}. "
            "This usually means DEADLINE_RISK_MODEL_PATH points to the "
            "native task-risk model instead of the legacy OULAD model."
        )

    try:
        imputer = pipeline.named_steps["imputer"]
        model = pipeline.named_steps["model"]
    except KeyError as error:
        raise RuntimeError(
            "Deadline risk pipeline is missing required named steps "
            "'imputer' and/or 'model'."
        ) from error

    try:
        explainer = shap.TreeExplainer(model)
    except Exception as error:
        raise RuntimeError(
            "Deadline risk legacy artifact is not compatible with "
            "SHAP TreeExplainer. Expected the RandomForest OULAD model."
        ) from error

    return DeadlineRiskRuntime(
        pipeline=pipeline,
        imputer=imputer,
        model=model,
        explainer=explainer,
        feature_names=DEADLINE_RISK_FEATURE_NAMES,
    )


def ensure_deadline_risk_model_artifact() -> Path:
    model_path = _configured_deadline_risk_path()

    if model_path.exists():
        return model_path

    bucket_name = os.getenv("ML_ARTIFACT_BUCKET")
    object_path = os.getenv("DEADLINE_RISK_MODEL_OBJECT_PATH")

    if not bucket_name or not object_path:
        raise FileNotFoundError(
            "Legacy deadline risk model artifact was not found locally, and "
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
            "Failed to download legacy deadline risk model artifact from "
            f"Supabase Storage bucket='{bucket_name}', path='{object_path}'. "
            f"Original error: {error}"
        ) from error

    tmp_path = model_path.with_suffix(model_path.suffix + ".tmp")
    tmp_path.write_bytes(artifact_bytes)
    tmp_path.replace(model_path)

    return model_path
