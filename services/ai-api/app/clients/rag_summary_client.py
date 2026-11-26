import time
from dataclasses import dataclass

from groq import APIConnectionError, APIStatusError
from pydantic import ValidationError

from app.clients.rag_llm_client import (
    RagChatMessage,
    RagFailedAttempt,
    RagLLMError,
    RagTokenUsage,
    _classify_provider_error,
    _get_rag_groq_client,
    _read_token_usage,
    _validate_messages,
)
from app.core.config import settings
from app.core.rag_model_registry import parse_rag_model_chain, validate_rag_configuration
from app.core.rag_token_budget import assert_prompt_budget
from app.schemas.rag_conversation_summary import RagConversationSummary, SUMMARY_RESPONSE_FORMAT


@dataclass(frozen=True)
class RagSummaryGeneration:
    summary: RagConversationSummary
    provider: str
    model: str
    usage: RagTokenUsage
    latency_ms: int


def generate_rag_summary(
    messages: list[RagChatMessage], *, deadline_at: float | None = None
) -> RagSummaryGeneration:
    validate_rag_configuration()
    _validate_messages(messages)
    assert_prompt_budget(messages)
    client = _get_rag_groq_client()
    models = parse_rag_model_chain(settings.rag_summary_models)
    start = time.monotonic()
    deadline = start + settings.rag_summary_deadline_seconds
    if deadline_at is not None:
        deadline = min(deadline, deadline_at)
    failures: list[RagFailedAttempt] = []
    for model in models:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RagLLMError(code="timeout", retryable=True, attempts=tuple(failures))
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_completion_tokens=settings.rag_summary_completion_tokens,
                timeout=min(remaining, settings.rag_summary_request_timeout_seconds),
                response_format=SUMMARY_RESPONSE_FORMAT,
                reasoning_effort="low",
                stream=False,
            )
            if time.monotonic() >= deadline:
                raise RagLLMError(code="timeout", retryable=True)
            if not response.choices:
                raise RagLLMError(code="empty_response", retryable=True)
            choice = response.choices[0]
            if choice.finish_reason != "stop":
                raise RagLLMError(code="incomplete_response", retryable=True)
            if not choice.message.content:
                raise RagLLMError(code="empty_response", retryable=True)
            return RagSummaryGeneration(
                summary=RagConversationSummary.model_validate_json(choice.message.content),
                provider="groq",
                model=model,
                usage=_read_token_usage(response),
                latency_ms=round((time.monotonic() - start) * 1000),
            )
        except (APIConnectionError, APIStatusError, RagLLMError, ValidationError) as error:
            if isinstance(error, ValidationError):
                code, retryable = "incomplete_response", True
            else:
                code, retryable = _classify_provider_error(error)
            failures.append(RagFailedAttempt(model=model, code=code))
            if not retryable or model == models[-1]:
                raise RagLLMError(code=code, retryable=retryable, attempts=tuple(failures)) from None

    raise RagLLMError(code="configuration_error", retryable=False)
