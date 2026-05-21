from datetime import datetime, timedelta, timezone

from app.services.native_task_risk_service import (
    calculate_deadline_pressure_score,
    calculate_focus_neglect_score,
    calculate_workload_pressure_score,
    classify_risk_band,
)


def test_overdue_task_has_max_deadline_pressure():
    now = datetime.now(timezone.utc)
    due_at = now - timedelta(days=1)

    score, metadata = calculate_deadline_pressure_score(
        due_at=due_at,
        now_utc=now,
    )

    assert score == 1.0
    assert metadata["deadline_state"] == "overdue"


def test_task_due_within_three_days_has_high_deadline_pressure():
    now = datetime.now(timezone.utc)
    due_at = now + timedelta(days=2)

    score, metadata = calculate_deadline_pressure_score(
        due_at=due_at,
        now_utc=now,
    )

    assert score == 0.75
    assert metadata["deadline_state"] == "due_within_3_days"


def test_focus_neglect_is_high_when_no_recent_focus_exists():
    score, metadata = calculate_focus_neglect_score(
        actual_focus_minutes_last_window=0,
        estimated_minutes=120,
    )

    assert score == 1.0
    assert metadata["expected_focus_minutes"] == 30.0


def test_focus_neglect_reduces_when_focus_activity_exists():
    score, metadata = calculate_focus_neglect_score(
        actual_focus_minutes_last_window=30,
        estimated_minutes=120,
    )

    assert score == 0.0
    assert metadata["focus_ratio"] == 1.0


def test_workload_pressure_scales_with_due_task_count():
    score, metadata = calculate_workload_pressure_score(
        open_due_soon_count=4
    )

    assert score == 0.75
    assert metadata["open_due_soon_count"] == 4


def test_risk_band_classification():
    assert classify_risk_band(10) == "low"
    assert classify_risk_band(40) == "moderate"
    assert classify_risk_band(60) == "elevated"
    assert classify_risk_band(85) == "high"