from app.core.rag_token_budget import estimate_message_tokens
from app.services.rag_context_builder import _current_message, pack_adaptive_memory


def test_memory_allocation_reuses_unused_capacity_and_measures_combined_envelope(stored_summary):
    system = {"role": "system", "content": "Study"}
    short = stored_summary.summary
    long = short.model_copy(update={"covered_concepts": [f"Topic {i}: " + f"algorithm{i} " * 30 for i in range(12)]})
    args = dict(system=system, question="Continue", sources=[], memory_limit=500, intent="continuation")
    for summary, handoff in ((short, long), (long, short), (long, long), (long, None), (None, long)):
        packed = pack_adaptive_memory(**args, summary=summary, handoff=handoff)
        delta = (estimate_message_tokens([system, packed.current_message])
                 - estimate_message_tokens([system, _current_message("Continue", [])]))
        assert 0 < delta == packed.summary_tokens + packed.handoff_tokens <= 500
        assert bool(packed.summary_text) is bool(summary)
        assert bool(packed.handoff_text) is bool(handoff)
        if summary is short:
            assert packed.handoff_tokens > 200
        if handoff is short:
            assert packed.summary_tokens > 300
    switched = pack_adaptive_memory(**{**args, "intent": "topic_change"}, summary=long, handoff=long)
    assert switched.summary_tokens == switched.handoff_tokens == 0
