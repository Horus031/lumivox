from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from supabase import Client

from app.clients.supabase_client import get_supabase_client
from app.schemas.engagement_retention import (
    EngagementStatsPayload,
    RecalculateEngagementRequest,
    RecalculateEngagementResponse,
    RewardLedgerEntryPreview,
)


REWARD_VALUES = {
    "focus_session_completed": 5,
    "task_completed": 10,
    "daily_streak_continued": 8,
    "streak_milestone_3": 15,
    "streak_milestone_7": 30,
}

MIN_VALID_FOCUS_MINUTES = 10
MIN_VALID_TASK_ESTIMATED_MINUTES = 10
MIN_TASK_AGE_BEFORE_COMPLETION_MINUTES = 5

STREAK_RESTORE_COST = 30
STREAK_RESTORE_WINDOW_HOURS = 24


# ============================================================
# 1. Date helpers
# ============================================================

def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None

    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def as_utc_date(value: str | None) -> date | None:
    parsed = parse_dt(value)

    if not parsed:
        return None

    return to_utc(parsed).date()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# 2. Anti-abuse activity rules
# ============================================================

def is_valid_focus_session(session: dict) -> bool:
    if session.get("status") != "completed":
        return False

    if not session.get("ended_at"):
        return False

    actual_minutes = float(session.get("actual_focus_minutes") or 0)

    return actual_minutes >= MIN_VALID_FOCUS_MINUTES


def is_valid_completed_task(task: dict) -> bool:
    if task.get("status") != "completed":
        return False

    completed_at = parse_dt(task.get("completed_at"))
    created_at = parse_dt(task.get("created_at"))

    if completed_at is None:
        return False

    estimated_minutes = task.get("estimated_minutes")

    if estimated_minutes is not None:
        try:
            if float(estimated_minutes) >= MIN_VALID_TASK_ESTIMATED_MINUTES:
                return True
        except (TypeError, ValueError):
            pass

    if created_at is None:
        return False

    task_age_minutes = (
        to_utc(completed_at) - to_utc(created_at)
    ).total_seconds() / 60

    return task_age_minutes >= MIN_TASK_AGE_BEFORE_COMPLETION_MINUTES


def extract_valid_activity_dates(
    *,
    completed_focus_sessions: list[dict],
    completed_tasks: list[dict],
) -> list[date]:
    valid_dates: list[date] = []

    for session in completed_focus_sessions:
        if not is_valid_focus_session(session):
            continue

        study_date = as_utc_date(session.get("ended_at"))

        if study_date:
            valid_dates.append(study_date)

    for task in completed_tasks:
        if not is_valid_completed_task(task):
            continue

        completed_date = as_utc_date(task.get("completed_at"))

        if completed_date:
            valid_dates.append(completed_date)

    return sorted(set(valid_dates))


# ============================================================
# 3. Streak calculation
# ============================================================

def calculate_longest_streak(active_dates: list[date]) -> int:
    if not active_dates:
        return 0

    unique_dates = sorted(set(active_dates))

    longest_streak = 1
    running_streak = 1

    for index in range(1, len(unique_dates)):
        previous_day = unique_dates[index - 1]
        current_day = unique_dates[index]

        if current_day == previous_day + timedelta(days=1):
            running_streak += 1
        else:
            running_streak = 1

        longest_streak = max(longest_streak, running_streak)

    return longest_streak


def calculate_streak_ending_at_latest_activity(
    active_dates: list[date],
) -> int:
    if not active_dates:
        return 0

    unique_dates = sorted(set(active_dates))
    current_streak = 1

    for index in range(len(unique_dates) - 1, 0, -1):
        current_day = unique_dates[index]
        previous_day = unique_dates[index - 1]

        if current_day == previous_day + timedelta(days=1):
            current_streak += 1
        else:
            break

    return current_streak


