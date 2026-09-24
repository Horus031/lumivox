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

from app.services.native_task_risk_features_v2 import (
    FEATURE_COLUMNS_V2,
    FEATURE_SCHEMA_VERSION,
    build_live_features_v2,
)
from app.schemas.native_task_risk import (
    NativeTaskRiskBatchError,
    NativeTaskRiskBatchPredictRequest,
    NativeTaskRiskBatchPredictResponse,
    NativeTaskRiskPredictRequest,
    NativeTaskRiskPredictResponse,
    NativeTaskRiskReason,
    NativeTaskRiskReasonSummary,
    NativeTaskRiskRecommendedAction,
    NativeTaskRiskCronRefreshRequest,
    NativeTaskRiskCronRefreshResponse,
    NativeTaskRiskBatchError,
)

def _build_reason_summaries(
    *,
    features: dict[str, float],
    probability: float,
    reasons: list[NativeTaskRiskReason],
) -> list[NativeTaskRiskReasonSummary]:
    summaries: list[NativeTaskRiskReasonSummary] = []

    days_until_due = int(features.get("days_until_due", 999))
    task_age_days = int(features.get("task_age_days", 0))
    focus_7d = int(features.get("focus_minutes_last_7d", 0))
    focus_14d = int(features.get("focus_minutes_last_14d", 0))
    overdue_30d = int(features.get("overdue_tasks_last_30d", 0))
    estimated_minutes = int(features.get("estimated_minutes", 0))
    goal_completion = float(features.get("goal_completion_ratio", 0))

    if days_until_due <= 1:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Deadline is very close",
                description="This task is due within 1 day, so the system flags it as requiring immediate attention.",
                severity="critical",
            )
        )
    elif days_until_due <= 3:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Deadline is approaching",
                description=f"This task is due in {days_until_due} days, leaving limited time to recover if progress is delayed.",
                severity="warning",
            )
        )

    if focus_7d <= 30:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Recent focus time is low",
                description=f"You only recorded {focus_7d} focus minutes in the last 7 days, which may make this task harder to finish on time.",
                severity="warning",
            )
        )
    elif focus_14d <= 90:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Focus momentum is limited",
                description=f"Your recent 14-day focus time is {focus_14d} minutes, so the model sees limited study momentum.",
                severity="info",
            )
        )

    if overdue_30d > 0:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Recent overdue history detected",
                description=f"You had {overdue_30d} overdue task(s) in the last 30 days. This pattern increases the predicted delay risk.",
                severity="warning",
            )
        )

    if task_age_days >= 7:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Task has been open for a while",
                description=f"This task has been open for {task_age_days} days. Long-open tasks are more likely to need rescheduling or breakdown.",
                severity="info",
            )
        )

    if estimated_minutes >= 180:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Estimated workload is high",
                description=f"This task is estimated at {estimated_minutes} minutes, so it may need to be split into smaller work blocks.",
                severity="warning",
            )
        )

    if goal_completion < 0.25 and features.get("has_goal", 0) == 1:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Related goal progress is still low",
                description="The related goal has low completion progress, which may indicate that the task is part of a larger delayed goal.",
                severity="info",
            )
        )

    if not summaries:
        summaries.append(
            NativeTaskRiskReasonSummary(
                title="Risk is based on combined behavior patterns",
                description="The model combines deadline distance, task history, focus activity, and goal progress to estimate this risk.",
                severity="info",
            )
        )

    return summaries[:4]


