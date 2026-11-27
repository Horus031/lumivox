import pytest

from app.schemas.rag_conversation_handoff import RagStoredHandoff
from app.schemas.rag_conversation_summary import RagConversationSummary, RagStoredSummary


@pytest.fixture
def stored_summary():
    return RagStoredSummary(
        id="summary-1",
        version=1,
        schema_version=1,
        covered_turn_index=2,
        covered_turn_count=2,
        generation_method="llm",
        model_name="openai/gpt-oss-20b",
        token_count=100,
        summary=RagConversationSummary(
            main_topic="Binary search invariants",
            learning_objective="Hiểu vì sao cần sắp xếp",
            covered_concepts=["Sorted data", "Loop invariant"],
            important_user_context=["Prefers worked examples"],
            unresolved_questions=["How are duplicates handled?"],
            document_references=["historical-notes.pdf"],
            uncertainties=["Which duplicate to return"],
            continuation_hint="Use a short sorted array",
        ),
    )


@pytest.fixture
def stored_handoff(stored_summary):
    return RagStoredHandoff(
        id="f5100000-0000-4000-8000-000000000041",
        source_session_id="f5100000-0000-4000-8000-000000000042",
        target_session_id="f5100000-0000-4000-8000-000000000043",
        schema_version=1, source_completed_turn_count=24, source_last_completed_turn_index=27,
        source_summary_version=10, generation_method="llm", token_count=100,
        summary=stored_summary.summary,
    )
