import pytest

from app.schemas.task_review import (
    ReviewFlashcardDraft,
    ReviewGenerationOutput,
    ReviewQuestionDraft,
    TaskReviewAnswerSubmission,
)

from app.services.task_review_service import (
    _build_assessment_payloads,
    _build_review_prompt,
    _score_review_answers,
    _submission_fingerprint,
)

def build_generation():
    return ReviewGenerationOutput(
        title="Review title",
        summary="Review summary",
        flashcards=[
            ReviewFlashcardDraft(
                front=f"Front {index}",
                back=f"Back {index}",
            )
            for index in range(
                1,
                5,
            )
        ],
        questions=[
            ReviewQuestionDraft(
                kind="single_choice",
                prompt=(
                    f"Question {index}"
                ),
                options=[
                    "A",
                    "B",
                    "C",
                ],
                correct_option_indices=[
                    1,
                ],
                explanation=(
                    "B is correct."
                ),
                weak_area=(
                    "Example concept"
                ),
            )
            for index in range(
                1,
                6,
            )
        ],
    )


def test_public_assessment_does_not_contain_answer_keys():
    generation = (
        build_generation()
    )

    (
        assessment,
        answer_key,
    ) = _build_assessment_payloads(
        generation
    )

    public_payload = (
        assessment.model_dump()
    )

    assert (
        len(
            public_payload[
                "questions"
            ]
        )
        == 5
    )

    for question in (
        public_payload[
            "questions"
        ]
    ):
        assert (
            "correct_option_indices"
            not in question
        )

        assert (
            "explanation"
            not in question
        )

        assert (
            "weak_area"
            not in question
        )

    assert (
        len(
            answer_key[
                "questions"
            ]
        )
        == 5
    )

    private_question = (
        answer_key[
            "questions"
        ][0]
    )

    assert (
        private_question[
            "correct_option_indices"
        ]
        == [1]
    )

    assert (
        private_question[
            "explanation"
        ]
        == "B is correct."
    )


def test_flashcards_are_public_study_material():
    generation = (
        build_generation()
    )

    (
        assessment,
        _,
    ) = _build_assessment_payloads(
        generation
    )

    assert (
        assessment
        .flashcards[0]
        .front
        == "Front 1"
    )

    assert (
        assessment
        .flashcards[0]
        .back
        == "Back 1"
    )


def test_review_prompt_uses_task_context_as_topic_signal():
    prompt = _build_review_prompt(
        task={
            "title": "Learn AWS VPC",
            "description": (
                "Understand public and private "
                "subnets"
            ),
        },
        goal={
            "title": "AWS networking",
            "description": None,
        },
        subtasks=[
            {
                "title": (
                    "Read about route tables"
                ),
                "description": None,
                "status": "completed",
            }
        ],
        chunks=[],
        preferred_locale="en",
    )

    assert (
        "signals for the learning topic"
        in prompt
    )

    assert (
        "stable, widely"
        in prompt
    )

    assert (
        "AWS VPC"
        in prompt
    )


def test_review_prompt_rejects_task_metadata_questions():
    prompt = _build_review_prompt(
        task={
            "title": "Learn AWS VPC",
            "description": None,
        },
        goal=None,
        subtasks=[],
        chunks=[],
        preferred_locale="en",
    )

    forbidden_guidance = (
        "Do not ask questions whose answer "
        "is merely the task title"
    )

    assert forbidden_guidance in prompt

    assert (
        "do not turn those names into quiz answers"
        in prompt
    )


def build_scoring_attempt():
    return {
        "pass_threshold": 70,
        "assessment_payload": {
            "title": "Networking review",
            "summary": "Summary",
            "flashcards": [],
            "questions": [
                {
                    "id": "q_1",
                    "kind": "single_choice",
                    "prompt": "Single choice",
                    "options": [
                        "A",
                        "B",
                        "C",
                    ],
                },
                {
                    "id": "q_2",
                    "kind": "multiple_select",
                    "prompt": "Multiple select",
                    "options": [
                        "A",
                        "B",
                        "C",
                    ],
                },
            ],
        },
    }


