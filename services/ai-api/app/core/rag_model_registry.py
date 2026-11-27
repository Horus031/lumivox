
from __future__ import annotations

from dataclasses import dataclass
import re

from app.clients.rag_redis_client import valid_rag_redis_url

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
    if settings.rag_context_quality_enabled and settings.rag_history_candidate_turns < settings.rag_recent_turns:
        raise RagConfigurationError("History candidate window must cover the recent-turn window.")
    if settings.rag_resource_control_enabled:
        if not settings.upstash_redis_rest_url or not valid_rag_redis_url(settings.upstash_redis_rest_url) \
            or not (settings.upstash_redis_rest_token or "").strip():
            raise RagConfigurationError("RAG resource control requires a secure Redis endpoint and credentials.")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", settings.rag_resource_namespace):
            raise RagConfigurationError("Invalid RAG resource namespace.")
        if settings.app_env.lower() in {"prod", "production"} and settings.rag_resource_namespace.lower() == "local":
            raise RagConfigurationError("Production RAG requires an isolated resource namespace.")
        if settings.rag_request_deadline_seconds <= settings.rag_answer_reserve_seconds + settings.rag_completion_reserve_seconds:
            raise RagConfigurationError("RAG deadline must exceed the combined answer and completion reserves.")
        if settings.rag_provider_lease_seconds <= max(
            settings.rag_request_timeout_seconds, settings.rag_summary_request_timeout_seconds,
        ) + settings.rag_provider_admission_timeout_seconds + 5:
            raise RagConfigurationError("RAG provider lease must exceed call timeout plus safety margin.")
        if settings.rag_max_provider_calls_per_ask < 2:
            raise RagConfigurationError("RAG Ask must budget an embedding and a primary answer.")
    if settings.rag_handoff_enabled and not settings.rag_new_chat_enabled:
        raise RagConfigurationError("RAG handoff requires New Chat to be enabled.")
    if settings.rag_hard_turn_limit > 24:
        raise RagConfigurationError("RAG hard turn limit exceeds the database safety ceiling.")

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

    if settings.rag_rolling_summary_enabled:
        if not (
            settings.rag_recent_turns
            < settings.rag_summary_start_turns
            < settings.rag_hard_turn_limit
        ):
            raise RagConfigurationError("RAG summary start must be between recent and hard turn limits.")
        if settings.rag_summary_request_timeout_seconds > settings.rag_summary_deadline_seconds:
            raise RagConfigurationError("RAG summary request timeout exceeds its deadline.")
        if settings.rag_summary_max_batch_turns < settings.rag_summary_update_interval:
            raise RagConfigurationError("RAG summary batch must cover its update interval.")

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

        if settings.rag_rolling_summary_enabled and (
            settings.rag_summary_completion_tokens > capability.max_completion_tokens
            or settings.rag_max_prompt_tokens + settings.rag_summary_completion_tokens
            > capability.context_window
        ):
            raise RagConfigurationError(f"RAG summary budget exceeds the limit of {model}.")

        if not capability.supports_structured_output:
            raise RagConfigurationError(
                f"Summary model does not support "
                f"structured output: {model}"
            )
