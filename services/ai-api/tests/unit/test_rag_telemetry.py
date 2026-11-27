import json

import pytest

from app.core import rag_telemetry as telemetry
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext, RagProviderAttempt
from app.services.rag_conversation_store import RagConversationError


def test_repeated_stages_and_safe_terminal_event(monkeypatch, caplog):
    monkeypatch.setattr(telemetry.settings, "rag_observability_enabled", True)

    @telemetry.observe_operation
    def ask(**kwargs):
        for _ in range(2):
            with telemetry.measure_stage("provider_admission"):
                pass
        telemetry.record_outcome("replayed")
        return "private answer"

    with caplog.at_level("INFO", logger=telemetry.__name__):
        assert ask(question="private question", selected_document_ids=["private scope"]) == "private answer"
    assert len(caplog.records) == 1
    event = json.loads(caplog.records[0].getMessage())
    assert "private" not in caplog.text
    assert event["stages"]["provider_admission"]["count"] == 2
    assert event["outcome"] == "replayed" and event["provider_calls"] == 0
    assert event["accounting_state"] == "not_applicable"
    assert "embedding" not in event["stages"]
    assert telemetry.current_telemetry() is None


def test_logging_failure_preserves_unknown_original_error(monkeypatch):
    monkeypatch.setattr(telemetry.settings, "rag_observability_enabled", True)
    error = RagConversationError("RAG_TURN_OUTCOME_UNKNOWN", 503, outcome="unknown")

    def logging_failure(*_):
        raise RuntimeError("Log destination unavailable")

    monkeypatch.setattr(telemetry.logger, "info", logging_failure)

    @telemetry.observe_operation
    def raise_original():
        raise error

    with pytest.raises(RagConversationError) as caught:
        raise_original()
    assert caught.value is error


def test_unknown_usage_and_ledger_states():
    operation = telemetry.RagOperationTelemetry("ask", True)
    execution = RagExecutionContext(RagDeadline.start(5), 4)
    operation.execution = execution
    execution.attempts = [RagProviderAttempt("embedding", "google", "gemini"),
                          RagProviderAttempt("answer", "groq", "openai/gpt-oss-120b", total_tokens=200)]
    execution.ledger = object()
    result = operation.snapshot()
    assert result["known_provider_tokens"] == 200
    assert result["unknown_usage_attempts"] == 1
    assert result["accounting_state"] == "partial_usage" and result["fallback_used"]
    execution.ledger_unconfirmed = True
    assert operation.snapshot()["accounting_state"] == "interrupted"
