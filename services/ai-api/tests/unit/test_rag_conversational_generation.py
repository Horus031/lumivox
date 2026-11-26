from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.clients.rag_llm_client import RagChatGeneration, RagTokenUsage
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.services import rag_conversational_generation as service


@pytest.fixture
def dependencies(monkeypatch):
    embedding = Mock(return_value=[0.1])
    retrieval = Mock(return_value=[])
    generation = Mock(return_value=RagChatGeneration(
        text="Study answer", provider="groq", model="openai/gpt-oss-20b",
        latency_ms=30, attempts=1, usage=RagTokenUsage(500, 30, 530), finish_reason="stop",
    ))
    monkeypatch.setattr(service, "_generate_query_embedding", embedding)
    monkeypatch.setattr(service, "_retrieve_chunks", retrieval)
    monkeypatch.setattr(service, "generate_rag_chat", generation)
    return SimpleNamespace(embedding=embedding, retrieval=retrieval, generation=generation)


def ask(*, history=False, document=False, variant="grounded_rule", locale="en"):
    recent = [RagCompletedTurn(
        turn_index=1, question="Explain binary search.", answer="It halves a sorted search interval.",
    )] if history else []
    return service.generate_conversational_answer(
        supabase=object(), user_id="user", question="Why is it efficient?",
        selected_document_ids=["document"] if document else [],
        top_k=5, prompt_variant=variant, preferred_locale=locale,
        context=RagConversationContext(
            session_id="session", completed_turn_count=len(recent), current_turn_index=len(recent) + 1,
            recent_turns=recent,
        ),
    )


@pytest.mark.parametrize("history", [False, True])
def test_general_ai_sends_complete_history_without_embedding(dependencies, history):
    result = ask(history=history)
    assert result.context.retrieval_strategy == "none"
    assert result.context.history_turns_used == int(history)
    dependencies.embedding.assert_not_called()
    dependencies.retrieval.assert_not_called()
    messages = dependencies.generation.call_args.args[0]
    assert [m["role"] for m in messages] == (
        ["system", "user", "assistant", "user"] if history else ["system", "user"]
    )
    assert result.generation.usage.total_tokens == 530


@pytest.mark.parametrize("history", [False, True])
def test_document_retrieval_embeds_only_current_question_or_bounded_recent_context(dependencies, history):
    dependencies.retrieval.return_value = [{
        "chunk_id": "chunk", "file_name": "notes.pdf", "chunk_index": 0, "content": "Binary search.",
    }]
    result = ask(history=history, document=True)
    query = dependencies.embedding.call_args.args[0]
    if history:
        assert "Explain binary search." in query
        assert result.context.retrieval_strategy == "history_augmented"
    else:
        assert query == "Why is it efficient?"
        assert result.context.retrieval_strategy == "current_question"
    assert dependencies.retrieval.call_args.kwargs["selected_document_ids"] == ["document"]
    assert result.context.retrieved_chunks_used == 1


@pytest.mark.parametrize("excluded", [False, True])
def test_strict_document_mode_without_usable_evidence_skips_provider(dependencies, excluded):
    if excluded:
        dependencies.retrieval.return_value = [{
            "chunk_id": "chunk", "file_name": "unpackable " * 3000,
            "chunk_index": 0, "content": "evidence",
        }]
    result = ask(history=True, document=True, locale="vi")
    assert "không tìm thấy đủ thông tin" in result.answer
    assert result.sources == []
    assert result.generation is None
    assert result.context.retrieved_chunks_used == 0
    assert result.context.generation_attempts == 0
    dependencies.generation.assert_not_called()


def test_no_rule_document_mode_can_use_general_knowledge(dependencies):
    result = ask(document=True, variant="no_rule")
    assert result.answer == "Study answer"
    assert result.sources == []
    dependencies.generation.assert_called_once()
