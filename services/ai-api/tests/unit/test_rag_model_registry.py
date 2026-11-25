
import pytest

from app.core import rag_model_registry as registry


def test_parse_model_chain_preserves_order():
    result = registry.parse_rag_model_chain(
        "openai/gpt-oss-20b,"
        "openai/gpt-oss-120b,"
        "openai/gpt-oss-20b"
    )

    assert result == [
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
    ]


def test_empty_model_chain_is_rejected():
    with pytest.raises(
        registry.RagConfigurationError
    ):
        registry.parse_rag_model_chain(" , ")


def test_unsupported_model_is_rejected():
    with pytest.raises(
        registry.RagConfigurationError
    ):
        registry.parse_rag_model_chain(
            "llama-3.1-8b-instant"
        )


def test_gpt_oss_capabilities():
    for model in (
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
    ):
        capability = (
            registry.get_rag_model_capability(model)
        )

        assert capability.context_window == 131072
        assert capability.max_completion_tokens == 65536
        assert capability.supports_structured_output
        assert capability.supports_reasoning_effort


def test_invalid_turn_limits_are_rejected(
    monkeypatch,
):
    monkeypatch.setattr(
        registry.settings,
        "rag_soft_turn_limit",
        24,
    )

    monkeypatch.setattr(
        registry.settings,
        "rag_hard_turn_limit",
        24,
    )

    with pytest.raises(
        registry.RagConfigurationError,
        match="soft turn limit",
    ):
        registry.validate_rag_configuration()


def test_invalid_summary_budget_is_rejected(
    monkeypatch,
):
    monkeypatch.setattr(
        registry.settings,
        "rag_max_prompt_tokens",
        500,
    )

    monkeypatch.setattr(
        registry.settings,
        "rag_max_summary_tokens",
        500,
    )

    with pytest.raises(
        registry.RagConfigurationError,
        match="summary budget",
    ):
        registry.validate_rag_configuration()


def test_default_rag_configuration_is_valid():
    registry.validate_rag_configuration()