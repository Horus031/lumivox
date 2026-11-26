from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.schemas.rag_conversation_handoff import RagNewChatRequest
from app.services import rag_new_chat_service as service
from app.services.rag_conversation_store import RagConversationError
from app.services.rag_handoff_builder import RagBuiltHandoff


def fixture_id(number):
    return str(UUID(int=number))


def request_for(mode="fresh"):
    return RagNewChatRequest(
        user_id=fixture_id(1), focus_session_id=fixture_id(2), source_session_id=fixture_id(3),
        client_request_id=fixture_id(4), mode=mode,
        selected_document_ids=[fixture_id(12), fixture_id(11), fixture_id(12)],
    )


@pytest.fixture
def dependencies(monkeypatch, stored_summary):
    for name in ("rag_conversation_v2_enabled", "rag_new_chat_enabled", "rag_handoff_enabled"):
        monkeypatch.setattr(service.settings, name, True)
    prepare = Mock(return_value={
        "outcome": "prepared", "source_session_id": fixture_id(3),
        "revision": {"source_completed_turn_count": 1, "source_last_completed_turn_index": 1},
        "previous_summary": None, "inherited_memory": None,
        "uncovered_turns": [{"turn_index": 1, "question": "Study question", "answer": "Answer"}],
    })
    commit = Mock(return_value={"outcome": "completed", "source_session_id": fixture_id(3),
        "target_session_id": fixture_id(5), "mode": "fresh", "has_handoff": False})
    build = Mock(return_value=RagBuiltHandoff(stored_summary.summary, "extractive", 100, 15))
    for name, mock in (
        ("get_supabase_client", Mock()), ("prepare_new_chat", prepare),
        ("commit_new_chat", commit), ("build_final_handoff", build),
    ):
        monkeypatch.setattr(service, name, mock)
    return SimpleNamespace(prepare=prepare, commit=commit, build=build)


def test_fresh_uses_sorted_distinct_ids_and_zero_provider_calls(dependencies):
    result = service.start_new_conversation(request_for())
    assert str(result.target_session_id) == fixture_id(5)
    payload = dependencies.prepare.call_args.kwargs["request_payload"]
    assert payload["selected_document_ids"] == [fixture_id(11), fixture_id(12)]
    assert dependencies.commit.call_args.kwargs["request_payload"] == payload
    assert dependencies.commit.call_args.kwargs["handoff"] is None
    dependencies.build.assert_not_called()


def test_replay_never_rebuilds_or_recommits(dependencies):
    dependencies.prepare.return_value = dependencies.commit.return_value
    service.start_new_conversation(request_for())
    dependencies.build.assert_not_called()
    dependencies.commit.assert_not_called()


def test_continue_requires_its_flag(monkeypatch, dependencies):
    monkeypatch.setattr(service.settings, "rag_handoff_enabled", False)
    with pytest.raises(RagConversationError, match="RAG_HANDOFF_DISABLED"):
        service.start_new_conversation(request_for("continue"))
    dependencies.prepare.assert_not_called()


@pytest.mark.parametrize("code", ["RAG_HANDOFF_SOURCE_CHANGED", "RAG_PERSISTENCE_UNAVAILABLE"])
def test_commit_conflict_or_unknown_outcome_is_preserved(dependencies, code):
    dependencies.commit.side_effect = RagConversationError(code, 409)
    with pytest.raises(RagConversationError, match=code):
        service.start_new_conversation(request_for("continue"))
    dependencies.commit.assert_called_once()
    args = dependencies.commit.call_args.kwargs
    assert args["expected_revision"]["source_completed_turn_count"] == 1
    assert args["handoff"]["schema_version"] == 1


def test_authorization_failure_stops_before_generation(dependencies):
    dependencies.prepare.side_effect = RagConversationError("RAG_DOCUMENT_ACCESS_DENIED", 403)
    with pytest.raises(RagConversationError, match="RAG_DOCUMENT_ACCESS_DENIED"):
        service.start_new_conversation(request_for("continue"))
    dependencies.build.assert_not_called()
    dependencies.commit.assert_not_called()


def test_build_failure_does_not_close_source_or_emit_raw_input(dependencies, caplog):
    dependencies.build.side_effect = RagConversationError("RAG_HANDOFF_EMPTY_CONTEXT", 409)
    with pytest.raises(RagConversationError, match="RAG_HANDOFF_EMPTY_CONTEXT"):
        service.start_new_conversation(request_for("continue"))
    assert "Study question" not in caplog.text
    dependencies.commit.assert_not_called()
