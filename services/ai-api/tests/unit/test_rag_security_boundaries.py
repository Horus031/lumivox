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
from app.security.rag_dispatch import rag_dispatch_authorization
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
