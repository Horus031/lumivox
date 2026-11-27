import logging
import time
from collections.abc import Callable
from typing import Any, Literal, TypeVar

from groq import APIConnectionError, APIStatusError

from app.clients.rag_redis_client import RagRedisUnavailable
from app.core.config import settings
from app.core.rag_deadline import RagDeadline, RagDeadlineExceeded
from app.core.rag_execution_context import RagExecutionContext, RagProviderAttempt, RagProviderStage
from app.core.rag_telemetry import current_telemetry, measure_stage, record_provider_admission
from app.security.rag_dispatch import before_rag_dispatch
from app.services.rag_provider_budget import (
    acquire_provider_permit, mark_model_cooldown, release_provider_permit, retry_after_seconds, settle_provider_debt,
)


ResourceErrorCode = Literal["provider_busy", "provider_cooldown", "resource_control_unavailable",
                            "provider_call_budget_exceeded", "provider_rpm_limited", "provider_tpm_limited",
                            "provider_quota_unavailable", "timeout"]
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
    throughput = settings.rag_provider_throughput_enabled
    reserved_output = request_options.get("max_completion_tokens")
    quota_options = {"input_tokens": estimated_prompt_tokens, "output_tokens": reserved_output} if throughput else {}
    redis_timeout = min(remaining, settings.rag_provider_admission_timeout_seconds)
    try:
        with measure_stage("provider_admission"):
            status, permit = acquire_provider_permit(model, timeout=redis_timeout, **quota_options)
    except RagRedisUnavailable:
        record_provider_admission("unavailable")
        raise RagProviderExecutionError("provider_quota_unavailable" if throughput else "resource_control_unavailable") from None
    record_provider_admission(status)
    if status == "busy":
        raise RagProviderExecutionError("provider_busy")
    if status == "cooldown":
        raise RagProviderExecutionError("provider_cooldown", retryable=True)
    if status == "rpm_limited":
        raise RagProviderExecutionError("provider_rpm_limited", retryable=True)
    if status == "tpm_limited":
        raise RagProviderExecutionError("provider_tpm_limited", retryable=True)
    if status == "quota_unavailable":
        raise RagProviderExecutionError("provider_quota_unavailable")
    if permit is None:
        raise RagProviderExecutionError("resource_control_unavailable")

    retain_permit = False
    try:
        messages = request_options.get("messages", [])
        before_rag_dispatch(*(message["content"] for message in messages), deadline=deadline)
        if not context.has_provider_budget(stage):
            raise RagProviderExecutionError("provider_call_budget_exceeded")
        attempt = RagProviderAttempt(stage, "groq", model, estimated_prompt_tokens=estimated_prompt_tokens)
        attempt_id = context.begin_attempt(attempt, reserved_output, deadline.bounded(1.0))
        try:
            if attempt_id is not None:
                before_rag_dispatch(deadline=deadline)
            remaining = min(deadline.remaining(), context.deadline.remaining())
            if remaining <= 0.1:
                raise RagProviderExecutionError("timeout", retryable=attempt_id is None)
            options = {**request_options, "timeout": min(request_options["timeout"], remaining)}
        except Exception:
            attempt.outcome = "failed"
            attempt.error_code = "dispatch_cancelled"
            context.finish_attempt(attempt_id, attempt, deadline.bounded(1.0))
            raise
        context.attempts.append(attempt)
        started = time.monotonic()
        try:
            with measure_stage("provider_dispatch"):
                response = client.chat.completions.create(**options)
            usage = getattr(response, "usage", None)
            for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
                value = getattr(usage, name, None)
                upper = 2_000_000 if name == "total_tokens" else 1_000_000
                if type(value) is int and 0 <= value <= upper:
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
                    with measure_stage("provider_cooldown"):
                        mark_model_cooldown(model, seconds=retry_after_seconds(error.response.headers.get("retry-after")),
                                            timeout=min(0.25, redis_timeout))
                except RagRedisUnavailable:
                    raise RagProviderExecutionError("resource_control_unavailable") from None
            raise
        finally:
            attempt.latency_ms = max(0, round((time.monotonic() - started) * 1_000))
            if throughput:
                input_tokens, output_tokens, total_tokens = (
                    attempt.prompt_tokens or 0, attempt.completion_tokens or 0, attempt.total_tokens or 0,
                )
                if (input_tokens > estimated_prompt_tokens or output_tokens > reserved_output
                    or total_tokens > estimated_prompt_tokens + reserved_output):
                    telemetry = current_telemetry()
                    if telemetry:
                        telemetry.usage_underestimated = True
                    try:
                        with measure_stage("provider_quota_settlement"):
                            settle_provider_debt(permit, input_tokens=input_tokens, output_tokens=output_tokens,
                                                 total_tokens=total_tokens, timeout=min(0.25, deadline.require_remaining(0)))
                    except (RagRedisUnavailable, RagDeadlineExceeded):
                        if telemetry:
                            telemetry.quota_settlement_unavailable = True
                        logger.warning("RAG provider quota settlement was not confirmed.")
                        try:
                            mark_model_cooldown(model, seconds=60, timeout=min(0.25, deadline.require_remaining(0)))
                        except (RagRedisUnavailable, RagDeadlineExceeded):
                            pass
            context.finish_attempt(attempt_id, attempt, deadline.bounded(1.0))
    finally:
        if not retain_permit:
            try:
                with measure_stage("provider_release"):
                    release_provider_permit(permit, timeout=min(0.25, redis_timeout))
            except RagRedisUnavailable:
                logger.warning("RAG provider permit release unavailable. The permit will expire.")
