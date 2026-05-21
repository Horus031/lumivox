from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.clients.supabase_client import get_supabase_client
from app.schemas.native_task_risk import (
    GenerateNativeTaskRiskScanRequest,
    GenerateNativeTaskRiskScanResponse,
    NativeTaskRiskAssessmentResponse,
    NativeTaskRiskEvidenceItem,
)


RISK_WEIGHTS = {
    "deadline_pressure": 0.30,
    "priority_pressure": 0.15,
    "focus_neglect": 0.25,
    "deadline_reliability_risk": 0.20,
    "workload_pressure": 0.10,
}

PRIORITY_SCORES = {
    "low": 0.25,
    "medium": 0.50,
    "high": 0.75,
    "critical": 1.00,
}


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(value, maximum))


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None

    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def classify_risk_band(score: float) -> str:
    if score < 30:
        return "low"
    if score < 55:
        return "moderate"
    if score < 75:
        return "elevated"
    return "high"


def calculate_deadline_pressure_score(
    due_at: datetime,
    now_utc: datetime,
) -> tuple[float, dict]:
    delta_days = (due_at - now_utc).total_seconds() / 86400

    if delta_days < 0:
        score = 1.00
        label = "overdue"
    elif delta_days <= 1:
        score = 0.95
        label = "due_within_1_day"
    elif delta_days <= 3:
        score = 0.75
        label = "due_within_3_days"
    elif delta_days <= 7:
        score = 0.55
        label = "due_within_7_days"
    else:
        score = 0.30
        label = "due_within_14_days"

    return score, {
        "days_until_due": round(delta_days, 2),
        "deadline_state": label,
    }


def calculate_focus_neglect_score(
    *,
    actual_focus_minutes_last_window: float,
    estimated_minutes: int | None,
) -> tuple[float, dict]:
    if estimated_minutes is None or estimated_minutes <= 0:
        expected_focus_minutes = 60.0
        estimate_source = "fallback_60_minutes"
    else:
        expected_focus_minutes = estimated_minutes * 0.25
        expected_focus_minutes = max(30.0, min(expected_focus_minutes, 120.0))
        estimate_source = "estimated_minutes_based"

    focus_ratio = clamp(
        actual_focus_minutes_last_window / expected_focus_minutes
    )

    focus_neglect_score = 1 - focus_ratio

    return focus_neglect_score, {
        "actual_focus_minutes_last_window": round(
            actual_focus_minutes_last_window,
            2,
        ),
        "expected_focus_minutes": round(expected_focus_minutes, 2),
        "estimate_source": estimate_source,
        "focus_ratio": round(focus_ratio, 4),
    }


def calculate_deadline_reliability_risk_score(
    recent_due_tasks: list[dict],
    now_utc: datetime,
) -> tuple[float, dict]:
    if not recent_due_tasks:
        return 0.50, {
            "eligible_historical_tasks": 0,
            "late_or_overdue_tasks": 0,
            "reason": "insufficient_history",
        }

    late_or_overdue_count = 0

    for task in recent_due_tasks:
        due_at = parse_dt(task.get("due_at"))
        completed_at = parse_dt(task.get("completed_at"))
        status = task.get("status")

        if due_at is None:
            continue

        is_late_completed = (
            status == "completed"
            and completed_at is not None
            and completed_at > due_at
        )

        is_unresolved_overdue = (
            status != "completed"
            and due_at < now_utc
        )

        if is_late_completed or is_unresolved_overdue:
            late_or_overdue_count += 1

    score = late_or_overdue_count / len(recent_due_tasks)

    return clamp(score), {
        "eligible_historical_tasks": len(recent_due_tasks),
        "late_or_overdue_tasks": late_or_overdue_count,
        "late_or_overdue_ratio": round(score, 4),
    }


