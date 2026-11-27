from collections.abc import Callable
from dataclasses import dataclass

from app.clients.rag_llm_client import RagChatMessage
from app.core.rag_token_budget import estimate_message_tokens
from app.schemas.rag_conversation_context import RagCompletedTurn
from app.services.rag_topic_context import topic_overlap

EXCERPT_PROFILES = ((160, 220), (100, 140), (64, 96), (32, 48))


@dataclass(frozen=True)
class RagPackedHistory:
    messages: list[RagChatMessage]
    selected_turn_indices: tuple[int, ...]
    truncated_turn_indices: tuple[int, ...]
    tokens_used: int


def rank_history_candidates(
    *, question: str, turns: list[RagCompletedTurn], recent_window: int,
) -> list[RagCompletedTurn]:
    ordered = sorted(turns, key=lambda turn: turn.turn_index, reverse=True)
    recent = {turn.turn_index for turn in ordered[:recent_window]}

    def score(turn: RagCompletedTurn) -> tuple[bool, int, int]:
        relevance = topic_overlap(question, f"{turn.question}\n{turn.answer}")
        return bool(relevance or turn.turn_index in recent), relevance, turn.turn_index

    return [*ordered[:1], *sorted(ordered[1:], key=score, reverse=True)]


def pack_history_candidates(
    *, question: str, turns: list[RagCompletedTurn], system: RagChatMessage, current: RagChatMessage,
    max_history_tokens: int, max_prompt_tokens: int, recent_window: int,
    history_excerpt: Callable[[str, int], tuple[str, bool]],
) -> RagPackedHistory:
    baseline = estimate_message_tokens([system, current])
    remaining = min(max_prompt_tokens - baseline, max_history_tokens)
    selected: dict[int, tuple[list[RagChatMessage], bool]] = {}
    for turn in rank_history_candidates(question=question, turns=turns, recent_window=recent_window):
        for question_tokens, answer_tokens in EXCERPT_PROFILES:
            user, user_truncated = history_excerpt(turn.question, question_tokens)
            assistant, assistant_truncated = history_excerpt(turn.answer, answer_tokens)
            pair: list[RagChatMessage] = [
                {"role": "user", "content": user},
                {"role": "assistant", "content": assistant},
            ]
            cost = estimate_message_tokens([system, *pair, current]) - baseline
            if cost <= remaining:
                selected[turn.turn_index] = (pair, user_truncated or assistant_truncated)
                remaining -= cost
                break
    indices = tuple(sorted(selected))
    messages = [message for index in indices for message in selected[index][0]]
    return RagPackedHistory(
        messages, indices, tuple(index for index in indices if selected[index][1]),
        estimate_message_tokens([system, *messages, current]) - baseline,
    )
