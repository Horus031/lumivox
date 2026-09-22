from __future__ import annotations

from datetime import datetime, time, timezone

from app.clients.supabase_client import get_supabase_client
from app.schemas.engagement_retention import (
    EngagementStatsPayload,
    ProcessEngagementActivityRequest,
    RecalculateEngagementRequest,
    RecalculateEngagementResponse,
    RewardLedgerEntryPreview,
)
from app.services.engagement_retention_service import (
    MIN_VALID_FOCUS_MINUTES,
    MIN_TASK_AGE_BEFORE_COMPLETION_MINUTES,
    MIN_VALID_TASK_ESTIMATED_MINUTES,
    REWARD_VALUES,
    STREAK_RESTORE_COST,
    as_utc_date,
    determine_streak_status,
    get_previous_engagement_stats,
    is_valid_completed_task,
    is_valid_focus_session,
    persist_engagement_stats,
    persist_streak_transition_event,
    recalculate_engagement,
)


def _source_reward(activity_type: str, row: dict) -> dict:
    if activity_type == "focus_session":
        return {
            "event_type": "focus_session_completed",
            "token_delta": REWARD_VALUES["focus_session_completed"],
            "source_key": f"focus_session_completed:{row['id']}",
            "source_payload": {
                "focus_session_id": row["id"],
                "actual_focus_minutes": row.get("actual_focus_minutes"),
                "anti_abuse_minimum_minutes": MIN_VALID_FOCUS_MINUTES,
            },
            "reward_note": "Completed a valid focus session.",
            "occurred_at": row.get("ended_at"),
        }

    return {
        "event_type": "task_completed",
        "token_delta": REWARD_VALUES["task_completed"],
        "source_key": f"task_completed:{row['id']}",
        "source_payload": {
            "task_id": row["id"],
            "estimated_minutes": row.get("estimated_minutes"),
            "anti_abuse_minimum_task_age_minutes": (
                MIN_TASK_AGE_BEFORE_COMPLETION_MINUTES
            ),
            "anti_abuse_minimum_estimated_minutes": (
                MIN_VALID_TASK_ESTIMATED_MINUTES
            ),
        },
        "reward_note": "Completed a valid task.",
        "occurred_at": row.get("completed_at"),
    }


def _streak_reward(event_type: str, activity_date, streak_days: int) -> dict:
    if event_type == "daily_streak_continued":
        note = "Continued the study streak into a new day."
        token_delta = REWARD_VALUES[event_type]
        payload = {"study_date": activity_date.isoformat()}
    else:
        milestone = 3 if event_type == "streak_milestone_3" else 7
        note = f"Reached a {milestone}-day study streak."
        token_delta = REWARD_VALUES[event_type]
        payload = {
            "milestone_days": milestone,
            "study_date": activity_date.isoformat(),
        }

    return {
        "event_type": event_type,
        "token_delta": token_delta,
        "source_key": f"{event_type}:{activity_date.isoformat()}",
        "source_payload": payload,
        "reward_note": note,
        "occurred_at": datetime.combine(
            activity_date,
            time.min,
            tzinfo=timezone.utc,
        ).isoformat(),
    }


def _insert_only_missing_rewards(
    *,
    user_id,
    rewards: list[dict],
) -> tuple[list[RewardLedgerEntryPreview], int]:
    if not rewards:
        return [], 0

    supabase = get_supabase_client()
    source_keys = [reward["source_key"] for reward in rewards]

    existing_result = (
        supabase.table("reward_ledger")
        .select("source_key")
        .eq("user_id", str(user_id))
        .in_("source_key", source_keys)
        .execute()
    )

    existing_keys = {
        row["source_key"]
        for row in (existing_result.data or [])
        if row.get("source_key")
    }
    missing = [
        reward for reward in rewards if reward["source_key"] not in existing_keys
    ]

    if not missing:
        return [], 0

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
        for reward in missing
    ]

    (
        supabase.table("reward_ledger")
        .upsert(
            rows,
            on_conflict="user_id,source_key",
            ignore_duplicates=True,
        )
        .execute()
    )

    previews = [
        RewardLedgerEntryPreview(
            event_type=reward["event_type"],
            token_delta=reward["token_delta"],
            source_key=reward["source_key"],
            reward_note=reward["reward_note"],
        )
        for reward in missing
    ]

    return previews, sum(int(reward["token_delta"]) for reward in missing)


def _fetch_activity(payload: ProcessEngagementActivityRequest) -> dict | None:
    supabase = get_supabase_client()

    if payload.activity_type == "focus_session":
        result = (
            supabase.table("focus_sessions")
            .select("id,status,ended_at,actual_focus_minutes")
            .eq("id", str(payload.activity_id))
            .eq("user_id", str(payload.user_id))
            .maybe_single()
            .execute()
        )
        row = result.data if result else None

        if not row or not is_valid_focus_session(row):
            return None

        return row

    result = (
        supabase.table("tasks")
        .select("id,status,created_at,completed_at,estimated_minutes")
        .eq("id", str(payload.activity_id))
        .eq("user_id", str(payload.user_id))
        .maybe_single()
        .execute()
    )
    row = result.data if result else None

    if not row or not is_valid_completed_task(row):
        return None

    return row


