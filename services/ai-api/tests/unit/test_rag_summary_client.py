from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from groq import AuthenticationError

from app.clients import rag_summary_client as client
from app.clients.rag_llm_client import RagLLMError
from app.core import rag_deadline
from app.core.rag_token_budget import RagTokenBudgetError
from app.security.rag_dispatch import rag_dispatch_authorization


MESSAGES = [
    {"role": "system", "content": "Summarize study context"},
    {"role": "user", "content": "Private synthetic prompt"},
]
MODEL_20B = "openai/gpt-oss-20b"
MODEL_120B = "openai/gpt-oss-120b"


@pytest.fixture(autouse=True)
def authorize_synthetic_dispatch():
    with rag_dispatch_authorization(lambda: None):
        yield


@pytest.fixture
def provider(monkeypatch):
    completion = Mock()
    monkeypatch.setattr(client, "_get_rag_groq_client", lambda: SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=completion)),
    ))
    monkeypatch.setattr(client.settings, "rag_summary_models", f"{MODEL_20B},{MODEL_120B}")
    monkeypatch.setattr(client.settings, "rag_chat_models", MODEL_120B)
    return completion


def response(content, finish="stop"):
    return SimpleNamespace(
        choices=[SimpleNamespace(finish_reason=finish, message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(prompt_tokens=350, completion_tokens=120, total_tokens=470),
    )


def test_strict_structured_output_uses_independent_summary_chain(provider, stored_summary):
    provider.return_value = response(stored_summary.summary.model_dump_json())
    result = client.generate_rag_summary(MESSAGES)
    call = provider.call_args.kwargs
    assert call["model"] == MODEL_20B
    assert call["stream"] is False
    assert call["reasoning_effort"] == "low"
    assert call["max_completion_tokens"] == client.settings.rag_summary_completion_tokens
    fmt = call["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    schema = fmt["json_schema"]["schema"]
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["additionalProperties"] is False
    assert result.summary == stored_summary.summary and result.usage.total_tokens == 470


@pytest.mark.parametrize("finish", ["stop", "length"])
def test_invalid_or_truncated_summary_fails_over_with_remaining_deadline(
    monkeypatch, provider, stored_summary, caplog, finish,
):
    current_time = 10.0
    clock = SimpleNamespace(monotonic=lambda: current_time)
    monkeypatch.setattr(client, "time", clock)
    monkeypatch.setattr(rag_deadline, "time", clock)
    monkeypatch.setattr(client.settings, "rag_summary_deadline_seconds", 6)
    monkeypatch.setattr(client.settings, "rag_summary_request_timeout_seconds", 4)
    def dispatch(**options):
        nonlocal current_time
        if options["model"] == MODEL_20B:
            current_time = 14.0
            return response('{"private":"provider payload"}', finish)
        return response(stored_summary.summary.model_dump_json())

    provider.side_effect = dispatch
    result = client.generate_rag_summary(MESSAGES)
    assert result.model == MODEL_120B
    assert [call.kwargs["timeout"] for call in provider.call_args_list] == [4, 2]
    assert "Private synthetic prompt" not in caplog.text and "provider payload" not in caplog.text


def test_auth_error_does_not_retry_or_expose_provider_payload(provider, caplog):
    provider.side_effect = AuthenticationError(
        "private provider content",
        response=httpx.Response(401, request=httpx.Request("POST", "https://example.test")),
        body=None,
    )
    with pytest.raises(RagLLMError, match="authentication_error") as error:
        client.generate_rag_summary(MESSAGES)
    assert not error.value.retryable
    assert "private provider content" not in str(error.value) + caplog.text
    provider.assert_called_once()


def test_prompt_budget_checked_before_provider(monkeypatch, provider):
    monkeypatch.setattr(client.settings, "rag_max_prompt_tokens", 800)
    with pytest.raises(RagTokenBudgetError):
        client.generate_rag_summary([MESSAGES[0], {"role": "user", "content": "word " * 2000}])
    provider.assert_not_called()
