from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

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


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None

    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def as_utc_date(value: str | None) -> date | None:
    parsed = parse_dt(value)

    if not parsed:
        return None

    return parsed.astimezone(timezone.utc).date()


def calculate_streaks(active_dates: list[date]) -> tuple[int, int, date | None]:
    if not active_dates:
        return 0, 0, None

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

    latest_active_date = unique_dates[-1]
    today_utc = datetime.now(timezone.utc).date()
    yesterday_utc = today_utc - timedelta(days=1)

    if latest_active_date not in {today_utc, yesterday_utc}:
        current_streak = 0
    else:
        current_streak = 1

        for index in range(len(unique_dates) - 1, 0, -1):
            current_day = unique_dates[index]
            previous_day = unique_dates[index - 1]

            if current_day == previous_day + timedelta(days=1):
                current_streak += 1
            else:
                break

    return current_streak, longest_streak, latest_active_date


def build_reward_candidates(
    *,
    completed_focus_sessions: list[dict],
    completed_tasks: list[dict],
    active_dates: list[date],
) -> list[dict]:
    rewards: list[dict] = []

    # --------------------------------------------------------
    # 1. Reward every completed focus session
    # --------------------------------------------------------

    for session in completed_focus_sessions:
        session_id = session["id"]
        ended_at = session.get("ended_at")

        rewards.append(
            {
                "event_type": "focus_session_completed",
                "token_delta": REWARD_VALUES["focus_session_completed"],
                "source_key": f"focus_session_completed:{session_id}",
                "source_payload": {
                    "focus_session_id": session_id,
                },
                "reward_note": "Completed a focus session.",
                "occurred_at": ended_at,
            }
        )

    # --------------------------------------------------------
    # 2. Reward every completed task
    # --------------------------------------------------------

    for task in completed_tasks:
        task_id = task["id"]
        completed_at = task.get("completed_at")

        rewards.append(
            {
                "event_type": "task_completed",
                "token_delta": REWARD_VALUES["task_completed"],
                "source_key": f"task_completed:{task_id}",
                "source_payload": {
                    "task_id": task_id,
                },
                "reward_note": "Completed a task.",
                "occurred_at": completed_at,
            }
        )

    # --------------------------------------------------------
    # 3. Reward daily streak continuation
    #    For every active study date after the first one,
    #    if previous date is consecutive.
    # --------------------------------------------------------

    unique_dates = sorted(set(active_dates))

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

    # --------------------------------------------------------
    # 4. Reward streak milestones
    # --------------------------------------------------------

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
) -> list[RewardLedgerEntryPreview]:
    supabase = get_supabase_client()

    created_rewards: list[RewardLedgerEntryPreview] = []

    for reward in reward_candidates:
        result = (
            supabase.table("reward_ledger")
            .upsert(
                {
                    "user_id": str(user_id),
                    "event_type": reward["event_type"],
                    "token_delta": reward["token_delta"],
                    "source_key": reward["source_key"],
                    "source_payload": reward["source_payload"],
                    "reward_note": reward["reward_note"],
                    "occurred_at": reward["occurred_at"],
                },
                on_conflict="user_id,source_key",
                ignore_duplicates=True,
            )
            .execute()
        )

        if result.data:
            created_rewards.append(
                RewardLedgerEntryPreview(
                    event_type=reward["event_type"],
                    token_delta=reward["token_delta"],
                    source_key=reward["source_key"],
                    reward_note=reward["reward_note"],
                )
            )

    return created_rewards


def aggregate_reward_stats(user_id: UUID) -> tuple[int, int, int]:
    supabase = get_supabase_client()

    reward_result = (
        supabase.table("reward_ledger")
        .select(
            """
            token_delta,
            occurred_at
            """
        )
        .eq("user_id", str(user_id))
        .execute()
    )

    reward_rows = reward_result.data or []

    total_tokens = sum(int(row["token_delta"]) for row in reward_rows)
    token_balance = total_tokens

    last_7d_start = datetime.now(timezone.utc) - timedelta(days=7)

    tokens_last_7d = 0

    for row in reward_rows:
        occurred_at = parse_dt(row.get("occurred_at"))

        if occurred_at and occurred_at >= last_7d_start:
            tokens_last_7d += int(row["token_delta"])

    return token_balance, total_tokens, tokens_last_7d