def determine_streak_status(
    *,
    latest_valid_activity_date: date | None,
    previous_stats: dict | None,
    current_streak_days: int,
) -> dict:
    current_time = now_utc()
    today = current_time.date()
    yesterday = today - timedelta(days=1)

    if latest_valid_activity_date is None:
        return {
            "streak_status": "lost",
            "current_streak_days": 0,
            "streak_freeze_started_at": None,
            "streak_restore_deadline_at": None,
            "can_restore_streak": False,
        }

    if latest_valid_activity_date in {today, yesterday}:
        return {
            "streak_status": "active",
            "current_streak_days": current_streak_days,
            "streak_freeze_started_at": None,
            "streak_restore_deadline_at": None,
            "can_restore_streak": False,
        }

    missed_days = (today - latest_valid_activity_date).days

    if missed_days == 2:
        previous_status = (
            previous_stats.get("streak_status")
            if previous_stats
            else None
        )

        previous_freeze_started_at = (
            previous_stats.get("streak_freeze_started_at")
            if previous_stats
            else None
        )

        previous_restore_deadline_at = (
            previous_stats.get("streak_restore_deadline_at")
            if previous_stats
            else None
        )

        if previous_status == "frozen" and previous_restore_deadline_at:
            freeze_started_at = previous_freeze_started_at
            restore_deadline_at = previous_restore_deadline_at
        else:
            freeze_started_at = current_time.isoformat()
            restore_deadline_at = (
                current_time + timedelta(hours=STREAK_RESTORE_WINDOW_HOURS)
            ).isoformat()

        deadline_dt = parse_dt(restore_deadline_at)

        can_restore = bool(
            deadline_dt is not None
            and deadline_dt > current_time
        )

        return {
            "streak_status": "frozen" if can_restore else "lost",
            "current_streak_days": current_streak_days if can_restore else 0,
            "streak_freeze_started_at": freeze_started_at if can_restore else None,
            "streak_restore_deadline_at": restore_deadline_at if can_restore else None,
            "can_restore_streak": can_restore,
        }

    return {
        "streak_status": "lost",
        "current_streak_days": 0,
        "streak_freeze_started_at": None,
        "streak_restore_deadline_at": None,
        "can_restore_streak": False,
    }


# ============================================================
# 4. Reward generation
# ============================================================

