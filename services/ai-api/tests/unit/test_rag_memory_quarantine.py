from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.api.routes import rag
from app.core.config import settings
from app.main import app
from app.services.rag_conversation_store import RagConversationError

USER = "11111111-1111-4111-8111-111111111111"
FOCUS = "22222222-2222-4222-8222-222222222222"
REQUEST = "33333333-3333-4333-8333-333333333333"


def test_quarantine_is_visible_without_reason_and_independent_of_flag(monkeypatch):
    monkeypatch.setattr(settings, "rag_privacy_filter_enabled", False)
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", True)
    monkeypatch.setattr(rag, "restore_rag_conversation", Mock(return_value={
        "enabled": True, "memory_quarantined": True, "memory_quarantine_reason": "security_review",
    }))
    monkeypatch.setattr(rag, "ask_rag_conversation_question",
                        Mock(side_effect=RagConversationError("RAG_MEMORY_QUARANTINED", 409)))
    client = TestClient(app)
    headers = {"x-lumivox-internal-key": settings.ai_internal_api_key}
    data = {"user_id": USER, "focus_session_id": FOCUS}
    restored = client.post("/api/v1/rag/chat/restore", headers=headers, json=data)
    assert restored.status_code == 200 and restored.json()["memory_quarantined"]
    assert "security_review" not in restored.text
    response = client.post("/api/v1/rag/chat/ask", headers=headers,
                           json={**data, "client_request_id": REQUEST, "question": "Continue"})
    assert response.status_code == 409 and response.json()["detail"] == "RAG_MEMORY_QUARANTINED"
