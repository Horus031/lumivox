from app.services.native_task_risk_service import (
    _fallback_probability,
    _risk_band,
    _snapshot_offset_bucket,
)


def _base_features():
    return {
        "days_until_due": 10.0,
        "overdue_tasks_last_30d": 0.0,
        "focus_minutes_last_7d": 180.0,
        "estimated_minutes": 60.0,
        "priority": 2.0,
        "goal_completion_ratio": 0.8,
    }


def test_risk_band_classification():
    assert _risk_band(0.10) == "low"
    assert _risk_band(0.40) == "moderate"
    assert _risk_band(0.55) == "elevated"
    assert _risk_band(0.85) == "high"


def test_snapshot_offset_bucket_matches_deadline_windows():
    assert _snapshot_offset_bucket(0) == 1
    assert _snapshot_offset_bucket(1) == 1
    assert _snapshot_offset_bucket(2) == 3
    assert _snapshot_offset_bucket(3) == 3
    assert _snapshot_offset_bucket(4) == 7
    assert _snapshot_offset_bucket(30) == 7


def test_fallback_probability_increases_for_imminent_deadline():
    baseline = _base_features()
    baseline_probability = _fallback_probability(baseline)

    urgent = {
        **baseline,
        "days_until_due": 1.0,
    }

    assert _fallback_probability(urgent) > baseline_probability


def test_fallback_probability_increases_for_low_focus():
    baseline = _base_features()
    baseline_probability = _fallback_probability(baseline)

    low_focus = {
        **baseline,
        "focus_minutes_last_7d": 0.0,
    }

    assert _fallback_probability(low_focus) > baseline_probability


def test_fallback_probability_increases_for_recent_overdue_history():
    baseline = _base_features()
    baseline_probability = _fallback_probability(baseline)

    overdue_history = {
        **baseline,
        "overdue_tasks_last_30d": 3.0,
    }

    assert _fallback_probability(overdue_history) > baseline_probability


def test_fallback_probability_increases_for_high_priority_large_task():
    baseline = _base_features()
    baseline_probability = _fallback_probability(baseline)

    pressured = {
        **baseline,
        "priority": 4.0,
        "estimated_minutes": 240.0,
    }

    assert _fallback_probability(pressured) > baseline_probability


def test_fallback_probability_is_bounded():
    worst_case = {
        "days_until_due": 0.0,
        "overdue_tasks_last_30d": 10.0,
        "focus_minutes_last_7d": 0.0,
        "estimated_minutes": 600.0,
        "priority": 4.0,
        "goal_completion_ratio": 0.0,
    }

    probability = _fallback_probability(worst_case)

    assert 0.02 <= probability <= 0.95
