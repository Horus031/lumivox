from datetime import (
    datetime,
    timezone,
)

from app.services.pbi_service import (
    calculate_das,
    calculate_tcr,
)

from app.services.task_behavior_analytics import (
    filter_root_behavior_tasks,
)


def test_root_behavior_filter_excludes_subtasks_and_cancelled():
    tasks = [
        {
            "id": "root-active",
            "parent_task_id": None,
            "status": "in_progress",
        },
        {
            "id": "root-completed",
            "parent_task_id": None,
            "status": "completed",
        },
        {
            "id": "subtask",
            "parent_task_id": "root-active",
            "status": "completed",
        },
        {
            "id": "cancelled",
            "parent_task_id": None,
            "status": "cancelled",
        },
    ]

    eligible = (
        filter_root_behavior_tasks(
            tasks
        )
    )

    assert [
        task["id"]
        for task in eligible
    ] == [
        "root-active",
        "root-completed",
    ]


def test_tcr_counts_only_root_non_cancelled_tasks():
    tasks = [
        {
            "id": "completed-root",
            "parent_task_id": None,
            "priority": "high",
            "status": "completed",
        },
        {
            "id": "active-root",
            "parent_task_id": None,
            "priority": "medium",
            "status": "in_progress",
        },
        {
            "id": "completed-subtask",
            "parent_task_id": "active-root",
            "priority": "critical",
            "status": "completed",
        },
        {
            "id": "cancelled-root",
            "parent_task_id": None,
            "priority": "critical",
            "status": "cancelled",
        },
    ]

    score, metadata = (
        calculate_tcr(
            tasks
        )
    )

    # Root eligible weights:
    #
    # completed high = 3
    # active medium  = 2
    #
    # TCR = 3 / 5 = 0.6
    assert score == 0.6

    assert (
        metadata[
            "eligible_tasks"
        ]
        == 2
    )

    assert (
        metadata[
            "completed_weight"
        ]
        == 3
    )

    assert (
        metadata[
            "total_weight"
        ]
        == 5
    )


def test_das_ignores_subtasks_and_cancelled_tasks():
    tasks = [
        {
            "id": "root-on-time",
            "parent_task_id": None,
            "priority": "medium",
            "status": "completed",
            "due_at": (
                "2026-10-03T"
                "12:00:00+00:00"
            ),
            "completed_at": (
                "2026-10-03T"
                "11:00:00+00:00"
            ),
        },
        {
            "id": "late-subtask",
            "parent_task_id": (
                "root-on-time"
            ),
            "priority": "critical",
            "status": "in_progress",
            "due_at": (
                "2026-10-01T"
                "00:00:00+00:00"
            ),
            "completed_at": None,
        },
        {
            "id": "cancelled-root",
            "parent_task_id": None,
            "priority": "critical",
            "status": "cancelled",
            "due_at": (
                "2026-10-01T"
                "00:00:00+00:00"
            ),
            "completed_at": None,
        },
    ]

    score, metadata = (
        calculate_das(
            tasks,
            datetime(
                2026,
                10,
                8,
                tzinfo=timezone.utc,
            ),
        )
    )

    assert score == 1.0

    assert (
        metadata[
            "eligible_tasks"
        ]
        == 1
    )

    assert (
        metadata[
            "average_penalty"
        ]
        == 0.0
    )