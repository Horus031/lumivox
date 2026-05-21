from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import sqrt
from statistics import mean
from zoneinfo import ZoneInfo

from app.clients.supabase_client import get_supabase_client


STANDARD_WEIGHTS = {
    "task_completion_rate": 0.30,
    "focus_quality_score": 0.25,
    "deadline_adherence_score": 0.25,
    "goal_momentum_score": 0.10,
    "consistency_score": 0.10,
}

PRIORITY_COMPLETION_WEIGHTS = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}

PRIORITY_DEADLINE_SEVERITY = {
    "low": 0.25,
    "medium": 0.50,
    "high": 0.75,
    "critical": 1.00,
}


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(value, maximum))


def safe_round(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def population_std(values: list[float]) -> float:
    if not values:
        return 0.0

    avg = mean(values)
    variance = sum((value - avg) ** 2 for value in values) / len(values)
    return sqrt(variance)


def get_user_period_window(user_id: str):
    supabase = get_supabase_client()

    profile_result = (
        supabase.table("profiles")
        .select("timezone")
        .eq("id", user_id)
        .single()
        .execute()
    )

    profile = profile_result.data or {}
    timezone_name = profile.get("timezone") or "UTC"

    try:
        user_tz = ZoneInfo(timezone_name)
    except Exception:
        user_tz = timezone.utc
        timezone_name = "UTC"

    now_local = datetime.now(user_tz)

    period_end_date = now_local.date()
    period_start_date = period_end_date - timedelta(days=6)

    period_start_local = datetime.combine(
        period_start_date,
        datetime.min.time(),
        tzinfo=user_tz,
    )

    period_end_exclusive_local = datetime.combine(
        period_end_date + timedelta(days=1),
        datetime.min.time(),
        tzinfo=user_tz,
    )

    period_start_utc = period_start_local.astimezone(timezone.utc)
    period_end_exclusive_utc = period_end_exclusive_local.astimezone(timezone.utc)

    return {
        "timezone_name": timezone_name,
        "period_start_date": period_start_date,
        "period_end_date": period_end_date,
        "period_start_utc": period_start_utc,
        "period_end_exclusive_utc": period_end_exclusive_utc,
    }


def calculate_tcr(tasks: list[dict]) -> tuple[float, dict]:
    if not tasks:
        return 0.5, {
            "eligible_tasks": 0,
            "reason": "No deadline-based tasks in the selected period.",
        }

    total_weight = 0.0
    completed_weight = 0.0

    for task in tasks:
        priority = task.get("priority", "medium")
        weight = PRIORITY_COMPLETION_WEIGHTS.get(priority, 2)

        total_weight += weight

        if task.get("status") == "completed":
            completed_weight += weight

    score = completed_weight / total_weight if total_weight > 0 else 0.5

    return clamp(score), {
        "eligible_tasks": len(tasks),
        "completed_weight": completed_weight,
        "total_weight": total_weight,
    }


def calculate_fqs(
    sessions: list[dict],
    distractions: list[dict],
) -> tuple[float, dict]:
    if not sessions:
        return 0.5, {
            "completed_sessions": 0,
            "reason": "No completed focus sessions in the selected period.",
        }

    total_planned_minutes = sum(
        int(session.get("planned_minutes") or 0)
        for session in sessions
    )

    total_actual_minutes = sum(
        int(session.get("actual_focus_minutes") or 0)
        for session in sessions
    )

    total_actual_seconds = total_actual_minutes * 60

    total_distraction_seconds = sum(
        int(event.get("duration_seconds") or 0)
        for event in distractions
    )

    if total_planned_minutes <= 0:
        focus_completion_ratio = 0.0
    else:
        focus_completion_ratio = clamp(
            total_actual_minutes / total_planned_minutes
        )

    if total_actual_seconds <= 0:
        distraction_rate = 0.0
    else:
        distraction_rate = clamp(
            total_distraction_seconds / total_actual_seconds
        )

    score = focus_completion_ratio * (1 - distraction_rate)

    return clamp(score), {
        "completed_sessions": len(sessions),
        "total_planned_minutes": total_planned_minutes,
        "total_actual_minutes": total_actual_minutes,
        "total_distraction_seconds": total_distraction_seconds,
        "focus_completion_ratio": safe_round(focus_completion_ratio),
        "distraction_rate": safe_round(distraction_rate),
    }


def calculate_das(
    tasks: list[dict],
    period_end_exclusive_utc: datetime,
) -> tuple[float, dict]:
    if not tasks:
        return 0.5, {
            "eligible_tasks": 0,
            "reason": "No deadline-based tasks in the selected period.",
        }

    penalties: list[float] = []

    for task in tasks:
        due_at_raw = task.get("due_at")
        if not due_at_raw:
            continue

        due_at = datetime.fromisoformat(due_at_raw.replace("Z", "+00:00"))
        status = task.get("status")
        completed_at_raw = task.get("completed_at")

        if status == "completed" and completed_at_raw:
            completed_at = datetime.fromisoformat(
                completed_at_raw.replace("Z", "+00:00")
            )

            if completed_at <= due_at:
                days_late = 0.0
            else:
                days_late = (completed_at - due_at).total_seconds() / 86400
        else:
            if due_at >= period_end_exclusive_utc:
                days_late = 0.0
            else:
                days_late = (
                    period_end_exclusive_utc - due_at
                ).total_seconds() / 86400

        overdue_days_normalized = clamp(days_late / 7)

        priority = task.get("priority", "medium")
        severity = PRIORITY_DEADLINE_SEVERITY.get(priority, 0.50)

        penalties.append(severity * overdue_days_normalized)

    if not penalties:
        return 0.5, {
            "eligible_tasks": 0,
            "reason": "No usable deadline data.",
        }

    average_penalty = sum(penalties) / len(penalties)
    score = 1 - average_penalty

    return clamp(score), {
        "eligible_tasks": len(penalties),
        "average_penalty": safe_round(average_penalty),
    }


def calculate_current_goal_progress(goals: list[dict]) -> tuple[float, int]:
    tracked_goals = [
        goal for goal in goals
        if goal.get("status") != "archived"
    ]

    if not tracked_goals:
        return 0.0, 0

    progress_values = [
        float(goal.get("progress_percent") or 0)
        for goal in tracked_goals
    ]

    return mean(progress_values), len(tracked_goals)


def calculate_gms(
    current_progress_percent: float,
    previous_progress_percent: float | None,
) -> tuple[float, dict]:
    if previous_progress_percent is None:
        return 0.5, {
            "reason": "No previous goal progress snapshot available.",
            "current_progress_percent": safe_round(current_progress_percent, 2),
        }

    epsilon = 1e-6

    numerator = current_progress_percent - previous_progress_percent
    denominator = 100 - previous_progress_percent + epsilon

    raw_score = numerator / denominator
    score = clamp(raw_score)

    return score, {
        "current_progress_percent": safe_round(current_progress_percent, 2),
        "previous_progress_percent": safe_round(previous_progress_percent, 2),
        "raw_goal_momentum": safe_round(raw_score),
    }


def calculate_cs(
    sessions: list[dict],
    period_start_date,
    period_end_date,
    timezone_name: str,
) -> tuple[float, dict]:
    try:
        user_tz = ZoneInfo(timezone_name)
    except Exception:
        user_tz = timezone.utc

    daily_focus = defaultdict(float)

    current_date = period_start_date
    while current_date <= period_end_date:
        daily_focus[current_date.isoformat()] = 0.0
        current_date += timedelta(days=1)

    for session in sessions:
        ended_at_raw = session.get("ended_at")
        if not ended_at_raw:
            continue

        ended_at_utc = datetime.fromisoformat(
            ended_at_raw.replace("Z", "+00:00")
        )
        ended_at_local = ended_at_utc.astimezone(user_tz)
        day_key = ended_at_local.date().isoformat()

        if day_key in daily_focus:
            daily_focus[day_key] += float(
                session.get("actual_focus_minutes") or 0
            )

    values = list(daily_focus.values())

    total_minutes = sum(values)
    if total_minutes <= 0:
        return 0.0, {
            "daily_focus_minutes": daily_focus,
            "reason": "No completed focus minutes in the selected period.",
        }

    avg = mean(values)
    std = population_std(values)

    if avg <= 0:
        score = 0.0
    else:
        score = 1 - (std / avg)

    return clamp(score), {
        "daily_focus_minutes": daily_focus,
        "mean_daily_focus_minutes": safe_round(avg),
        "std_daily_focus_minutes": safe_round(std),
    }


def weighted_pbi(components: dict[str, float], weights: dict[str, float]) -> float:
    score = sum(
        components[key] * weights[key]
        for key in STANDARD_WEIGHTS.keys()
    ) * 100

    return round(max(0, min(score, 100)), 2)

def classify_pbi_band(score: float) -> str:
    if score < 40:
        return "At-risk behavioural pattern"
    if score < 60:
        return "Unstable productivity"
    if score < 80:
        return "Healthy but improvable"
    return "Strong productive behaviour"


def classify_component_level(score: float) -> str:
    if score < 0.40:
        return "low"
    if score < 0.70:
        return "moderate"
    return "strong"


def build_rule_based_explanation_payload(
    *,
    standard_pbi: float,
    personalized_pbi: float,
    components: dict[str, float],
    metadata: dict,
) -> dict:
    pbi_band = classify_pbi_band(personalized_pbi)

    component_explanations: list[dict] = []
    actionable_insights: list[dict] = []

    # --------------------------------------------------------
    # TCR
    # --------------------------------------------------------
    tcr_score = components["task_completion_rate"]
    tcr_meta = metadata["tcr"]

    if tcr_meta.get("eligible_tasks", 0) == 0:
        tcr_message = (
            "There were no deadline-based tasks in this period, so the "
            "Task Completion Rate remains neutral."
        )
    elif tcr_score >= 0.70:
        tcr_message = (
            "Task completion is strong relative to the weighted set of "
            "deadline-based tasks."
        )
        actionable_insights.append({
            "type": "positive",
            "title": "Task execution is moving well",
            "body": (
                "Your weighted task completion rate is healthy. Maintaining "
                "this behaviour will support both Standard and Personalized PBI."
            ),
            "linked_component": "task_completion_rate",
        })
    else:
        tcr_message = (
            "Task completion is below the desired level for the selected period."
        )
        actionable_insights.append({
            "type": "warning",
            "title": "Task completion needs attention",
            "body": (
                "Several deadline-based tasks were not completed. Breaking large "
                "tasks into smaller steps may make progress easier to sustain."
            ),
            "linked_component": "task_completion_rate",
        })

    component_explanations.append({
        "key": "task_completion_rate",
        "title": "Task Completion Rate",
        "score": tcr_score,
        "level": classify_component_level(tcr_score),
        "message": tcr_message,
    })

    # --------------------------------------------------------
    # FQS
    # --------------------------------------------------------
    fqs_score = components["focus_quality_score"]
    fqs_meta = metadata["fqs"]
    distraction_rate = float(fqs_meta.get("distraction_rate", 0))

    if fqs_meta.get("completed_sessions", 0) == 0:
        fqs_message = (
            "No completed focus sessions were recorded, so Focus Quality remains neutral."
        )
    elif distraction_rate >= 0.25:
        fqs_message = (
            "Focus Quality was reduced by a relatively high distraction rate "
            "during completed sessions."
        )
        actionable_insights.append({
            "type": "warning",
            "title": "Distractions are affecting focus quality",
            "body": (
                "A notable share of active focus time was logged as distraction. "
                "Try shorter sessions or a lower-interruption study environment."
            ),
            "linked_component": "focus_quality_score",
        })
    elif fqs_score >= 0.70:
        fqs_message = (
            "Focus sessions were completed with good endurance and limited distraction."
        )
        actionable_insights.append({
            "type": "positive",
            "title": "Focus quality is a current strength",
            "body": (
                "Your planned and actual focus time are well aligned, and "
                "distraction pressure is currently low."
            ),
            "linked_component": "focus_quality_score",
        })
    else:
        fqs_message = (
            "Focus Quality is moderate and may improve with better planned-versus-actual "
            "session alignment."
        )

    component_explanations.append({
        "key": "focus_quality_score",
        "title": "Focus Quality Score",
        "score": fqs_score,
        "level": classify_component_level(fqs_score),
        "message": fqs_message,
    })

    # --------------------------------------------------------
    # DAS
    # --------------------------------------------------------
    das_score = components["deadline_adherence_score"]
    das_meta = metadata["das"]
    average_penalty = float(das_meta.get("average_penalty", 0))

    if das_meta.get("eligible_tasks", 0) == 0:
        das_message = (
            "There were no eligible deadline-based tasks in this period, so "
            "Deadline Adherence remains neutral."
        )
    elif average_penalty >= 0.25:
        das_message = (
            "Deadline Adherence was reduced by overdue or late-completed tasks."
        )
        actionable_insights.append({
            "type": "warning",
            "title": "Deadline risk is visible",
            "body": (
                "Late or overdue work is lowering your adherence score. Review "
                "the most urgent tasks and schedule targeted focus sessions."
            ),
            "linked_component": "deadline_adherence_score",
        })
    else:
        das_message = (
            "Deadline Adherence is healthy, with low overdue penalty in the current period."
        )
        actionable_insights.append({
            "type": "positive",
            "title": "Deadline discipline is holding up",
            "body": (
                "Your recent deadline penalty is low, indicating that scheduled work "
                "is mostly being handled on time."
            ),
            "linked_component": "deadline_adherence_score",
        })

    component_explanations.append({
        "key": "deadline_adherence_score",
        "title": "Deadline Adherence Score",
        "score": das_score,
        "level": classify_component_level(das_score),
        "message": das_message,
    })

    # --------------------------------------------------------
    # GMS
    # --------------------------------------------------------
    gms_score = components["goal_momentum_score"]
    gms_meta = metadata["gms"]

    if "previous_progress_percent" not in gms_meta:
        gms_message = (
            "No earlier goal progress snapshot exists yet, so Goal Momentum remains neutral."
        )
    elif gms_score >= 0.40:
        gms_message = (
            "Goal progress has improved compared with the earlier recorded period."
        )
        actionable_insights.append({
            "type": "positive",
            "title": "Goal momentum is building",
            "body": (
                "Your active goals are showing positive progress compared with the "
                "previous snapshot."
            ),
            "linked_component": "goal_momentum_score",
        })
    else:
        gms_message = (
            "Goal progress growth is currently limited compared with the prior snapshot."
        )
        actionable_insights.append({
            "type": "neutral",
            "title": "Goal progress has slowed",
            "body": (
                "Progress is still being tracked, but momentum is not strongly increasing. "
                "Review whether active goals need clearer next actions."
            ),
            "linked_component": "goal_momentum_score",
        })

    component_explanations.append({
        "key": "goal_momentum_score",
        "title": "Goal Momentum Score",
        "score": gms_score,
        "level": classify_component_level(gms_score),
        "message": gms_message,
    })

    # --------------------------------------------------------
    # CS
    # --------------------------------------------------------
    cs_score = components["consistency_score"]
    cs_meta = metadata["cs"]

    if "reason" in cs_meta:
        cs_message = (
            "No completed focus minutes were recorded across the period, so "
            "Consistency remains low."
        )
    elif cs_score >= 0.70:
        cs_message = (
            "Focus time is distributed relatively consistently across the measured days."
        )
        actionable_insights.append({
            "type": "positive",
            "title": "Your study rhythm is stable",
            "body": (
                "Daily focus time is fairly balanced, which supports sustainable "
                "productive behaviour."
            ),
            "linked_component": "consistency_score",
        })
    else:
        cs_message = (
            "Focus time varies noticeably between days, reducing the consistency score."
        )
        actionable_insights.append({
            "type": "warning",
            "title": "Your rhythm is uneven",
            "body": (
                "Some days are much more active than others. A lighter but more regular "
                "focus routine may improve consistency."
            ),
            "linked_component": "consistency_score",
        })

    component_explanations.append({
        "key": "consistency_score",
        "title": "Consistency Score",
        "score": cs_score,
        "level": classify_component_level(cs_score),
        "message": cs_message,
    })

    # --------------------------------------------------------
    # Overall summary
    # --------------------------------------------------------
    weakest_component = min(
        component_explanations,
        key=lambda item: item["score"],
    )

    strongest_component = max(
        component_explanations,
        key=lambda item: item["score"],
    )

    overall_summary = (
        f"Your current Personalized PBI is {personalized_pbi}, classified as "
        f"'{pbi_band}'. The strongest behavioural dimension is "
        f"{strongest_component['title']}, while the main improvement area is "
        f"{weakest_component['title']}."
    )

    return {
        "pbi_band": pbi_band,
        "overall_summary": overall_summary,
        "standard_pbi": standard_pbi,
        "personalized_pbi": personalized_pbi,
        "strongest_component": strongest_component["key"],
        "weakest_component": weakest_component["key"],
        "component_explanations": component_explanations,
        "actionable_insights": actionable_insights[:4],
        "explanation_version": "rule-based-v1",
    }


def generate_pbi_snapshot(user_id: str) -> dict:
    supabase = get_supabase_client()

    period = get_user_period_window(user_id)

    period_start_utc_iso = period["period_start_utc"].isoformat()
    period_end_exclusive_utc_iso = period["period_end_exclusive_utc"].isoformat()

    period_start_date = period["period_start_date"]
    period_end_date = period["period_end_date"]

    # --------------------------------------------------------
    # 1. Fetch deadline-relevant tasks
    # --------------------------------------------------------

    tasks_result = (
        supabase.table("tasks")
        .select("id, priority, status, due_at, completed_at")
        .eq("user_id", user_id)
        .gte("due_at", period_start_utc_iso)
        .lt("due_at", period_end_exclusive_utc_iso)
        .neq("status", "cancelled")
        .execute()
    )

    deadline_tasks = tasks_result.data or []

    # --------------------------------------------------------
    # 2. Fetch completed focus sessions
    # --------------------------------------------------------

    sessions_result = (
        supabase.table("focus_sessions")
        .select(
            "id, planned_minutes, actual_focus_minutes, ended_at, status"
        )
        .eq("user_id", user_id)
        .eq("status", "completed")
        .gte("ended_at", period_start_utc_iso)
        .lt("ended_at", period_end_exclusive_utc_iso)
        .execute()
    )

    completed_sessions = sessions_result.data or []
    session_ids = [session["id"] for session in completed_sessions]

    # --------------------------------------------------------
    # 3. Fetch distractions linked to completed sessions
    # --------------------------------------------------------

    if session_ids:
        distractions_result = (
            supabase.table("distraction_events")
            .select("id, session_id, duration_seconds")
            .eq("user_id", user_id)
            .in_("session_id", session_ids)
            .execute()
        )
        distractions = distractions_result.data or []
    else:
        distractions = []

    # --------------------------------------------------------
    # 4. Fetch goals and previous goal progress snapshot
    # --------------------------------------------------------

    goals_result = (
        supabase.table("goals")
        .select("id, status, progress_percent")
        .eq("user_id", user_id)
        .execute()
    )

    goals = goals_result.data or []
    current_goal_progress, tracked_goal_count = (
        calculate_current_goal_progress(goals)
    )

    previous_goal_snapshot_result = (
        supabase.table("goal_progress_snapshots")
        .select("average_progress_percent, period_end")
        .eq("user_id", user_id)
        .lt("period_end", period_start_date.isoformat())
        .order("period_end", desc=True)
        .limit(1)
        .execute()
    )

    previous_goal_snapshot = (
        previous_goal_snapshot_result.data[0]
        if previous_goal_snapshot_result.data
        else None
    )

    previous_goal_progress = (
        float(previous_goal_snapshot["average_progress_percent"])
        if previous_goal_snapshot
        else None
    )

    # --------------------------------------------------------
    # 5. Calculate all five components
    # --------------------------------------------------------

    tcr, tcr_meta = calculate_tcr(deadline_tasks)
    fqs, fqs_meta = calculate_fqs(completed_sessions, distractions)
    das, das_meta = calculate_das(
        deadline_tasks,
        period["period_end_exclusive_utc"],
    )
    gms, gms_meta = calculate_gms(
        current_goal_progress,
        previous_goal_progress,
    )
    cs, cs_meta = calculate_cs(
        completed_sessions,
        period_start_date,
        period_end_date,
        period["timezone_name"],
    )

    components = {
        "task_completion_rate": safe_round(tcr),
        "focus_quality_score": safe_round(fqs),
        "deadline_adherence_score": safe_round(das),
        "goal_momentum_score": safe_round(gms),
        "consistency_score": safe_round(cs),
    }

    # --------------------------------------------------------
    # 6. Fetch personalized weights
    # --------------------------------------------------------

    weights_result = (
        supabase.table("pbi_weight_profiles")
        .select(
            """
            task_completion_weight,
            focus_quality_weight,
            deadline_adherence_weight,
            goal_momentum_weight,
            consistency_weight
            """
        )
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    weight_data = weights_result.data

    personalized_weights = {
        "task_completion_rate": float(weight_data["task_completion_weight"]),
        "focus_quality_score": float(weight_data["focus_quality_weight"]),
        "deadline_adherence_score": float(
            weight_data["deadline_adherence_weight"]
        ),
        "goal_momentum_score": float(weight_data["goal_momentum_weight"]),
        "consistency_score": float(weight_data["consistency_weight"]),
    }

    standard_pbi = weighted_pbi(components, STANDARD_WEIGHTS)
    personalized_pbi = weighted_pbi(components, personalized_weights)
    
    metadata = {
        "timezone": period["timezone_name"],
        "tcr": tcr_meta,
        "fqs": fqs_meta,
        "das": das_meta,
        "gms": gms_meta,
        "cs": cs_meta,
        "calculation_version": "v1.0-rolling-7-day",
    }
    
    explanation_payload = build_rule_based_explanation_payload(
        standard_pbi=standard_pbi,
        personalized_pbi=personalized_pbi,
        components=components,
        metadata=metadata,
    )

    # --------------------------------------------------------
    # 7. Upsert goal progress snapshot
    # --------------------------------------------------------

    supabase.table("goal_progress_snapshots").upsert(
        {
            "user_id": user_id,
            "period_start": period_start_date.isoformat(),
            "period_end": period_end_date.isoformat(),
            "average_progress_percent": round(current_goal_progress, 2),
            "tracked_goal_count": tracked_goal_count,
        },
        on_conflict="user_id,period_start,period_end",
    ).execute()

    # --------------------------------------------------------
    # 8. Upsert PBI snapshot
    # --------------------------------------------------------

    supabase.table("pbi_snapshots").upsert(
        {
            "user_id": user_id,
            "period_start": period_start_date.isoformat(),
            "period_end": period_end_date.isoformat(),
            "standard_pbi": standard_pbi,
            "personalized_pbi": personalized_pbi,
            "task_completion_rate": components["task_completion_rate"],
            "focus_quality_score": components["focus_quality_score"],
            "deadline_adherence_score": components[
                "deadline_adherence_score"
            ],
            "goal_momentum_score": components["goal_momentum_score"],
            "consistency_score": components["consistency_score"],
            "calculation_version": "v1.0-rolling-7-day",
            "explanation_payload": explanation_payload,
        },
        on_conflict="user_id,period_start,period_end",
    ).execute()

    return {
        "user_id": user_id,
        "period_start": period_start_date,
        "period_end": period_end_date,
        "standard_pbi": standard_pbi,
        "personalized_pbi": personalized_pbi,
        "components": components,
        "metadata": metadata,
        "explanation_payload": explanation_payload,
    }