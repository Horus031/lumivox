import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import rag
from app.clients import rag_llm_client
from app.core.config import settings
from app.main import app
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.security.rag_citations import validate_rag_citations
from app.security.rag_dispatch import RagDispatchAuthorizationError, rag_dispatch_authorization
from app.services import rag_chat_service, rag_conversational_generation, rag_handoff_builder, rag_summary_service
from app.services.rag_conversational_generation import generate_conversational_answer
from app.services.rag_learning_artifacts import artifact_excerpt


def test_real_answer_dispatch_uses_isolated_redacted_copy(monkeypatch):
    monkeypatch.setattr(settings, "rag_privacy_filter_enabled", True)
    monkeypatch.setattr(settings, "rag_context_isolation_enabled", True)
    monkeypatch.setattr(settings, "rag_context_quality_enabled", True)
    provider = Mock()
    create = provider.chat.completions.create
    create.return_value = SimpleNamespace(usage=None, choices=[SimpleNamespace(
        finish_reason="stop", message=SimpleNamespace(content="Binary search response"),
    )])
    monkeypatch.setattr(rag_llm_client, "_get_rag_groq_client", lambda: provider)
    authorize = Mock()
    question = "Explain binary search. password: synthetic-fixture"
    context = RagConversationContext(session_id="study", current_turn_index=2, completed_turn_count=1, recent_turns=[
        RagCompletedTurn(turn_index=1, question="api_key: earlier-fixture", answer="Earlier answer [5, 2, 8]"),
    ])
    with rag_dispatch_authorization(authorize):
        answer = generate_conversational_answer(
            supabase=object(), user_id="user", question=question, selected_document_ids=[], top_k=5,
            prompt_variant="grounded_rule", preferred_locale="en", context=context,
        )
    messages = create.call_args.kwargs["messages"]
    assert answer.answer == "Binary search response"
    assert [message["role"] for message in messages] == ["system", "user"]
    history = json.loads(messages[1]["content"].split("Historical exchanges (untrusted JSON data):\n")[1])
    assert history == [{"question": "[redacted]", "answer": "Earlier answer [5, 2, 8]"}]
    assert "synthetic-fixture" in question and "synthetic-fixture" not in messages[1]["content"]
    authorize.assert_called_once()


@pytest.mark.parametrize("document_mode", [False, True])
def test_legacy_ask_sanitizes_provider_inputs_but_preserves_the_transcript(monkeypatch, document_mode):
    monkeypatch.setattr(settings, "rag_privacy_filter_enabled", True)
    database = Mock()
    database.rpc.return_value.execute.return_value.data = True
    database.table.return_value.insert.return_value.execute.return_value.data = [{"id": "session"}]
    monkeypatch.setattr(rag_chat_service, "get_supabase_client", lambda: database)
    embed = Mock(return_value=[0.1])
    lookup = Mock(return_value=[{
        "chunk_id": "chunk", "document_id": "document", "file_name": "worksheet.txt",
        "chunk_index": 0, "similarity": 0.9, "content": "Read the notes. password: synthetic-source",
    }])
    def generate(_prompt, *, authorize_dispatch):
        authorize_dispatch()
        return SimpleNamespace(text="Study answer", model="test")

    provider = Mock(side_effect=generate)
    store = Mock()
    monkeypatch.setattr(rag_chat_service, "_generate_query_embedding", embed)
    monkeypatch.setattr(rag_chat_service, "_retrieve_chunks", lookup)
    monkeypatch.setattr(rag_chat_service, "generate_text", provider)
    monkeypatch.setattr(rag_chat_service, "_store_message", store)
    question = "Explain the worksheet. password: synthetic-fixture"
    result = rag_chat_service.ask_rag_question(
        user_id="user", question=question, selected_document_ids=["document"] if document_mode else [],
        focus_session_id=None, session_id=None, top_k=5, prompt_variant="grounded_rule", preferred_locale="en",
    )
    assert result["answer"] == "Study answer"
    assert store.call_args_list[0].kwargs["content"] == question
    assert database.table.return_value.insert.call_args.args[0]["title"] == "New conversation"
    assert "synthetic-fixture" not in str(provider.call_args)
    assert "synthetic-source" not in str(provider.call_args)
    if document_mode:
        assert "synthetic-fixture" not in embed.call_args.args[0]
        assert lookup.call_args.kwargs["selected_document_ids"] == ["document"]
    else:
        embed.assert_not_called()