def persist_engagement_stats(
    *,
    user_id: UUID,
    stats: EngagementStatsPayload,
) -> None:
    supabase = get_supabase_client()

    (
        supabase.table("user_engagement_stats")
        .upsert(
            {
                "user_id": str(user_id),
                "current_streak_days": stats.current_streak_days,
                "longest_streak_days": stats.longest_streak_days,
                "latest_active_study_date": stats.latest_active_study_date,
                "token_balance": stats.token_balance,
                "total_tokens_earned": stats.total_tokens_earned,
                "tokens_earned_last_7d": stats.tokens_earned_last_7d,
                "completed_focus_sessions_total": stats.completed_focus_sessions_total,
                "completed_tasks_total": stats.completed_tasks_total,
                "calculation_version": "engagement-v1",
            },
            on_conflict="user_id",
        )
        .execute()
    )


def recalculate_engagement(
    payload: RecalculateEngagementRequest,
) -> RecalculateEngagementResponse:
    supabase = get_supabase_client()

    # --------------------------------------------------------
    # 1. Fetch completed focus sessions
    # --------------------------------------------------------

    focus_result = (
        supabase.table("focus_sessions")
        .select(
            """
            id,
            status,
            ended_at
            """
        )
        .eq("user_id", str(payload.user_id))
        .eq("status", "completed")
        .execute()
    )

    completed_focus_sessions = focus_result.data or []

    # --------------------------------------------------------
    # 2. Fetch completed tasks
    # --------------------------------------------------------

    task_result = (
        supabase.table("tasks")
        .select(
            """
            id,
            status,
            completed_at
            """
        )
        .eq("user_id", str(payload.user_id))
        .eq("status", "completed")
        .not_.is_("completed_at", "null")
        .execute()
    )

    completed_tasks = task_result.data or []

    # --------------------------------------------------------
    # 3. Active study dates from completed focus sessions
    # --------------------------------------------------------

    active_dates: list[date] = []

    for session in completed_focus_sessions:
        study_date = as_utc_date(session.get("ended_at"))

        if study_date:
            active_dates.append(study_date)

    # --------------------------------------------------------
    # 4. Calculate streaks
    # --------------------------------------------------------

    current_streak, longest_streak, latest_active_date = calculate_streaks(
        active_dates
    )

    # --------------------------------------------------------
    # 5. Build and insert missing rewards
    # --------------------------------------------------------

    reward_candidates = build_reward_candidates(
        completed_focus_sessions=completed_focus_sessions,
        completed_tasks=completed_tasks,
        active_dates=active_dates,
    )

    newly_created_rewards: list[RewardLedgerEntryPreview] = []

    if payload.persist_results:
        newly_created_rewards = insert_missing_rewards(
            user_id=payload.user_id,
            reward_candidates=reward_candidates,
        )

    # --------------------------------------------------------
    # 6. Aggregate reward totals from ledger
    # --------------------------------------------------------

    token_balance, total_tokens, tokens_last_7d = aggregate_reward_stats(
        payload.user_id
    )

    # --------------------------------------------------------
    # 7. Build stats payload
    # --------------------------------------------------------

    stats = EngagementStatsPayload(
        current_streak_days=current_streak,
        longest_streak_days=longest_streak,
        latest_active_study_date=(
            latest_active_date.isoformat()
            if latest_active_date
            else None
        ),
        token_balance=token_balance,
        total_tokens_earned=total_tokens,
        tokens_earned_last_7d=tokens_last_7d,
        completed_focus_sessions_total=len(completed_focus_sessions),
        completed_tasks_total=len(completed_tasks),
    )

    # --------------------------------------------------------
    # 8. Persist engagement summary
    # --------------------------------------------------------

    if payload.persist_results:
        persist_engagement_stats(
            user_id=payload.user_id,
            stats=stats,
        )

    return RecalculateEngagementResponse(
        stats=stats,
        newly_created_rewards=newly_created_rewards,
    )