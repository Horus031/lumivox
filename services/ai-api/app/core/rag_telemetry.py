import json
import logging
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from functools import wraps
from time import perf_counter
from typing import TYPE_CHECKING
from uuid import uuid4

from app.core.config import settings

if TYPE_CHECKING:
    from app.core.rag_execution_context import RagExecutionContext

logger = logging.getLogger(__name__)


@dataclass
class StageTiming:
    count: int = 0
    total_ms: float = 0
    failures: int = 0


@dataclass
class RagOperationTelemetry:
    operation: str
    document_mode: bool
    trace_id: str = field(default_factory=lambda: uuid4().hex)
    started: float = field(default_factory=perf_counter)
    stages: dict[str, StageTiming] = field(default_factory=dict)
    outcome: str = "completed"
    error_code: str | None = None
    execution: "RagExecutionContext | None" = None
    provider_models: list[tuple[str, str, str]] = field(default_factory=list)
    admission_outcomes: dict[str, int] = field(default_factory=dict)
    quota_settlement_unavailable: bool = False
    usage_underestimated: bool = False

    @contextmanager
    def measure(self, stage):
        timing = self.stages.setdefault(stage, StageTiming())
        timing.count += 1
        started = perf_counter()
        try:
            yield
        except BaseException:
            timing.failures += 1
            raise
        finally:
            timing.total_ms += (perf_counter() - started) * 1000

    def snapshot(self):
        execution = self.execution
        attempts = execution.attempts if execution else []
        known_tokens = [attempt.total_tokens for attempt in attempts if attempt.total_tokens is not None]
        provider_calls = len(attempts) if execution else len(self.provider_models)
        unknown_usage = provider_calls - len(known_tokens)
        measured = execution is not None or bool(self.provider_models) or self.outcome in {
            "replayed", "deterministic_abstention",
        } or (
            self.operation == "fresh" and self.outcome == "completed"
        )
        state = "unavailable"
        if execution and execution.ledger_unconfirmed:
            state = "interrupted"
        elif measured:
            if not provider_calls:
                state = "not_applicable"
            elif execution and execution.ledger is not None:
                usage_incomplete = any(
                    None in (attempt.prompt_tokens, attempt.completion_tokens, attempt.total_tokens)
                    for attempt in attempts
                )
                state = "partial_usage" if usage_incomplete else "complete"
        dispatched_models = [(a.stage, a.provider, a.model) for a in attempts] if execution else self.provider_models
        return {
            "event": "rag.operation.finished", "schema_version": 1, "trace_id": self.trace_id,
            "operation": self.operation, "document_mode": self.document_mode, "outcome": self.outcome,
            "error_code": self.error_code, "elapsed_ms": round((perf_counter() - self.started) * 1000, 2),
            "provider_calls": provider_calls if measured else None,
            "known_provider_tokens": sum(known_tokens) if known_tokens else None,
            "unknown_usage_attempts": unknown_usage if measured else None,
            "accounting_state": state, "quota_settlement_unavailable": self.quota_settlement_unavailable,
            "usage_underestimated": self.usage_underestimated,
            "provider_admission_outcomes": self.admission_outcomes.copy(),
            "fallback_used": any(
                provider == "groq" and model in chain[1:]
                for stage, provider, model in dispatched_models
                for chain in [[item.strip() for item in (
                    settings.rag_chat_models if stage == "answer" else settings.rag_summary_models
                ).split(",") if item.strip()]]
            ),
            "stages": {stage: {**asdict(timing), "total_ms": round(timing.total_ms, 2)}
                       for stage, timing in self.stages.items()},
        }


_current: ContextVar[RagOperationTelemetry | None] = ContextVar("rag_operation_telemetry", default=None)

_OUTCOMES = {
    "RAG_TURN_IN_PROGRESS": "in_progress", "RAG_NEW_CHAT_IN_PROGRESS": "in_progress",
    "RAG_TURN_OUTCOME_UNKNOWN": "unknown", "RAG_PERSISTENCE_UNAVAILABLE": "unknown",
    "RAG_DOCUMENT_ACCESS_DENIED": "authorization_rejected", "RAG_INVALID_LEASE": "authorization_rejected",
    "RAG_MEMORY_QUARANTINED": "authorization_rejected", "RAG_SESSION_NOT_FOUND": "authorization_rejected",
    "RAG_INVALID_REQUEST": "admission_rejected", "RAG_CONVERSATION_LIMIT_REACHED": "admission_rejected",
    "RAG_NEW_CHAT_DISABLED": "admission_rejected", "RAG_HANDOFF_DISABLED": "admission_rejected",
    "RAG_PROVIDER_CALL_BUDGET_EXCEEDED": "admission_rejected",
    "RAG_PROVIDER_BUSY": "provider_busy", "RAG_PROVIDER_COOLDOWN": "admission_rejected",
    "RAG_PROVIDER_RPM_LIMITED": "admission_rejected", "RAG_PROVIDER_TPM_LIMITED": "admission_rejected",
    "RAG_PROVIDER_QUOTA_UNAVAILABLE": "admission_rejected", "RAG_RESOURCE_CONTROL_UNAVAILABLE": "admission_rejected",
    "RAG_PROVIDER_RATE_LIMITED": "provider_rate_limited", "RAG_REQUEST_DEADLINE_EXCEEDED": "deadline_exceeded",
    "RAG_GENERATION_FAILED": "failed", "RAG_NEW_CHAT_PREPARATION_FAILED": "failed",
}


def current_telemetry():
    return _current.get()


def configure_telemetry_logging() -> None:
    if settings.rag_observability_enabled and not logger.handlers:
        logger.addHandler(logging.StreamHandler())
        logger.setLevel(logging.INFO)
        logger.propagate = False


def note_unmanaged_dispatch(stage, provider, model):
    if telemetry := current_telemetry():
        telemetry.provider_models.append((stage, provider, model))


def record_provider_admission(outcome):
    if telemetry := current_telemetry():
        counts = telemetry.admission_outcomes
        counts[outcome] = counts.get(outcome, 0) + 1


def measure_stage(stage):
    telemetry = current_telemetry()
    return telemetry.measure(stage) if telemetry else nullcontext()


def timed_stage(stage):
    def decorate(function):
        @wraps(function)
        def invoke(*args, **kwargs):
            with measure_stage(stage):
                return function(*args, **kwargs)
        return invoke
    return decorate


def record_outcome(outcome):
    if telemetry := current_telemetry():
        telemetry.outcome = outcome


def observe_operation(function):
    @wraps(function)
    def invoke(*args, **kwargs):
        if not settings.rag_observability_enabled:
            return function(*args, **kwargs)
        request = args[0] if args else kwargs.get("request")
        telemetry = RagOperationTelemetry(
            request.mode if request else "ask",
            bool(request.selected_document_ids if request else kwargs.get("selected_document_ids")),
        )
        token = _current.set(telemetry)
        try:
            return function(*args, **kwargs)
        except BaseException as error:
            code = getattr(error, "code", None)
            telemetry.error_code = code if isinstance(code, str) and code in _OUTCOMES else None
            telemetry.outcome = "unknown" if getattr(error, "outcome", None) == "unknown" else _OUTCOMES.get(
                telemetry.error_code, "failed",
            )
            raise
        finally:
            _current.reset(token)
            try:
                logger.info(json.dumps(telemetry.snapshot(), separators=(",", ":")))
            except Exception:
                pass
    return invoke
