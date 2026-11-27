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
from app.core.rag_deadline import RagDeadline
from app.security.rag_dispatch import before_rag_dispatch
from app.core.rag_execution_context import RagExecutionContext, RagProviderStage
from app.services.rag_provider_execution import RagProviderExecutionError, execute_rag_provider_call
from app.core.rag_model_registry import parse_rag_model_chain, validate_rag_configuration
from app.core.rag_token_budget import assert_prompt_budget
from app.core.rag_telemetry import measure_stage, note_unmanaged_dispatch
from app.schemas.rag_conversation_summary import RagConversationSummary, SUMMARY_RESPONSE_FORMAT


@dataclass(frozen=True)
class RagSummaryGeneration:
    summary: RagConversationSummary
    provider: str
    model: str
    usage: RagTokenUsage
    latency_ms: int


def generate_rag_summary(
    messages: list[RagChatMessage], *, deadline_at: float | None = None,
    execution_context: RagExecutionContext | None = None, stage: RagProviderStage = "rolling_summary"
) -> RagSummaryGeneration:
    validate_rag_configuration()
    _validate_messages(messages)
    estimated_prompt_tokens = assert_prompt_budget(messages)
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
            request_options = {
                "model": model, "messages": messages,
                "max_completion_tokens": settings.rag_summary_completion_tokens,
                "timeout": min(remaining, settings.rag_summary_request_timeout_seconds),
                "response_format": SUMMARY_RESPONSE_FORMAT, "reasoning_effort": "low", "stream": False,
            }

            def parse_response(response) -> RagSummaryGeneration:
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

            if execution_context is not None:
                return execute_rag_provider_call(
                    client=client, request_options=request_options, stage=stage, context=execution_context,
                    deadline=RagDeadline(deadline), estimated_prompt_tokens=estimated_prompt_tokens,
                    classify_error=_classify_summary_error, parse_response=parse_response,
                )
            if settings.rag_durable_accounting_enabled or settings.rag_provider_throughput_enabled:
                raise RagProviderExecutionError("provider_quota_unavailable")
            if before_rag_dispatch(*(message["content"] for message in messages), deadline=RagDeadline(deadline)):
                request_options["timeout"] = min(request_options["timeout"], RagDeadline(deadline).require_remaining())
            note_unmanaged_dispatch(stage, "groq", model)
            with measure_stage("provider_dispatch"):
                response = client.chat.completions.create(**request_options)
            return parse_response(response)

        except (APIConnectionError, APIStatusError, RagLLMError, RagProviderExecutionError, ValidationError) as error:
            code, retryable = _classify_summary_error(error)
            failures.append(RagFailedAttempt(model=model, code=code))
            if not retryable or model == models[-1]:
                raise RagLLMError(code=code, retryable=retryable, attempts=tuple(failures)) from None

    raise RagLLMError(code="configuration_error", retryable=False)


def _classify_summary_error(error: Exception):
    if isinstance(error, ValidationError):
        return "incomplete_response", True
    return _classify_provider_error(error)
