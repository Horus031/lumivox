
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, TypedDict

from groq import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    Groq,
)

from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.services.rag_provider_execution import RagProviderExecutionError, execute_rag_provider_call
from app.core.rag_model_registry import (
    get_rag_model_capability,
    parse_rag_model_chain,
    validate_rag_configuration,
)
from app.core.rag_token_budget import RagTokenBudgetError, assert_prompt_budget


logger = logging.getLogger(__name__)


class RagChatMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


RagErrorCode = Literal[
    "configuration_error",
    "invalid_request",
    "authentication_error",
    "model_unavailable",
    "rate_limit",
    "timeout",
    "context_length_exceeded",
    "provider_unavailable",
    "empty_response",
    "incomplete_response",
    "provider_busy",
    "provider_cooldown",
    "resource_control_unavailable",
    "provider_call_budget_exceeded",
]


@dataclass(frozen=True)
class RagTokenUsage:
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None


@dataclass(frozen=True)
class RagChatGeneration:
    text: str
    provider: str
    model: str
    latency_ms: int
    attempts: int
    usage: RagTokenUsage
    finish_reason: str


@dataclass(frozen=True)
class RagFailedAttempt:
    model: str
    code: RagErrorCode


class RagLLMError(RuntimeError):
    def __init__(
        self,
        *,
        code: RagErrorCode,
        retryable: bool,
        attempts: tuple[RagFailedAttempt, ...] = (),
    ) -> None:
        self.code = code
        self.retryable = retryable
        self.attempts = attempts

        super().__init__(
            f"RAG generation failed: {code}"
        )


@lru_cache(maxsize=1)
def _get_rag_groq_client() -> Groq:
    if not settings.groq_api_key:
        raise RagLLMError(
            code="configuration_error",
            retryable=False,
        )

    return Groq(
        api_key=settings.groq_api_key,
        timeout=settings.rag_request_timeout_seconds,
        max_retries=0,
    )


def _validate_messages(
    messages: list[RagChatMessage],
) -> None:
    if len(messages) < 2 or messages[0]["role"] != "system":
        raise RagLLMError(
            code="invalid_request",
            retryable=False,
        )

    if messages[-1]["role"] != "user":
        raise RagLLMError(
            code="invalid_request",
            retryable=False,
        )

    for index, message in enumerate(messages):
        expected_role = "system" if index == 0 else "user" if index % 2 else "assistant"
        if message["role"] != expected_role:
            raise RagLLMError(
                code="invalid_request",
                retryable=False,
            )

        if not message["content"].strip():
            raise RagLLMError(
                code="invalid_request",
                retryable=False,
            )


def _read_token_usage(response) -> RagTokenUsage:
    usage = getattr(response, "usage", None)

    return RagTokenUsage(
        prompt_tokens=getattr(
            usage, "prompt_tokens", None
        ),
        completion_tokens=getattr(
            usage, "completion_tokens", None
        ),
        total_tokens=getattr(
            usage, "total_tokens", None
        ),
    )


def _classify_provider_error(
    error: Exception,
) -> tuple[RagErrorCode, bool]:
    if isinstance(error, (RagLLMError, RagProviderExecutionError)):
        return error.code, error.retryable

    if isinstance(error, APITimeoutError):
        return "timeout", True

    if isinstance(error, APIConnectionError):
        return "provider_unavailable", True

    if isinstance(error, APIStatusError):
        status = error.status_code

        body = getattr(error, "body", None)
        error_code = None

        if isinstance(body, dict):
            provider_error = body.get("error", body)

            if isinstance(provider_error, dict):
                error_code = provider_error.get("code")

        if error_code == "context_length_exceeded":
            return "context_length_exceeded", False

        if status == 429:
            return "rate_limit", True

        if status in {401, 403}:
            return "authentication_error", False

        if status == 404 or error_code in {
            "model_decommissioned",
            "model_not_found",
        }:
            return "model_unavailable", True

        if status == 408:
            return "timeout", True

        if status == 409 or status >= 500:
            return "provider_unavailable", True

        if status in {400, 413, 422}:
            return "invalid_request", False

    return "provider_unavailable", False


