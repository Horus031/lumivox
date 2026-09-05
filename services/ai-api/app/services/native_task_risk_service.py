from __future__ import annotations

import json
import math
import os
from datetime import datetime, time, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from supabase import create_client

from app.schemas.native_task_risk import (
    NativeTaskRiskPredictRequest,
    NativeTaskRiskPredictResponse,
    NativeTaskRiskReason,
)


MODEL_KEY = "native_task_delay_risk_classifier"

DEFAULT_FEATURE_COLUMNS = [
    "days_until_due",
    "task_age_days",
    "estimated_minutes",
    "priority",
    "title_length",
    "description_length",
    "has_description",
    "has_goal",
    "is_subtask",
    "task_depth",
    "child_task_count",
    "focus_minutes_last_7d",
    "focus_minutes_last_14d",
    "completed_tasks_last_7d",
    "completed_tasks_last_14d",
    "overdue_tasks_last_30d",
    "goal_completion_ratio",
    "snapshot_weekday",
    "is_weekend_snapshot",
    "snapshot_offset_days",
]

PRIORITY_MAP = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}

COMPLETED_STATUSES = {"completed", "done", "complete", "finished"}
CANCELLED_STATUSES = {"cancelled", "canceled"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)

    if path.is_absolute():
        return path

    # service root: services/ai-api
    return Path.cwd() / path


