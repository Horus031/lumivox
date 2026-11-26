import pytest

from app.core.rag_token_budget import count_text_tokens
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.services.rag_retrieval_context import build_retrieval_query


HISTORY = [RagCompletedTurn(
    turn_index=1, question="Explain binary search.", answer="Binary search uses sorted data.",
)]


def test_first_turn_retrieves_the_original_question():
    result = build_retrieval_query("Explain binary search.", [])
    assert result.text == "Explain binary search."
    assert result.strategy == "current_question"


@pytest.mark.parametrize("question", ["Why is it efficient?", "Vậy nó có ưu điểm gì?"])
def test_follow_up_includes_the_latest_topic(question):
    result = build_retrieval_query(question, HISTORY)
    assert result.strategy == "history_augmented"
    assert question in result.text
    assert HISTORY[0].question in result.text
    assert HISTORY[0].answer in result.text


@pytest.mark.parametrize("question", [
    "New topic: why Docker?",
    "Đổi chủ đề: tại sao dùng Docker?",
    "Explain several common architectural principles for deploying a distributed service.",
])
def test_topic_switch_and_standalone_question_retrieve_without_history(question):
    result = build_retrieval_query(question, HISTORY)
    assert result.strategy == "current_question"
    assert result.text == question


def test_augmented_query_bounds_history_without_shortening_the_question():
    latest = RagCompletedTurn(turn_index=2, question="sort " * 300, answer="merge " * 400)
    question = "How about its complexity?"
    result = build_retrieval_query(question, [latest, *HISTORY])
    assert result.text.startswith(f"Current question:\n{question}\n")
    assert "Explain binary search." not in result.text
    assert count_text_tokens(result.text) < count_text_tokens(question) + 270


def test_summary_adds_only_bounded_topic_and_last_three_concepts(stored_summary):
    summary = stored_summary.summary.model_copy(update={
        "covered_concepts": ["unused concept", "Complexity", "Sorted arrays", "Boundary " * 300],
    })
    result = build_retrieval_query("Why is it efficient?", HISTORY,
                                  stored_summary.model_copy(update={"summary": summary}))
    assert result.strategy == "history_augmented"
    topic = result.text.split("Earlier study topic:\n")[1]
    assert "Binary search invariants" in topic and "Sorted arrays" in topic
    assert "unused concept" not in topic and "historical-notes.pdf" not in topic
    assert count_text_tokens(topic) <= 100


def test_explicit_topic_change_excludes_summary(stored_summary):
    question = "Đổi chủ đề: tại sao nên học đại số?"
    result = build_retrieval_query(question, HISTORY, stored_summary)
    assert result.strategy == "current_question"
    assert result.text == question
