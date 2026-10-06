from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    Field,
)

class GenerateWeeklyReflectionRequest(
    BaseModel
):
    user_id: UUID

    persist_reflection: bool = True

    generate_ai_card: bool = True


class WeeklyReflectionEvidenceItem(
    BaseModel
):
    key: str
    title: str
    message: str

    tone: Literal[
        "positive",
        "neutral",
        "watch",
    ]


class WeeklyReflectionMetricPayload(
    BaseModel
):
    # ========================================================
    # Behaviour
    # ========================================================

    average_standard_pbi: float | None

    average_personalized_pbi: float | None

    completed_focus_minutes: float

    completed_focus_sessions: int

    active_focus_days: int

    completed_tasks: int

    late_or_overdue_tasks: int

    # ========================================================
    # Mastery
    #
    # These fields are separate from PBI.
    # Defaults preserve compatibility with older reflection
    # payloads which do not contain mastery metrics.
    # ========================================================

    review_attempts: int = 0

    reviewed_tasks: int = 0

    passed_review_attempts: int = 0

    failed_review_attempts: int = 0

    review_pass_rate: float | None = None

    average_review_score: float | None = None

    top_review_weak_areas: list[str] = Field(
            default_factory=list
        )


class WeeklyReflectionComparisonPayload(
    BaseModel
):
    # Behaviour deltas

    average_standard_pbi_delta: float | None

    average_personalized_pbi_delta: float | None

    completed_focus_minutes_delta: float

    completed_focus_sessions_delta: int

    active_focus_days_delta: int

    completed_tasks_delta: int

    late_or_overdue_tasks_delta: int

    # Mastery deltas

    review_attempts_delta: int = 0

    reviewed_tasks_delta: int = 0

    review_pass_rate_delta: float | None = None

    average_review_score_delta: float | None = None


class GeminiWeeklyReflectionWin(
    BaseModel
):
    evidence_key: str = Field(
        ...,
        min_length=1,
    )

    student_friendly_explanation: str = Field(
            ...,
            min_length=1,
        )


class GeminiWeeklyReflectionWatchout(
    BaseModel
):
    evidence_key: str = Field(
        ...,
        min_length=1,
    )

    student_friendly_explanation: str = Field(
            ...,
            min_length=1,
        )


class GeminiWeeklyReflectionAction(
    BaseModel
):
    action: str = Field(
        ...,
        min_length=1,
    )

    rationale: str = Field(
        ...,
        min_length=1,
    )


class GeminiWeeklyReflectionOutput(
    BaseModel
):
    title: str = Field(
        ...,
        min_length=1,
    )

    summary: str = Field(
        ...,
        min_length=1,
    )

    reflection_interpretation: str = Field(
            ...,
            min_length=1,
        )

    wins: list[
        GeminiWeeklyReflectionWin
    ] = Field(
        default_factory=list,
        max_length=4,
    )

    watchouts: list[
        GeminiWeeklyReflectionWatchout
    ] = Field(
        default_factory=list,
        max_length=4,
    )

    next_week_actions: list[
        GeminiWeeklyReflectionAction
    ] = Field(
        ...,
        min_length=1,
        max_length=3,
    )

    confidence_note: str = Field(
        ...,
        min_length=1,
    )


class GenerateWeeklyReflectionResponse(
    BaseModel
):
    reflection_id: UUID | None

    card_id: UUID | None

    reflection_direction: Literal[
        "improving",
        "stable",
        "mixed",
        "needs_attention",
    ]

    current_metrics: WeeklyReflectionMetricPayload

    previous_metrics: WeeklyReflectionMetricPayload

    comparison_payload: WeeklyReflectionComparisonPayload

    evidence: list[ WeeklyReflectionEvidenceItem
    ]

    ai_card: GeminiWeeklyReflectionOutput | None