def _get_supabase_admin():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
        )

    return create_client(supabase_url, service_role_key)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _parse_date_to_due_at(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        parsed_date = datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None

    return datetime.combine(
        parsed_date + timedelta(days=1),
        time.min,
        tzinfo=timezone.utc,
    )


def _get_effective_due_at(task: dict[str, Any]) -> datetime | None:
    due_at = _parse_datetime(task.get("due_at"))

    if due_at is not None:
        return due_at

    return _parse_date_to_due_at(task.get("due_date"))


def _task_status(task: dict[str, Any]) -> str:
    return str(task.get("status") or "").strip().lower()


def _normalize_priority(value: Any) -> int:
    if isinstance(value, bool):
        return 2

    if isinstance(value, (int, float)):
        return min(4, max(1, int(value)))

    return PRIORITY_MAP.get(str(value or "medium").lower(), 2)


@lru_cache(maxsize=1)
def _load_model_artifact() -> dict[str, Any] | None:
    model_path_value = os.getenv(
        "NATIVE_TASK_RISK_MODEL_PATH",
        "ml/artifacts/native-task-risk/native_task_risk_best_model.joblib",
    )

    model_path = _resolve_path(model_path_value)

    if not model_path.exists():
        return None

    artifact = joblib.load(model_path)

    if not isinstance(artifact, dict) or "model" not in artifact:
        raise RuntimeError("Invalid native task risk model artifact format.")

    return artifact


@lru_cache(maxsize=1)
def _load_model_metadata() -> dict[str, Any]:
    metadata_path_value = os.getenv(
        "NATIVE_TASK_RISK_METADATA_PATH",
        "ml/artifacts/native-task-risk/native_task_risk_model_metadata.json",
    )

    metadata_path = _resolve_path(metadata_path_value)

    if metadata_path.exists():
        with metadata_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    artifact = _load_model_artifact()

    if artifact:
        return {
            "model_key": artifact.get("model_key", MODEL_KEY),
            "model_version": artifact.get("model_version", "unknown"),
            "selected_algorithm": artifact.get("selected_algorithm", "unknown"),
            "feature_columns": artifact.get("feature_columns", DEFAULT_FEATURE_COLUMNS),
            "threshold": artifact.get("threshold", 0.5),
        }

    return {
        "model_key": MODEL_KEY,
        "model_version": "deterministic-fallback-v1",
        "selected_algorithm": "deterministic_fallback",
        "feature_columns": DEFAULT_FEATURE_COLUMNS,
        "threshold": 0.5,
    }


def _fetch_user_tasks(supabase: Any, user_id: str) -> list[dict[str, Any]]:
    response = (
        supabase.table("tasks")
        .select(
            "id,user_id,goal_id,parent_task_id,title,description,status,"
            "priority,estimated_minutes,due_at,due_date,created_at,completed_at"
        )
        .eq("user_id", user_id)
        .execute()
    )

    return response.data or []


def _fetch_task(
    *,
    user_tasks: list[dict[str, Any]],
    task_id: str,
) -> dict[str, Any]:
    for task in user_tasks:
        if str(task.get("id")) == task_id:
            return task

    raise ValueError("Task not found for this user.")


def _fetch_focus_sessions(
    supabase: Any,
    *,
    user_id: str,
    window_start: datetime,
    now: datetime,
) -> list[dict[str, Any]]:
    response = (
        supabase.table("focus_sessions")
        .select("id,user_id,task_id,started_at,ended_at,planned_minutes,actual_focus_minutes,status")
        .eq("user_id", user_id)
        .gte("started_at", window_start.isoformat())
        .lte("started_at", now.isoformat())
        .execute()
    )

    return response.data or []


def _count_recent_focus_minutes(
    sessions: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
) -> int:
    window_start = now - timedelta(days=days)
    total = 0

    for session in sessions:
        started_at = _parse_datetime(session.get("started_at"))

        if started_at and window_start <= started_at <= now:
            total += max(0, int(session.get("actual_focus_minutes") or 0))

    return total


def _count_recent_completed_tasks(
    tasks: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
) -> int:
    window_start = now - timedelta(days=days)
    count = 0

    for task in tasks:
        completed_at = _parse_datetime(task.get("completed_at"))

        if completed_at and window_start <= completed_at <= now:
            count += 1

    return count


def _count_recent_overdue_tasks(
    tasks: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
) -> int:
    window_start = now - timedelta(days=days)
    count = 0

    for task in tasks:
        if _task_status(task) in CANCELLED_STATUSES:
            continue

        due_at = _get_effective_due_at(task)

        if not due_at or not (window_start <= due_at <= now):
            continue

        completed_at = _parse_datetime(task.get("completed_at"))

        if completed_at is None or completed_at > due_at:
            count += 1

    return count


def _goal_completion_ratio(
    tasks: list[dict[str, Any]],
    *,
    goal_id: str | None,
    now: datetime,
) -> float:
    if not goal_id:
        return 0.0

    goal_tasks = []

    for task in tasks:
        if str(task.get("goal_id") or "") != goal_id:
            continue

        if _task_status(task) in CANCELLED_STATUSES:
            continue

        created_at = _parse_datetime(task.get("created_at"))

        if created_at and created_at <= now:
            goal_tasks.append(task)

    if not goal_tasks:
        return 0.0

    completed = 0

    for task in goal_tasks:
        completed_at = _parse_datetime(task.get("completed_at"))

        if completed_at and completed_at <= now:
            completed += 1

    return completed / len(goal_tasks)


def _task_depth(
    *,
    task: dict[str, Any],
    task_by_id: dict[str, dict[str, Any]],
) -> int:
    depth = 0
    current = task
    visited: set[str] = set()

    while current.get("parent_task_id"):
        current_id = str(current.get("id"))

        if current_id in visited:
            return depth

        visited.add(current_id)

        parent_id = str(current["parent_task_id"])
        parent = task_by_id.get(parent_id)

        if not parent:
            return depth + 1

        depth += 1
        current = parent

    return depth


def _child_task_count(
    *,
    task_id: str,
    tasks: list[dict[str, Any]],
) -> int:
    return sum(
        1
        for task in tasks
        if str(task.get("parent_task_id") or "") == task_id
    )


def _snapshot_offset_bucket(days_until_due: int) -> int:
    if days_until_due <= 1:
        return 1

    if days_until_due <= 3:
        return 3

    return 7


def _build_live_features(
    *,
    task: dict[str, Any],
    user_tasks: list[dict[str, Any]],
    focus_sessions: list[dict[str, Any]],
    now: datetime,
) -> tuple[dict[str, float], datetime | None]:
    task_id = str(task["id"])
    goal_id = str(task.get("goal_id") or "") or None

    due_at = _get_effective_due_at(task)
    created_at = _parse_datetime(task.get("created_at"))

    if due_at is None:
        raise ValueError("Task has no due_at or due_date.")

    if created_at is None:
        raise ValueError("Task has no valid created_at.")

    if _task_status(task) in COMPLETED_STATUSES or task.get("completed_at"):
        raise ValueError("Completed tasks do not need risk prediction.")

    if _task_status(task) in CANCELLED_STATUSES:
        raise ValueError("Cancelled tasks do not need risk prediction.")

    seconds_until_due = max(0.0, (due_at - now).total_seconds())
    days_until_due = int(math.ceil(seconds_until_due / 86400))

    task_by_id = {
        str(item["id"]): item
        for item in user_tasks
        if item.get("id")
    }

    title = str(task.get("title") or "")
    description = str(task.get("description") or "")

    features = {
        "days_until_due": float(days_until_due),
        "task_age_days": float(max(0, (now.date() - created_at.date()).days)),
        "estimated_minutes": float(max(0, int(task.get("estimated_minutes") or 0))),
        "priority": float(_normalize_priority(task.get("priority"))),
        "title_length": float(len(title)),
        "description_length": float(len(description)),
        "has_description": float(int(bool(description.strip()))),
        "has_goal": float(int(bool(goal_id))),
        "is_subtask": float(int(bool(task.get("parent_task_id")))),
        "task_depth": float(_task_depth(task=task, task_by_id=task_by_id)),
        "child_task_count": float(_child_task_count(task_id=task_id, tasks=user_tasks)),
        "focus_minutes_last_7d": float(
            _count_recent_focus_minutes(focus_sessions, now=now, days=7)
        ),
        "focus_minutes_last_14d": float(
            _count_recent_focus_minutes(focus_sessions, now=now, days=14)
        ),
        "completed_tasks_last_7d": float(
            _count_recent_completed_tasks(user_tasks, now=now, days=7)
        ),
        "completed_tasks_last_14d": float(
            _count_recent_completed_tasks(user_tasks, now=now, days=14)
        ),
        "overdue_tasks_last_30d": float(
            _count_recent_overdue_tasks(user_tasks, now=now, days=30)
        ),
        "goal_completion_ratio": float(
            _goal_completion_ratio(user_tasks, goal_id=goal_id, now=now)
        ),
        "snapshot_weekday": float(now.weekday()),
        "is_weekend_snapshot": float(int(now.weekday() >= 5)),
        "snapshot_offset_days": float(_snapshot_offset_bucket(days_until_due)),
    }

    return features, due_at


def _risk_band(probability: float) -> str:
    if probability >= 0.70:
        return "high"

    if probability >= 0.50:
        return "elevated"

    if probability >= 0.35:
        return "moderate"

    return "low"


def _fallback_probability(features: dict[str, float]) -> float:
    days_until_due = features["days_until_due"]
    overdue_count = features["overdue_tasks_last_30d"]
    focus_7d = features["focus_minutes_last_7d"]
    estimated_minutes = features["estimated_minutes"]
    priority = features["priority"]
    goal_completion = features["goal_completion_ratio"]

    score = 0.15

    if days_until_due <= 1:
        score += 0.30
    elif days_until_due <= 3:
        score += 0.20
    elif days_until_due <= 7:
        score += 0.10

    if priority >= 4:
        score += 0.12
    elif priority >= 3:
        score += 0.07

    if estimated_minutes >= 180:
        score += 0.10

    if focus_7d <= 30:
        score += 0.15
    elif focus_7d <= 90:
        score += 0.07

    if overdue_count >= 3:
        score += 0.15
    elif overdue_count >= 1:
        score += 0.08

    if goal_completion < 0.25:
        score += 0.08

    return min(0.95, max(0.02, score))


def _feature_reason_label(feature_name: str, feature_value: float, contribution: float) -> str:
    direction = "increases" if contribution > 0 else "decreases"

    labels = {
        "days_until_due": f"Deadline distance {direction} the predicted delay risk.",
        "task_age_days": f"Task age {direction} the predicted delay risk.",
        "estimated_minutes": f"Estimated workload {direction} the predicted delay risk.",
        "priority": f"Task priority {direction} the predicted delay risk.",
        "is_subtask": f"Subtask status {direction} the predicted delay risk.",
        "task_depth": f"Task hierarchy depth {direction} the predicted delay risk.",
        "child_task_count": f"Number of child tasks {direction} the predicted delay risk.",
        "focus_minutes_last_7d": f"Recent focus time {direction} the predicted delay risk.",
        "completed_tasks_last_7d": f"Recent completed tasks {direction} the predicted delay risk.",
        "overdue_tasks_last_30d": f"Recent overdue task history {direction} the predicted delay risk.",
        "goal_completion_ratio": f"Goal progress {direction} the predicted delay risk.",
    }

    return labels.get(
        feature_name,
        f"{feature_name} {direction} the predicted delay risk.",
    )


def _extract_logistic_reasons(
    *,
    artifact: dict[str, Any],
    features: dict[str, float],
) -> list[NativeTaskRiskReason]:
    pipeline = artifact["model"]
    feature_columns = artifact.get("feature_columns") or DEFAULT_FEATURE_COLUMNS

    if "model" not in pipeline.named_steps:
        return []

    model = pipeline.named_steps["model"]

    if not hasattr(model, "coef_"):
        return []

    x = pd.DataFrame([[features[column] for column in feature_columns]], columns=feature_columns)

    transformed = x

    if "imputer" in pipeline.named_steps:
        transformed = pipeline.named_steps["imputer"].transform(transformed)

    if "scaler" in pipeline.named_steps:
        transformed = pipeline.named_steps["scaler"].transform(transformed)

    coefficients = model.coef_[0]
    contributions = coefficients * np.asarray(transformed)[0]

    rows = []

    for feature_name, feature_value, contribution in zip(
        feature_columns,
        [features[column] for column in feature_columns],
        contributions,
    ):
        if abs(float(contribution)) < 0.0001:
            effect = "neutral"
        elif contribution > 0:
            effect = "increases_risk"
        else:
            effect = "decreases_risk"

        rows.append(
            NativeTaskRiskReason(
                feature_name=feature_name,
                feature_value=float(feature_value),
                contribution=round(float(contribution), 6),
                effect=effect,
                reason=_feature_reason_label(
                    feature_name,
                    float(feature_value),
                    float(contribution),
                ),
            )
        )

    rows.sort(key=lambda item: abs(item.contribution), reverse=True)

    return rows[:5]


def _fallback_reasons(features: dict[str, float]) -> list[NativeTaskRiskReason]:
    reasons: list[NativeTaskRiskReason] = []

    if features["days_until_due"] <= 3:
        reasons.append(
            NativeTaskRiskReason(
                feature_name="days_until_due",
                feature_value=features["days_until_due"],
                contribution=0.25,
                effect="increases_risk",
                reason="The task is close to its deadline.",
            )
        )

    if features["focus_minutes_last_7d"] <= 30:
        reasons.append(
            NativeTaskRiskReason(
                feature_name="focus_minutes_last_7d",
                feature_value=features["focus_minutes_last_7d"],
                contribution=0.15,
                effect="increases_risk",
                reason="Recent focus time is low.",
            )
        )

    if features["overdue_tasks_last_30d"] >= 1:
        reasons.append(
            NativeTaskRiskReason(
                feature_name="overdue_tasks_last_30d",
                feature_value=features["overdue_tasks_last_30d"],
                contribution=0.12,
                effect="increases_risk",
                reason="The user has overdue tasks in the recent history window.",
            )
        )

    if features["goal_completion_ratio"] < 0.25:
        reasons.append(
            NativeTaskRiskReason(
                feature_name="goal_completion_ratio",
                feature_value=features["goal_completion_ratio"],
                contribution=0.08,
                effect="increases_risk",
                reason="The related goal has low completion progress.",
            )
        )

    return reasons[:5]


def _get_active_model_version_id(
    supabase: Any,
    *,
    model_key: str,
    model_version: str,
) -> str | None:
    response = (
        supabase.table("ml_model_versions")
        .select("id")
        .eq("model_key", model_key)
        .eq("version", model_version)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )

    if response.data:
        return response.data["id"]

    return None


def _persist_prediction(
    supabase: Any,
    *,
    request: NativeTaskRiskPredictRequest,
    task: dict[str, Any],
    response: NativeTaskRiskPredictResponse,
) -> str | None:
    model_version_id = _get_active_model_version_id(
        supabase,
        model_key=response.model_key,
        model_version=response.model_version,
    )

    if not model_version_id:
        return None

    prediction = (
        supabase.table("deadline_risk_predictions")
        .insert(
            {
                "user_id": request.user_id,
                "task_id": request.task_id,
                "model_version_id": model_version_id,
                "input_mode": "lumivox_native_features",
                "risk_probability": response.risk_probability,
                "predicted_label": response.predicted_late,
                "decision_threshold": response.decision_threshold,
                "feature_payload": response.features,
                "prediction_metadata": {
                    "prediction_mode": response.prediction_mode,
                    "risk_score": response.risk_score,
                    "risk_band": response.risk_band,
                    "due_at": response.due_at,
                    "days_until_due": response.days_until_due,
                },
            }
        )
        .execute()
    )

    if not prediction.data:
        return None

    prediction_id = prediction.data[0]["id"]

    attribution_rows = []

    for index, reason in enumerate(response.reasons, start=1):
        attribution_rows.append(
            {
                "prediction_id": prediction_id,
                "feature_name": reason.feature_name,
                "feature_value": reason.feature_value,
                "shap_value": reason.contribution,
                "effect": reason.effect,
                "absolute_rank": index,
            }
        )

    if attribution_rows:
        (
            supabase.table("deadline_risk_feature_attributions")
            .insert(attribution_rows)
            .execute()
        )

    return prediction_id


def predict_native_task_risk(
    request: NativeTaskRiskPredictRequest,
) -> NativeTaskRiskPredictResponse:
    supabase = _get_supabase_admin()
    now = _now_utc()

    user_tasks = _fetch_user_tasks(supabase, request.user_id)
    task = _fetch_task(user_tasks=user_tasks, task_id=request.task_id)

    focus_sessions = _fetch_focus_sessions(
        supabase,
        user_id=request.user_id,
        window_start=now - timedelta(days=14),
        now=now,
    )

    features, due_at = _build_live_features(
        task=task,
        user_tasks=user_tasks,
        focus_sessions=focus_sessions,
        now=now,
    )

    artifact = _load_model_artifact()
    metadata = _load_model_metadata()

    feature_columns = metadata.get("feature_columns") or DEFAULT_FEATURE_COLUMNS
    threshold = float(metadata.get("threshold") or 0.5)

    if artifact:
        model = artifact["model"]
        x = pd.DataFrame(
            [[features[column] for column in feature_columns]],
            columns=feature_columns,
        )

        probability = float(model.predict_proba(x)[0][1])
        prediction_mode = "native_ml"
        model_key = str(metadata.get("model_key") or MODEL_KEY)
        model_version = str(metadata.get("model_version") or "unknown")
        model_name = str(metadata.get("selected_algorithm") or "unknown")
        reasons = _extract_logistic_reasons(
            artifact=artifact,
            features=features,
        )
    else:
        probability = _fallback_probability(features)
        prediction_mode = "deterministic_fallback"
        model_key = MODEL_KEY
        model_version = "deterministic-fallback-v1"
        model_name = "deterministic_fallback"
        reasons = _fallback_reasons(features)

    risk_band = _risk_band(probability)

    due_at_iso = due_at.isoformat() if due_at else None
    days_until_due = int(features["days_until_due"]) if due_at else None

    response = NativeTaskRiskPredictResponse(
        user_id=request.user_id,
        task_id=request.task_id,
        goal_id=str(task.get("goal_id")) if task.get("goal_id") else None,
        prediction_mode=prediction_mode,
        model_key=model_key,
        model_version=model_version,
        model_name=model_name,
        risk_probability=round(probability, 6),
        risk_score=round(probability * 100, 2),
        risk_band=risk_band,
        predicted_late=probability >= threshold,
        decision_threshold=threshold,
        days_until_due=days_until_due,
        due_at=due_at_iso,
        features=features,
        reasons=reasons,
        prediction_id=None,
    )

    if request.persist:
        prediction_id = _persist_prediction(
            supabase,
            request=request,
            task=task,
            response=response,
        )

        response.prediction_id = prediction_id

    return response