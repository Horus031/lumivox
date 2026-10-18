from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.api.routes import focus_v2

client = TestClient(app)
USER = "11111111-1111-4111-8111-111111111111"
SESSION = "22222222-2222-4222-8222-222222222222"
SEGMENT = "33333333-3333-4333-8333-333333333333"


def test_create_never_allows_unauthenticated_requests():
    result = client.post("/api/v1/focus-v2/create", json={
        "user_id": USER, "focus_minutes": 25, "short_break_minutes": 5,
        "long_break_minutes": 15, "round_count": 4, "long_break_every": 4,
        "auto_start_breaks": False, "auto_start_focus": False,
    })
    assert result.status_code == 401


def test_transition_never_allows_unauthenticated_requests():
    result = client.post("/api/v1/focus-v2/transition", json={
        "user_id": USER, "session_id": SESSION, "expected_segment_id": SEGMENT,
        "action": "pause",
    })
    assert result.status_code == 401


def test_internal_key_and_validated_payload_reach_backend(monkeypatch):
    monkeypatch.setattr(focus_v2, "transition_focus_v2", lambda payload: {
        "parentStatus": "ongoing", "segmentId": str(payload.expected_segment_id),
        "nextSegmentId": None, "parentCompleted": False,
    })
    response = client.post("/api/v1/focus-v2/transition", json={
        "user_id": USER, "session_id": SESSION, "expected_segment_id": SEGMENT,
        "action": "pause",
    }, headers={"x-lumivox-internal-key": settings.ai_internal_api_key})
    assert response.status_code == 200, response.text
    assert response.json()["segmentId"] == SEGMENT


def test_bad_input_rejected_before_service(monkeypatch):
    def should_not_call(payload):
        raise AssertionError("Invalid payload reached service")
    monkeypatch.setattr(focus_v2, "transition_focus_v2", should_not_call)
    response = client.post("/api/v1/focus-v2/transition", json={
        "user_id": USER, "session_id": SESSION, "expected_segment_id": SEGMENT,
        "action": "delete_everything",
    }, headers={"x-lumivox-internal-key": settings.ai_internal_api_key})
    assert response.status_code == 422