def process_engagement_activity(
    payload: ProcessEngagementActivityRequest,
) -> RecalculateEngagementResponse:
    previous = get_previous_engagement_stats(payload.user_id)

    # New users need one canonical baseline calculation. After that the common
    # completion path is incremental and constant with respect to history size.
    if not previous:
        return recalculate_engagement(
            RecalculateEngagementRequest(
                user_id=payload.user_id,
                persist_results=True,
            )
        )

    row = _fetch_activity(payload)

    if not row:
        # Invalidated/reverted activities are uncommon and easier to reconcile
        # with the canonical calculator than with compensating ledger writes.
        return recalculate_engagement(
            RecalculateEngagementRequest(
                user_id=payload.user_id,
                persist_results=True,
            )
        )

    activity_timestamp = (
        row.get("ended_at")
        if payload.activity_type == "focus_session"
        else row.get("completed_at")
    )
    activity_date = as_utc_date(activity_timestamp)

    if activity_date is None:
        return recalculate_engagement(
            RecalculateEngagementRequest(
                user_id=payload.user_id,
                persist_results=True,
            )
        )

    previous_date_text = previous.get("last_valid_activity_date")
    previous_date = (
        datetime.fromisoformat(previous_date_text).date()
        if previous_date_text
        else None
    )

    # Out-of-order edits can change historical streak shape. Keep the fast path
    # simple and fall back to the canonical reconciliation in that rare case.
    if previous_date and activity_date < previous_date:
        return recalculate_engagement(
            RecalculateEngagementRequest(
                user_id=payload.user_id,
                persist_results=True,
            )
        )

    previous_streak = int(previous.get("current_streak_days") or 0)

    if previous_date is None:
        current_streak = 1
        continued = False
    elif activity_date == previous_date:
        current_streak = max(previous_streak, 1)
        continued = False
    elif (activity_date - previous_date).days == 1:
        current_streak = max(previous_streak, 0) + 1
        continued = True
    else:
        current_streak = 1
        continued = False

    longest_streak = max(
        int(previous.get("longest_streak_days") or 0),
        current_streak,
    )

    rewards = [_source_reward(payload.activity_type, row)]

    if continued:
        rewards.append(
            _streak_reward(
                "daily_streak_continued",
                activity_date,
                current_streak,
            )
        )

        if current_streak == 3:
            rewards.append(
                _streak_reward(
                    "streak_milestone_3",
                    activity_date,
                    current_streak,
                )
            )
        elif current_streak == 7:
            rewards.append(
                _streak_reward(
                    "streak_milestone_7",
                    activity_date,
                    current_streak,
                )
            )

    created_rewards, token_delta = _insert_only_missing_rewards(
        user_id=payload.user_id,
        rewards=rewards,
    )

    source_key = rewards[0]["source_key"]
    source_was_new = any(
        reward.source_key == source_key for reward in created_rewards
    )

    latest_date = (
        activity_date
        if previous_date is None or activity_date >= previous_date
        else previous_date
    )

    status_payload = determine_streak_status(
        latest_valid_activity_date=latest_date,
        previous_stats=previous,
        current_streak_days=current_streak,
    )

    earned_delta = sum(
        reward.token_delta
        for reward in created_rewards
        if reward.token_delta > 0
    )

    completed_focus_sessions_total = int(
        previous.get("completed_focus_sessions_total") or 0
    )
    valid_focus_sessions_total = int(
        previous.get("valid_focus_sessions_total") or 0
    )
    completed_tasks_total = int(previous.get("completed_tasks_total") or 0)
    valid_completed_tasks_total = int(
        previous.get("valid_completed_tasks_total") or 0
    )

    if source_was_new and payload.activity_type == "focus_session":
        completed_focus_sessions_total += 1
        valid_focus_sessions_total += 1
    elif source_was_new and payload.activity_type == "task":
        completed_tasks_total += 1
        valid_completed_tasks_total += 1

    stats = EngagementStatsPayload(
        current_streak_days=status_payload["current_streak_days"],
        longest_streak_days=longest_streak,
        latest_active_study_date=latest_date.isoformat(),
        last_valid_activity_date=latest_date.isoformat(),
        streak_status=status_payload["streak_status"],
        streak_freeze_started_at=status_payload["streak_freeze_started_at"],
        streak_restore_deadline_at=status_payload["streak_restore_deadline_at"],
        can_restore_streak=status_payload["can_restore_streak"],
        restore_cost_tokens=STREAK_RESTORE_COST,
        token_balance=int(previous.get("token_balance") or 0) + token_delta,
        total_tokens_earned=(
            int(previous.get("total_tokens_earned") or 0) + earned_delta
        ),
        total_tokens_spent=int(previous.get("total_tokens_spent") or 0),
        # Daily reconciliation corrects the rolling-window boundary. Completion
        # events only need to add rewards created in the current request.
        tokens_earned_last_7d=(
            int(previous.get("tokens_earned_last_7d") or 0) + earned_delta
        ),
        completed_focus_sessions_total=completed_focus_sessions_total,
        valid_focus_sessions_total=valid_focus_sessions_total,
        completed_tasks_total=completed_tasks_total,
        valid_completed_tasks_total=valid_completed_tasks_total,
    )

    persist_engagement_stats(user_id=payload.user_id, stats=stats)
    persist_streak_transition_event(
        user_id=payload.user_id,
        previous_stats=previous,
        next_stats=stats,
    )

    return RecalculateEngagementResponse(
        stats=stats,
        newly_created_rewards=created_rewards,
    )
