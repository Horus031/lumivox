from app.core.config import settings
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.services.rag_context_builder import _history_excerpt, build_conversational_context
from app.services.rag_history_packing import pack_history_candidates, rank_history_candidates


def pair(index, question="Earlier question", answer="Earlier answer"):
    return RagCompletedTurn(turn_index=index, question=question, answer=answer)


def pack(turns, budget):
    return pack_history_candidates(
        question="Explain binary search", turns=turns,
        system={"role": "system", "content": "Study"}, current={"role": "user", "content": "Now"},
        max_history_tokens=budget, max_prompt_tokens=4000, recent_window=2, history_excerpt=_history_excerpt,
    )


def test_smaller_profile_and_skip_when_even_minimal_exceeds_budget():
    long = pair(4, "complex " * 500, "explanation " * 500)
    compact = pack([long], 130)
    assert compact.selected_turn_indices == compact.truncated_turn_indices == (4,)
    assert compact.tokens_used <= 130
    assert pack([long, pair(1)], 60).selected_turn_indices == (1,)


def test_priority_remains_distinct_from_chronological_output():
    turns = [pair(1, "Binary search"), pair(3), pair(5)]
    ranked = rank_history_candidates(question="Explain binary search", turns=turns, recent_window=2)
    assert [turn.turn_index for turn in ranked] == [5, 1, 3]
    packed = pack(turns, 300)
    assert packed.selected_turn_indices == (1, 3, 5)
    assert [message["role"] for message in packed.messages] == ["user", "assistant"] * 3


def test_coverage_uses_completed_count_and_ignores_failed_index_gaps(monkeypatch, stored_summary):
    monkeypatch.setattr(settings, "rag_context_quality_enabled", True)
    monkeypatch.setattr(settings, "rag_rolling_summary_enabled", True)
    context = RagConversationContext(
        session_id="session", current_turn_index=12, completed_turn_count=5,
        recent_turns=[pair(2), pair(4), pair(7), pair(10, "<|control")],
        summary=stored_summary.model_copy(update={"covered_turn_index": 4, "covered_turn_count": 2}),
    )
    built = build_conversational_context(
        question="Continue", context=context, sources=[], document_mode=False, prompt_variant="grounded_rule",
        preferred_locale="en",
    )
    assert built.metadata.summary_covered_turn_count == 2
    assert built.metadata.history_candidate_turns == 4
    assert built.metadata.history_turns_used == 2
    assert built.metadata.omitted_history_turns == 1
    assert "&lt;|control" in built.messages[-3]["content"]