def build_scoring_answer_key():
    return {
        "schema_version": "v1",
        "questions": [
            {
                "id": "q_1",
                "correct_option_indices": [
                    1,
                ],
                "explanation": (
                    "B is correct."
                ),
                "weak_area": (
                    "Routing"
                ),
            },
            {
                "id": "q_2",
                "correct_option_indices": [
                    0,
                    2,
                ],
                "explanation": (
                    "A and C are correct."
                ),
                "weak_area": (
                    "Subnet design"
                ),
            },
        ],
    }


def test_scoring_is_deterministic():
    feedback, weak_areas = (
        _score_review_answers(
            attempt=(
                build_scoring_attempt()
            ),
            answer_key=(
                build_scoring_answer_key()
            ),
            answers=[
                TaskReviewAnswerSubmission(
                    question_id="q_1",
                    selected_option_indices=[
                        1,
                    ],
                ),
                TaskReviewAnswerSubmission(
                    question_id="q_2",
                    selected_option_indices=[
                        0,
                    ],
                ),
            ],
        )
    )

    assert feedback.correct_count == 1
    assert feedback.total_questions == 2
    assert feedback.score == 50
    assert feedback.passed is False

    assert weak_areas == [
        "Subnet design"
    ]


def test_multiple_select_order_does_not_matter():
    feedback, weak_areas = (
        _score_review_answers(
            attempt=(
                build_scoring_attempt()
            ),
            answer_key=(
                build_scoring_answer_key()
            ),
            answers=[
                TaskReviewAnswerSubmission(
                    question_id="q_1",
                    selected_option_indices=[
                        1,
                    ],
                ),
                TaskReviewAnswerSubmission(
                    question_id="q_2",
                    selected_option_indices=[
                        2,
                        0,
                    ],
                ),
            ],
        )
    )

    assert feedback.score == 100
    assert feedback.passed is True
    assert weak_areas == []


def test_submission_fingerprint_ignores_answer_order():
    first = _submission_fingerprint(
        [
            TaskReviewAnswerSubmission(
                question_id="q_2",
                selected_option_indices=[
                    2,
                    0,
                ],
            ),
            TaskReviewAnswerSubmission(
                question_id="q_1",
                selected_option_indices=[
                    1,
                ],
            ),
        ]
    )

    second = _submission_fingerprint(
        [
            TaskReviewAnswerSubmission(
                question_id="q_1",
                selected_option_indices=[
                    1,
                ],
            ),
            TaskReviewAnswerSubmission(
                question_id="q_2",
                selected_option_indices=[
                    0,
                    2,
                ],
            ),
        ]
    )

    assert first == second


def test_submission_fingerprint_changes_with_answers():
    first = _submission_fingerprint(
        [
            TaskReviewAnswerSubmission(
                question_id="q_1",
                selected_option_indices=[
                    1,
                ],
            ),
        ]
    )

    second = _submission_fingerprint(
        [
            TaskReviewAnswerSubmission(
                question_id="q_1",
                selected_option_indices=[
                    0,
                ],
            ),
        ]
    )

    assert first != second


def test_scoring_rejects_missing_question():
    with pytest.raises(
        ValueError
    ):
        _score_review_answers(
            attempt=(
                build_scoring_attempt()
            ),
            answer_key=(
                build_scoring_answer_key()
            ),
            answers=[
                TaskReviewAnswerSubmission(
                    question_id="q_1",
                    selected_option_indices=[
                        1,
                    ],
                ),
            ],
        )


def test_scoring_rejects_extra_option_index():
    with pytest.raises(
        ValueError
    ):
        _score_review_answers(
            attempt=(
                build_scoring_attempt()
            ),
            answer_key=(
                build_scoring_answer_key()
            ),
            answers=[
                TaskReviewAnswerSubmission(
                    question_id="q_1",
                    selected_option_indices=[
                        9,
                    ],
                ),
                TaskReviewAnswerSubmission(
                    question_id="q_2",
                    selected_option_indices=[
                        0,
                        2,
                    ],
                ),
            ],
        )
