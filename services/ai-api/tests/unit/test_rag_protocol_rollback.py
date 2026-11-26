from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import rag
from app.core.config import settings
from app.main import app


@pytest.mark.parametrize(("protocol", "enabled", "code"), [
    ("v2", False, "RAG_V2_DISABLED"),
    ("legacy", True, "RAG_PROTOCOL_MISMATCH"),
])
def test_mismatched_protocol_never_generates(monkeypatch, protocol, enabled, code):
    monkeypatch.setattr(settings, "rag_conversation_v2_enabled", enabled)
    legacy, v2 = Mock(), Mock()
    monkeypatch.setattr(rag, "ask_rag_question", legacy)
    monkeypatch.setattr(rag, "ask_rag_conversation_question", v2)
    response = TestClient(app).post("/api/v1/rag/chat/ask",
        json={"user_id": "11111111-1111-4111-8111-111111111111", "question": "Synthetic study question",
              "conversation_protocol": protocol},
        headers={"x-lumivox-internal-key": settings.ai_internal_api_key})
    assert response.status_code == 409 and response.json()["detail"]["code"] == code
    legacy.assert_not_called()
    v2.assert_not_called()
