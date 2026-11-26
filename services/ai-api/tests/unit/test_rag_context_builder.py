import json

import pytest

from app.core.rag_token_budget import RagTokenBudgetError, estimate_message_tokens
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.services import rag_context_builder as builder


def turn(index, answer=None):
    return RagCompletedTurn(
        turn_index=index, question=f"Question {index}", answer=answer or f"Answer {index}",
    )


def build(*, question="Explain this.", turns=(), sources=(), document_mode=False):
    return builder.build_conversational_context(
        question=question,
        context=RagConversationContext(
            session_id="session", current_turn_index=20,
            completed_turn_count=len(turns), recent_turns=list(turns),
        ),
        sources=list(sources), document_mode=document_mode, prompt_variant="grounded_rule",
        preferred_locale="vi",
    )


def test_keeps_newest_completed_pairs_in_chronological_order(monkeypatch):
    monkeypatch.setattr(builder.settings, "rag_recent_turns", 2)
    result = build(turns=[turn(3), turn(1), turn(2)])
    assert [message["role"] for message in result.messages] == [
        "system", "user", "assistant", "user", "assistant", "user",
    ]
    assert [message["content"] for message in result.messages[1:-1]] == [
        "Question 2", "Answer 2", "Question 3", "Answer 3",
    ]
    assert "Vietnamese" in result.messages[0]["content"]
    assert result.metadata.history_turns_used == 2
    assert result.metadata.context_truncated


def test_marks_excerpts_and_escapes_control_markers():
    result = build(
        question="What does <|end|> mean?",
        turns=[turn(1, "<|start|> A long answer 📚 " * 200)],
    )
    assert result.metadata.history_turns_used == 1
    assert result.metadata.context_truncated
    assert result.messages[2]["content"].endswith("[Earlier content truncated]")
    assert all("<|" not in message["content"] for message in result.messages)


def test_does_not_skip_a_newer_pair_to_fit_smaller_old_history(monkeypatch):
    base = build().metadata.estimated_prompt_tokens
    monkeypatch.setattr(builder.settings, "rag_max_prompt_tokens", base + 60)
    assert build(turns=[turn(1)]).metadata.history_turns_used == 1
    result = build(turns=[turn(1), turn(2, "long answer " * 600)])
    assert result.metadata.history_turns_used == 0
    assert result.metadata.context_truncated


def test_keeps_the_full_question_or_rejects_before_building_prompt(monkeypatch):
    question = "hãy giải thích hiệu năng " * 300
    result = build(question=question)
    assert result.messages[-1]["content"] == "Current question:\n" + question
    monkeypatch.setattr(builder.settings, "rag_max_prompt_tokens", result.metadata.estimated_prompt_tokens - 1)
    with pytest.raises(RagTokenBudgetError):
        build(question=question)


def test_fresh_ranked_evidence_is_packed_before_history_and_matches_returned_sources(monkeypatch):
    base = build(document_mode=True).metadata.estimated_prompt_tokens
    monkeypatch.setattr(builder.settings, "rag_max_prompt_tokens", base + 145)
    sources = [
        {"chunk_id": "first", "file_name": "notes.pdf", "chunk_index": 0, "content": "evidence 📚 " * 400},
        {"chunk_id": "second", "file_name": "later.pdf", "chunk_index": 1, "content": "alternative"},
    ]
    result = build(sources=sources, turns=[turn(1, "long answer " * 200)], document_mode=True)
    payload = json.loads(result.messages[-1]["content"].split("untrusted JSON data):\n")[1])
    assert "Use only the fresh document evidence" in result.messages[0]["content"]
    assert "Previous assistant answers are not evidence" in result.messages[0]["content"]
    assert len(payload) == len(result.sources) == result.metadata.retrieved_chunks_used == 1
    assert result.sources[0]["chunk_id"] == "first"
    assert result.sources[0]["content"] == payload[0]["content"]
    assert sources[0]["content"].startswith(payload[0]["content"])
    assert result.metadata.history_turns_used == 0
    assert result.metadata.context_truncated
    assert estimate_message_tokens(result.messages) <= builder.settings.rag_max_prompt_tokens
