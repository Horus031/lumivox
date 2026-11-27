from unittest.mock import Mock

import pytest

from app.clients.rag_redis_client import RagRedisUnavailable
from app.services import rag_provider_budget as budget


def test_acquire_release_and_unknown_id(monkeypatch):
    def respond(command, *, timeout):
        assert timeout == 0.5
        return ["acquired", command[5]]

    execute = Mock(side_effect=respond)
    monkeypatch.setattr(budget, "execute_rag_redis_command", execute)
    status, permit = budget.acquire_provider_permit("test-model", timeout=0.5)
    assert status == "acquired" and permit is not None
    execute.side_effect = [1, 0]
    budget.release_provider_permit(permit, timeout=0.5)
    budget.release_provider_permit(budget.RagProviderPermit(permit.key, "unknown"), timeout=0.5)
    assert execute.call_args_list[-2].args[0] == ["ZREM", permit.key, permit.permit_id]
    assert execute.call_args_list[-1].args[0] == ["ZREM", permit.key, "unknown"]


@pytest.mark.parametrize("status", ["busy", "cooldown"])
def test_redis_denial_does_not_return_lease(monkeypatch, status):
    monkeypatch.setattr(budget, "execute_rag_redis_command", Mock(return_value=[status, "0"]))
    assert budget.acquire_provider_permit("test-model", timeout=0.5) == (status, None)


def test_malformed_redis_response_fails_closed(monkeypatch):
    monkeypatch.setattr(budget, "execute_rag_redis_command", Mock(return_value=["acquired", "another-id"]))
    with pytest.raises(RagRedisUnavailable):
        budget.acquire_provider_permit("test-model", timeout=0.5)


def test_retry_after_is_bounded():
    assert budget.retry_after_seconds("86400") == 120
    assert budget.retry_after_seconds("0") == 1
    assert budget.retry_after_seconds("invalid") == budget.settings.rag_provider_cooldown_seconds
