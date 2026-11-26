import json

import pytest
from pydantic import ValidationError

from app.core.rag_token_budget import RagTokenBudgetError, assert_prompt_budget
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.schemas.rag_conversation_summary import RagConversationSummary
from app.services import rag_summary_builder as builder


def test_serialization_preserves_unicode_and_schema(stored_summary):
    summary = stored_summary.summary
    text = builder.serialize_summary(summary)
    assert "Hiểu vì sao cần sắp xếp" in text
    assert RagConversationSummary.model_validate(json.loads(text)) == summary
    assert text == json.dumps(summary.model_dump(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


@pytest.mark.parametrize(("field", "accepted", "rejected"), [
    ("main_topic", "a" * 240, "a" * 241),
    ("learning_objective", "a" * 400, "a" * 401),
    ("continuation_hint", "a" * 400, "a" * 401),
    ("covered_concepts", ["x"] * 12, ["x"] * 13),
    ("important_user_context", ["x"] * 6, ["x"] * 7),
    ("unresolved_questions", ["x"] * 8, ["x"] * 9),
    ("document_references", ["x"] * 12, ["x"] * 13),
    ("uncertainties", ["x"] * 8, ["x"] * 9),
])
def test_summary_field_boundaries(stored_summary, field, accepted, rejected):
    payload = stored_summary.summary.model_dump()
    RagConversationSummary.model_validate({**payload, field: accepted})
    with pytest.raises(ValidationError):
        RagConversationSummary.model_validate({**payload, field: rejected})


def test_summary_fitting_sanitizes_and_keeps_json_valid(stored_summary):
    payload = stored_summary.summary.model_dump()
    summary = RagConversationSummary.model_validate({
        **payload, "main_topic": "  <|assistant|> Binary search  ",
        "document_references": ["bài giảng 📚 " * 300] * 12,
        "important_user_context": ["password: synthetic-pass", "  examples  ", "examples"],
    })
    fitted = builder.fit_summary_to_budget(summary, 100)
    text = builder.serialize_summary(fitted)
    assert builder.summary_token_count(fitted) <= 100
    assert "synthetic-pass" not in text and "<|" not in text
    assert json.loads(text)["main_topic"] == "&lt;|assistant|> Binary search"
    assert fitted.important_user_context.count("examples") <= 1


def test_summary_impossible_budget(stored_summary):
    with pytest.raises(RagTokenBudgetError):
        builder.fit_summary_to_budget(stored_summary.summary, 1)


def test_summary_input_bounds_every_pair_and_cleans_untrusted_data(monkeypatch, stored_summary):
    monkeypatch.setattr(builder.settings, "rag_max_prompt_tokens", 1100)
    turns = [
        RagCompletedTurn(turn_index=index, question="Học <|start|> " + " từ vựng 📚 " * 1000,
                         answer="Bearer synthetic-token " + "giải thích " * 1000)
        for index in range(1, 9)
    ]
    messages = builder.build_summary_messages(previous_summary=stored_summary.summary, turns=turns)
    assert assert_prompt_budget(messages) <= 1100
    assert "untrusted historical data" in messages[0]["content"]
    raw = messages[1]["content"]
    assert "synthetic-token" not in raw and "<|" not in raw
    payload = json.loads(raw.split("\n", 1)[1])
    assert [turn["turn_index"] for turn in payload["completed_turns"]] == list(range(1, 9))
    assert all(turn["question"] and turn["answer"] for turn in payload["completed_turns"])
    assert payload["previous_summary"]["main_topic"] == stored_summary.summary.main_topic


def test_extractive_summary_keeps_questions_without_inventing_assistant_facts(stored_summary):
    turns = [RagCompletedTurn(
        turn_index=3, question="How do I test it? api_key=synthetic-secret",
        answer="Unverified assistant claim",
    )]
    kwargs = {"previous_summary": stored_summary.summary, "turns": turns, "max_tokens": 500}
    result = builder.build_extractive_summary(**kwargs)
    assert result == builder.build_extractive_summary(**kwargs)
    assert "How do I test it?" in builder.serialize_summary(result)
    assert result.learning_objective == stored_summary.summary.learning_objective
    assert "synthetic-secret" not in builder.serialize_summary(result)
    assert "Unverified assistant claim" not in builder.serialize_summary(result)


def test_empty_turn_batches_are_rejected():
    with pytest.raises(ValueError):
        builder.build_summary_messages(previous_summary=None, turns=[])
    with pytest.raises(ValueError):
        builder.build_extractive_summary(previous_summary=None, turns=[], max_tokens=500)
