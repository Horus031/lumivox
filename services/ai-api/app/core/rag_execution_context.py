import logging
from dataclasses import asdict, dataclass, field
from typing import Literal, Protocol
from uuid import uuid4

from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_telemetry import measure_stage
from app.security.rag_dispatch import rag_dispatch_deadline, require_rag_dispatch_authorization


RagProviderStage = Literal["answer", "rolling_summary", "handoff", "embedding"]


@dataclass
class RagProviderAttempt:
    stage: RagProviderStage
    provider: str
    model: str
    outcome: Literal["success", "failed", "unknown"] = "unknown"
    latency_ms: int = 0
    error_code: str | None = None
    estimated_prompt_tokens: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class RagLedgerUnavailable(RuntimeError):
    pass


class RagAttemptLedger(Protocol):
    def begin(self, attempt_id: str, index: int, attempt: RagProviderAttempt, reserved_output: int | None) -> bool: ...
    def finish(self, attempt_id: str, attempt: RagProviderAttempt) -> None: ...


def aggregate_attempt_usage(attempts: list[RagProviderAttempt]) -> dict:
    fields = ("prompt_tokens", "completion_tokens", "total_tokens")
    known = {
        name: sum(value for attempt in attempts if (value := getattr(attempt, name)) is not None)
        for name in fields
    }
    missing = {name: sum(getattr(attempt, name) is None for attempt in attempts) for name in fields}
    return {
        "provider_calls": len(attempts), "known_usage": known, "unknown_usage_attempts": missing,
        "usage_complete": {name: count == 0 for name, count in missing.items()},
    }


@dataclass
class RagExecutionContext:
    deadline: RagDeadline
    max_provider_calls: int
    answer_call_reserve: int = 0
    needs_embedding: bool = False
    attempts: list[RagProviderAttempt] = field(default_factory=list)
    ledger: RagAttemptLedger | None = None
    ledger_unconfirmed: bool = False

    def begin_attempt(self, attempt: RagProviderAttempt, reserved_output: int | None,
                      deadline: RagDeadline) -> str | None:
        if not settings.rag_durable_accounting_enabled:
            return None
        require_rag_dispatch_authorization()
        if self.ledger is None:
            raise RagLedgerUnavailable("RAG attempt ledger is required.")
        attempt_id = str(uuid4())
        token = rag_dispatch_deadline.set(deadline)
        try:
            with measure_stage("attempt_begin"):
                if not self.ledger.begin(attempt_id, len(self.attempts) + 1, attempt, reserved_output):
                    raise RagLedgerUnavailable("RAG attempt identity already exists.")
        except Exception:
            self.ledger_unconfirmed = True
            raise
        finally:
            rag_dispatch_deadline.reset(token)
        return attempt_id

    def finish_attempt(self, attempt_id: str | None, attempt: RagProviderAttempt, deadline: RagDeadline) -> None:
        if attempt_id is None or self.ledger is None:
            return
        token = rag_dispatch_deadline.set(deadline)
        try:
            with measure_stage("attempt_finish"):
                self.ledger.finish(attempt_id, attempt)
        except Exception:
            self.ledger_unconfirmed = True
            logging.getLogger(__name__).warning("RAG provider outcome ledger write was not confirmed.")
        finally:
            rag_dispatch_deadline.reset(token)

    def has_provider_budget(self, stage: RagProviderStage) -> bool:
        reserve = self.answer_call_reserve if stage in {"rolling_summary", "embedding"} else 0
        if stage == "rolling_summary" and self.needs_embedding:
            reserve += 1
        return len(self.attempts) + reserve < self.max_provider_calls

    def accounting(self) -> list[dict]:
        return [asdict(attempt) for attempt in self.attempts]
