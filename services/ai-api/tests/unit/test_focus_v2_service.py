from types import SimpleNamespace
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

from app.schemas.focus_v2 import CreateFocusV2Request, TransitionFocusV2Request
from app.services import focus_v2_service as service

USER = "11111111-1111-4111-8111-111111111111"
SESSION = "22222222-2222-4222-8222-222222222222"
SEGMENT = "33333333-3333-4333-8333-333333333333"


class MockSupabase:
    def __init__(self, result):
        self.result = result
        self.method = None
        self.arguments = None

    def rpc(self, method, arguments):
        self.method = method
        self.arguments = arguments
        return self

    def execute(self):
        if isinstance(self.result, Exception):
            raise self.result
        return SimpleNamespace(data=self.result)


def test_create_passes_validated_fields_and_no_browser_credentials(monkeypatch):
    client = MockSupabase(SESSION)
    monkeypatch.setattr(service, "get_supabase_client", lambda: client)
    payload = CreateFocusV2Request(
        user_id=UUID(USER), focus_minutes=25, short_break_minutes=5,
        long_break_minutes=15, round_count=4, long_break_every=4,
        auto_start_breaks=False, auto_start_focus=False,
    )
    result = service.create_focus_v2(payload)
    assert result == {"session_id": SESSION}
    assert client.method == "focus_v2_create_session"
    assert client.arguments["p_user_id"] == USER
    assert client.arguments["p_task_id"] is None
    assert client.arguments["p_round_count"] == 4


def test_transition_respects_expected_segment_id(monkeypatch):
    result = {"parentStatus": "ongoing", "segmentId": SEGMENT,
              "nextSegmentId": None, "parentCompleted": False}
    client = MockSupabase(result)
    monkeypatch.setattr(service, "get_supabase_client", lambda: client)
    payload = TransitionFocusV2Request(
        user_id=UUID(USER), session_id=UUID(SESSION),
        action="pause", expected_segment_id=UUID(SEGMENT),
    )
    assert service.transition_focus_v2(payload) == result
    assert client.arguments["p_expected_segment_id"] == SEGMENT


def test_duplicate_create_maps_to_conflict(monkeypatch):
    client = MockSupabase(APIError({"message": "duplicate", "code": "23505"}))
    monkeypatch.setattr(service, "get_supabase_client", lambda: client)
    payload = CreateFocusV2Request(
        user_id=UUID(USER), focus_minutes=25, short_break_minutes=5,
        long_break_minutes=15, round_count=4, long_break_every=4,
        auto_start_breaks=False, auto_start_focus=False,
    )
    with pytest.raises(service.FocusV2Conflict):
        service.create_focus_v2(payload)


def test_unknown_postgres_errors_are_not_misreported_as_conflicts(monkeypatch):
    client = MockSupabase(APIError({"message": "unavailable", "code": "XX000"}))
    monkeypatch.setattr(service, "get_supabase_client", lambda: client)
    payload = TransitionFocusV2Request(
        user_id=UUID(USER), session_id=UUID(SESSION),
        action="pause", expected_segment_id=UUID(SEGMENT),
    )
    with pytest.raises(APIError):
        service.transition_focus_v2(payload)
