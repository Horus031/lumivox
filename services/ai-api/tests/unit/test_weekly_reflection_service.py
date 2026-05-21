from app.schemas.weekly_reflection import (
    WeeklyReflectionMetricPayload,
)
from app.services.weekly_reflection_service import (
    build_reflection_evidence,
    classify_reflection_direction,
    compare_metrics,
)


def build_metrics(
    *,
    pbi: float,
    focus_minutes: float,
    sessions: int,
    days: int,
    tasks: int,
    late: int,
):
    return WeeklyReflectionMetricPayload(
        average_standard_pbi=pbi,
        average_personalized_pbi=pbi,
        completed_focus_minutes=focus_minutes,
        completed_focus_sessions=sessions,
        active_focus_days=days,
        completed_tasks=tasks,
        late_or_overdue_tasks=late,
    )


def test_compare_metrics_returns_correct_deltas():
    current = build_metrics(
        pbi=75,
        focus_minutes=300,
        sessions=6,
        days=4,
        tasks=5,
        late=1,
    )

    previous = build_metrics(
        pbi=70,
        focus_minutes=240,
        sessions=4,
        days=3,
        tasks=3,
        late=2,
    )

    comparison = compare_metrics(current, previous)

    assert comparison.average_personalized_pbi_delta == 5
    assert comparison.completed_focus_minutes_delta == 60
    assert comparison.completed_focus_sessions_delta == 2
    assert comparison.active_focus_days_delta == 1
    assert comparison.completed_tasks_delta == 2
    assert comparison.late_or_overdue_tasks_delta == -1


def test_build_reflection_evidence_detects_positive_trend():
    current = build_metrics(
        pbi=78,
        focus_minutes=320,
        sessions=7,
        days=5,
        tasks=6,
        late=0,
    )

    previous = build_metrics(
        pbi=70,
        focus_minutes=250,
        sessions=5,
        days=3,
        tasks=4,
        late=2,
    )

    comparison = compare_metrics(current, previous)

    evidence = build_reflection_evidence(
        current=current,
        previous=previous,
        comparison=comparison,
    )

    evidence_keys = [item.key for item in evidence]

    assert "personalized_pbi_improved" in evidence_keys
    assert "focus_minutes_increased" in evidence_keys
    assert "active_days_increased" in evidence_keys
    assert "completed_tasks_increased" in evidence_keys
    assert "deadline_reliability_improved" in evidence_keys


def test_reflection_direction_is_improving_when_positive_signals_dominate():
    current = build_metrics(
        pbi=78,
        focus_minutes=320,
        sessions=7,
        days=5,
        tasks=6,
        late=0,
    )

    previous = build_metrics(
        pbi=70,
        focus_minutes=250,
        sessions=5,
        days=3,
        tasks=4,
        late=2,
    )

    comparison = compare_metrics(current, previous)

    evidence = build_reflection_evidence(
        current=current,
        previous=previous,
        comparison=comparison,
    )

    direction = classify_reflection_direction(evidence)

    assert direction == "improving"