from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.clients.rag_llm_client import RagLLMError, RagTokenUsage
from app.clients.rag_summary_client import RagSummaryGeneration
from app.schemas.rag_conversation_context import RagConversationContext
from app.security.rag_dispatch import rag_dispatch_authorization
from app.services import rag_summary_service as service


@pytest.fixture
def dependencies(monkeypatch, stored_summary):
    load = Mock()
    generate = Mock(return_value=RagSummaryGeneration(
        summary=stored_summary.summary, provider="groq", model=stored_summary.model_name,
        latency_ms=170, usage=RagTokenUsage(400, 200, 600),
    ))
    save = Mock(side_effect=lambda supabase, **kwargs: {
        "id": "saved-summary", "version": kwargs["expected_version"] + 1,
        "schema_version": 1, "covered_turn_index": kwargs["covered_turn_index"],
        "covered_turn_count": kwargs["covered_turn_index"],
        "summary": kwargs["summary"], "generation_method": kwargs["generation_method"],
        "model_name": kwargs["metadata"].get("model_name"), "token_count": kwargs["token_count"],
    })
    for name, mock in (
        ("load_summary_input", load), ("generate_rag_summary", generate),
        ("save_conversation_summary", save),
    ):
        monkeypatch.setattr(service, name, mock)
    monkeypatch.setattr(service.settings, "rag_rolling_summary_enabled", True)
    monkeypatch.setattr(service.settings, "rag_summary_start_turns", 6)
    monkeypatch.setattr(service.settings, "rag_summary_update_interval", 2)
    with rag_dispatch_authorization(Mock()):
        yield SimpleNamespace(load=load, generate=generate, save=save)


def snapshot(indexes, *, previous=None):
    return {
        "session_id": "session", "completed_turn_count": (max(indexes) if indexes else 2) + 4,
        "selected_document_ids": [],
        "previous_summary": previous.model_dump() if previous else None,
        "turns": [
            {"turn_index": index, "question": f"Question {index}?", "answer": "Unverified claim"}
            for index in indexes
        ],
    }


def refresh(count, summary=None):
    return service.maybe_refresh_summary(
        supabase=object(), user_id="owner", session_id="session", turn_id="current",
        lease_token="lease", context=RagConversationContext(
            session_id="session", current_turn_index=count + 1, completed_turn_count=count,
            summary=summary,
        ),
    )


def test_flag_disabled_ignores_existing_summary(monkeypatch, dependencies, stored_summary):
    monkeypatch.setattr(service.settings, "rag_rolling_summary_enabled", False)
    assert refresh(8, stored_summary).summary is None
    dependencies.load.assert_not_called()
    dependencies.generate.assert_not_called()
    dependencies.save.assert_not_called()


def test_five_completed_turns_does_not_refresh(dependencies):
    assert refresh(5).summary is None
    dependencies.load.assert_not_called()
    dependencies.generate.assert_not_called()
    dependencies.save.assert_not_called()


def test_six_completed_turns_summarizes_first_two_and_saves_provenance(dependencies):
    dependencies.load.return_value = snapshot([1, 2])
    result = refresh(6)
    saved = dependencies.save.call_args.kwargs
    assert result.summary.version == 1
    assert saved["expected_version"] == 0 and saved["covered_turn_index"] == 2
    assert saved["metadata"] == {
        "schema_version": 1, "batch_size": 8, "input_turn_count": 2, "provider": "groq",
        "model_name": "openai/gpt-oss-20b", "latency_ms": 170, "prompt_tokens": 400,
        "completion_tokens": 200, "total_tokens": 600,
    }


@pytest.mark.parametrize("pending", [[], [3]])
def test_current_summary_kept_until_two_new_eligible_turns(dependencies, stored_summary, pending):
    dependencies.load.return_value = snapshot(pending, previous=stored_summary)
    assert refresh(7, stored_summary).summary == stored_summary
    dependencies.generate.assert_not_called()
    dependencies.save.assert_not_called()


def test_incremental_update_uses_only_newly_eligible_turns(dependencies, stored_summary):
    dependencies.load.return_value = snapshot([3, 4], previous=stored_summary)
    result = refresh(8, stored_summary)
    saved = dependencies.save.call_args.kwargs
    assert result.summary.version == 2
    assert saved["expected_version"] == 1 and saved["covered_turn_index"] == 4
    messages = dependencies.generate.call_args.args[0]
    assert "Question 3?" in messages[1]["content"] and "Question 4?" in messages[1]["content"]
    assert "Question 1?" not in messages[1]["content"]
    assert stored_summary.summary.main_topic in messages[1]["content"]


@pytest.mark.parametrize("code", ["provider_unavailable", "incomplete_response"])
def test_provider_or_validation_failure_uses_only_extractive_summary(dependencies, code):
    dependencies.load.return_value = snapshot([1, 2])
    dependencies.generate.side_effect = RagLLMError(code=code, retryable=True)
    result = refresh(6)
    saved = dependencies.save.call_args.kwargs
    assert result.summary.generation_method == "extractive"
    assert "provider" not in saved["metadata"] and "model_name" not in saved["metadata"]
    assert result.summary.summary.unresolved_questions == ["Question 1?", "Question 2?"]
    assert "Unverified claim" not in result.summary.summary.model_dump_json()


def test_impossible_budget_keeps_persisted_summary(monkeypatch, dependencies, stored_summary):
    monkeypatch.setattr(service.settings, "rag_max_summary_tokens", 1)
    dependencies.load.return_value = snapshot([3, 4], previous=stored_summary)
    assert refresh(8, stored_summary).summary == stored_summary
    dependencies.save.assert_not_called()
