from unittest.mock import Mock
from types import SimpleNamespace

import pytest

from app.clients.rag_llm_client import generate_rag_chat
from app.clients.rag_summary_client import generate_rag_summary
from app.core import rag_deadline
from app.core.rag_deadline import RagDeadline, RagDeadlineExceeded
from app.core.rag_execution_context import RagExecutionContext
from app.security.rag_dispatch import RagDispatchAuthorizationError, rag_dispatch_authorization
from app.services import rag_chat_service, rag_provider_execution
from app.services.rag_conversation_store import RagConversationError, assert_turn_authorized
from app.services.rag_provider_budget import RagProviderPermit


@pytest.mark.parametrize("code", ["RAG_DOCUMENT_ACCESS_DENIED", "RAG_MEMORY_QUARANTINED", "RAG_PERSISTENCE_UNAVAILABLE"])
def test_denial_after_permit_acquire_releases_it_without_counting_dispatch(monkeypatch, code):
    client = Mock()
    permit = RagProviderPermit("test", "permit")
    release = Mock()
    monkeypatch.setattr(rag_provider_execution, "acquire_provider_permit", Mock(return_value=("acquired", permit)))
    monkeypatch.setattr(rag_provider_execution, "release_provider_permit", release)
    execution = RagExecutionContext(RagDeadline.start(5), 4)
    with rag_dispatch_authorization(Mock(side_effect=RagConversationError(code, 409))), pytest.raises(RagConversationError):
        rag_provider_execution.execute_rag_provider_call(
            client=client, request_options={"model": "synthetic", "timeout": 3}, stage="answer",
            context=execution, deadline=execution.deadline, estimated_prompt_tokens=0,
            classify_error=lambda _: ("unexpected", False), parse_response=lambda value: value,
        )
    client.chat.completions.create.assert_not_called()
    release.assert_called_once()
    assert execution.attempts == []


def test_embedding_checks_lease_and_zero_dispatch_on_denial(monkeypatch):
    client = Mock()
    monkeypatch.setattr(rag_chat_service, "get_gemini_client", lambda: client)
    with rag_dispatch_authorization(Mock(side_effect=RagConversationError("RAG_INVALID_LEASE", 409))):
        with pytest.raises(RagConversationError, match="RAG_INVALID_LEASE"):
            rag_chat_service._generate_query_embedding("Study fixture")
    client.models.embed_content.assert_not_called()


def test_deadline_expiring_during_authorization_releases_permit_without_dispatch(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(rag_deadline, "time", SimpleNamespace(monotonic=lambda: now[0]))
    permit = RagProviderPermit("test", "permit")
    release = Mock()
    monkeypatch.setattr(rag_provider_execution, "acquire_provider_permit", Mock(return_value=("acquired", permit)))
    monkeypatch.setattr(rag_provider_execution, "release_provider_permit", release)
    client, execution = Mock(), RagExecutionContext(RagDeadline.start(1), 4)

    def authorize():
        now[0] = 2.0

    with rag_dispatch_authorization(authorize), pytest.raises(RagDeadlineExceeded):
        rag_provider_execution.execute_rag_provider_call(
            client=client, request_options={"model": "synthetic", "timeout": 3}, stage="answer",
            context=execution, deadline=execution.deadline, estimated_prompt_tokens=0,
            classify_error=lambda _: ("unexpected", False), parse_response=lambda value: value,
        )
    client.chat.completions.create.assert_not_called()
    release.assert_called_once()
    assert execution.attempts == []


def test_missing_authorization_result_fails_closed():
    supabase = Mock()
    supabase.rpc.return_value.execute.return_value.data = None
    with pytest.raises(RagConversationError, match="RAG_PERSISTENCE_UNAVAILABLE"):
        assert_turn_authorized(supabase, user_id="owner", session_id="session", turn_id="turn", lease_token="lease")


@pytest.mark.parametrize("dispatch", [
    lambda: generate_rag_chat([{"role": "user", "content": "Synthetic"}]),
    lambda: generate_rag_summary([{"role": "user", "content": "Synthetic"}]),
    lambda: rag_chat_service._generate_query_embedding("Synthetic"),
])
def test_low_level_rag_clients_require_authorization_even_with_accounting_disabled(monkeypatch, dispatch):
    from app.core.config import settings

    for name in ("rag_observability_enabled", "rag_durable_accounting_enabled", "rag_provider_throughput_enabled"):
        monkeypatch.setattr(settings, name, False)
    with pytest.raises(RagDispatchAuthorizationError):
        dispatch()
