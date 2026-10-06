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
    pbi: float = 70,
    focus_minutes: float = 240,
    sessions: int = 4,
    days: int = 3,
    tasks: int = 3,
    late: int = 1,

    review_attempts: int = 0,
    reviewed_tasks: int = 0,
    passed_reviews: int = 0,
    failed_reviews: int = 0,

    pass_rate:
        float | None = None,

    review_score:
        float | None = None,

    weak_areas:
        list[str] | None = None,
):
    return (
        WeeklyReflectionMetricPayload(
            average_standard_pbi=(
                pbi
            ),

            average_personalized_pbi=(
                pbi
            ),

            completed_focus_minutes=(
                focus_minutes
            ),

            completed_focus_sessions=(
                sessions
            ),

            active_focus_days=days,

            completed_tasks=tasks,

            late_or_overdue_tasks=(
                late
            ),

            review_attempts=(
                review_attempts
            ),

            reviewed_tasks=(
                reviewed_tasks
            ),

            passed_review_attempts=(
                passed_reviews
            ),

            failed_review_attempts=(
                failed_reviews
            ),

            review_pass_rate=(
                pass_rate
            ),

            average_review_score=(
                review_score
            ),

            top_review_weak_areas=(
                weak_areas
                or []
            ),
        )
    )


def test_compare_metrics_returns_correct_behaviour_deltas():
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

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    assert (
        comparison
        .average_personalized_pbi_delta
        == 5
    )

    assert (
        comparison
        .completed_focus_minutes_delta
        == 60
    )

    assert (
        comparison
        .completed_focus_sessions_delta
        == 2
    )

    assert (
        comparison
        .active_focus_days_delta
        == 1
    )

    assert (
        comparison
        .completed_tasks_delta
        == 2
    )

    assert (
        comparison
        .late_or_overdue_tasks_delta
        == -1
    )


def test_compare_metrics_returns_mastery_deltas():
    current = build_metrics(
        review_attempts=4,
        reviewed_tasks=3,
        passed_reviews=3,
        failed_reviews=1,
        pass_rate=75,
        review_score=82,
    )

    previous = build_metrics(
        review_attempts=2,
        reviewed_tasks=2,
        passed_reviews=1,
        failed_reviews=1,
        pass_rate=50,
        review_score=68,
    )

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    assert (
        comparison
        .review_attempts_delta
        == 2
    )

    assert (
        comparison
        .reviewed_tasks_delta
        == 1
    )

    assert (
        comparison
        .review_pass_rate_delta
        == 25
    )

    assert (
        comparison
        .average_review_score_delta
        == 14
    )


def test_build_reflection_evidence_detects_positive_behaviour_trend():
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

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    evidence = (
        build_reflection_evidence(
            current=current,
            previous=previous,
            comparison=(
                comparison
            ),
        )
    )

    evidence_keys = [
        item.key
        for item in evidence
    ]

    assert (
        "personalized_pbi_improved"
        in evidence_keys
    )

    assert (
        "focus_minutes_increased"
        in evidence_keys
    )

    assert (
        "active_days_increased"
        in evidence_keys
    )

    assert (
        "completed_tasks_increased"
        in evidence_keys
    )

    assert (
        "deadline_reliability_improved"
        in evidence_keys
    )


def test_mastery_trend_uses_multiple_reviewed_tasks():
    current = build_metrics(
        review_attempts=3,
        reviewed_tasks=2,
        passed_reviews=2,
        failed_reviews=1,
        pass_rate=66.67,
        review_score=82,
    )

    previous = build_metrics(
        review_attempts=2,
        reviewed_tasks=2,
        passed_reviews=1,
        failed_reviews=1,
        pass_rate=50,
        review_score=65,
    )

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    evidence = (
        build_reflection_evidence(
            current=current,
            previous=previous,
            comparison=(
                comparison
            ),
        )
    )

    keys = [
        item.key
        for item in evidence
    ]

    assert (
        "review_score_improved"
        in keys
    )


def test_single_reviewed_task_does_not_create_directional_mastery_claim():
    current = build_metrics(
        review_attempts=3,
        reviewed_tasks=1,
        passed_reviews=0,
        failed_reviews=3,
        pass_rate=0,
        review_score=35,
        weak_areas=[
            "CIDR",
        ],
    )

    previous = build_metrics()

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    evidence = (
        build_reflection_evidence(
            current=current,
            previous=previous,
            comparison=(
                comparison
            ),
        )
    )

    keys = {
        item.key
        for item in evidence
    }

    assert (
        "review_mastery_strong"
        not in keys
    )

    assert (
        "review_mastery_needs_attention"
        not in keys
    )

    assert (
        "review_score_improved"
        not in keys
    )

    assert (
        "review_score_declined"
        not in keys
    )

    assert (
        "review_topics_to_revisit"
        in keys
    )


def test_strong_mastery_signal_when_sample_is_large_enough():
    current = build_metrics(
        review_attempts=3,
        reviewed_tasks=3,
        passed_reviews=3,
        failed_reviews=0,
        pass_rate=100,
        review_score=88,
    )

    previous = build_metrics()

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    evidence = (
        build_reflection_evidence(
            current=current,
            previous=previous,
            comparison=(
                comparison
            ),
        )
    )

    keys = {
        item.key
        for item in evidence
    }

    assert (
        "review_mastery_strong"
        in keys
    )


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

    comparison = (
        compare_metrics(
            current,
            previous,
        )
    )

    evidence = (
        build_reflection_evidence(
            current=current,
            previous=previous,
            comparison=(
                comparison
            ),
        )
    )

    direction = (
        classify_reflection_direction(
            evidence
        )
    )

    assert (
        direction
        == "improving"
    )