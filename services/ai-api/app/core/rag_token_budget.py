from functools import lru_cache
from typing import Protocol, Sequence

import tiktoken

from app.core.config import settings


class TokenizableMessage(Protocol):
    def __getitem__(self, key: str, /) -> str: ...


class RagTokenBudgetError(ValueError):
    pass


# Conservative allowances for provider serialization, not its billing formula.
SERIALIZATION_RESERVE = 250
PER_MESSAGE_OVERHEAD = 16


@lru_cache(maxsize=1)
def get_rag_encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding("o200k_harmony")


def count_text_tokens(text: str) -> int:
    return len(get_rag_encoding().encode_ordinary(text))


def estimate_message_tokens(messages: Sequence[TokenizableMessage]) -> int:
    return SERIALIZATION_RESERVE + sum(
        PER_MESSAGE_OVERHEAD + count_text_tokens(message["role"])
        + count_text_tokens(message["content"])
        for message in messages
    )


def truncate_text_to_tokens(text: str, max_tokens: int) -> str:
    if max_tokens <= 0:
        return ""
    encoding = get_rag_encoding()
    tokens = encoding.encode_ordinary(text)
    if len(tokens) <= max_tokens:
        return text
    return encoding.decode(tokens[:max_tokens], errors="ignore")


def assert_prompt_budget(
    messages: Sequence[TokenizableMessage], max_tokens: int | None = None
) -> int:
    budget = settings.rag_max_prompt_tokens if max_tokens is None else max_tokens
    estimate = estimate_message_tokens(messages)
    if estimate > budget:
        raise RagTokenBudgetError("RAG prompt exceeds its token budget.")
    return estimate
