import logging
import time
from collections.abc import Callable
from typing import Any, Literal, TypeVar

from groq import APIConnectionError, APIStatusError

from app.clients.rag_redis_client import RagRedisUnavailable
from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext, RagProviderAttempt, RagProviderStage
from app.security.rag_dispatch import before_rag_dispatch
from app.services.rag_provider_budget import (
    acquire_provider_permit, mark_model_cooldown, release_provider_permit, retry_after_seconds,
)


ResourceErrorCode = Literal["provider_busy", "provider_cooldown", "resource_control_unavailable",
                            "provider_call_budget_exceeded", "timeout"]
Result = TypeVar("Result")
logger = logging.getLogger(__name__)


class RagProviderExecutionError(RuntimeError):
    def __init__(self, code: ResourceErrorCode, retryable: bool = False):
        self.code = code
        self.retryable = retryable
        super().__init__(code)


def execute_rag_provider_call(
    *,
    client: Any,
    request_options: dict[str, Any],
    stage: RagProviderStage,
    context: RagExecutionContext,
    deadline: RagDeadline,
    estimated_prompt_tokens: int,
    classify_error: Callable[[Exception], tuple[str, bool]],
    parse_response: Callable[[Any], Result],
) -> Result:
    remaining = min(deadline.remaining(), context.deadline.remaining())
    if remaining <= 0.1:
        raise RagProviderExecutionError("timeout", retryable=True)
    if not context.has_provider_budget(stage):
        raise RagProviderExecutionError("provider_call_budget_exceeded")

    model = request_options["model"]
    redis_timeout = min(remaining, settings.rag_provider_admission_timeout_seconds)
    try:
        status, permit = acquire_provider_permit(model, timeout=redis_timeout)
    except RagRedisUnavailable:
        raise RagProviderExecutionError("resource_control_unavailable") from None
    if status == "busy":
        raise RagProviderExecutionError("provider_busy")
    if status == "cooldown":
        raise RagProviderExecutionError("provider_cooldown", retryable=True)
    if permit is None:
        raise RagProviderExecutionError("resource_control_unavailable")

    retain_permit = False
    try:
        messages = request_options.get("messages", [])
        before_rag_dispatch(*(message["content"] for message in messages), deadline=deadline)
        remaining = min(deadline.remaining(), context.deadline.remaining())
        if remaining <= 0.1:
            raise RagProviderExecutionError("timeout", retryable=True)
        if not context.has_provider_budget(stage):
            raise RagProviderExecutionError("provider_call_budget_exceeded")
        options = {**request_options, "timeout": min(request_options["timeout"], remaining)}
        attempt = RagProviderAttempt(stage, "groq", model, estimated_prompt_tokens=estimated_prompt_tokens)
        context.attempts.append(attempt)
        started = time.monotonic()
        try:
            response = client.chat.completions.create(**options)
            usage = getattr(response, "usage", None)
            for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
                value = getattr(usage, name, None)
                if type(value) is int and value >= 0:
                    setattr(attempt, name, value)
            result = parse_response(response)
            attempt.outcome = "success"
            return result
        except Exception as error:
            retain_permit = isinstance(error, APIConnectionError)
            attempt.outcome = "unknown" if retain_permit else "failed"
            attempt.error_code, _ = classify_error(error)
            if isinstance(error, APIStatusError) and error.status_code == 429:
                try:
                    mark_model_cooldown(model, seconds=retry_after_seconds(error.response.headers.get("retry-after")),
                                        timeout=min(0.25, redis_timeout))
                except RagRedisUnavailable:
                    raise RagProviderExecutionError("resource_control_unavailable") from None
            raise
        finally:
            attempt.latency_ms = max(0, round((time.monotonic() - started) * 1_000))
    finally:
        if not retain_permit:
            try:
                release_provider_permit(permit, timeout=min(0.25, redis_timeout))
            except RagRedisUnavailable:
                logger.warning("RAG provider permit release unavailable. The permit will expire.")
