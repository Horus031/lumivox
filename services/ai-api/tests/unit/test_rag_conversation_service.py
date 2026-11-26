
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from postgrest.exceptions import APIError

from app.services import (
    rag_conversation_service as service,
)

from app.services.rag_conversation_store import (
    RagConversationError,
)
from app.services.rag_chat_service import _get_or_create_session


BASE_REQUEST = {
    "user_id": "user-1",
    "question": "Explain binary search",
    "selected_document_ids": [],
    "focus_session_id": "focus-1",
    "session_id": None,
    "client_request_id": "request-1",
    "top_k": 5,
    "prompt_variant": "grounded_rule",
    "preferred_locale": "en",
}


@pytest.fixture
def dependencies(monkeypatch):
    supabase = Mock()

    reserve = Mock(
        return_value={
            "outcome": "reserved",
            "turn_id": "turn-1",
            "session_id": "session-1",
            "lease_token": "lease-1",
        }
    )

    generate = Mock(
        return_value=(
            "Study answer",
            [],
            SimpleNamespace(
                provider="groq",
                model="openai/gpt-oss-20b",
            ),
        )
    )

    complete = Mock(
        return_value={
            "session_id": "session-1",
            "turn_id": "turn-1",
            "answer": "Study answer",
        }
    )

    fail = Mock(return_value=True)

    monkeypatch.setattr(
        service,
        "get_supabase_client",
        lambda: supabase,
    )

    monkeypatch.setattr(
        service, "reserve_turn", reserve
    )

    monkeypatch.setattr(
        service, "generate_rag_answer", generate
    )

    monkeypatch.setattr(
        service, "complete_turn", complete
    )

    monkeypatch.setattr(
        service, "fail_turn", fail
    )

    return SimpleNamespace(
        reserve=reserve,
        generate=generate,
        complete=complete,
        fail=fail,
    )


def test_successful_turn(dependencies):
    result = service.ask_rag_conversation_question(
        **BASE_REQUEST
    )

    assert result["answer"] == "Study answer"

    dependencies.reserve.assert_called_once()
    dependencies.generate.assert_called_once()
    dependencies.complete.assert_called_once()
    dependencies.fail.assert_not_called()


def test_completed_request_replays_response(
    dependencies,
):
    dependencies.reserve.return_value = {
        "outcome": "completed",
        "response": {
            "answer": "Persisted answer"
        },
    }

    result = service.ask_rag_conversation_question(
        **BASE_REQUEST
    )

    assert result["answer"] == "Persisted answer"

    dependencies.generate.assert_not_called()
    dependencies.complete.assert_not_called()


def test_processing_request_does_not_generate(
    dependencies,
):
    dependencies.reserve.return_value = {
        "outcome": "processing"
    }

    with pytest.raises(
        RagConversationError
    ) as exc:
        service.ask_rag_conversation_question(
            **BASE_REQUEST
        )

    assert exc.value.code == "RAG_TURN_IN_PROGRESS"

    dependencies.generate.assert_not_called()


def test_failed_request_does_not_generate(
    dependencies,
):
    dependencies.reserve.return_value = {
        "outcome": "failed",
        "session_id": "session-1",
    }

    with pytest.raises(
        RagConversationError
    ) as exc:
        service.ask_rag_conversation_question(
            **BASE_REQUEST
        )

    assert (
        exc.value.code
        == "RAG_PREVIOUS_TURN_FAILED"
    )
    assert exc.value.session_id == "session-1"

    dependencies.generate.assert_not_called()


def test_generation_failure_marks_turn_failed(
    dependencies,
):
    dependencies.generate.side_effect = (
        RuntimeError("provider error")
    )

    with pytest.raises(
        RagConversationError
    ):
        service.ask_rag_conversation_question(
            **BASE_REQUEST
        )

    dependencies.fail.assert_called_once()
    dependencies.complete.assert_not_called()


def test_uncertain_completion_does_not_mark_failed(
    dependencies,
):
    dependencies.complete.side_effect = (
        RagConversationError(
            "RAG_PERSISTENCE_UNAVAILABLE",
            503,
        )
    )

    with pytest.raises(
        RagConversationError
    ):
        service.ask_rag_conversation_question(
            **BASE_REQUEST
        )

    dependencies.fail.assert_not_called()


def test_document_ids_are_canonicalized(
    dependencies,
):
    service.ask_rag_conversation_question(
        **{
            **BASE_REQUEST,
            "selected_document_ids": [
                "b", "a", "a"
            ],
        }
    )

    request = (
        dependencies.reserve.call_args
        .kwargs["request_payload"]
    )

    assert request[
        "selected_document_ids"
    ] == ["a", "b"]


def test_reservation_error_prevents_generation(
    dependencies,
):
    dependencies.reserve.side_effect = (
        RagConversationError(
            "RAG_DOCUMENT_ACCESS_DENIED",
            403,
        )
    )

    with pytest.raises(
        RagConversationError
    ):
        service.ask_rag_conversation_question(
            **BASE_REQUEST
        )

    dependencies.generate.assert_not_called()
    dependencies.complete.assert_not_called()


def test_restore_validates_access_before_fetching_document_history(monkeypatch):
    supabase = Mock()
    scope, session, unexpected_history = Mock(), Mock(), Mock()
    scope.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": "focus-1"}
    ]
    session.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": "session-1", "selected_document_ids": ["document-1"]}
    ]
    supabase.table.side_effect = [scope, session, unexpected_history]
    supabase.rpc.return_value.execute.side_effect = APIError(
        {"message": "RAG_DOCUMENT_ACCESS_DENIED", "code": "P0001"}
    )
    monkeypatch.setattr(service, "get_supabase_client", lambda: supabase)

    with pytest.raises(RagConversationError, match="RAG_DOCUMENT_ACCESS_DENIED") as error:
        service.restore_rag_conversation(user_id="user-1", focus_session_id="focus-1")

    assert error.value.status_code == 403
    supabase.rpc.assert_called_once_with(
        "rag_v2_validate_scope",
        {
            "p_user_id": "user-1",
            "p_focus_session_id": "focus-1",
            "p_document_ids": ["document-1"],
        },
    )
    assert [call.args[0] for call in supabase.table.call_args_list] == [
        "focus_sessions",
        "rag_chat_sessions",
    ]


@pytest.mark.parametrize("found", [True, False])
def test_supplied_legacy_session_id_never_creates_or_uses_a_v2_session(found):
    supabase = Mock()
    table = supabase.table.return_value
    query = table.select.return_value
    query.eq.return_value = query
    query.maybe_single.return_value.execute.return_value = (
        SimpleNamespace(data={"id": "session-1"}) if found else None
    )
    params = {
        "user_id": "user-1",
        "session_id": "session-1",
        "focus_session_id": "focus-1",
        "prompt_variant": "grounded_rule",
        "context_mode": "general",
        "selected_document_ids": [],
        "top_k": 5,
        "question": "Explain binary search",
        "preferred_locale": "en",
    }

    if found:
        assert _get_or_create_session(supabase, **params) == "session-1"
    else:
        with pytest.raises(RagConversationError, match="RAG_SESSION_NOT_FOUND") as error:
            _get_or_create_session(supabase, **params)
        assert error.value.status_code == 404

    query.eq.assert_any_call("user_id", "user-1")
    query.eq.assert_any_call("conversation_version", 1)
    table.insert.assert_not_called()