def _build_recommended_actions(
    *,
    task_id: str,
    features: dict[str, float],
    probability: float,
    risk_band: str,
) -> list[NativeTaskRiskRecommendedAction]:
    actions: list[NativeTaskRiskRecommendedAction] = []

    days_until_due = int(features.get("days_until_due", 999))
    focus_7d = int(features.get("focus_minutes_last_7d", 0))
    estimated_minutes = int(features.get("estimated_minutes", 0))
    child_task_count = int(features.get("child_task_count", 0))
    is_subtask = int(features.get("is_subtask", 0))

    if risk_band in {"moderate", "elevated", "high"}:
        actions.append(
            NativeTaskRiskRecommendedAction(
                action_id="start_focus",
                label="Start focus",
                description="Start a focus session for this task now.",
                action_type="start_focus",
                priority=5,
                payload={"task_id": task_id},
            )
        )

    if days_until_due <= 3 and risk_band in {"elevated", "high"}:
        actions.append(
            NativeTaskRiskRecommendedAction(
                action_id="reschedule_plus_1_day",
                label="Reschedule +1 day",
                description="Move the deadline 1 day later if the current date is unrealistic.",
                action_type="reschedule",
                priority=4,
                payload={"task_id": task_id, "days_to_add": 1},
            )
        )

        actions.append(
            NativeTaskRiskRecommendedAction(
                action_id="reschedule_plus_3_days",
                label="Reschedule +3 days",
                description="Move the deadline 3 days later and reduce deadline pressure.",
                action_type="reschedule",
                priority=3,
                payload={"task_id": task_id, "days_to_add": 3},
            )
        )

    if estimated_minutes >= 120 and child_task_count == 0 and is_subtask == 0:
        actions.append(
            NativeTaskRiskRecommendedAction(
                action_id="split_task",
                label="Break into subtasks",
                description="Split this task into smaller subtasks to make progress easier.",
                action_type="split_task",
                priority=4,
                payload={"task_id": task_id},
            )
        )

    if risk_band == "high":
        actions.append(
            NativeTaskRiskRecommendedAction(
                action_id="reduce_scope",
                label="Reduce scope",
                description="Review the task and reduce its scope to the minimum achievable outcome.",
                action_type="reduce_scope",
                priority=3,
                payload={"task_id": task_id},
            )
        )

    actions.append(
        NativeTaskRiskRecommendedAction(
            action_id="view_task",
            label="View task",
            description="Open the task and review its details.",
            action_type="view_task",
            priority=1,
            payload={"task_id": task_id},
        )
    )

    actions.sort(key=lambda item: item.priority, reverse=True)

    return actions[:5]


MODEL_KEY = "native_task_delay_risk_classifier"
AI_API_DIR = Path(__file__).resolve().parents[2]

DEFAULT_FEATURE_COLUMNS = FEATURE_COLUMNS_V2

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

    # Resolve relative model paths from services/ai-api, not process cwd.
    return AI_API_DIR / path


def _get_supabase_admin():
    supabase_url = os.getenv("SUPABASE_URL")
    secret_key = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    if not supabase_url or not secret_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SECRET_KEY "
            "(or SUPABASE_SERVICE_ROLE_KEY) must be configured."
        )

    return create_client(supabase_url, secret_key)


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
            "feature_schema_version": artifact.get(
                "feature_schema_version", FEATURE_SCHEMA_VERSION
            ),
            "feature_columns": artifact.get("feature_columns", DEFAULT_FEATURE_COLUMNS),
            "prediction_horizon_days": artifact.get("prediction_horizon_days", 14),
            "threshold": artifact.get("threshold", 0.5),
        }

    return {
        "model_key": MODEL_KEY,
        "model_version": "deterministic-fallback-v1",
        "selected_algorithm": "deterministic_fallback",
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_columns": DEFAULT_FEATURE_COLUMNS,
        "prediction_horizon_days": 14,
        "threshold": 0.5,
    }


def _native_model_required() -> bool:
    explicit = str(os.getenv("NATIVE_TASK_RISK_REQUIRE_MODEL") or "").strip().lower()
    if explicit in {"1", "true", "yes", "on"}:
        return True
    if explicit in {"0", "false", "no", "off"}:
        return False
    return str(os.getenv("APP_ENV") or "").strip().lower() in {"staging", "production"}