def build_reward_candidates(
    *,
    completed_focus_sessions: list[dict],
    completed_tasks: list[dict],
    valid_activity_dates: list[date],
) -> list[dict]:
    rewards: list[dict] = []

    for session in completed_focus_sessions:
        if not is_valid_focus_session(session):
            continue

        session_id = session["id"]
        ended_at = session.get("ended_at")

        rewards.append(
            {
                "event_type": "focus_session_completed",
                "token_delta": REWARD_VALUES["focus_session_completed"],
                "source_key": f"focus_session_completed:{session_id}",
                "source_payload": {
                    "focus_session_id": session_id,
                    "actual_focus_minutes": session.get("actual_focus_minutes"),
                    "anti_abuse_minimum_minutes": MIN_VALID_FOCUS_MINUTES,
                },
                "reward_note": "Completed a valid focus session.",
                "occurred_at": ended_at,
            }
        )

    for task in completed_tasks:
        if not is_valid_completed_task(task):
            continue

        task_id = task["id"]
        completed_at = task.get("completed_at")

        rewards.append(
            {
                "event_type": "task_completed",
                "token_delta": REWARD_VALUES["task_completed"],
                "source_key": f"task_completed:{task_id}",
                "source_payload": {
                    "task_id": task_id,
                    "estimated_minutes": task.get("estimated_minutes"),
                    "anti_abuse_minimum_task_age_minutes": (
                        MIN_TASK_AGE_BEFORE_COMPLETION_MINUTES
                    ),
                    "anti_abuse_minimum_estimated_minutes": (
                        MIN_VALID_TASK_ESTIMATED_MINUTES
                    ),
                },
                "reward_note": "Completed a valid task.",
                "occurred_at": completed_at,
            }
        )

    unique_dates = sorted(set(valid_activity_dates))

    for index in range(1, len(unique_dates)):
        previous_day = unique_dates[index - 1]
        current_day = unique_dates[index]

        if current_day == previous_day + timedelta(days=1):
            rewards.append(
                {
                    "event_type": "daily_streak_continued",
                    "token_delta": REWARD_VALUES["daily_streak_continued"],
                    "source_key": (
                        f"daily_streak_continued:{current_day.isoformat()}"
                    ),
                    "source_payload": {
                        "study_date": current_day.isoformat(),
                    },
                    "reward_note": "Continued the study streak into a new day.",
                    "occurred_at": datetime.combine(
                        current_day,
                        datetime.min.time(),
                        tzinfo=timezone.utc,
                    ).isoformat(),
                }
            )

    running_streak = 1

    for index in range(1, len(unique_dates)):
        previous_day = unique_dates[index - 1]
        current_day = unique_dates[index]

        if current_day == previous_day + timedelta(days=1):
            running_streak += 1
        else:
            running_streak = 1

        if running_streak == 3:
            rewards.append(
                {
                    "event_type": "streak_milestone_3",
                    "token_delta": REWARD_VALUES["streak_milestone_3"],
                    "source_key": (
                        f"streak_milestone_3:{current_day.isoformat()}"
                    ),
                    "source_payload": {
                        "milestone_days": 3,
                        "study_date": current_day.isoformat(),
                    },
                    "reward_note": "Reached a 3-day study streak.",
                    "occurred_at": datetime.combine(
                        current_day,
                        datetime.min.time(),
                        tzinfo=timezone.utc,
                    ).isoformat(),
                }
            )

        if running_streak == 7:
            rewards.append(
                {
                    "event_type": "streak_milestone_7",
                    "token_delta": REWARD_VALUES["streak_milestone_7"],
                    "source_key": (
                        f"streak_milestone_7:{current_day.isoformat()}"
                    ),
                    "source_payload": {
                        "milestone_days": 7,
                        "study_date": current_day.isoformat(),
                    },
                    "reward_note": "Reached a 7-day study streak.",
                    "occurred_at": datetime.combine(
                        current_day,
                        datetime.min.time(),
                        tzinfo=timezone.utc,
                    ).isoformat(),
                }
            )

    return rewards


def insert_missing_rewards(
    *,
    user_id: UUID,
    reward_candidates: list[dict],
    supabase: Client | None = None,
) -> list[RewardLedgerEntryPreview]:
    supabase = supabase or get_supabase_client()

    created_rewards: list[RewardLedgerEntryPreview] = []
    
    rows = [
        {
            "user_id": str(user_id),
            "event_type": reward["event_type"],
            "token_delta": reward["token_delta"],
            "source_key": reward["source_key"],
            "source_payload": reward["source_payload"],
            "reward_note": reward["reward_note"],
            "occurred_at": reward["occurred_at"],
        }
        for reward in reward_candidates
    ]
    
    supabase.table("reward_ledger").upsert(
        rows,
        on_conflict="user_id,source_key",
        ignore_duplicates=True,
    ).execute()
    
    
    return created_rewards


# ============================================================
# 5. Streak event log
# ============================================================

def insert_streak_event_if_missing(
    *,
    user_id: UUID,
    event_type: str,
    previous_status: str | None,
    next_status: str | None,
    event_date: date,
    source_key: str,
    metadata: dict,
    token_delta: int = 0,
    supabase: Client | None = None,
) -> None:
    supabase = supabase or get_supabase_client()

    (
        supabase.table("user_streak_events")
        .upsert(
            {
                "user_id": str(user_id),
                "event_type": event_type,
                "previous_status": previous_status,
                "next_status": next_status,
                "event_date": event_date.isoformat(),
                "token_delta": token_delta,
                "source_key": source_key,
                "metadata": metadata,
                "occurred_at": now_utc().isoformat(),
            },
            on_conflict="user_id,source_key",
            ignore_duplicates=True,
        )
        .execute()
    )


