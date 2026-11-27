from app.core.config import settings
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.services.rag_learning_artifacts import artifact_excerpt, extract_learning_artifacts
from app.services.rag_summary_builder import build_extractive_summary, fit_summary_to_budget, serialize_summary


def test_atomic_artifact_extraction():
    assert extract_learning_artifacts("Input [8, 3, 5, 1, 9]\nResult: [-3, 1.5]") == [
        "Result: [-3, 1.5]", "[8, 3, 5, 1, 9]",
    ]
    assert extract_learning_artifacts("[8, 3, 5, 1, 9]", max_tokens=2) == []
    assert artifact_excerpt("Input [8, 3, 5]", "Input [8, 3") == "Input"
    assert artifact_excerpt("Result: [1, 2]", "Result: [1") == ""


def test_extractive_summary_keeps_earlier_answers_and_preserves_or_drops_inputs(monkeypatch, stored_summary):
    monkeypatch.setattr(settings, "rag_context_quality_enabled", True)
    previous = stored_summary.summary.model_copy(update={"unresolved_questions": ["Will this work in all cases?"]})
    turn = RagCompletedTurn(
        turn_index=2, question="Sort [8, 3, 5, 1, 9]? api_key: secretfixture",
        answer="Final result: [1, 3, 5, 8, 9]\nPassword: sensitivefixture",
    )
    summary = build_extractive_summary(previous_summary=previous, turns=[turn], max_tokens=500)
    assert "Earlier answer:" in summary.covered_concepts[-1]
    assert summary.unresolved_questions == previous.unresolved_questions
    assert "[8, 3, 5, 1, 9]" in summary.continuation_hint
    assert "[1, 3, 5, 8, 9]" in summary.continuation_hint
    assert "sensitivefixture" not in serialize_summary(summary)
    assert "secretfixture" not in serialize_summary(summary)
    compressed = fit_summary_to_budget(summary, 80)
    for line in compressed.continuation_hint.splitlines():
        assert line in summary.continuation_hint.splitlines()
