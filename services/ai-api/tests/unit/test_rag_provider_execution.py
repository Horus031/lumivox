from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from groq import APITimeoutError

from app.clients.rag_redis_client import RagRedisUnavailable
from app.core import rag_deadline
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.services import rag_provider_execution as provider
from app.services.rag_provider_budget import RagProviderPermit


@pytest.fixture
def attempt(monkeypatch):
    client = Mock()
    transport = client.chat.completions.create
    permit = RagProviderPermit("permits", "owned")
    acquire, release = Mock(return_value=("acquired", permit)), Mock()
    monkeypatch.setattr(provider, "acquire_provider_permit", acquire)
    monkeypatch.setattr(provider, "release_provider_permit", release)
    now = [100.0]
    monkeypatch.setattr(rag_deadline, "time", SimpleNamespace(monotonic=lambda: now[0]))
    context = RagExecutionContext(RagDeadline.start(5), 1)

    def run(parse=lambda response: response):
        return provider.execute_rag_provider_call(
            client=client, request_options={"model": "mock", "timeout": 10.0}, stage="answer",
            context=context, deadline=context.deadline, estimated_prompt_tokens=15,
            classify_error=lambda _: ("synthetic", False), parse_response=parse,
        )

    return SimpleNamespace(run=run, acquire=acquire, release=release, transport=transport,
                           context=context, now=now, permit=permit)


@pytest.mark.parametrize(("status", "error"), [("busy", "provider_busy"), ("cooldown", "provider_cooldown")])
def test_provider_denied_before_dispatch(attempt, status, error):
    attempt.acquire.return_value = (status, None)
    with pytest.raises(provider.RagProviderExecutionError, match=error):
        attempt.run()
    attempt.transport.assert_not_called()
    assert attempt.context.attempts == []


def test_redis_outage_fails_closed(attempt):
    attempt.acquire.side_effect = RagRedisUnavailable
    with pytest.raises(provider.RagProviderExecutionError, match="resource_control_unavailable"):
        attempt.run()
    attempt.transport.assert_not_called()


def test_expired_deadline_skips_redis_and_provider(attempt):
    attempt.now[0] = 105
    with pytest.raises(provider.RagProviderExecutionError, match="timeout"):
        attempt.run()
    attempt.acquire.assert_not_called()
    attempt.transport.assert_not_called()


def test_redis_time_counts_toward_provider_deadline(attempt):
    def acquire(*args, **kwargs):
        attempt.now[0] = 104
        return "acquired", attempt.permit

    attempt.acquire.side_effect = acquire
    attempt.run()
    assert attempt.transport.call_args.kwargs["timeout"] == 1


def test_successful_admission_after_deadline_releases_without_dispatch(attempt):
    def acquire(*args, **kwargs):
        attempt.now[0] = 105
        return "acquired", attempt.permit

    attempt.acquire.side_effect = acquire
    with pytest.raises(provider.RagProviderExecutionError, match="timeout"):
        attempt.run()
    attempt.transport.assert_not_called()
    attempt.release.assert_called_once()


def test_transport_timeout_retains_permit_and_counts_unknown_usage(attempt):
    attempt.transport.side_effect = APITimeoutError(request=httpx.Request("POST", "https://example.test"))
    with pytest.raises(APITimeoutError):
        attempt.run()
    attempt.release.assert_not_called()
    assert attempt.context.attempts[0].outcome == "unknown"
    assert attempt.context.attempts[0].total_tokens is None
    with pytest.raises(provider.RagProviderExecutionError, match="provider_call_budget_exceeded"):
        attempt.run()
    attempt.transport.assert_called_once()


def test_incomplete_response_retains_usage_and_releases(attempt):
    attempt.transport.return_value = SimpleNamespace(usage=SimpleNamespace(
        prompt_tokens=15, completion_tokens=3, total_tokens=18,
    ))

    def reject(_):
        raise ValueError("incomplete")

    with pytest.raises(ValueError, match="incomplete"):
        attempt.run(reject)
    entry = attempt.context.attempts[0]
    assert (entry.outcome, entry.total_tokens) == ("failed", 18)
    attempt.release.assert_called_once()
