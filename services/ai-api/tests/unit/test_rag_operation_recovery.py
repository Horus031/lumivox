from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import rag_operation_recovery_service as service


URL = "/api/v1/rag/chat/operation-status"
REQUEST = {
    "user_id": "11111111-1111-4111-8111-111111111111",
    "focus_session_id": "22222222-2222-4222-8222-222222222222",
    "client_request_id": "33333333-3333-4333-8333-333333333333",
    "operation": "ask",
}


@pytest.fixture
def stores(monkeypatch):
    monkeypatch.setattr(settings, "rag_operation_recovery_enabled", True)
    read = Mock(return_value={"operation": "ask", "status": "completed", "response_payload": {"answer": "private"}})
    recover = Mock(return_value={"operation": "ask", "status": "failed"})
    monkeypatch.setattr(service, "get_supabase_client", Mock())
    monkeypatch.setattr(service, "load_operation_status", read)
    monkeypatch.setattr(service, "recover_expired_turn", recover)
    return read, recover


def post(**overrides):
    return TestClient(app).post(URL, json={**REQUEST, **overrides},
        headers={"x-lumivox-internal-key": settings.ai_internal_api_key})


def test_completed_status_is_metadata_only_and_available_during_v2_rollback(monkeypatch, stores):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", False)
    response = post()
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert "response_payload" not in response.json()
    stores[0].assert_called_once()
    stores[1].assert_not_called()


def test_recovery_disabled_never_calls_the_database(monkeypatch, stores):
    monkeypatch.setattr(settings, "rag_operation_recovery_enabled", False)
    response = post()
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RAG_RECOVERY_DISABLED"
    for store in stores:
        store.assert_not_called()


def test_explicit_expiry_mutation_uses_operation_specific_rpc(monkeypatch, stores):
    recover_preparation = Mock(return_value={"operation": "new_chat", "status": "failed"})
    monkeypatch.setattr(service, "recover_expired_preparation", recover_preparation)
    assert post(recover_expired=True).json()["status"] == "failed"
    response = post(operation="new_chat", recover_expired=True)
    assert response.status_code == 200 and response.json()["status"] == "failed"
    stores[0].assert_not_called()
    stores[1].assert_called_once()
    recover_preparation.assert_called_once()


def test_rollback_restore_still_advertises_recovery(monkeypatch):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", False)
    monkeypatch.setattr(settings, "rag_operation_recovery_enabled", True)
    response = TestClient(app).post("/api/v1/rag/chat/restore", json=REQUEST,
        headers={"x-lumivox-internal-key": settings.ai_internal_api_key})
    assert response.status_code == 200
    assert response.json()["enabled"] is False and response.json()["recovery_enabled"] is True
