import re
from dataclasses import dataclass
from typing import Sequence

from app.core.config import settings
from app.core.rag_token_budget import count_text_tokens, truncate_text_to_tokens
from app.schemas.rag_conversation_context import RagCompletedTurn, RagRetrievalStrategy
from app.schemas.rag_conversation_summary import RagStoredSummary
from app.schemas.rag_conversation_handoff import RagStoredHandoff
from app.services.rag_summary_builder import _clean
from app.services.rag_topic_context import (
    EXPLICIT_TOPIC_CHANGE, PREVIOUS_CONVERSATION, classify_question_intent, normalize_topic_text, topic_overlap,
)


FOLLOW_UP_PATTERN = re.compile(
    r"\b(it|its|this|that|these|those|they|them|the former|the latter|which one|"
    r"what about|how about|why|nó|chúng|cái này|cái đó|điều này|điều đó|"
    r"phần này|phần đó|vậy|tại sao|còn|tiếp theo)\b",
    re.IGNORECASE,
)
@dataclass(frozen=True)
class RagRetrievalQuery:
    text: str
    strategy: RagRetrievalStrategy


def _build_legacy_retrieval_query(
    question: str,
    recent_turns: Sequence[RagCompletedTurn],
    summary: RagStoredSummary | None = None,
    handoff: RagStoredHandoff | None = None,
) -> RagRetrievalQuery:
    if (
        (not recent_turns and not summary and not handoff)
        or EXPLICIT_TOPIC_CHANGE.search(question)
        or (not FOLLOW_UP_PATTERN.search(question) and count_text_tokens(question) > 8)
    ):
        return RagRetrievalQuery(question, "current_question")

    text = f"Current question:\n{question}"
    if recent_turns:
        latest = max(recent_turns, key=lambda turn: turn.turn_index)
        topic = truncate_text_to_tokens(latest.question, 100)
        explanation = truncate_text_to_tokens(latest.answer, 140)
        text += f"\nRecent conversation topic:\n{topic}\nPrevious explanation context:\n{explanation}"
    remaining = 100
    for memory, heading in ((summary, "Earlier study topic"), (handoff, "Inherited study topic")):
        if memory is None or remaining == 0:
            continue
        terms = ", ".join(filter(None, [
            memory.summary.main_topic, *memory.summary.covered_concepts[-3:],
        ]))
        if terms:
            excerpt = truncate_text_to_tokens(terms, min(remaining, 60) if memory is summary and handoff else remaining)
            text += f"\n{heading}:\n{excerpt}"
            remaining -= count_text_tokens(excerpt)
    return RagRetrievalQuery(text, "history_augmented")


def build_adaptive_retrieval_query(
    question: str,
    recent_turns: Sequence[RagCompletedTurn],
    summary: RagStoredSummary | None = None,
    handoff: RagStoredHandoff | None = None,
) -> RagRetrievalQuery:
    intent = classify_question_intent(question)
    if intent in {"standalone", "topic_change"}:
        return RagRetrievalQuery(question, "current_question")

    inherited_reference = bool(PREVIOUS_CONVERSATION.search(normalize_topic_text(question)))
    expansions = []
    if recent_turns and not (handoff and inherited_reference):
        turn = max(recent_turns, key=lambda entry: (
            topic_overlap(question, f"{_clean(entry.question)}\n{_clean(entry.answer)}"), entry.turn_index,
        ))
        expansions.append(
            "\nRecent conversation topic:\n" + truncate_text_to_tokens(_clean(turn.question), 100)
            + "\nPrevious explanation context:\n" + truncate_text_to_tokens(_clean(turn.answer), 140)
        )

    for memory, heading in ((summary, "Earlier study topic"), (handoff, "Inherited study topic")):
        if memory is None or (memory is summary and handoff and inherited_reference):
            continue
        terms = _clean(", ".join(filter(None, [
            memory.summary.main_topic, *memory.summary.covered_concepts[-3:], memory.summary.continuation_hint,
        ])))
        if terms and (not expansions or (memory is handoff and inherited_reference)
                      or topic_overlap(question, terms)):
            expansions.append(f"\n{heading}:\n" + truncate_text_to_tokens(terms, 100))
    if not expansions:
        return RagRetrievalQuery(question, "current_question")
    expansion = truncate_text_to_tokens("".join(expansions), 300)
    return RagRetrievalQuery(question + expansion, "history_augmented")


def build_retrieval_query(
    question: str,
    recent_turns: Sequence[RagCompletedTurn],
    summary: RagStoredSummary | None = None,
    handoff: RagStoredHandoff | None = None,
) -> RagRetrievalQuery:
    build = build_adaptive_retrieval_query if settings.rag_context_quality_enabled else _build_legacy_retrieval_query
    return build(question, recent_turns, summary, handoff)
