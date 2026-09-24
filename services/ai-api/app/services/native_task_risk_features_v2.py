from __future__ import annotations

import math
from datetime import datetime, time, timedelta, timezone
from typing import Any


SECONDS_PER_DAY = 86_400
FEATURE_SCHEMA_VERSION = "native-task-risk-v2"

FEATURE_COLUMNS_V2 = [
    "days_until_due",
    "task_age_days",
    "task_duration_days",
    "elapsed_fraction",
    "estimated_minutes",
    "workload_minutes_per_day",
    "priority",
    "title_length",
    "description_length",
    "has_description",
    "has_goal",
    "is_subtask",
    "task_depth",
    "child_task_count",
    "task_focus_minutes_last_7d",
    "task_focus_minutes_last_14d",
    "task_focus_sessions_last_14d",
    "focus_minutes_last_7d",
    "focus_minutes_last_14d",
    "completed_tasks_last_7d",
    "completed_tasks_last_14d",
    "due_tasks_last_30d",
    "overdue_tasks_last_30d",
    "overdue_rate_last_30d",
    "goal_completion_ratio",
    "snapshot_weekday",
    "is_weekend_snapshot",
]

PRIORITY_MAP = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}
COMPLETED_STATUSES = {"completed", "done", "complete", "finished"}
CANCELLED_STATUSES = {"cancelled", "canceled"}


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
    return PRIORITY_MAP.get(str(value or "medium").strip().lower(), 2)


def _count_focus_minutes(
    sessions: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
    task_id: str | None = None,
) -> int:
    window_start = now - timedelta(days=days)
    total = 0
    for session in sessions:
        if task_id is not None and str(session.get("task_id") or "") != task_id:
            continue
        started_at = _parse_datetime(session.get("started_at"))
        if started_at and window_start <= started_at <= now:
            total += max(0, int(session.get("actual_focus_minutes") or 0))
    return total


def _count_focus_sessions(
    sessions: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
    task_id: str,
) -> int:
    window_start = now - timedelta(days=days)
    count = 0
    for session in sessions:
        if str(session.get("task_id") or "") != task_id:
            continue
        started_at = _parse_datetime(session.get("started_at"))
        if started_at and window_start <= started_at <= now:
            count += 1
    return count


def _count_completed_tasks(
    tasks: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
) -> int:
    window_start = now - timedelta(days=days)
    return sum(
        1
        for task in tasks
        if (
            (completed_at := _parse_datetime(task.get("completed_at"))) is not None
            and window_start <= completed_at <= now
        )
    )


def _recent_due_and_overdue(
    tasks: list[dict[str, Any]],
    *,
    now: datetime,
    days: int,
) -> tuple[int, int]:
    window_start = now - timedelta(days=days)
    due_count = 0
    overdue_count = 0

    for task in tasks:
        if _task_status(task) in CANCELLED_STATUSES:
            continue
        due_at = _get_effective_due_at(task)
        if due_at is None or not (window_start <= due_at <= now):
            continue

        due_count += 1
        completed_at = _parse_datetime(task.get("completed_at"))
        if completed_at is None or completed_at > due_at:
            overdue_count += 1

    return due_count, overdue_count


def _goal_completion_ratio(
    tasks: list[dict[str, Any]],
    *,
    goal_id: str | None,
    now: datetime,
) -> float:
    if not goal_id:
        return 0.0

    eligible: list[dict[str, Any]] = []
    for task in tasks:
        if str(task.get("goal_id") or "") != goal_id:
            continue
        if _task_status(task) in CANCELLED_STATUSES:
            continue
        created_at = _parse_datetime(task.get("created_at"))
        if created_at is not None and created_at <= now:
            eligible.append(task)

    if not eligible:
        return 0.0

    completed = sum(
        1
        for task in eligible
        if (
            (completed_at := _parse_datetime(task.get("completed_at"))) is not None
            and completed_at <= now
        )
    )
    return completed / len(eligible)


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
        if parent is None:
            return depth + 1

        depth += 1
        current = parent

    return depth


