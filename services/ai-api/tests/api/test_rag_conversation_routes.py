from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import rag
from app.core.config import settings
from app.main import app
from app.services.rag_conversation_store import RagConversationError


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


def lifecycle_post(path, payload):
    return client.post(
        "/api/v1/rag/chat/" + path, json=payload,
        headers={"x-lumivox-internal-key": settings.ai_internal_api_key},
    )


RESTORE_PAYLOAD = {"user_id": REQUEST["user_id"], "focus_session_id": REQUEST["focus_session_id"]}
TRANSITION_PAYLOAD = {
    **RESTORE_PAYLOAD, "source_session_id": ANSWER["session_id"],
    "client_request_id": REQUEST_ID, "mode": "continue",
}


def test_new_chat_requires_internal_key():
    response = client.post("/api/v1/rag/chat/new", json=TRANSITION_PAYLOAD)
    assert response.status_code in (401, 403)


def test_new_chat_returns_stable_code_for_revision_conflict(monkeypatch):
    monkeypatch.setattr(rag, "start_new_conversation", Mock(
        side_effect=RagConversationError("RAG_HANDOFF_SOURCE_CHANGED", 409),
    ))
    response = lifecycle_post("new", TRANSITION_PAYLOAD)
    assert response.status_code == 409
    assert response.json() == {"detail": {"code": "RAG_HANDOFF_SOURCE_CHANGED"}}


def test_revoked_active_restore_only_exposes_id_for_fresh_recovery(monkeypatch):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", True)
    monkeypatch.setattr(settings, "rag_new_chat_enabled", True)
    monkeypatch.setattr(settings, "rag_handoff_enabled", True)
    monkeypatch.setattr(rag, "restore_rag_conversation", Mock(
        side_effect=RagConversationError("RAG_DOCUMENT_ACCESS_DENIED", 403),
    ))
    monkeypatch.setattr(rag, "get_supabase_client", Mock())
    monkeypatch.setattr(rag, "list_conversations", Mock(return_value={
        "active_session_id": ANSWER["session_id"],
        "conversations": [{"id": ANSWER["session_id"], "content_available": False}],
    }))
    response = lifecycle_post("restore", RESTORE_PAYLOAD)
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == ANSWER["session_id"] and data["new_chat_enabled"]
    assert not data["content_available"] and not data["has_handoff"]
    assert data["messages"] == data["selected_document_ids"] == []


def test_history_flag_off_and_malformed_cursor(monkeypatch):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", True)
    monkeypatch.setattr(settings, "rag_new_chat_enabled", False)
    assert lifecycle_post("history", RESTORE_PAYLOAD).status_code == 409
    monkeypatch.setattr(settings, "rag_new_chat_enabled", True)
    response = lifecycle_post("history", {
        **RESTORE_PAYLOAD, "cursor": {"created_at": "2026-11-26T15:00:00", "id": REQUEST_ID},
    })
    assert response.status_code == 422


def test_flag_disabled_preserves_legacy_request_without_client_id(routes, monkeypatch):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", False)
    legacy, conversation = routes

    response = post(REQUEST)

    assert response.status_code == 200
    assert response.json()["answer"] == ANSWER["answer"]
    assert response.json()["completed_turn_count"] is None
    assert response.json()["hard_turn_limit"] is None
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
    assert response.json()["soft_turn_limit"] == settings.rag_soft_turn_limit
    assert response.json()["hard_turn_limit"] == settings.rag_hard_turn_limit
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