def validate_native_task_risk_artifact() -> dict[str, Any]:
    """Validate train/serve compatibility during application startup."""

    artifact = _load_model_artifact()
    metadata = _load_model_metadata()

    if artifact is None:
        if _native_model_required():
            model_path = _resolve_path(
                os.getenv(
                    "NATIVE_TASK_RISK_MODEL_PATH",
                    "ml/artifacts/native-task-risk/native_task_risk_best_model.joblib",
                )
            )
            raise RuntimeError(
                f"Native task risk model is required but missing: {model_path}"
            )

        return {
            "status": "fallback",
            "model_version": "deterministic-fallback-v1",
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
        }

    artifact_features = list(artifact.get("feature_columns") or [])
    metadata_features = list(metadata.get("feature_columns") or [])
    if artifact_features != DEFAULT_FEATURE_COLUMNS:
        raise RuntimeError(
            "Native task risk artifact feature schema does not match serving v2 contract."
        )
    if metadata_features != artifact_features:
        raise RuntimeError("Native task risk metadata/artifact feature columns mismatch.")

    artifact_schema = str(artifact.get("feature_schema_version") or "")
    metadata_schema = str(metadata.get("feature_schema_version") or "")
    if artifact_schema != FEATURE_SCHEMA_VERSION or metadata_schema != FEATURE_SCHEMA_VERSION:
        raise RuntimeError(
            f"Expected feature schema {FEATURE_SCHEMA_VERSION}, "
            f"got artifact={artifact_schema!r}, metadata={metadata_schema!r}."
        )

    if str(artifact.get("model_version")) != str(metadata.get("model_version")):
        raise RuntimeError("Native task risk metadata/artifact model version mismatch.")

    if abs(float(artifact.get("threshold", 0.5)) - float(metadata.get("threshold", 0.5))) > 1e-9:
        raise RuntimeError("Native task risk metadata/artifact threshold mismatch.")

    model = artifact.get("model")
    if model is None or not hasattr(model, "predict_proba"):
        raise RuntimeError("Native task risk artifact model does not support predict_proba.")

    return {
        "status": "ready",
        "model_version": str(metadata.get("model_version") or "unknown"),
        "algorithm": str(metadata.get("selected_algorithm") or "unknown"),
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "threshold": float(metadata.get("threshold") or 0.5),
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
                    "reason_summaries": [
                        item.model_dump()
                        for item in response.reason_summaries
                    ],
                    "recommended_actions": [
                        item.model_dump()
                        for item in response.recommended_actions
                    ],
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

    features, due_at = build_live_features_v2(
        task=task,
        user_tasks=user_tasks,
        focus_sessions=focus_sessions,
        now=now,
    )

    artifact = _load_model_artifact()
    metadata = _load_model_metadata()

    feature_columns = metadata.get("feature_columns") or DEFAULT_FEATURE_COLUMNS
    threshold = float(metadata.get("threshold") or 0.5)
    max_horizon_days = int(metadata.get("prediction_horizon_days") or 14)

    if int(features["days_until_due"]) > max_horizon_days:
        raise ValueError(
            f"Task is outside the trained prediction horizon ({max_horizon_days} days)."
        )

    missing_features = [column for column in feature_columns if column not in features]
    if missing_features:
        raise RuntimeError(
            f"Serving features do not satisfy model contract: {missing_features}"
        )

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
    
    reason_summaries = _build_reason_summaries(
        features=features,
        probability=probability,
        reasons=reasons,
    )

    recommended_actions = _build_recommended_actions(
        task_id=request.task_id,
        features=features,
        probability=probability,
        risk_band=risk_band,
    )

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
        reason_summaries=reason_summaries,
        recommended_actions=recommended_actions,
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

def predict_native_task_risk_batch(
    request: NativeTaskRiskBatchPredictRequest,
) -> NativeTaskRiskBatchPredictResponse:
    predictions: list[NativeTaskRiskPredictResponse] = []
    errors: list[NativeTaskRiskBatchError] = []

    unique_task_ids = list(dict.fromkeys(request.task_ids))

    for task_id in unique_task_ids:
        try:
            prediction = predict_native_task_risk(
                NativeTaskRiskPredictRequest(
                    user_id=request.user_id,
                    task_id=task_id,
                    persist=request.persist,
                )
            )
            predictions.append(prediction)
        except Exception as error:
            errors.append(
                NativeTaskRiskBatchError(
                    task_id=task_id,
                    error=str(error),
                )
            )

    return NativeTaskRiskBatchPredictResponse(
        predictions=predictions,
        errors=errors,
    )

def refresh_native_task_risk_for_cron(
    request: NativeTaskRiskCronRefreshRequest,
) -> NativeTaskRiskCronRefreshResponse:
    supabase = _get_supabase_admin()

    response = (
        supabase.rpc(
            "get_native_task_risk_system_candidates",
            {
                "p_horizon_days": request.horizon_days,
                "p_max_users": request.max_users,
                "p_max_tasks_per_user": request.max_tasks_per_user,
                "p_skip_recent_hours": request.skip_recent_hours,
            },
        )
        .execute()
    )

    candidates = response.data or []

    predictions_created = 0
    errors: list[NativeTaskRiskBatchError] = []

    for candidate in candidates:
        user_id = str(candidate["user_id"])
        task_id = str(candidate["task_id"])

        try:
            prediction = predict_native_task_risk(
                NativeTaskRiskPredictRequest(
                    user_id=user_id,
                    task_id=task_id,
                    persist=True,
                )
            )

            if prediction.prediction_id:
                predictions_created += 1

        except Exception as error:
            errors.append(
                NativeTaskRiskBatchError(
                    task_id=task_id,
                    error=str(error),
                )
            )

    return NativeTaskRiskCronRefreshResponse(
        candidates=len(candidates),
        predictions_created=predictions_created,
        errors=errors,
    )