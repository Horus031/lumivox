from types import SimpleNamespace
from unittest.mock import Mock
from time import sleep

import pytest

from app.core.config import settings
from app.core.rag_deadline import RagDeadline, RagDeadlineExceeded
from app.core.rag_execution_context import RagExecutionContext, RagLedgerUnavailable
from app.security.rag_dispatch import rag_dispatch_authorization
from app.services import rag_provider_execution as service
from app.services.rag_conversation_store import RagConversationError


@pytest.fixture
def execution(monkeypatch):
    monkeypatch.setattr(settings, "rag_durable_accounting_enabled", True)
    monkeypatch.setattr(settings, "rag_provider_throughput_enabled", False)
    monkeypatch.setattr(service, "acquire_provider_permit", Mock(return_value=("acquired", object())))
    monkeypatch.setattr(service, "release_provider_permit", Mock())
    context = RagExecutionContext(RagDeadline.start(4), 4)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=Mock(return_value="answer"))))
    return context, client


def dispatch(execution):
    context, client = execution
    return service.execute_rag_provider_call(
        client=client, stage="answer", context=context, deadline=context.deadline,
        request_options={"model": "openai/gpt-oss-20b", "timeout": 2, "max_completion_tokens": 1200},
        estimated_prompt_tokens=101, classify_error=lambda _: ("provider_unavailable", False),
        parse_response=lambda result: result,
    )


def test_missing_and_replayed_intents_cannot_dispatch(execution):
    context, client = execution
    with rag_dispatch_authorization(Mock()):
        with pytest.raises(RagLedgerUnavailable):
            dispatch(execution)
        context.ledger = Mock()
        context.ledger.begin.return_value = False
        with pytest.raises(RagLedgerUnavailable):
            dispatch(execution)
    assert not context.attempts
    client.chat.completions.create.assert_not_called()
    assert context.ledger_unconfirmed


def test_lease_is_revalidated_after_intent(execution):
    context, client = execution
    context.ledger = Mock()
    authorize = Mock(side_effect=[None, RagConversationError("RAG_INVALID_LEASE", 409)])
    with rag_dispatch_authorization(authorize), pytest.raises(RagConversationError):
        dispatch(execution)
    assert authorize.call_count == 2
    assert context.ledger.finish.call_args.args[1].error_code == "dispatch_cancelled"
    assert not context.attempts
    client.chat.completions.create.assert_not_called()


def test_valid_response_survives_finish_failure_without_retry(execution):
    context, client = execution
    context.ledger = Mock()
    context.ledger.finish.side_effect = RuntimeError("transport error")
    with rag_dispatch_authorization(Mock()):
        assert dispatch(execution) == "answer"
    assert context.ledger_unconfirmed
    assert context.attempts[0].outcome == "success"
    assert context.ledger.finish.call_args.args[0] == context.ledger.begin.call_args.args[0]
    client.chat.completions.create.assert_called_once()


def test_expired_deadline_after_ledger_begin_prevents_dispatch(execution):
    context, client = execution
    context.deadline = RagDeadline.start(0.2)
    context.ledger = Mock()

    def begin(*_):
        sleep(0.21)
        return True

    context.ledger.begin.side_effect = begin
    with rag_dispatch_authorization(Mock()), pytest.raises(RagDeadlineExceeded):
        dispatch(execution)
    assert not context.attempts
    client.chat.completions.create.assert_not_called()
