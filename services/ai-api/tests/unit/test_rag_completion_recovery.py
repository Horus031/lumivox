import pytest

from app.services import rag_conversation_service as service
from app.services.rag_conversation_store import RagConversationError
from test_rag_conversation_service import BASE_REQUEST, dependencies


@pytest.mark.parametrize("error_code", ["RAG_PERSISTENCE_UNAVAILABLE", "RAG_INVALID_LEASE"])
def test_uncertain_completion_does_not_fail_or_replace_request(dependencies, error_code):
    dependencies.complete.side_effect = RagConversationError(error_code, 503)
    with pytest.raises(RagConversationError, match="RAG_TURN_OUTCOME_UNKNOWN") as caught:
        service.ask_rag_conversation_question(**BASE_REQUEST)
    assert caught.value.outcome == "unknown"
    assert dependencies.reserve.call_args.kwargs["client_request_id"] == BASE_REQUEST["client_request_id"]
    dependencies.fail.assert_not_called()


@pytest.mark.parametrize(("error_code", "reason"), [
    ("RAG_INVALID_RESPONSE", "persistence_failed"),
    ("RAG_DOCUMENT_ACCESS_DENIED", "document_access_denied"),
])
@pytest.mark.parametrize("marked_failed", [True, False])
def test_definite_rejection_is_terminal_only_if_failure_was_persisted(
    dependencies, error_code, reason, marked_failed,
):
    dependencies.complete.side_effect = RagConversationError(error_code, 500)
    dependencies.fail.return_value = marked_failed
    with pytest.raises(RagConversationError) as caught:
        service.ask_rag_conversation_question(**BASE_REQUEST)
    assert caught.value.code == (error_code if marked_failed else "RAG_TURN_OUTCOME_UNKNOWN")
    assert caught.value.outcome == ("failed" if marked_failed else "unknown")
    assert dependencies.fail.call_args.kwargs["error_code"] == reason