def calculate_workload_pressure_score(open_due_soon_count: int) -> tuple[float, dict]:
    if open_due_soon_count <= 1:
        score = 0.00
    elif open_due_soon_count == 2:
        score = 0.25
    elif open_due_soon_count == 3:
        score = 0.50
    elif open_due_soon_count == 4:
        score = 0.75
    else:
        score = 1.00

    return score, {
        "open_due_soon_count": open_due_soon_count,
    }


def build_evidence_payload(
    *,
    deadline_meta: dict,
    focus_meta: dict,
    reliability_meta: dict,
    workload_meta: dict,
    task_priority: str,
    risk_components: dict,
) -> list[dict]:
    evidence: list[dict] = []

    days_until_due = deadline_meta["days_until_due"]
    deadline_state = deadline_meta["deadline_state"]

    if deadline_state == "overdue":
        evidence.append(
            {
                "key": "deadline_pressure",
                "title": "Deadline already passed",
                "message": "This task is past its due time and should be reviewed immediately.",
                "severity": "important",
            }
        )
    elif days_until_due <= 3:
        evidence.append(
            {
                "key": "deadline_pressure",
                "title": "Deadline is approaching soon",
                "message": f"This task is due in approximately {max(days_until_due, 0):.1f} days.",
                "severity": "important",
            }
        )
    elif days_until_due <= 7:
        evidence.append(
            {
                "key": "deadline_pressure",
                "title": "Deadline is within one week",
                "message": "The due date is getting closer and already contributes to task risk.",
                "severity": "watch",
            }
        )

    if task_priority in {"high", "critical"}:
        evidence.append(
            {
                "key": "priority_pressure",
                "title": "High task priority",
                "message": f"This task is marked as {task_priority}, increasing its importance in the risk scan.",
                "severity": "watch",
            }
        )

    focus_score = risk_components["focus_neglect_score"]
    focus_minutes = focus_meta["actual_focus_minutes_last_window"]

    if focus_score >= 0.75:
        evidence.append(
            {
                "key": "focus_neglect",
                "title": "Limited recent focus activity",
                "message": f"Only {focus_minutes:.0f} focus minutes were recorded for this task in the recent focus window.",
                "severity": "important",
            }
        )
    elif focus_score >= 0.45:
        evidence.append(
            {
                "key": "focus_neglect",
                "title": "Focus progress may be insufficient",
                "message": "Some work has been recorded, but recent task-specific focus is still below the expected preparation level.",
                "severity": "watch",
            }
        )

    reliability_ratio = reliability_meta.get("late_or_overdue_ratio")

    if reliability_ratio is not None and reliability_ratio >= 0.40:
        evidence.append(
            {
                "key": "deadline_reliability",
                "title": "Recent deadline reliability is under pressure",
                "message": f"About {round(reliability_ratio * 100)}% of recent due tasks were late or unresolved after their deadline.",
                "severity": "watch",
            }
        )

    open_due_soon_count = workload_meta["open_due_soon_count"]

    if open_due_soon_count >= 3:
        evidence.append(
            {
                "key": "workload_pressure",
                "title": "Several deadlines are clustered together",
                "message": f"There are {open_due_soon_count} open tasks due within the next 7 days.",
                "severity": "watch",
            }
        )

    if not evidence:
        evidence.append(
            {
                "key": "balanced_state",
                "title": "No dominant pressure signal",
                "message": "The current task shows no single dominant risk factor in the native scan.",
                "severity": "neutral",
            }
        )

    return evidence


