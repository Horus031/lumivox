import pytest

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
