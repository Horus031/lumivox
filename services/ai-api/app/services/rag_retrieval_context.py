import re
from dataclasses import dataclass
from typing import Sequence

from app.core.rag_token_budget import count_text_tokens, truncate_text_to_tokens
from app.schemas.rag_conversation_context import RagCompletedTurn, RagRetrievalStrategy
from app.schemas.rag_conversation_summary import RagStoredSummary


FOLLOW_UP_PATTERN = re.compile(
    r"\b(it|its|this|that|these|those|they|them|the former|the latter|which one|"
    r"what about|how about|why|nó|chúng|cái này|cái đó|điều này|điều đó|"
    r"phần này|phần đó|vậy|tại sao|còn|tiếp theo)\b",
    re.IGNORECASE,
)
EXPLICIT_TOPIC_CHANGE = re.compile(
    r"\b(new topic|unrelated question|switch topics|chủ đề mới|đổi chủ đề|"
    r"câu hỏi khác)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RagRetrievalQuery:
    text: str
    strategy: RagRetrievalStrategy


def build_retrieval_query(
    question: str,
    recent_turns: Sequence[RagCompletedTurn],
    summary: RagStoredSummary | None = None,
) -> RagRetrievalQuery:
    if (
        not recent_turns
        or EXPLICIT_TOPIC_CHANGE.search(question)
        or (not FOLLOW_UP_PATTERN.search(question) and count_text_tokens(question) > 8)
    ):
        return RagRetrievalQuery(question, "current_question")

    latest = max(recent_turns, key=lambda turn: turn.turn_index)
    topic = truncate_text_to_tokens(latest.question, 100)
    explanation = truncate_text_to_tokens(latest.answer, 140)
    text = (
        f"Current question:\n{question}\n"
        f"Recent conversation topic:\n{topic}\n"
        f"Previous explanation context:\n{explanation}"
    )
    if summary:
        terms = ", ".join(filter(None, [
            summary.summary.main_topic, *summary.summary.covered_concepts[-3:],
        ]))
        if terms:
            text += "\nEarlier study topic:\n" + truncate_text_to_tokens(terms, 100)
    return RagRetrievalQuery(text, "history_augmented")
