import pytest

from app.schemas.task_review import (
    ReviewQuestionDraft,
)


def test_single_choice_requires_one_correct_answer():
    question = ReviewQuestionDraft(
        kind="single_choice",
        prompt="Which answer is correct?",
        options=[
            "A",
            "B",
            "C",
        ],
        correct_option_indices=[1],
        explanation="B is correct.",
        weak_area="Example concept",
    )

    assert (
        question.correct_option_indices
        == [1]
    )


def test_single_choice_rejects_multiple_correct_answers():
    with pytest.raises(
        ValueError
    ):
        ReviewQuestionDraft(
            kind="single_choice",
            prompt="Question",
            options=[
                "A",
                "B",
                "C",
            ],
            correct_option_indices=[
                0,
                1,
            ],
            explanation="Explanation",
            weak_area="Concept",
        )


def test_multiple_select_requires_multiple_answers():
    with pytest.raises(
        ValueError
    ):
        ReviewQuestionDraft(
            kind="multiple_select",
            prompt="Question",
            options=[
                "A",
                "B",
                "C",
            ],
            correct_option_indices=[
                0,
            ],
            explanation="Explanation",
            weak_area="Concept",
        )


def test_true_false_requires_two_options():
    with pytest.raises(
        ValueError
    ):
        ReviewQuestionDraft(
            kind="true_false",
            prompt="Question",
            options=[
                "True",
                "False",
                "Maybe",
            ],
            correct_option_indices=[
                0,
            ],
            explanation="Explanation",
            weak_area="Concept",
        )


def test_answer_index_must_exist():
    with pytest.raises(
        ValueError
    ):
        ReviewQuestionDraft(
            kind="single_choice",
            prompt="Question",
            options=[
                "A",
                "B",
            ],
            correct_option_indices=[
                5,
            ],
            explanation="Explanation",
            weak_area="Concept",
        )