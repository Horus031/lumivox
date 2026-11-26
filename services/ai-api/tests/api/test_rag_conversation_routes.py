from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import rag
from app.core.config import settings
from app.main import app


client = TestClient(app)
ASK_URL = "/api/v1/rag/chat/ask"
REQUEST = {
    "user_id": "11111111-1111-4111-8111-111111111111",
    "question": "Explain binary search",
    "focus_session_id": "22222222-2222-4222-8222-222222222222",
}
REQUEST_ID = "33333333-3333-4333-8333-333333333333"
ANSWER = {
    "session_id": "44444444-4444-4444-8444-444444444444",
    "answer": "A binary search halves the search interval.",
    "sources": [],
    "prompt_variant": "grounded_rule",
    "context_mode": "general",
    "selected_document_ids": [],
    "top_k": 5,
    "latency_ms": 10,
}


@pytest.fixture
def routes(monkeypatch):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", True)
    legacy = Mock(return_value=ANSWER)
    conversation = Mock(return_value={**ANSWER, "completed_turn_count": 1})
    monkeypatch.setattr(rag, "ask_rag_question", legacy)
    monkeypatch.setattr(rag, "ask_rag_conversation_question", conversation)
    return legacy, conversation


def post(payload):
    return client.post(
        ASK_URL,
        json=payload,
        headers={"x-lumivox-internal-key": settings.ai_internal_api_key},
    )


def test_flag_disabled_preserves_legacy_request_without_client_id(routes, monkeypatch):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", False)
    legacy, conversation = routes

    response = post(REQUEST)

    assert response.status_code == 200
    assert response.json()["answer"] == ANSWER["answer"]
    assert response.json()["completed_turn_count"] is None
    legacy.assert_called_once()
    conversation.assert_not_called()


def test_flag_enabled_requires_request_id(routes):
    response = post(REQUEST)

    assert response.status_code == 400
    assert response.json() == {"detail": "RAG_REQUEST_ID_REQUIRED"}
    for service in routes:
        service.assert_not_called()


def test_valid_request_id_reaches_v2_service(routes):
    legacy, conversation = routes
    response = post({**REQUEST, "client_request_id": REQUEST_ID})

    assert response.status_code == 200
    assert response.json()["completed_turn_count"] == 1
    assert conversation.call_args.kwargs["client_request_id"] == REQUEST_ID
    legacy.assert_not_called()


@pytest.mark.parametrize(
    ("invalid_fields", "status"),
    [
        ({"user_id": "invalid"}, 400),
        ({"focus_session_id": "invalid"}, 400),
        ({"session_id": "invalid"}, 400),
        ({"selected_document_ids": ["invalid"]}, 400),
        ({"client_request_id": "invalid"}, 422),
    ],
)
def test_flag_enabled_rejects_invalid_uuids(routes, invalid_fields, status):
    response = post({**REQUEST, "client_request_id": REQUEST_ID, **invalid_fields})

    assert response.status_code == status
    if status == 400:
        assert response.json() == {"detail": "RAG_INVALID_REQUEST"}
    for service in routes:
        service.assert_not_called()


@pytest.mark.parametrize("enabled", [False, True])
def test_raw_provider_errors_never_reach_client(routes, monkeypatch, enabled):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", enabled)
    service = routes[int(enabled)]
    service.side_effect = RuntimeError("private provider diagnostic")

    response = post({**REQUEST, "client_request_id": REQUEST_ID})

    assert response.status_code == 500
    assert response.json() == {"detail": "RAG_INTERNAL_ERROR"}
    service.assert_called_once()
