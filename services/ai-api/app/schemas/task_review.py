from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    Field,
    model_validator,
)


ReviewLocale = Literal[
    "auto",
    "en",
    "vi",
]

ReviewQuestionKind = Literal[
    "single_choice",
    "multiple_select",
    "true_false",
]

ReviewAttemptStatus = Literal[
    "generating",
    "ready",
    "passed",
    "failed",
    "generation_failed",
    "cancelled",
]


class ReviewFlashcardDraft(BaseModel):
    front: str = Field(
        ...,
        min_length=1,
        max_length=500,
    )

    back: str = Field(
        ...,
        min_length=1,
        max_length=1200,
    )


class ReviewQuestionDraft(BaseModel):
    kind: ReviewQuestionKind

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=1200,
    )

    options: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
    )

    correct_option_indices: list[int] = Field(
        ...,
        min_length=1,
        max_length=5,
    )

    explanation: str = Field(
        ...,
        min_length=1,
        max_length=1200,
    )

    weak_area: str = Field(
        ...,
        min_length=1,
        max_length=160,
    )

    @model_validator(mode="after")
    def validate_question(
        self,
    ):
        if any(
            not option.strip()
            for option in self.options
        ):
            raise ValueError(
                "Question options "
                "cannot be empty."
            )

        unique_indices = set(
            self.correct_option_indices
        )

        if len(unique_indices) != len(
            self.correct_option_indices
        ):
            raise ValueError(
                "Correct option indices "
                "must be unique."
            )

        for index in unique_indices:
            if (
                index < 0
                or index >= len(self.options)
            ):
                raise ValueError(
                    "Correct option index "
                    "is outside option range."
                )

        if (
            self.kind
            in {
                "single_choice",
                "true_false",
            }
            and len(unique_indices) != 1
        ):
            raise ValueError(
                f"{self.kind} requires "
                "exactly one correct answer."
            )

        if (
            self.kind
            == "multiple_select"
            and len(unique_indices) < 2
        ):
            raise ValueError(
                "multiple_select requires "
                "at least two correct answers."
            )

        if (
            self.kind == "true_false"
            and len(self.options) != 2
        ):
            raise ValueError(
                "true_false requires "
                "exactly two options."
            )

        return self


class ReviewGenerationOutput(BaseModel):
    title: str = Field(
        ...,
        min_length=1,
        max_length=160,
    )

    summary: str = Field(
        ...,
        min_length=1,
        max_length=1000,
    )

    flashcards: list[
        ReviewFlashcardDraft
    ] = Field(
        ...,
        min_length=4,
        max_length=8,
    )

    questions: list[
        ReviewQuestionDraft
    ] = Field(
        ...,
        min_length=5,
        max_length=8,
    )


class TaskReviewFlashcard(BaseModel):
    id: str
    front: str
    back: str


class TaskReviewQuestion(BaseModel):
    id: str
    kind: ReviewQuestionKind
    prompt: str
    options: list[str]


class TaskReviewAssessmentPayload(
    BaseModel
):
    title: str
    summary: str

    flashcards: list[
        TaskReviewFlashcard
    ]

    questions: list[
        TaskReviewQuestion
    ]


class GenerateTaskReviewRequest(
    BaseModel
):
    user_id: UUID
    task_id: UUID

    expected_status: Literal[
        "in_progress",
        "overdue",
    ]

    expected_updated_at: datetime

    preferred_locale: ReviewLocale = (
        "auto"
    )

    pass_threshold: int = Field(
        default=70,
        ge=50,
        le=100,
    )

    include_goal_documents: bool = True

    top_k: int = Field(
        default=8,
        ge=3,
        le=12,
    )


class GetLatestTaskReviewRequest(
    BaseModel
):
    user_id: UUID
    task_id: UUID


class TaskReviewAttemptResponse(
    BaseModel
):
    attempt_id: UUID
    task_id: UUID
    attempt_number: int

    status: ReviewAttemptStatus

    pass_threshold: float

    score: float | None = None

    assessment: (
        TaskReviewAssessmentPayload
        | None
    )

    provider: str | None
    model: str | None
    prompt_version: str | None
    latency_ms: int | None

    generation_error: str | None

    created_at: datetime
    ready_at: datetime | None


class GetLatestTaskReviewResponse(
    BaseModel
):
    attempt: (
        TaskReviewAttemptResponse
        | None
    )