def generate_rag_chat(
    messages: list[RagChatMessage],
    *,
    max_completion_tokens: int | None = None,
    deadline_at: float | None = None,
    execution_context: RagExecutionContext | None = None,
) -> RagChatGeneration:
    validate_rag_configuration()
    _validate_messages(messages)
    try:
        estimated_prompt_tokens = assert_prompt_budget(messages)
    except RagTokenBudgetError:
        raise RagLLMError(code="context_length_exceeded", retryable=False) from None

    client = _get_rag_groq_client()

    models = parse_rag_model_chain(
        settings.rag_chat_models
    )

    completion_budget = (
        settings.rag_max_completion_tokens
        if max_completion_tokens is None
        else max_completion_tokens
    )

    if (
        completion_budget < 1
        or completion_budget
        > settings.rag_max_completion_tokens
    ):
        raise RagLLMError(
            code="invalid_request",
            retryable=False,
        )

    started_at = time.monotonic()

    deadline = (
        started_at
        + settings.rag_generation_deadline_seconds
    )

    if deadline_at is not None:
        deadline = min(deadline, deadline_at)

    failures: list[RagFailedAttempt] = []
    attempts = 0

    for model in models:
        capability = get_rag_model_capability(model)

        for _ in range(
            settings.rag_max_attempts_per_model
        ):
            remaining_seconds = (
                deadline - time.monotonic()
            )

            if remaining_seconds <= 0.1:
                raise RagLLMError(
                    code="timeout",
                    retryable=True,
                    attempts=tuple(failures),
                )

            attempts += 1

            try:
                request_options = {
                    "model": model,
                    "messages": messages,
                    "max_completion_tokens": (
                        completion_budget
                    ),
                    "temperature": 0.3,
                    "timeout": min(
                        settings.rag_request_timeout_seconds,
                        remaining_seconds,
                    ),
                }

                if capability.supports_reasoning_effort:
                    request_options["reasoning_effort"] = (
                        settings.rag_reasoning_effort
                    )

                def parse_response(response) -> RagChatGeneration:
                    usage = _read_token_usage(response)
                    if (
                        usage.prompt_tokens is not None
                        and usage.prompt_tokens > settings.rag_max_prompt_tokens
                    ):
                        logger.warning(
                            "RAG provider prompt tokens exceeded budget: actual=%s budget=%s",
                            usage.prompt_tokens,
                            settings.rag_max_prompt_tokens,
                        )

                    if execution_context is None and time.monotonic() >= deadline:
                        raise RagLLMError(
                            code="timeout",
                            retryable=True,
                        )

                    if not response.choices:
                        raise RagLLMError(
                            code="empty_response",
                            retryable=True,
                        )

                    choice = response.choices[0]

                    finish_reason = (
                        choice.finish_reason or "unknown"
                    )

                    if finish_reason != "stop":
                        raise RagLLMError(
                            code="incomplete_response",
                            retryable=True,
                        )

                    text = (
                        choice.message.content or ""
                    ).strip()

                    if not text:
                        raise RagLLMError(
                            code="empty_response",
                            retryable=True,
                        )

                    return RagChatGeneration(
                        text=text,
                        provider="groq",
                        model=model,
                        latency_ms=int(
                            (
                                time.monotonic()
                                - started_at
                            ) * 1000
                        ),
                        attempts=(sum(item.stage == "answer" for item in execution_context.attempts)
                                  if execution_context is not None else attempts),
                        usage=usage,
                        finish_reason=finish_reason,
                    )
                if execution_context is not None:
                    return execute_rag_provider_call(
                        client=client, request_options=request_options, stage="answer",
                        context=execution_context, deadline=RagDeadline(deadline),
                        estimated_prompt_tokens=estimated_prompt_tokens, classify_error=_classify_provider_error,
                        parse_response=parse_response,
                    )
                return parse_response(client.chat.completions.create(**request_options))

            except (
                APIStatusError,
                APIConnectionError,
                RagLLMError,
                RagProviderExecutionError,
            ) as error:
                code, retryable = (
                    _classify_provider_error(error)
                )

                failures.append(
                    RagFailedAttempt(
                        model=model,
                        code=code,
                    )
                )

                if not retryable:
                    raise RagLLMError(
                        code=code,
                        retryable=False,
                        attempts=tuple(failures),
                    ) from None

                if code in {
                    "rate_limit",
                    "provider_cooldown",
                    "model_unavailable",
                    "incomplete_response",
                    "empty_response",
                }:
                    break

    final_code = (
        failures[-1].code
        if failures
        else "provider_unavailable"
    )

    raise RagLLMError(
        code=final_code,
        retryable=True,
        attempts=tuple(failures),
    )
