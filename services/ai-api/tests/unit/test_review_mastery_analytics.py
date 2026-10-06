from app.services.review_mastery_analytics import (
    summarize_review_mastery,
)


def test_review_mastery_summary_separates_attempts_from_tasks():
    attempts = [
        {
            "task_id": "task-a",
            "status": "failed",
            "score": 60,
            "weak_areas": [
                "CIDR",
            ],
        },
        {
            "task_id": "task-a",
            "status": "passed",
            "score": 90,
            "weak_areas": [],
        },
        {
            "task_id": "task-b",
            "status": "failed",
            "score": 50,
            "weak_areas": [
                "cidr",
                "Route Tables",
            ],
        },
    ]

    result = (
        summarize_review_mastery(
            attempts
        )
    )

    assert (
        result[
            "review_attempts"
        ]
        == 3
    )

    assert (
        result[
            "reviewed_tasks"
        ]
        == 2
    )

    assert (
        result[
            "passed_review_attempts"
        ]
        == 1
    )

    assert (
        result[
            "failed_review_attempts"
        ]
        == 2
    )

    assert (
        result[
            "review_pass_rate"
        ]
        == 33.33
    )

    assert (
        result[
            "average_review_score"
        ]
        == 66.67
    )

    assert (
        result[
            "top_review_weak_areas"
        ]
        == [
            "CIDR",
            "Route Tables",
        ]
    )


def test_review_mastery_summary_empty_window():
    result = (
        summarize_review_mastery(
            []
        )
    )

    assert (
        result[
            "review_attempts"
        ]
        == 0
    )

    assert (
        result[
            "reviewed_tasks"
        ]
        == 0
    )

    assert (
        result[
            "review_pass_rate"
        ]
        is None
    )

    assert (
        result[
            "average_review_score"
        ]
        is None
    )

    assert (
        result[
            "top_review_weak_areas"
        ]
        == []
    )


def test_review_mastery_ignores_non_final_attempts():
    attempts = [
        {
            "task_id": "task-a",
            "status": "ready",
            "score": None,
            "weak_areas": [],
        },
        {
            "task_id": "task-b",
            "status": (
                "generation_failed"
            ),
            "score": None,
            "weak_areas": [],
        },
    ]

    result = (
        summarize_review_mastery(
            attempts
        )
    )

    assert (
        result[
            "review_attempts"
        ]
        == 0
    )