def persist_streak_transition_event(
    *,
    user_id: UUID,
    previous_stats: dict | None,
    next_stats: EngagementStatsPayload,
    supabase: Client | None = None,
) -> None:
    supabase = supabase or get_supabase_client()
    previous_status = (
        previous_stats.get("streak_status")
        if previous_stats
        else None
    )

    next_status = next_stats.streak_status

    latest_activity = next_stats.last_valid_activity_date
    today = now_utc().date()

    if latest_activity:
        insert_streak_event_if_missing(
            user_id=user_id,
            event_type="activity_detected",
            previous_status=previous_status,
            next_status=next_status,
            event_date=date.fromisoformat(latest_activity),
            source_key=f"activity_detected:{latest_activity}",
            metadata={
                "last_valid_activity_date": latest_activity,
                "current_streak_days": next_stats.current_streak_days,
            },
            supabase=supabase,
        )

    if previous_status == next_status:
        return

    if next_status == "active":
        event_type = (
            "streak_started"
            if next_stats.current_streak_days <= 1
            else "streak_continued"
        )
    elif next_status == "frozen":
        event_type = "streak_frozen"
    else:
        event_type = "streak_lost"

    insert_streak_event_if_missing(
        user_id=user_id,
        event_type=event_type,
        previous_status=previous_status,
        next_status=next_status,
        event_date=today,
        source_key=f"{event_type}:{today.isoformat()}",
        metadata={
            "current_streak_days": next_stats.current_streak_days,
            "restore_deadline_at": next_stats.streak_restore_deadline_at,
        },
        supabase=supabase,
    )


# ============================================================
# 6. Token aggregation
# ============================================================

def aggregate_reward_stats(
    user_id: UUID,
    supabase: Client | None = None,
) -> tuple[int, int, int, int]:
    supabase = supabase or get_supabase_client()

    result = supabase.rpc(
        "get_engagement_reward_aggregates",
        {"p_user_id": str(user_id)},
    ).execute()

    rows = result.data or []
    row = rows[0] if rows else {}

    return (
        int(row.get("token_balance") or 0),
        int(row.get("total_tokens_earned") or 0),
        int(row.get("total_tokens_spent") or 0),
        int(row.get("tokens_earned_last_7d") or 0),
    )


# ============================================================
# 7. Database persistence
# ============================================================

def get_previous_engagement_stats(
    user_id: UUID,
    supabase: Client | None = None,
) -> dict | None:
    supabase = supabase or get_supabase_client()

    result = (
        supabase.table("user_engagement_stats")
        .select("*")
        .eq("user_id", str(user_id))
        .maybe_single()
        .execute()
    )

    if result is None:
        return None

    return result.data


def persist_engagement_stats(
    *,
    user_id: UUID,
    stats: EngagementStatsPayload,
    supabase: Client | None = None,
) -> None:
    supabase = supabase or get_supabase_client()

    (
        supabase.table("user_engagement_stats")
        .upsert(
            {
                "user_id": str(user_id),
                "current_streak_days": stats.current_streak_days,
                "longest_streak_days": stats.longest_streak_days,
                "latest_active_study_date": stats.latest_active_study_date,
                "last_valid_activity_date": stats.last_valid_activity_date,
                "streak_status": stats.streak_status,
                "streak_freeze_started_at": stats.streak_freeze_started_at,
                "streak_restore_deadline_at": stats.streak_restore_deadline_at,
                "last_streak_evaluation_at": now_utc().isoformat(),
                "token_balance": stats.token_balance,
                "total_tokens_earned": stats.total_tokens_earned,
                "total_tokens_spent": stats.total_tokens_spent,
                "tokens_earned_last_7d": stats.tokens_earned_last_7d,
                "completed_focus_sessions_total": stats.completed_focus_sessions_total,
                "valid_focus_sessions_total": stats.valid_focus_sessions_total,
                "completed_tasks_total": stats.completed_tasks_total,
                "valid_completed_tasks_total": stats.valid_completed_tasks_total,
                "calculation_version": "engagement-v3-reconcile",
            },
            on_conflict="user_id",
        )
        .execute()
    )


# ============================================================
# 8. Main public service
# ============================================================

