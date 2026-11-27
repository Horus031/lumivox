import time
from dataclasses import dataclass


class RagDeadlineExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class RagDeadline:
    expires_at: float

    @classmethod
    def start(cls, seconds: float) -> "RagDeadline":
        return cls(time.monotonic() + seconds)

    def remaining(self) -> float:
        return max(0.0, self.expires_at - time.monotonic())

    def require_remaining(self, minimum: float = 0.1) -> float:
        remaining = self.remaining()
        if remaining <= minimum:
            raise RagDeadlineExceeded("RAG request deadline exceeded.")
        return remaining

    def bounded(self, maximum: float, reserve: float = 0.0) -> "RagDeadline":
        return RagDeadline(min(self.expires_at - reserve, time.monotonic() + maximum))
