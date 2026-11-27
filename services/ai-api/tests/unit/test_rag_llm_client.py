
from types import SimpleNamespace

import httpx
import pytest

from groq import APIStatusError, APITimeoutError

from app.clients import rag_llm_client as rag
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.security.rag_dispatch import rag_dispatch_authorization
from app.services import rag_provider_execution as provider
from app.services.rag_provider_budget import RagProviderPermit


PRIMARY = "openai/gpt-oss-20b"
FALLBACK = "openai/gpt-oss-120b"


@pytest.fixture(autouse=True)
def authorize_synthetic_dispatch():
    with rag_dispatch_authorization(lambda: None):
        yield


class FakeGroqClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

        self.chat = SimpleNamespace(
            completions=SimpleNamespace(
                create=self.create
            )
        )

    def create(self, **kwargs):
        self.calls.append(kwargs)

        response = self.responses.pop(0)

        if isinstance(response, Exception):
            raise response

        return response


def make_response(
    text="Study answer",
    finish_reason="stop",
):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=text
                ),
                finish_reason=finish_reason,
            )
        ],
        usage=SimpleNamespace(
            prompt_tokens=120,
            completion_tokens=80,
            total_tokens=200,
        ),
    )


def make_status_error(
    status_code,
    error_code,
):
    request = httpx.Request(
        "POST",
        "https://api.groq.com/openai/v1/chat/completions",
    )

    body = {
        "error": {
            "message": "Provider error",
            "code": error_code,
        }
    }

    response = httpx.Response(
        status_code,
        request=request,
        json=body,
    )

    return APIStatusError(
        "Provider error",
        response=response,
        body=body,
    )


@pytest.fixture
def messages():
    return [
        {
            "role": "system",
            "content": "You are a study tutor.",
        },
        {
            "role": "user",
            "content": "What is binary search?",
        },
        {
            "role": "assistant",
            "content": (
                "Binary search repeatedly halves "
                "a sorted search space."
            ),
        },
        {
            "role": "user",
            "content": "What is its complexity?",
        },
    ]


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch):
    monkeypatch.setattr(
        rag.settings,
        "rag_chat_models",
        f"{PRIMARY},{FALLBACK}",
    )

    monkeypatch.setattr(
        rag.settings,
        "rag_max_attempts_per_model",
        1,
    )

    monkeypatch.setattr(
        rag.settings,
        "rag_max_completion_tokens",
        1200,
    )

    monkeypatch.setattr(
        rag.settings,
        "rag_reasoning_effort",
        "low",
    )


def install_fake(monkeypatch, responses):
    client = FakeGroqClient(responses)

    monkeypatch.setattr(
        rag,
        "_get_rag_groq_client",
        lambda: client,
    )

    return client


def test_resource_control_skips_cooled_down_model(monkeypatch, messages):
    client = install_fake(monkeypatch, [make_response()])
    permit = RagProviderPermit("permits", "owned")
    monkeypatch.setattr(provider, "acquire_provider_permit", lambda model, **_: (
        ("cooldown", None) if model == PRIMARY else ("acquired", permit)
    ))
    monkeypatch.setattr(provider, "release_provider_permit", lambda *args, **kwargs: None)
    execution = RagExecutionContext(RagDeadline.start(10), 4)
    assert rag.generate_rag_chat(messages, execution_context=execution).model == FALLBACK
    assert [call["model"] for call in client.calls] == [FALLBACK]
    assert [entry.model for entry in execution.attempts] == [FALLBACK]


def test_resource_control_global_saturation_does_not_attempt_fallback(monkeypatch, messages):
    client = install_fake(monkeypatch, [])
    checked = []

    def acquire(model, **kwargs):
        checked.append(model)
        return "busy", None

    monkeypatch.setattr(provider, "acquire_provider_permit", acquire)
    execution = RagExecutionContext(RagDeadline.start(10), 4)
    with pytest.raises(rag.RagLLMError) as error:
        rag.generate_rag_chat(messages, execution_context=execution)
    assert error.value.code == "provider_busy"
    assert checked == [PRIMARY]
    assert not client.calls


def test_generation_preserves_message_roles(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [make_response("O(log n)")],
    )

    result = rag.generate_rag_chat(messages)

    assert result.text == "O(log n)"
    assert result.model == PRIMARY
    assert result.attempts == 1
    assert result.finish_reason == "stop"

    call = client.calls[0]

    assert call["messages"] == messages
    assert call["max_completion_tokens"] == 1200
    assert call["reasoning_effort"] == "low"
    assert "reasoning_format" not in call


@pytest.mark.parametrize("roles", [
    ["user"], ["system", "assistant", "user"], ["system", "user", "system", "user"],
])
def test_rejects_invalid_multiturn_sequences_before_provider(monkeypatch, roles):
    client = install_fake(monkeypatch, [])
    with pytest.raises(rag.RagLLMError) as error:
        rag.generate_rag_chat([{"role": role, "content": "Study question"} for role in roles])
    assert error.value.code == "invalid_request"
    assert client.calls == []


def test_rejects_oversized_prompt_before_provider(monkeypatch, messages):
    client = install_fake(monkeypatch, [])
    messages[-1]["content"] = "example " * 5000
    with pytest.raises(rag.RagLLMError) as error:
        rag.generate_rag_chat(messages)
    assert error.value.code == "context_length_exceeded"
    assert client.calls == []


