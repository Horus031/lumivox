from datetime import date

from app.services.engagement_retention_service import (
    build_reward_candidates,
    calculate_streaks,
)


def test_calculate_streaks_returns_current_and_longest_streak():
    active_dates = [
        date(2026, 5, 10),
        date(2026, 5, 11),
        date(2026, 5, 12),
        date(2026, 5, 14),
    ]

    current_streak, longest_streak, latest_date = calculate_streaks(
        active_dates
    )

    assert longest_streak == 3
    assert latest_date == date(2026, 5, 14)
    assert current_streak >= 0


def test_reward_candidates_include_focus_and_task_rewards():
    focus_sessions = [
        {
            "id": "focus-1",
            "ended_at": "2026-05-10T10:00:00+00:00",
        }
    ]

    completed_tasks = [
        {
            "id": "task-1",
            "completed_at": "2026-05-10T11:00:00+00:00",
        }
    ]

    active_dates = [
        date(2026, 5, 10),
        date(2026, 5, 11),
        date(2026, 5, 12),
    ]

    rewards = build_reward_candidates(
        completed_focus_sessions=focus_sessions,
        completed_tasks=completed_tasks,
        active_dates=active_dates,
    )

    event_types = [reward["event_type"] for reward in rewards]

    assert "focus_session_completed" in event_types
    assert "task_completed" in event_types
    assert "daily_streak_continued" in event_types
    assert "streak_milestone_3" in event_types


def test_reward_source_keys_are_stable():
    focus_sessions = [
        {
            "id": "focus-1",
            "ended_at": "2026-05-10T10:00:00+00:00",
        }
    ]

    rewards = build_reward_candidates(
        completed_focus_sessions=focus_sessions,
        completed_tasks=[],
        active_dates=[],
    )

    assert rewards[0]["source_key"] == "focus_session_completed:focus-1"