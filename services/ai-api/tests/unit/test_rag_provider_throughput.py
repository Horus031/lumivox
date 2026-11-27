from unittest.mock import Mock

import pytest

from app.core.config import settings
from app.core.rag_provider_quotas import RagModelQuota, RagQuotaConfigurationError, configured_quotas, validate_provider_quotas
from app.services import rag_provider_budget as budget
from app.services.rag_conversation_service import ask_rag_conversation_question
from app.services.rag_conversation_store import RagConversationError


@pytest.fixture
def quota(monkeypatch):
    monkeypatch.setattr(settings, "rag_provider_throughput_enabled", True)
    monkeypatch.setattr(settings, "rag_provider_quota_scope", "shared-test")
    monkeypatch.setattr(settings, "rag_provider_quotas_json", '{"test":{"rpm":3,"tpm":9000}}')


def test_quota_scope_supersedes_environment_namespace(quota, monkeypatch):
    first = budget.provider_keys("test")
    monkeypatch.setattr(settings, "rag_resource_namespace", "another-environment")
    assert budget.provider_keys("test") == first
    monkeypatch.setattr(settings, "rag_provider_quota_scope", "another-allocation")
    assert budget.provider_keys("test") != first


def test_unconfirmed_existing_redis_reservation_is_denied(quota, monkeypatch):
    command = Mock(return_value=["existing", "0"])
    monkeypatch.setattr(budget, "execute_rag_redis_command", command)
    assert budget.acquire_provider_permit("test", timeout=1, input_tokens=9, output_tokens=3) == ("quota_unavailable", None)
    args = command.call_args.args[0]
    assert args[2] == 4 and len({key.split("{")[1].split("}")[0] for key in args[3:7]}) == 1
    assert args[-6:] == [9, 3, 3, 9000, 0, 0]


def test_invalid_or_missing_config_fails_closed(quota, monkeypatch):
    with pytest.raises(RagQuotaConfigurationError):
        validate_provider_quotas(["missing"], ["test"])
    monkeypatch.setattr(settings, "rag_provider_quotas_json", '{"test":{"rpm":true,"tpm":9000}}')
    with pytest.raises(RagQuotaConfigurationError):
        configured_quotas()
    assert budget.acquire_provider_permit("test", timeout=1) == ("quota_unavailable", None)
    assert RagModelQuota(rpm=1, tpm=9000).otpm is None


def test_invalid_throughput_configuration_returns_resource_error_before_reservation(quota, monkeypatch):
    monkeypatch.setattr(settings, "rag_resource_control_enabled", False)
    reserve = Mock()
    monkeypatch.setattr("app.services.rag_conversation_service.reserve_turn", reserve)
    with pytest.raises(RagConversationError) as caught:
        ask_rag_conversation_question(
            user_id="user", question="Study question", selected_document_ids=[], focus_session_id=None,
            session_id=None, client_request_id="request", top_k=5, prompt_variant="grounded_rule",
        )
    assert caught.value.code == "RAG_PROVIDER_QUOTA_UNAVAILABLE" and caught.value.outcome == "failed"
    reserve.assert_not_called()
