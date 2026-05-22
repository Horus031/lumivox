from datetime import date
from uuid import uuid4

from app.services.engagement_retention_service import (
    build_reward_candidates,
    calculate_longest_streak,
    calculate_streak_ending_at_latest_activity,
    get_previous_engagement_stats,
    is_valid_completed_task,
    is_valid_focus_session,
)


def test_valid_focus_session_requires_minimum_minutes():
    valid_session = {
        "id": "focus-1",
        "status": "completed",
        "ended_at": "2026-05-10T10:00:00+00:00",
        "actual_focus_minutes": 12,
    }

    invalid_session = {
        "id": "focus-2",
        "status": "completed",
        "ended_at": "2026-05-10T10:00:00+00:00",
        "actual_focus_minutes": 2,
    }

    assert is_valid_focus_session(valid_session) is True
    assert is_valid_focus_session(invalid_session) is False


def test_valid_task_accepts_estimated_minutes():
    task = {
        "id": "task-1",
        "status": "completed",
        "created_at": "2026-05-10T10:00:00+00:00",
        "completed_at": "2026-05-10T10:01:00+00:00",
        "estimated_minutes": 15,
    }

    assert is_valid_completed_task(task) is True


def test_valid_task_rejects_instant_low_effort_completion():
    task = {
        "id": "task-1",
        "status": "completed",
        "created_at": "2026-05-10T10:00:00+00:00",
        "completed_at": "2026-05-10T10:01:00+00:00",
        "estimated_minutes": 1,
    }

    assert is_valid_completed_task(task) is False


def test_calculate_streaks():
    active_dates = [
        date(2026, 5, 10),
        date(2026, 5, 11),
        date(2026, 5, 12),
        date(2026, 5, 14),
    ]

    assert calculate_longest_streak(active_dates) == 3
    assert calculate_streak_ending_at_latest_activity(active_dates) == 1


def test_reward_candidates_include_only_valid_focus_and_task_rewards():
    focus_sessions = [
        {
            "id": "focus-1",
            "status": "completed",
            "ended_at": "2026-05-10T10:00:00+00:00",
            "actual_focus_minutes": 12,
        },
        {
            "id": "focus-2",
            "status": "completed",
            "ended_at": "2026-05-10T10:00:00+00:00",
            "actual_focus_minutes": 2,
        },
    ]

    completed_tasks = [
        {
            "id": "task-1",
            "status": "completed",
            "created_at": "2026-05-10T10:00:00+00:00",
            "completed_at": "2026-05-10T10:10:00+00:00",
            "estimated_minutes": 5,
        },
        {
            "id": "task-2",
            "status": "completed",
            "created_at": "2026-05-10T10:00:00+00:00",
            "completed_at": "2026-05-10T10:01:00+00:00",
            "estimated_minutes": 1,
        },
    ]

    rewards = build_reward_candidates(
        completed_focus_sessions=focus_sessions,
        completed_tasks=completed_tasks,
        valid_activity_dates=[
            date(2026, 5, 10),
            date(2026, 5, 11),
            date(2026, 5, 12),
        ],
    )

    source_keys = [reward["source_key"] for reward in rewards]

    assert "focus_session_completed:focus-1" in source_keys
    assert "focus_session_completed:focus-2" not in source_keys
    assert "task_completed:task-1" in source_keys
    assert "task_completed:task-2" not in source_keys
    assert "streak_milestone_3:2026-05-12" in source_keys


def test_previous_engagement_stats_returns_none_when_row_is_missing(monkeypatch):
    class FakeQuery:
        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            return None

    class FakeSupabase:
        def table(self, *_args, **_kwargs):
            return FakeQuery()

    monkeypatch.setattr(
        "app.services.engagement_retention_service.get_supabase_client",
        lambda: FakeSupabase(),
    )

    assert get_previous_engagement_stats(uuid4()) is None