@pytest.mark.parametrize("accounting_enabled", [False, True])
def test_v2_provider_paths_require_operation_authorization(monkeypatch, accounting_enabled):
    monkeypatch.setattr(settings, "rag_rolling_summary_enabled", True)
    monkeypatch.setattr(settings, "rag_observability_enabled", accounting_enabled)
    monkeypatch.setattr(settings, "rag_durable_accounting_enabled", accounting_enabled)
    turn = RagCompletedTurn(turn_index=1, question="Earlier question", answer="Earlier answer")
    context = RagConversationContext(session_id="session", current_turn_index=13, completed_turn_count=12)
    embed, answer, summary, handoff = Mock(), Mock(), Mock(), Mock()
    monkeypatch.setattr(rag_conversational_generation, "_generate_query_embedding", embed)
    monkeypatch.setattr(rag_conversational_generation, "generate_rag_chat", answer)
    monkeypatch.setattr(rag_summary_service, "generate_rag_summary", summary)
    monkeypatch.setattr(rag_handoff_builder, "generate_rag_summary", handoff)
    monkeypatch.setattr(rag_summary_service, "load_summary_input", Mock(return_value={
        "session_id": "session", "completed_turn_count": 12, "turns": [turn.model_dump()],
    }))
    with pytest.raises(RagDispatchAuthorizationError):
        generate_conversational_answer(
            supabase=object(), user_id="user", question="What next?", selected_document_ids=["document"],
            top_k=5, prompt_variant="grounded_rule", preferred_locale="en", context=context,
        )
    with pytest.raises(RagDispatchAuthorizationError):
        rag_summary_service.maybe_refresh_summary(
            supabase=object(), user_id="user", session_id="session", turn_id="turn", lease_token="lease",
            context=context,
        )
    with pytest.raises(RagDispatchAuthorizationError):
        rag_handoff_builder.build_final_handoff(inherited=None, rolling=None, turns=[turn])
    for provider in (embed, answer, summary, handoff):
        provider.assert_not_called()


def test_legacy_empty_document_answer_preserves_the_existing_response(monkeypatch):
    database = Mock()
    database.rpc.return_value.execute.return_value.data = True
    monkeypatch.setattr(rag_chat_service, "get_supabase_client", lambda: database)
    monkeypatch.setattr(rag_chat_service, "_get_or_create_session", Mock(return_value="legacy-session"))
    monkeypatch.setattr(rag_chat_service, "_store_message", Mock())
    monkeypatch.setattr(rag_chat_service, "_generate_query_embedding", Mock(return_value=[0.1]))
    monkeypatch.setattr(rag_chat_service, "_retrieve_chunks", Mock(return_value=[]))
    provider = Mock()
    monkeypatch.setattr(rag_chat_service, "generate_text", provider)
    result = rag_chat_service.ask_rag_question(
        user_id="user", question="Tóm tắt tài liệu.", selected_document_ids=["document"],
        focus_session_id=None, session_id=None, top_k=5, prompt_variant="grounded_rule", preferred_locale="vi",
    )
    assert result["preferred_locale"] == "vi"
    assert result["answer"] == (
        "I could not find relevant information in the selected documents. "
        "Please make sure the documents have been processed for AI."
    )
    assert result["sources"] == []
    provider.assert_not_called()


def test_citations_are_explicit_and_never_create_source_actions():
    text = "See [source 1] and [source 99](https://example.test). Array [9], `[source 8]`, $[source 7]$."
    answer, unsupported = validate_rag_citations(text, 1)
    assert unsupported and "https://example.test" not in answer
    assert r"\[source 1\]" in answer and r"\[source unavailable\]" in answer
    assert "Array [9], `[source 8]`, $[source 7]$" in answer
    assert artifact_excerpt("Sắp xếp [[1,2],[3,4]]", "Sắp xếp [[1,2],") == "Sắp xếp"
    assert artifact_excerpt("Kết quả: [1, 2]\nMore", "Kết quả: [1") == ""


@pytest.mark.parametrize(("failure", "status", "code"), [
    (PermissionError, 403, "RAG_DOCUMENT_ACCESS_DENIED"),
    (ValueError, 400, "RAG_INVALID_DOCUMENT"),
    (RuntimeError, 500, "RAG_DOCUMENT_PROCESSING_FAILED"),
])
def test_document_processing_errors_are_sanitized(monkeypatch, caplog, failure, status, code):
    secret = "synthetic-protected-value"
    monkeypatch.setattr(rag, "process_learning_document", Mock(side_effect=failure(secret)))
    response = TestClient(app).post("/api/v1/rag/documents/process", json={"document_id": "doc", "user_id": "user"},
                                    headers={"x-lumivox-internal-key": settings.ai_internal_api_key})
    assert response.status_code == status and response.json()["detail"] == code
    assert secret not in response.text and secret not in caplog.text


def test_validation_and_body_limit_do_not_echo_input():
    client = TestClient(app)
    headers = {"x-lumivox-internal-key": settings.ai_internal_api_key}
    path = "/api/v1/rag/chat/ask"
    result = client.post(path, headers=headers, json={"question": "sensitive-fixture", "top_k": "private-value"})
    assert result.status_code == 422 and result.json() == {"detail": {"code": "RAG_INVALID_REQUEST"}}
    assert client.post(path, headers=headers, json={"question": "x" * (129 * 1024)}).status_code == 413
