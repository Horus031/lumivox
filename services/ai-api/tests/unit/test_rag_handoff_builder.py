import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.clients.rag_llm_client import RagLLMError, RagTokenUsage
from app.clients.rag_summary_client import RagSummaryGeneration
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.security.rag_dispatch import rag_dispatch_authorization
from app.services import rag_handoff_builder as builder
from app.services.rag_conversation_store import RagConversationError
from app.services.rag_summary_builder import serialize_summary, summary_token_count


def turns(count, start=1):
    return [RagCompletedTurn(turn_index=i, question=f"Ví dụ {i}?", answer=f"Example {i}.")
            for i in range(start, start + count)]


@pytest.fixture
def provider(monkeypatch, stored_summary):
    generate = Mock(return_value=RagSummaryGeneration(
        summary=stored_summary.summary, provider="groq", model="openai/gpt-oss-20b",
        usage=RagTokenUsage(400, 100, 500), latency_ms=10,
    ))
    monkeypatch.setattr(builder, "generate_rag_summary", generate)
    monkeypatch.setattr(builder.settings, "rag_summary_max_batch_turns", 8)
    with rag_dispatch_authorization(Mock()):
        yield generate


@pytest.mark.parametrize(("count", "rolling", "expected_calls"), [(3, False, 1), (6, True, 1), (24, False, 3)])
def test_all_uncovered_turns_are_processed_in_bounded_batches(provider, stored_summary, count, rolling, expected_calls):
    start = 19 if rolling else 1
    result = builder.build_final_handoff(
        inherited=None, rolling=stored_summary.summary if rolling else None, turns=turns(count, start),
    )
    indexes = []
    deadlines = []
    for call in provider.call_args_list:
        payload = json.loads(call.args[0][1]["content"].split("\n", 1)[1])
        assert len(payload["completed_turns"]) <= 8
        if rolling:
            assert payload["previous_summary"]["main_topic"] == stored_summary.summary.main_topic
        indexes.extend(pair["turn_index"] for pair in payload["completed_turns"])
        deadlines.append(call.kwargs["deadline_at"])
    assert indexes == list(range(start, start + count))
    assert len(deadlines) == expected_calls and len(set(deadlines)) == 1
    assert result.total_tokens == 500 * expected_calls
    assert result.generation_method == "llm"


def test_only_inherited_context_and_seed_priority(provider, stored_summary):
    inherited = stored_summary.summary.model_copy(update={"main_topic": "Old topic"})
    result = builder.build_final_handoff(inherited=inherited, rolling=None, turns=[])
    assert result.summary.main_topic == "Old topic"
    provider.assert_not_called()
    merged = builder.merge_summary_seeds(inherited, stored_summary.summary)
    assert merged.main_topic == stored_summary.summary.main_topic
    assert "different study topic" in " ".join(merged.uncertainties)


@pytest.mark.parametrize("deadline_exhausted", [True, False])
def test_remaining_batches_use_extractive_after_failure_or_deadline(monkeypatch, provider, deadline_exhausted):
    if deadline_exhausted:
        clock = Mock(side_effect=[10, 25, 25, 25, 25])
        monkeypatch.setattr(builder, "time", SimpleNamespace(monotonic=clock))
    else:
        provider.side_effect = RagLLMError(code="rate_limit", retryable=True)
    result = builder.build_final_handoff(inherited=None, rolling=None, turns=turns(24))
    assert result.generation_method == "extractive"
    assert "Ví dụ 24?" in serialize_summary(result.summary)
    assert provider.call_count == (0 if deadline_exhausted else 1)


def test_budget_filters_secret_but_preserves_unicode(provider, stored_summary):
    inherited = stored_summary.summary.model_copy(update={
        "document_references": ["dài " * 400] * 12,
        "important_user_context": ["api_key=synthetic-key"],
    })
    result = builder.build_final_handoff(inherited=inherited, rolling=None, turns=[])
    text = serialize_summary(result.summary)
    assert "synthetic-key" not in text
    assert "Hiểu vì sao cần sắp xếp" in text
    assert summary_token_count(result.summary) == result.token_count <= 500
    assert json.loads(text)["main_topic"] == inherited.main_topic
    provider.assert_not_called()


def test_empty_handoff_is_rejected(provider):
    with pytest.raises(RagConversationError, match="RAG_HANDOFF_EMPTY_CONTEXT"):
        builder.build_final_handoff(inherited=None, rolling=None, turns=[])
    provider.assert_not_called()


def test_adaptive_handoff_fallback_retains_exact_worked_exercise_without_extra_calls(monkeypatch, provider):
    monkeypatch.setattr(builder.settings, "rag_context_quality_enabled", True)
    provider.side_effect = RagLLMError(code="provider_busy", retryable=False)
    exercise = RagCompletedTurn(turn_index=1, question="Sort [8, 3, 5].", answer="Final result: [3, 5, 8]")
    result = builder.build_final_handoff(inherited=None, rolling=None, turns=[exercise])
    assert result.generation_method == "extractive"
    assert "[8, 3, 5]" in result.summary.continuation_hint and "[3, 5, 8]" in result.summary.continuation_hint
    assert result.token_count <= 500
    provider.assert_called_once()
