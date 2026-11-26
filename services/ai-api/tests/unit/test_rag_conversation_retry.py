from unittest.mock import Mock

import pytest

from app.services import rag_conversation_service as service
from app.services.rag_conversation_store import RagConversationError


def ask():
    return service.ask_rag_conversation_question(
        user_id="user",
        question="Explain binary search",
        selected_document_ids=[],
        focus_session_id="focus",
        session_id=None,
        client_request_id="request",
        top_k=5,
        prompt_variant="grounded_rule",
    )


@pytest.fixture
def reserve(monkeypatch):
    monkeypatch.setattr(service, "get_supabase_client", Mock())
    reserve_turn = Mock()
    monkeypatch.setattr(service, "reserve_turn", reserve_turn)
    return reserve_turn


def test_completed_turn_replays_persisted_response(reserve, monkeypatch):
    response = {"answer": "Stored answer", "completed_turn_count": 1}
    reserve.return_value = {"outcome": "completed", "response": response}
    generate = Mock()
    monkeypatch.setattr(service, "generate_rag_answer", generate)

    assert ask() == response
    generate.assert_not_called()


@pytest.mark.parametrize(
    ("outcome", "code", "session_id"),
    [
        ("processing", "RAG_TURN_IN_PROGRESS", None),
        ("failed", "RAG_PREVIOUS_TURN_FAILED", "session"),
    ],
)
def test_existing_turn_reports_its_state(reserve, monkeypatch, outcome, code, session_id):
    reserve.return_value = {"outcome": outcome, "session_id": "session"}
    generate = Mock()
    monkeypatch.setattr(service, "generate_rag_answer", generate)

    with pytest.raises(RagConversationError) as error:
        ask()

    assert error.value.code == code
    assert error.value.session_id == session_id
    generate.assert_not_called()


@pytest.mark.parametrize(
    ("registered_failure", "code", "session_id"),
    [
        (True, "RAG_GENERATION_FAILED", "session"),
        (False, "RAG_TURN_OUTCOME_UNKNOWN", None),
        (None, "RAG_TURN_OUTCOME_UNKNOWN", None),
    ],
)
def test_generation_failure_requires_persistence_confirmation(
    reserve, monkeypatch, registered_failure, code, session_id
):
    reserve.return_value = {
        "outcome": "reserved",
        "session_id": "session",
        "turn_id": "turn",
        "lease_token": "lease",
    }
    monkeypatch.setattr(
        service, "generate_rag_answer", Mock(side_effect=RuntimeError("Provider failed"))
    )
    mark_failed = Mock(return_value=registered_failure)
    if registered_failure is None:
        mark_failed.side_effect = RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
    monkeypatch.setattr(service, "fail_turn", mark_failed)

    with pytest.raises(RagConversationError) as error:
        ask()

    assert error.value.code == code
    assert error.value.session_id == session_id
    mark_failed.assert_called_once()
