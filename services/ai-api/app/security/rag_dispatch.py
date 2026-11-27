from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_telemetry import measure_stage
from app.security.rag_privacy import assert_safe_rag_provider_text

_authorize: ContextVar[Callable[[], None] | None] = ContextVar("rag_dispatch_authorize", default=None)
rag_dispatch_deadline: ContextVar[RagDeadline | None] = ContextVar("rag_dispatch_deadline", default=None)


class RagDispatchAuthorizationError(RuntimeError):
    pass


def require_rag_dispatch_authorization() -> None:
    if _authorize.get() is None:
        raise RagDispatchAuthorizationError("RAG v2 provider dispatch requires operation authorization.")


@contextmanager
def rag_dispatch_authorization(authorize: Callable[[], None]) -> Iterator[None]:
    token = _authorize.set(authorize)
    try:
        yield
    finally:
        _authorize.reset(token)


def before_rag_dispatch(*contents: str, deadline: RagDeadline | None = None) -> bool:
    if settings.rag_privacy_filter_enabled:
        for text in contents:
            assert_safe_rag_provider_text(text)
    callback = _authorize.get()
    if callback is None:
        return False
    if deadline:
        deadline.require_remaining()
    token = rag_dispatch_deadline.set(deadline)
    try:
        with measure_stage("provider_authorization"):
            callback()
    finally:
        rag_dispatch_deadline.reset(token)
    if deadline:
        deadline.require_remaining()
    return True