def recalculate_engagement(
    payload: RecalculateEngagementRequest,
) -> RecalculateEngagementResponse:
    supabase = get_supabase_client()

    previous_stats = get_previous_engagement_stats(
        payload.user_id,
        supabase=supabase,
    )

    focus_result = (
        supabase.table("focus_sessions")
        .select(
            """
            id,
            status,
            ended_at,
            actual_focus_minutes
            """
        )
        .eq("user_id", str(payload.user_id))
        .eq("status", "completed")
        .execute()
    )

    completed_focus_sessions = focus_result.data or []

    task_result = (
        supabase.table("tasks")
        .select(
            """
            id,
            status,
            created_at,
            completed_at,
            estimated_minutes
            """
        )
        .eq("user_id", str(payload.user_id))
        .eq("status", "completed")
        .execute()
    )

    completed_tasks = [
        task
        for task in (task_result.data or [])
        if task.get("completed_at") is not None
    ]

    valid_focus_sessions = [
        session
        for session in completed_focus_sessions
        if is_valid_focus_session(session)
    ]

    valid_completed_tasks = [
        task
        for task in completed_tasks
        if is_valid_completed_task(task)
    ]

    valid_activity_dates = extract_valid_activity_dates(
        completed_focus_sessions=completed_focus_sessions,
        completed_tasks=completed_tasks,
    )

    longest_streak = calculate_longest_streak(valid_activity_dates)
    raw_current_streak = calculate_streak_ending_at_latest_activity(
        valid_activity_dates
    )

    latest_valid_activity_date = (
        max(valid_activity_dates)
        if valid_activity_dates
        else None
    )

    status_payload = determine_streak_status(
        latest_valid_activity_date=latest_valid_activity_date,
        previous_stats=previous_stats,
        current_streak_days=raw_current_streak,
    )

    reward_candidates = build_reward_candidates(
        completed_focus_sessions=completed_focus_sessions,
        completed_tasks=completed_tasks,
        valid_activity_dates=valid_activity_dates,
    )

    newly_created_rewards: list[RewardLedgerEntryPreview] = []

    if payload.persist_results:
        newly_created_rewards = insert_missing_rewards(
            user_id=payload.user_id,
            reward_candidates=reward_candidates,
            supabase=supabase,
        )

    (
        token_balance,
        total_tokens_earned,
        total_tokens_spent,
        tokens_last_7d,
    ) = aggregate_reward_stats(
        payload.user_id,
        supabase=supabase,
    )

    stats = EngagementStatsPayload(
        current_streak_days=status_payload["current_streak_days"],
        longest_streak_days=longest_streak,
        latest_active_study_date=(
            latest_valid_activity_date.isoformat()
            if latest_valid_activity_date
            else None
        ),
        last_valid_activity_date=(
            latest_valid_activity_date.isoformat()
            if latest_valid_activity_date
            else None
        ),
        streak_status=status_payload["streak_status"],
        streak_freeze_started_at=status_payload["streak_freeze_started_at"],
        streak_restore_deadline_at=status_payload[
            "streak_restore_deadline_at"
        ],
        can_restore_streak=status_payload["can_restore_streak"],
        restore_cost_tokens=STREAK_RESTORE_COST,
        token_balance=token_balance,
        total_tokens_earned=total_tokens_earned,
        total_tokens_spent=total_tokens_spent,
        tokens_earned_last_7d=tokens_last_7d,
        completed_focus_sessions_total=len(completed_focus_sessions),
        valid_focus_sessions_total=len(valid_focus_sessions),
        completed_tasks_total=len(completed_tasks),
        valid_completed_tasks_total=len(valid_completed_tasks),
    )

    if payload.persist_results:
        persist_engagement_stats(
            user_id=payload.user_id,
            stats=stats,
            supabase=supabase,
        )

        persist_streak_transition_event(
            user_id=payload.user_id,
            previous_stats=previous_stats,
            next_stats=stats,
            supabase=supabase,
        )

    return RecalculateEngagementResponse(
        stats=stats,
        newly_created_rewards=newly_created_rewards,
    )