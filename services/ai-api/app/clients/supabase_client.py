from functools import lru_cache
from contextlib import contextmanager
from contextvars import ContextVar
from collections.abc import Iterator

import httpx
from supabase import Client, ClientOptions, create_client

from app.core.config import settings
from app.core.rag_deadline import RagDeadline


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Reuse the service-role Supabase client for the lifetime of the worker.

    The client is application-scoped and does not carry end-user auth state, so
    recreating it for every service call only adds HTTP/client setup overhead.
    """
    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
    )


_TERMINAL_RPCS = {
    "rag_v2_complete_turn", "rag_v2_fail_turn", "rag_v2_fail_turn_with_usage",
    "rag_v2_commit_prepared_new_chat", "rag_v2_fail_new_chat_preparation",
}
_summary_deadline: ContextVar[RagDeadline | None] = ContextVar("rag_summary_deadline", default=None)


@contextmanager
def rag_supabase_summary_deadline(deadline: RagDeadline | None) -> Iterator[None]:
    token = _summary_deadline.set(deadline)
    try:
        yield
    finally:
        _summary_deadline.reset(token)


@contextmanager
def bounded_rag_supabase(
    deadline: RagDeadline, *, completion_reserve: float = 0, answer_reserve: float = 0,
) -> Iterator[Client]:
    def bound_request(request: httpx.Request) -> None:
        rpc = request.url.path.rsplit("/", 1)[-1]
        if completion_reserve and rpc in _TERMINAL_RPCS:
            timeout = max(0.25, min(completion_reserve, deadline.remaining()))
        else:
            reserve = completion_reserve
            expires_at = deadline.expires_at
            if rpc in {"rag_v2_get_summary_input", "rag_v2_save_summary"}:
                reserve += answer_reserve
                if (summary_deadline := _summary_deadline.get()) is not None:
                    expires_at = min(expires_at - reserve, summary_deadline.expires_at)
                    reserve = 0
            timeout = RagDeadline(expires_at - reserve).require_remaining()
        request.extensions["timeout"] = httpx.Timeout(timeout).as_dict()

    with httpx.Client(
        follow_redirects=False, transport=httpx.HTTPTransport(retries=0),
        event_hooks={"request": [bound_request]},
    ) as http:
        yield create_client(settings.supabase_url, settings.supabase_secret_key, options=ClientOptions(
            httpx_client=http, auto_refresh_token=False, persist_session=False,
        ))
