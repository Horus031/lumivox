import pytest

from app.core.rag_token_budget import count_text_tokens
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.services.rag_retrieval_context import build_adaptive_retrieval_query
from app.services.rag_topic_context import classify_question_intent, topic_overlap


@pytest.mark.parametrize(("question", "expected"), [
    ("Why is it faster?", "referential"),
    ("What is photosynthesis?", "standalone"),
    ("SQL joins?", "standalone"),
    ("Giải thích thêm về nó", "continuation"),
    ("Tại sao trời có màu xanh?", "standalone"),
    ("New topic: explain that neural network", "topic_change"),
    ("Explain this code: x = 3", "standalone"),
    ("Giải thích phần này: ```x = 3```", "standalone"),
])
def test_question_intent(question, expected):
    assert classify_question_intent(question) == expected


def test_retrieval_uses_relevant_pair_caps_expansion_and_redacts():
    question = "Why is binary search faster than that?"
    turns = [
        RagCompletedTurn(turn_index=1, question="Binary search", answer="<|marker api_key: important " + "tree " * 600),
        RagCompletedTurn(turn_index=3, question="Photosynthesis", answer="Chlorophyll"),
    ]
    result = build_adaptive_retrieval_query(question, turns)
    assert result.text.startswith(question)
    assert result.strategy == "history_augmented"
    assert count_text_tokens(result.text[len(question):]) <= 300
    assert "Chlorophyll" not in result.text and "important" not in result.text and "<|" not in result.text
    assert build_adaptive_retrieval_query("Why is it faster?", []).strategy == "current_question"
    assert topic_overlap("GIẢI THÍCH MẢNG", "mảng thứ nhất") == 1