def _child_task_count(*, task_id: str, tasks: list[dict[str, Any]]) -> int:
    return sum(
        1
        for task in tasks
        if str(task.get("parent_task_id") or "") == task_id
    )


def build_live_features_v2(
    *,
    task: dict[str, Any],
    user_tasks: list[dict[str, Any]],
    focus_sessions: list[dict[str, Any]],
    now: datetime,
) -> tuple[dict[str, float], datetime]:
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
    days_until_due = max(1, int(math.ceil(seconds_until_due / SECONDS_PER_DAY)))
    task_age_days = max(0, (now.date() - created_at.date()).days)

    duration_seconds = max(1.0, (due_at - created_at).total_seconds())
    task_duration_days = max(1, int(math.ceil(duration_seconds / SECONDS_PER_DAY)))
    elapsed_seconds = max(0.0, (now - created_at).total_seconds())
    elapsed_fraction = min(1.0, max(0.0, elapsed_seconds / duration_seconds))

    estimated_minutes = max(0, int(task.get("estimated_minutes") or 0))
    workload_minutes_per_day = estimated_minutes / max(days_until_due, 1)

    due_30d, overdue_30d = _recent_due_and_overdue(
        user_tasks,
        now=now,
        days=30,
    )
    overdue_rate_30d = overdue_30d / due_30d if due_30d else 0.0

    task_by_id = {
        str(item["id"]): item
        for item in user_tasks
        if item.get("id")
    }
    title = str(task.get("title") or "")
    description = str(task.get("description") or "")

    features = {
        "days_until_due": float(days_until_due),
        "task_age_days": float(task_age_days),
        "task_duration_days": float(task_duration_days),
        "elapsed_fraction": float(elapsed_fraction),
        "estimated_minutes": float(estimated_minutes),
        "workload_minutes_per_day": float(workload_minutes_per_day),
        "priority": float(_normalize_priority(task.get("priority"))),
        "title_length": float(len(title)),
        "description_length": float(len(description)),
        "has_description": float(int(bool(description.strip()))),
        "has_goal": float(int(bool(goal_id))),
        "is_subtask": float(int(bool(task.get("parent_task_id")))),
        "task_depth": float(_task_depth(task=task, task_by_id=task_by_id)),
        "child_task_count": float(_child_task_count(task_id=task_id, tasks=user_tasks)),
        "task_focus_minutes_last_7d": float(
            _count_focus_minutes(
                focus_sessions,
                now=now,
                days=7,
                task_id=task_id,
            )
        ),
        "task_focus_minutes_last_14d": float(
            _count_focus_minutes(
                focus_sessions,
                now=now,
                days=14,
                task_id=task_id,
            )
        ),
        "task_focus_sessions_last_14d": float(
            _count_focus_sessions(
                focus_sessions,
                now=now,
                days=14,
                task_id=task_id,
            )
        ),
        "focus_minutes_last_7d": float(
            _count_focus_minutes(focus_sessions, now=now, days=7)
        ),
        "focus_minutes_last_14d": float(
            _count_focus_minutes(focus_sessions, now=now, days=14)
        ),
        "completed_tasks_last_7d": float(
            _count_completed_tasks(user_tasks, now=now, days=7)
        ),
        "completed_tasks_last_14d": float(
            _count_completed_tasks(user_tasks, now=now, days=14)
        ),
        "due_tasks_last_30d": float(due_30d),
        "overdue_tasks_last_30d": float(overdue_30d),
        "overdue_rate_last_30d": float(overdue_rate_30d),
        "goal_completion_ratio": float(
            _goal_completion_ratio(user_tasks, goal_id=goal_id, now=now)
        ),
        "snapshot_weekday": float(now.weekday()),
        "is_weekend_snapshot": float(int(now.weekday() >= 5)),
    }

    missing = [name for name in FEATURE_COLUMNS_V2 if name not in features]
    if missing:
        raise RuntimeError(f"Serving feature contract is incomplete: {missing}")

    return features, due_at
