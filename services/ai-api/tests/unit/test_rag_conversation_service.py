
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from postgrest.exceptions import APIError

from app.clients.rag_llm_client import RagTokenUsage
from app.schemas.rag_conversation_context import RagContextMetadata
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
        return_value=SimpleNamespace(
            answer="Study answer",
            sources=[],
            generation=SimpleNamespace(
                provider="groq",
                model="openai/gpt-oss-20b",
                usage=RagTokenUsage(500, 30, 530),
            ),
            context=RagContextMetadata(
                estimated_prompt_tokens=600, history_turns_used=0,
                retrieved_chunks_used=0, context_truncated=False,
                retrieval_strategy="none", generation_attempts=1,
            ),
        )
    )
    load = Mock(return_value={
        "session_id": "session-1", "current_turn_index": 1, "completed_turn_count": 0,
    })

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
        service, "generate_conversational_answer", generate
    )
    monkeypatch.setattr(service, "load_conversation_context", load)

    monkeypatch.setattr(
        service, "complete_turn", complete
    )

    monkeypatch.setattr(
        service, "fail_turn", fail
    )

    return SimpleNamespace(
        reserve=reserve,
        load=load,
        generate=generate,
        complete=complete,
        fail=fail,
    )


@pytest.mark.parametrize("code", ["RAG_SUMMARY_CONFLICT", "RAG_PERSISTENCE_UNAVAILABLE"])
def test_summary_conflict_or_uncertain_write_reconciles_before_generation(
    monkeypatch, dependencies, stored_summary, code,
):
    monkeypatch.setattr(service.settings, "rag_rolling_summary_enabled", True)
    monkeypatch.setattr(service, "maybe_refresh_summary", Mock(
        side_effect=RagConversationError(code, 409),
    ))
    snapshot = {"session_id": "session-1", "current_turn_index": 9, "completed_turn_count": 8}
    dependencies.load.side_effect = [
        snapshot, {**snapshot, "summary": stored_summary.model_dump()},
    ]
    service.ask_rag_conversation_question(**BASE_REQUEST)
    assert dependencies.load.call_count == 2
    assert dependencies.generate.call_args.kwargs["context"].summary == stored_summary


@pytest.mark.parametrize("code", ["RAG_DOCUMENT_ACCESS_DENIED", "RAG_INVALID_LEASE", "RAG_CONTEXT_UNAVAILABLE"])
def test_summary_authorization_or_lease_failure_blocks_answer(monkeypatch, dependencies, code):
    monkeypatch.setattr(service.settings, "rag_rolling_summary_enabled", True)
    error = RagConversationError(code, 409)
    monkeypatch.setattr(service, "maybe_refresh_summary", Mock(side_effect=error))
    dependencies.load.side_effect = [dependencies.load.return_value, error]
    with pytest.raises(RagConversationError) as caught:
        service.ask_rag_conversation_question(**BASE_REQUEST)
    assert caught.value.code == code
    dependencies.generate.assert_not_called()
    dependencies.complete.assert_not_called()


def test_answer_failure_after_summary_commit_leaves_earlier_coverage(
    monkeypatch, dependencies, stored_summary,
):
    monkeypatch.setattr(service.settings, "rag_rolling_summary_enabled", True)
    snapshot = {"session_id": "session-1", "current_turn_index": 7, "completed_turn_count": 6}
    dependencies.load.return_value = snapshot
    refresh = Mock(side_effect=lambda **kwargs: kwargs["context"].model_copy(
        update={"summary": stored_summary},
    ))
    monkeypatch.setattr(service, "maybe_refresh_summary", refresh)
    dependencies.generate.side_effect = RuntimeError("Synthetic answer failure")
    with pytest.raises(RagConversationError, match="RAG_GENERATION_FAILED"):
        service.ask_rag_conversation_question(**BASE_REQUEST)
    assert stored_summary.covered_turn_index < snapshot["current_turn_index"]
    dependencies.fail.assert_called_once()
    dependencies.complete.assert_not_called()
    assert dependencies.generate.call_args.kwargs["context"].summary is stored_summary


def test_successful_turn(dependencies):
    result = service.ask_rag_conversation_question(
        **BASE_REQUEST
    )

    assert result["answer"] == "Study answer"

    dependencies.reserve.assert_called_once()
    dependencies.generate.assert_called_once()
    dependencies.complete.assert_called_once()
    dependencies.fail.assert_not_called()
    usage = dependencies.complete.call_args.kwargs["usage"]
    assert (usage["prompt_tokens"], usage["completion_tokens"], usage["total_tokens"]) == (500, 30, 530)
    assert usage["context"]["estimated_prompt_tokens"] == 600
    assert usage["context"]["generation_attempts"] == 1
    assert dependencies.load.call_args.kwargs["lease_token"] == "lease-1"


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

    dependencies.load.assert_not_called()
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


def test_restore_maps_revoked_document_access_from_snapshot(monkeypatch):
    supabase = Mock()
    supabase.rpc.return_value.execute.side_effect = APIError(
        {"message": "RAG_DOCUMENT_ACCESS_DENIED", "code": "P0001"}
    )
    monkeypatch.setattr(service, "get_supabase_client", lambda: supabase)

    with pytest.raises(RagConversationError, match="RAG_DOCUMENT_ACCESS_DENIED") as error:
        service.restore_rag_conversation(user_id="user-1", focus_session_id="focus-1")

    assert error.value.status_code == 403
    supabase.rpc.assert_called_once_with(
        "rag_v2_restore_context",
        {
            "p_user_id": "user-1",
            "p_focus_session_id": "focus-1",
        },
    )
    supabase.table.assert_not_called()


def test_context_denial_prevents_generation(dependencies):
    dependencies.load.side_effect = RagConversationError("RAG_CONTEXT_UNAVAILABLE", 409)

    with pytest.raises(RagConversationError, match="RAG_CONTEXT_UNAVAILABLE"):
        service.ask_rag_conversation_question(**BASE_REQUEST)

    dependencies.generate.assert_not_called()
    dependencies.complete.assert_not_called()
    dependencies.fail.assert_called_once()


def test_configured_limit_below_database_ceiling_blocks_generation(dependencies, monkeypatch):
    monkeypatch.setattr(service.settings, "rag_soft_turn_limit", 5)
    monkeypatch.setattr(service.settings, "rag_hard_turn_limit", 10)
    dependencies.load.return_value.update(completed_turn_count=10, current_turn_index=11)

    with pytest.raises(RagConversationError, match="RAG_CONVERSATION_LIMIT_REACHED"):
        service.ask_rag_conversation_question(**BASE_REQUEST)

    dependencies.generate.assert_not_called()
    dependencies.complete.assert_not_called()
    dependencies.fail.assert_called_once()


def test_invalid_configuration_does_not_reserve(dependencies, monkeypatch):
    monkeypatch.setattr(service.settings, "rag_hard_turn_limit", 25)

    with pytest.raises(ValueError, match="database safety ceiling"):
        service.ask_rag_conversation_question(**BASE_REQUEST)

    dependencies.reserve.assert_not_called()


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