def _persist_assessment(
    *,
    user_id: UUID,
    task_id: str,
    risk_score: float,
    risk_band: str,
    component_scores: dict,
    component_payload: dict,
    evidence_payload: list[dict],
    request: GenerateNativeTaskRiskScanRequest,
) -> UUID:
    supabase = get_supabase_client()

    result = (
        supabase.table("native_task_risk_assessments")
        .insert(
            {
                "user_id": str(user_id),
                "task_id": task_id,
                "risk_score": risk_score,
                "risk_band": risk_band,
                "deadline_pressure_score": component_scores[
                    "deadline_pressure_score"
                ],
                "priority_pressure_score": component_scores[
                    "priority_pressure_score"
                ],
                "focus_neglect_score": component_scores[
                    "focus_neglect_score"
                ],
                "deadline_reliability_risk_score": component_scores[
                    "deadline_reliability_risk_score"
                ],
                "workload_pressure_score": component_scores[
                    "workload_pressure_score"
                ],
                "component_payload": component_payload,
                "evidence_payload": evidence_payload,
                "horizon_days": request.horizon_days,
                "focus_window_days": request.focus_window_days,
                "history_window_days": request.history_window_days,
                "calculation_version": "native-risk-v1",
            }
        )
        .execute()
    )

    return UUID(result.data[0]["id"])


