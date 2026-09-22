from uuid import uuid4

from app.schemas.engagement_retention import (
    ProcessEngagementActivityRequest,
    RewardLedgerEntryPreview,
)
from app.services import engagement_incremental_service as service


def _previous_stats():
    return {
        "current_streak_days": 2,
        "longest_streak_days": 4,
        "last_valid_activity_date": "2026-09-21",
        "token_balance": 100,
        "total_tokens_earned": 140,
        "total_tokens_spent": 40,
        "tokens_earned_last_7d": 30,
        "completed_focus_sessions_total": 8,
        "valid_focus_sessions_total": 7,
        "completed_tasks_total": 12,
        "valid_completed_tasks_total": 10,
        "streak_status": "active",
    }


def test_process_task_completion_uses_incremental_fast_path(monkeypatch):
    user_id = uuid4()
    activity_id = uuid4()
    persisted = {}

    monkeypatch.setattr(
        service,
        "get_previous_engagement_stats",
        lambda _user_id: _previous_stats(),
    )
    monkeypatch.setattr(
        service,
        "_fetch_activity",
        lambda _payload: {
            "id": str(activity_id),
            "status": "completed",
            "created_at": "2026-09-22T08:00:00+00:00",
            "completed_at": "2026-09-22T09:00:00+00:00",
            "estimated_minutes": 30,
        },
    )
    monkeypatch.setattr(
        service,
        "_insert_only_missing_rewards",
        lambda **_kwargs: (
            [
                RewardLedgerEntryPreview(
                    event_type="task_completed",
                    token_delta=10,
                    source_key=f"task_completed:{activity_id}",
                    reward_note="Completed a valid task.",
                ),
                RewardLedgerEntryPreview(
                    event_type="daily_streak_continued",
                    token_delta=8,
                    source_key="daily_streak_continued:2026-09-22",
                    reward_note="Continued the study streak into a new day.",
                ),
                RewardLedgerEntryPreview(
                    event_type="streak_milestone_3",
                    token_delta=15,
                    source_key="streak_milestone_3:2026-09-22",
                    reward_note="Reached a 3-day study streak.",
                ),
            ],
            33,
        ),
    )
    monkeypatch.setattr(
        service,
        "determine_streak_status",
        lambda **kwargs: {
            "streak_status": "active",
            "current_streak_days": kwargs["current_streak_days"],
            "streak_freeze_started_at": None,
            "streak_restore_deadline_at": None,
            "can_restore_streak": False,
        },
    )
    monkeypatch.setattr(
        service,
        "persist_engagement_stats",
        lambda **kwargs: persisted.setdefault("stats", kwargs["stats"]),
    )
    monkeypatch.setattr(
        service,
        "persist_streak_transition_event",
        lambda **_kwargs: None,
    )

    result = service.process_engagement_activity(
        ProcessEngagementActivityRequest(
            user_id=user_id,
            activity_type="task",
            activity_id=activity_id,
        )
    )

    assert result.stats.current_streak_days == 3
    assert result.stats.longest_streak_days == 4
    assert result.stats.token_balance == 133
    assert result.stats.completed_tasks_total == 13
    assert result.stats.valid_completed_tasks_total == 11
    assert persisted["stats"].current_streak_days == 3


def test_same_day_completion_does_not_increment_streak(monkeypatch):
    previous = _previous_stats()
    previous["last_valid_activity_date"] = "2026-09-22"
    previous["current_streak_days"] = 3
    activity_id = uuid4()

    monkeypatch.setattr(
        service,
        "get_previous_engagement_stats",
        lambda _user_id: previous,
    )
    monkeypatch.setattr(
        service,
        "_fetch_activity",
        lambda _payload: {
            "id": str(activity_id),
            "status": "completed",
            "ended_at": "2026-09-22T11:00:00+00:00",
            "actual_focus_minutes": 25,
        },
    )
    monkeypatch.setattr(
        service,
        "_insert_only_missing_rewards",
        lambda **kwargs: (
            [
                RewardLedgerEntryPreview(
                    event_type="focus_session_completed",
                    token_delta=5,
                    source_key=f"focus_session_completed:{activity_id}",
                    reward_note="Completed a valid focus session.",
                )
            ],
            5,
        ),
    )
    monkeypatch.setattr(
        service,
        "determine_streak_status",
        lambda **kwargs: {
            "streak_status": "active",
            "current_streak_days": kwargs["current_streak_days"],
            "streak_freeze_started_at": None,
            "streak_restore_deadline_at": None,
            "can_restore_streak": False,
        },
    )
    monkeypatch.setattr(service, "persist_engagement_stats", lambda **_kwargs: None)
    monkeypatch.setattr(
        service,
        "persist_streak_transition_event",
        lambda **_kwargs: None,
    )

    result = service.process_engagement_activity(
        ProcessEngagementActivityRequest(
            user_id=uuid4(),
            activity_type="focus_session",
            activity_id=activity_id,
        )
    )

    assert result.stats.current_streak_days == 3
    assert result.stats.completed_focus_sessions_total == 9
    assert result.stats.valid_focus_sessions_total == 8
