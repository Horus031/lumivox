from dataclasses import asdict, dataclass, field
from typing import Literal

from app.core.rag_deadline import RagDeadline


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

    def has_provider_budget(self, stage: RagProviderStage) -> bool:
        reserve = self.answer_call_reserve if stage in {"rolling_summary", "embedding"} else 0
        if stage == "rolling_summary" and self.needs_embedding:
            reserve += 1
        return len(self.attempts) + reserve < self.max_provider_calls

    def accounting(self) -> list[dict]:
        return [asdict(attempt) for attempt in self.attempts]
