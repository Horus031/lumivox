from __future__ import annotations

from typing import Any


def filter_root_behavior_tasks(
    tasks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Return Tasks that are eligible for high-level behavioural analytics.

    Lumivox treats a root Task as the behavioural unit.

    Subtasks describe the internal decomposition of that Task and must not
    independently increase completion/deadline metrics, otherwise one large
    Task with five subtasks would be counted as six separate behavioural
    commitments.

    Cancelled Tasks are also excluded because cancellation means the
    commitment was intentionally closed rather than completed or left late.
    """

    return [
        task
        for task in tasks
        if (
            task.get(
                "parent_task_id"
            )
            is None
            and task.get(
                "status"
            )
            != "cancelled"
        )
    ]