def test_reports_provider_prompt_overrun_without_logging_content(monkeypatch, messages, caplog):
    response = make_response()
    actual = rag.settings.rag_max_prompt_tokens + 1
    response.usage.prompt_tokens = actual
    install_fake(monkeypatch, [response])
    result = rag.generate_rag_chat(messages)
    assert result.usage.prompt_tokens == actual
    assert f"actual={actual} budget={actual - 1}" in caplog.text
    assert messages[-1]["content"] not in caplog.text


def test_generation_returns_token_usage(
    monkeypatch,
    messages,
):
    install_fake(
        monkeypatch,
        [make_response()],
    )

    result = rag.generate_rag_chat(messages)

    assert result.usage.prompt_tokens == 120
    assert result.usage.completion_tokens == 80
    assert result.usage.total_tokens == 200


def test_rate_limit_falls_back(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [
            make_status_error(
                429, "rate_limit_exceeded"
            ),
            make_response("Fallback answer"),
        ],
    )

    result = rag.generate_rag_chat(messages)

    assert result.model == FALLBACK
    assert result.attempts == 2

    assert [
        call["model"]
        for call in client.calls
    ] == [PRIMARY, FALLBACK]


def test_timeout_falls_back(
    monkeypatch,
    messages,
):
    request = httpx.Request(
        "POST",
        "https://api.groq.com/openai/v1/chat/completions",
    )

    client = install_fake(
        monkeypatch,
        [
            APITimeoutError(request=request),
            make_response(),
        ],
    )

    result = rag.generate_rag_chat(messages)

    assert result.model == FALLBACK
    assert len(client.calls) == 2


def test_context_overflow_does_not_fallback(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [
            make_status_error(
                400,
                "context_length_exceeded",
            )
        ],
    )

    with pytest.raises(
        rag.RagLLMError
    ) as exc:
        rag.generate_rag_chat(messages)

    assert exc.value.code == (
        "context_length_exceeded"
    )
    assert not exc.value.retryable
    assert len(client.calls) == 1


def test_authentication_error_does_not_fallback(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [
            make_status_error(
                401,
                "invalid_api_key",
            )
        ],
    )

    with pytest.raises(
        rag.RagLLMError
    ) as exc:
        rag.generate_rag_chat(messages)

    assert exc.value.code == (
        "authentication_error"
    )
    assert not exc.value.retryable
    assert len(client.calls) == 1


def test_truncated_response_is_not_accepted(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [
            make_response(
                "Incomplete answer",
                finish_reason="length",
            ),
            make_response("Complete answer"),
        ],
    )

    result = rag.generate_rag_chat(messages)

    assert result.text == "Complete answer"
    assert result.model == FALLBACK
    assert len(client.calls) == 2


def test_empty_response_falls_back(
    monkeypatch,
    messages,
):
    install_fake(
        monkeypatch,
        [
            make_response("   "),
            make_response("Complete answer"),
        ],
    )

    result = rag.generate_rag_chat(messages)

    assert result.model == FALLBACK


def test_all_models_rate_limited(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [
            make_status_error(
                429, "rate_limit_exceeded"
            ),
            make_status_error(
                429, "rate_limit_exceeded"
            ),
        ],
    )

    with pytest.raises(
        rag.RagLLMError
    ) as exc:
        rag.generate_rag_chat(messages)

    assert exc.value.code == "rate_limit"
    assert exc.value.retryable
    assert len(exc.value.attempts) == 2
    assert len(client.calls) == 2


def test_invalid_messages_are_rejected(
    monkeypatch,
):
    client = install_fake(
        monkeypatch,
        [],
    )

    with pytest.raises(
        rag.RagLLMError
    ) as exc:
        rag.generate_rag_chat([])

    assert exc.value.code == "invalid_request"
    assert len(client.calls) == 0


def test_completion_budget_is_enforced(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [],
    )

    with pytest.raises(
        rag.RagLLMError
    ) as exc:
        rag.generate_rag_chat(
            messages,
            max_completion_tokens=1201,
        )

    assert exc.value.code == "invalid_request"
    assert len(client.calls) == 0


def test_deadline_prevents_additional_calls(
    monkeypatch,
    messages,
):
    client = install_fake(
        monkeypatch,
        [
            make_status_error(
                429, "rate_limit_exceeded"
            ),
        ],
    )

    current_time = 0.0

    def dispatch(**options):
        nonlocal current_time
        current_time = 100.0
        return client.create(**options)

    monkeypatch.setattr(rag.time, "monotonic", lambda: current_time)
    monkeypatch.setattr(client.chat.completions, "create", dispatch)

    with pytest.raises(
        rag.RagLLMError
    ) as exc:
        rag.generate_rag_chat(messages)

    assert exc.value.code == "timeout"
    assert len(client.calls) == 1


def test_missing_usage_is_not_reported_as_zero(
    monkeypatch,
    messages,
):
    response = make_response()
    response.usage = None

    install_fake(
        monkeypatch,
        [response],
    )

    result = rag.generate_rag_chat(messages)

    assert result.usage.prompt_tokens is None
    assert result.usage.completion_tokens is None
    assert result.usage.total_tokens is None
