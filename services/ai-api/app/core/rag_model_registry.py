
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class RagModelCapability:
    model_id: str
    context_window: int
    max_completion_tokens: int
    supports_structured_output: bool
    supports_reasoning_effort: bool
    tokenizer_encoding: str


RAG_MODEL_REGISTRY: dict[str, RagModelCapability] = {
    "openai/gpt-oss-20b": RagModelCapability(
        model_id="openai/gpt-oss-20b",
        context_window=131072,
        max_completion_tokens=65536,
        supports_structured_output=True,
        supports_reasoning_effort=True,
        tokenizer_encoding="o200k_harmony",
    ),
    "openai/gpt-oss-120b": RagModelCapability(
        model_id="openai/gpt-oss-120b",
        context_window=131072,
        max_completion_tokens=65536,
        supports_structured_output=True,
        supports_reasoning_effort=True,
        tokenizer_encoding="o200k_harmony",
    ),
}


class RagConfigurationError(ValueError):
    pass


def parse_rag_model_chain(value: str) -> list[str]:
    models = list(
        dict.fromkeys(
            item.strip()
            for item in value.split(",")
            if item.strip()
        )
    )

    if not models:
        raise RagConfigurationError(
            "RAG model chain must not be empty."
        )

    for model in models:
        if model not in RAG_MODEL_REGISTRY:
            raise RagConfigurationError(
                f"Unsupported RAG model: {model}"
            )

    return models


def get_rag_model_capability(
    model_id: str,
) -> RagModelCapability:
    capability = RAG_MODEL_REGISTRY.get(model_id)

    if capability is None:
        raise RagConfigurationError(
            f"Unsupported RAG model: {model_id}"
        )

    return capability


def validate_rag_configuration() -> None:
    chat_models = parse_rag_model_chain(
        settings.rag_chat_models
    )

    summary_models = parse_rag_model_chain(
        settings.rag_summary_models
    )

    if (
        settings.rag_soft_turn_limit
        >= settings.rag_hard_turn_limit
    ):
        raise RagConfigurationError(
            "RAG soft turn limit must be lower "
            "than the hard turn limit."
        )

    if (
        settings.rag_recent_turns
        >= settings.rag_hard_turn_limit
    ):
        raise RagConfigurationError(
            "RAG recent turns must be lower "
            "than the hard turn limit."
        )

    if (
        settings.rag_max_summary_tokens
        >= settings.rag_max_prompt_tokens
    ):
        raise RagConfigurationError(
            "RAG summary budget must be lower "
            "than the prompt budget."
        )

    if (
        settings.rag_request_timeout_seconds
        > settings.rag_generation_deadline_seconds
    ):
        raise RagConfigurationError(
            "RAG provider timeout must not exceed "
            "the generation deadline."
        )

    for model in dict.fromkeys(
        chat_models + summary_models
    ):
        capability = get_rag_model_capability(model)

        if (
            settings.rag_max_completion_tokens
            > capability.max_completion_tokens
        ):
            raise RagConfigurationError(
                f"Completion budget exceeds "
                f"the limit of {model}."
            )

        total_budget = (
            settings.rag_max_prompt_tokens
            + settings.rag_max_completion_tokens
        )

        if total_budget > capability.context_window:
            raise RagConfigurationError(
                f"Context budget exceeds "
                f"the limit of {model}."
            )

    for model in summary_models:
        capability = get_rag_model_capability(model)

        if not capability.supports_structured_output:
            raise RagConfigurationError(
                f"Summary model does not support "
                f"structured output: {model}"
            )