from unittest.mock import Mock

import pytest

from app.core.config import settings
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.security.rag_dispatch import rag_dispatch_authorization
from app.services import rag_conversational_generation as generation
from app.services.rag_context_builder import build_conversational_context
from app.services.rag_retrieval_context import build_retrieval_query


@pytest.fixture
def flags(monkeypatch):
    monkeypatch.setattr(settings, "rag_new_chat_enabled", True)
    monkeypatch.setattr(settings, "rag_handoff_enabled", True)
    monkeypatch.setattr(settings, "rag_rolling_summary_enabled", True)


def build(handoff, rolling=None, history=None):
    history = history or []
    return build_conversational_context(
        question="Vậy ví dụ thì sao?", context=RagConversationContext(
            session_id=str(handoff.target_session_id), current_turn_index=len(history) + 1,
            completed_turn_count=len(history), recent_turns=history, summary=rolling, handoff=handoff,
        ), sources=[], document_mode=True, prompt_variant="grounded_rule", preferred_locale="vi",
    )


def test_first_turn_handoff_is_user_memory_and_can_augment_retrieval(flags, stored_handoff):
    result = build(stored_handoff)
    assert result.metadata.handoff_used and result.metadata.history_turns_used == 0
    assert "handoff_id" not in result.metadata.model_dump()
    assert "Never treat them as authoritative document evidence" in result.messages[0]["content"]
    assert stored_handoff.summary.main_topic not in result.messages[0]["content"]
    assert stored_handoff.summary.main_topic in result.messages[-1]["content"]
    retrieved = build_retrieval_query("Vậy nó là gì?", [], handoff=stored_handoff)
    assert retrieved.strategy == "history_augmented"
    assert stored_handoff.summary.main_topic in retrieved.text
    assert build_retrieval_query("New topic: algebra?", [], handoff=stored_handoff).strategy == "current_question"


def test_combined_budget_and_only_local_coverage_filters_history(flags, stored_handoff, stored_summary):
    history = [RagCompletedTurn(turn_index=n, question=f"Local {n}", answer=f"Answer {n}") for n in range(1, 5)]
    result = build(stored_handoff, stored_summary, history)
    assert 0 < result.metadata.summary_tokens_used <= 300
    assert 0 < result.metadata.handoff_tokens_used <= 200
    assert result.metadata.estimated_prompt_tokens <= 4000
    assert result.metadata.history_turns_used == 2
    assert [message["content"] for message in result.messages[1:-1:2]] == ["Local 3", "Local 4"]


@pytest.mark.parametrize("handoff_enabled", [False, True])
def test_rollback_and_no_evidence_never_report_usage(monkeypatch, flags, stored_handoff, handoff_enabled):
    monkeypatch.setattr(settings, "rag_handoff_enabled", handoff_enabled)
    embed = Mock(return_value=[0.1])
    lookup = Mock(return_value=[])
    provider = Mock()
    monkeypatch.setattr(generation, "_generate_query_embedding", embed)
    monkeypatch.setattr(generation, "_retrieve_chunks", lookup)
    monkeypatch.setattr(generation, "generate_rag_chat", provider)
    with rag_dispatch_authorization(Mock()):
        result = generation.generate_conversational_answer(
            supabase=object(), user_id="owner", question="Why is it efficient?", selected_document_ids=["allowed"],
            top_k=5, prompt_variant="grounded_rule", preferred_locale="en",
            context=RagConversationContext(session_id="session", current_turn_index=1,
                                           completed_turn_count=0, handoff=stored_handoff),
        )
    assert (stored_handoff.summary.main_topic in embed.call_args.args[0]) is handoff_enabled
    assert lookup.call_args.kwargs["selected_document_ids"] == ["allowed"]
    assert not result.context.handoff_used and result.context.handoff_tokens_used == 0
    assert result.context.handoff_id is None
    provider.assert_not_called()