def generate_native_task_risk_scan(
    payload: GenerateNativeTaskRiskScanRequest,
) -> GenerateNativeTaskRiskScanResponse:
    supabase = get_supabase_client()

    now_utc = datetime.now(timezone.utc)

    horizon_limit = now_utc + timedelta(days=payload.horizon_days)
    focus_window_start = now_utc - timedelta(days=payload.focus_window_days)
    history_window_start = now_utc - timedelta(days=payload.history_window_days)

    # --------------------------------------------------------
    # 1. Fetch candidate open tasks
    # --------------------------------------------------------

    tasks_result = (
        supabase.table("tasks")
        .select(
            """
            id,
            title,
            priority,
            status,
            due_at,
            estimated_minutes,
            created_at
            """
        )
        .eq("user_id", str(payload.user_id))
        .in_("status", ["todo", "in_progress", "overdue"])
        .execute()
    )

    open_tasks = tasks_result.data or []

    candidate_tasks = []

    for task in open_tasks:
        due_at = parse_dt(task.get("due_at"))

        if due_at is None:
            continue

        is_within_horizon = due_at <= horizon_limit
        is_overdue = due_at < now_utc

        if is_within_horizon or is_overdue:
            candidate_tasks.append(task)

    if payload.task_id:
        candidate_tasks = [
            task
            for task in candidate_tasks
            if task["id"] == str(payload.task_id)
        ]

    # --------------------------------------------------------
    # 2. Fetch recent completed focus sessions
    # --------------------------------------------------------

    candidate_task_ids = [task["id"] for task in candidate_tasks]

    if candidate_task_ids:
        focus_result = (
            supabase.table("focus_sessions")
            .select(
                """
                task_id,
                actual_focus_minutes,
                ended_at,
                status
                """
            )
            .eq("user_id", str(payload.user_id))
            .eq("status", "completed")
            .in_("task_id", candidate_task_ids)
            .gte("ended_at", focus_window_start.isoformat())
            .execute()
        )

        focus_sessions = focus_result.data or []
    else:
        focus_sessions = []

    focus_minutes_by_task: dict[str, float] = defaultdict(float)

    for session in focus_sessions:
        task_id = session.get("task_id")
        focus_minutes_by_task[task_id] += float(
            session.get("actual_focus_minutes") or 0
        )

    # --------------------------------------------------------
    # 3. Fetch deadline history for reliability score
    # --------------------------------------------------------

    historical_tasks_result = (
        supabase.table("tasks")
        .select(
            """
            id,
            status,
            due_at,
            completed_at
            """
        )
        .eq("user_id", str(payload.user_id))
        .gte("due_at", history_window_start.isoformat())
        .lt("due_at", now_utc.isoformat())
        .neq("status", "cancelled")
        .execute()
    )

    historical_due_tasks = historical_tasks_result.data or []

    deadline_reliability_score, reliability_meta = (
        calculate_deadline_reliability_risk_score(
            historical_due_tasks,
            now_utc,
        )
    )

    # --------------------------------------------------------
    # 4. Workload pressure — open tasks due within 7 days
    # --------------------------------------------------------

    due_soon_limit = now_utc + timedelta(days=7)

    open_due_soon_count = 0

    for task in open_tasks:
        due_at = parse_dt(task.get("due_at"))

        if due_at and now_utc <= due_at <= due_soon_limit:
            open_due_soon_count += 1

    workload_pressure_score, workload_meta = (
        calculate_workload_pressure_score(open_due_soon_count)
    )

    # --------------------------------------------------------
    # 5. Assess each candidate task
    # --------------------------------------------------------

    responses: list[NativeTaskRiskAssessmentResponse] = []

    for task in candidate_tasks:
        due_at = parse_dt(task["due_at"])

        if due_at is None:
            continue

        deadline_pressure_score, deadline_meta = (
            calculate_deadline_pressure_score(
                due_at,
                now_utc,
            )
        )

        priority_pressure_score = PRIORITY_SCORES.get(
            task["priority"],
            0.50,
        )

        task_focus_minutes = focus_minutes_by_task.get(
            task["id"],
            0.0,
        )

        focus_neglect_score, focus_meta = calculate_focus_neglect_score(
            actual_focus_minutes_last_window=task_focus_minutes,
            estimated_minutes=task.get("estimated_minutes"),
        )

        weighted_score = (
            RISK_WEIGHTS["deadline_pressure"] * deadline_pressure_score
            + RISK_WEIGHTS["priority_pressure"] * priority_pressure_score
            + RISK_WEIGHTS["focus_neglect"] * focus_neglect_score
            + RISK_WEIGHTS["deadline_reliability_risk"]
            * deadline_reliability_score
            + RISK_WEIGHTS["workload_pressure"]
            * workload_pressure_score
        )

        risk_score = round(weighted_score * 100, 2)
        risk_band = classify_risk_band(risk_score)

        component_scores = {
            "deadline_pressure_score": round(deadline_pressure_score, 4),
            "priority_pressure_score": round(priority_pressure_score, 4),
            "focus_neglect_score": round(focus_neglect_score, 4),
            "deadline_reliability_risk_score": round(
                deadline_reliability_score,
                4,
            ),
            "workload_pressure_score": round(
                workload_pressure_score,
                4,
            ),
        }

        component_payload = {
            "weights": RISK_WEIGHTS,
            "deadline": deadline_meta,
            "focus_neglect": focus_meta,
            "deadline_reliability": reliability_meta,
            "workload_pressure": workload_meta,
        }

        evidence_payload = build_evidence_payload(
            deadline_meta=deadline_meta,
            focus_meta=focus_meta,
            reliability_meta=reliability_meta,
            workload_meta=workload_meta,
            task_priority=task["priority"],
            risk_components=component_scores,
        )

        assessment_id = None

        if payload.persist_assessments:
            assessment_id = _persist_assessment(
                user_id=payload.user_id,
                task_id=task["id"],
                risk_score=risk_score,
                risk_band=risk_band,
                component_scores=component_scores,
                component_payload=component_payload,
                evidence_payload=evidence_payload,
                request=payload,
            )

        responses.append(
            NativeTaskRiskAssessmentResponse(
                assessment_id=assessment_id,
                task_id=UUID(task["id"]),
                task_title=task["title"],
                task_due_at=task["due_at"],
                task_priority=task["priority"],
                risk_score=risk_score,
                risk_band=risk_band,
                deadline_pressure_score=component_scores[
                    "deadline_pressure_score"
                ],
                priority_pressure_score=component_scores[
                    "priority_pressure_score"
                ],
                focus_neglect_score=component_scores[
                    "focus_neglect_score"
                ],
                deadline_reliability_risk_score=component_scores[
                    "deadline_reliability_risk_score"
                ],
                workload_pressure_score=component_scores[
                    "workload_pressure_score"
                ],
                evidence=[
                    NativeTaskRiskEvidenceItem(**item)
                    for item in evidence_payload
                ],
            )
        )

    responses.sort(
        key=lambda item: item.risk_score,
        reverse=True,
    )

    return GenerateNativeTaskRiskScanResponse(
        assessed_task_count=len(responses),
        assessments=responses,
    )