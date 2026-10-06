from __future__ import annotations

from collections import Counter
from statistics import mean
from typing import Any


FINAL_REVIEW_STATUSES = {
    "passed",
    "failed",
}


def _valid_review_score(
    value: Any,
) -> float | None:
    if value is None:
        return None

    try:
        score = float(value)
    except (
        TypeError,
        ValueError,
    ):
        return None

    if (
        score < 0
        or score > 100
    ):
        return None

    return score


def summarize_review_mastery(
    attempts: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Summarize finalized AI Review attempts.

    Important:
    - This is a mastery signal.
    - It is NOT part of PBI.
    - Attempts and reviewed Tasks are kept separately because a learner may
      retry one Task several times in the same period.
    """

    finalized_attempts = [
        attempt
        for attempt in attempts
        if attempt.get(
            "status"
        )
        in FINAL_REVIEW_STATUSES
    ]

    review_attempts = len(
        finalized_attempts
    )

    reviewed_task_ids = {
        str(
            attempt["task_id"]
        )
        for attempt
        in finalized_attempts
        if attempt.get(
            "task_id"
        )
    }

    passed_review_attempts = sum(
        1
        for attempt
        in finalized_attempts
        if attempt.get(
            "status"
        )
        == "passed"
    )

    failed_review_attempts = (
        review_attempts
        - passed_review_attempts
    )

    scores = [
        score
        for attempt
        in finalized_attempts
        if (
            score := _valid_review_score(
                attempt.get(
                    "score"
                )
            )
        )
        is not None
    ]

    review_pass_rate = (
        round(
            (
                passed_review_attempts
                / review_attempts
            )
            * 100,
            2,
        )
        if review_attempts
        > 0
        else None
    )

    average_review_score = (
        round(
            mean(scores),
            2,
        )
        if scores
        else None
    )

    weak_area_counts: Counter[
        str
    ] = Counter()

    weak_area_display: dict[
        str,
        str,
    ] = {}

    for attempt in (
        finalized_attempts
    ):
        weak_areas = (
            attempt.get(
                "weak_areas"
            )
            or []
        )

        if not isinstance(
            weak_areas,
            list,
        ):
            continue

        for raw_area in weak_areas:
            if not isinstance(
                raw_area,
                str,
            ):
                continue

            label = (
                raw_area.strip()
            )

            if not label:
                continue

            normalized = (
                label.casefold()
            )

            weak_area_counts[
                normalized
            ] += 1

            weak_area_display.setdefault(
                normalized,
                label,
            )

    ranked_weak_areas = sorted(
        weak_area_counts.keys(),
        key=lambda key: (
            -weak_area_counts[key],
            weak_area_display[
                key
            ].casefold(),
        ),
    )

    top_review_weak_areas = [
        weak_area_display[key]
        for key
        in ranked_weak_areas[:3]
    ]

    return {
        "review_attempts":
            review_attempts,

        "reviewed_tasks":
            len(
                reviewed_task_ids
            ),

        "passed_review_attempts":
            passed_review_attempts,

        "failed_review_attempts":
            failed_review_attempts,

        "review_pass_rate":
            review_pass_rate,

        "average_review_score":
            average_review_score,

        "top_review_weak_areas":
            top_review_weak_areas,
    }