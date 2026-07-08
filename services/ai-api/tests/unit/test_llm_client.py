from types import SimpleNamespace

from pydantic import BaseModel, Field

from app.clients import llm_client


class FakeOutput(BaseModel):
    title: str


class NestedItem(BaseModel):
    label: str


class NestedOutput(BaseModel):
    title: str
    items: list[NestedItem] = Field(default_factory=list)


class FakeGroqClient:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self.create)
        )

    def create(self, **kwargs):
        self.calls.append(kwargs)
        response = self.responses.pop(0)

        if isinstance(response, Exception):
            raise response

        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=response)
                )
            ]
        )


def test_generate_text_falls_back_to_next_groq_model(monkeypatch):
    fake_client = FakeGroqClient(
        [
            RuntimeError("rate limited"),
            "fallback answer",
        ]
    )

    monkeypatch.setattr(llm_client.settings, "llm_provider", "groq")
    monkeypatch.setattr(llm_client.settings, "llm_max_attempts_per_model", 1)
    monkeypatch.setattr(llm_client, "_get_groq_client", lambda: fake_client)

    result = llm_client.generate_text(
        "Explain this",
        model_chain=["primary-model", "fallback-model"],
    )

    assert result.text == "fallback answer"
    assert result.provider == "groq"
    assert result.model == "fallback-model"
    assert result.attempts == 2
    assert [call["model"] for call in fake_client.calls] == [
        "primary-model",
        "fallback-model",
    ]


def test_generate_structured_uses_json_schema_response_format(monkeypatch):
    fake_client = FakeGroqClient(['{"title":"Ready"}'])

    monkeypatch.setattr(llm_client.settings, "llm_provider", "groq")
    monkeypatch.setattr(llm_client.settings, "llm_max_attempts_per_model", 1)
    monkeypatch.setattr(llm_client, "_get_groq_client", lambda: fake_client)

    result = llm_client.generate_structured(
        prompt="Build JSON",
        output_model=FakeOutput,
        schema_name="fake_output",
        model_chain=["structured-model"],
    )

    assert result.output.title == "Ready"
    assert result.provider == "groq"
    assert result.model == "structured-model"
    assert result.attempts == 1
    assert fake_client.calls[0]["response_format"]["type"] == "json_schema"
    assert (
        fake_client.calls[0]["response_format"]["json_schema"]["name"]
        == "fake_output"
    )


def test_generate_structured_sends_strict_schema_for_nested_objects(
    monkeypatch,
):
    fake_client = FakeGroqClient(['{"title":"Ready","items":[]}'])

    monkeypatch.setattr(llm_client.settings, "llm_provider", "groq")
    monkeypatch.setattr(llm_client.settings, "llm_max_attempts_per_model", 1)
    monkeypatch.setattr(llm_client, "_get_groq_client", lambda: fake_client)

    result = llm_client.generate_structured(
        prompt="Build JSON",
        output_model=NestedOutput,
        schema_name="nested_output",
        model_chain=["structured-model"],
    )

    schema = fake_client.calls[0]["response_format"]["json_schema"]["schema"]

    assert result.output.items == []
    assert schema["additionalProperties"] is False
    assert "items" in schema["required"]
    assert schema["$defs"]["NestedItem"]["additionalProperties"] is False
    assert schema["$defs"]["NestedItem"]["required"] == ["label"]
