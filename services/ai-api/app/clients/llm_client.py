from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Generic, TypeVar

from pydantic import BaseModel

from app.clients.gemini_client import get_gemini_client
from app.core.config import settings


TOutput = TypeVar("TOutput", bound=BaseModel)


@dataclass(frozen=True)
class LLMTextGeneration:
    text: str
    provider: str
    model: str
    latency_ms: int
    attempts: int


@dataclass(frozen=True)
class LLMStructuredGeneration(Generic[TOutput]):
    output: TOutput
    provider: str
    model: str
    latency_ms: int
    attempts: int


def _split_model_chain(value: str) -> list[str]:
    return [
        model.strip()
        for model in value.split(",")
        if model.strip()
    ]


def _get_groq_client():
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY must be configured.")

    try:
        from groq import Groq
    except ImportError as error:
        raise RuntimeError(
            "The groq package is required for LLM_PROVIDER=groq. "
            "Install service dependencies from requirements.txt."
        ) from error

    return Groq(
        api_key=settings.groq_api_key,
        timeout=settings.llm_request_timeout_seconds,
    )


def _get_attempt_count() -> int:
    return max(1, settings.llm_max_attempts_per_model)


def _to_strict_json_schema(schema: dict) -> dict:
    strict_schema = dict(schema)
    _apply_strict_object_rules(strict_schema)
    return strict_schema


def _apply_strict_object_rules(value) -> None:
    if isinstance(value, dict):
        if value.get("type") == "object":
            properties = value.get("properties")
            value["additionalProperties"] = False

            if isinstance(properties, dict):
                value["required"] = list(properties.keys())

        for child in value.values():
            _apply_strict_object_rules(child)

    elif isinstance(value, list):
        for child in value:
            _apply_strict_object_rules(child)


def _generate_gemini_text(prompt: str) -> LLMTextGeneration:
    started_at = time.perf_counter()
    client = get_gemini_client()

    response = client.models.generate_content(
        model=settings.gemini_text_model,
        contents=prompt,
    )

    text = getattr(response, "text", None)

    if not text:
        raise RuntimeError("Gemini did not return text.")

    return LLMTextGeneration(
        text=text.strip(),
        provider="google",
        model=settings.gemini_text_model,
        latency_ms=int((time.perf_counter() - started_at) * 1000),
        attempts=1,
    )


def _generate_gemini_structured(
    *,
    prompt: str,
    output_model: type[TOutput],
) -> LLMStructuredGeneration[TOutput]:
    started_at = time.perf_counter()
    client = get_gemini_client()

    response = client.models.generate_content(
        model=settings.gemini_insight_model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_json_schema": output_model.model_json_schema(),
        },
    )

    return LLMStructuredGeneration(
        output=output_model.model_validate_json(response.text),
        provider="google",
        model=settings.gemini_insight_model,
        latency_ms=int((time.perf_counter() - started_at) * 1000),
        attempts=1,
    )


def generate_text(
    prompt: str,
    *,
    model_chain: list[str] | None = None,
) -> LLMTextGeneration:
    provider = settings.llm_provider.lower()

    if provider == "google":
        return _generate_gemini_text(prompt)

    if provider != "groq":
        raise RuntimeError(f"Unsupported LLM provider: {settings.llm_provider}")

    client = _get_groq_client()
    models = model_chain or _split_model_chain(settings.groq_chat_models)
    attempts_per_model = _get_attempt_count()
    started_at = time.perf_counter()
    attempts = 0
    errors: list[str] = []

    for model in models:
        for _ in range(attempts_per_model):
            attempts += 1
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                )

                text = response.choices[0].message.content

                if not text:
                    raise RuntimeError("Groq did not return text.")

                return LLMTextGeneration(
                    text=text.strip(),
                    provider="groq",
                    model=model,
                    latency_ms=int(
                        (time.perf_counter() - started_at) * 1000
                    ),
                    attempts=attempts,
                )
            except Exception as error:
                errors.append(f"{model}: {error}")

    raise RuntimeError(
        "All Groq text generation attempts failed. "
        + " | ".join(errors)
    )


def generate_structured(
    *,
    prompt: str,
    output_model: type[TOutput],
    schema_name: str,
    model_chain: list[str] | None = None,
) -> LLMStructuredGeneration[TOutput]:
    provider = settings.llm_provider.lower()

    if provider == "google":
        return _generate_gemini_structured(
            prompt=prompt,
            output_model=output_model,
        )

    if provider != "groq":
        raise RuntimeError(f"Unsupported LLM provider: {settings.llm_provider}")

    client = _get_groq_client()
    models = model_chain or _split_model_chain(settings.groq_structured_models)
    attempts_per_model = _get_attempt_count()
    schema = _to_strict_json_schema(output_model.model_json_schema())
    started_at = time.perf_counter()
    attempts = 0
    errors: list[str] = []

    for model in models:
        for _ in range(attempts_per_model):
            attempts += 1
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": schema_name,
                            "schema": schema,
                            "strict": True,
                        },
                    },
                )

                text = response.choices[0].message.content

                if not text:
                    raise RuntimeError("Groq did not return JSON content.")

                output = output_model.model_validate_json(text)

                return LLMStructuredGeneration(
                    output=output,
                    provider="groq",
                    model=model,
                    latency_ms=int(
                        (time.perf_counter() - started_at) * 1000
                    ),
                    attempts=attempts,
                )
            except Exception as error:
                errors.append(f"{model}: {error}")

    for model in models:
        for _ in range(attempts_per_model):
            attempts += 1
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                prompt
                                + "\n\nReturn only a valid JSON object that "
                                + "matches this JSON schema:\n"
                                + json.dumps(schema, ensure_ascii=False)
                            ),
                        }
                    ],
                    response_format={"type": "json_object"},
                )

                text = response.choices[0].message.content

                if not text:
                    raise RuntimeError("Groq did not return JSON content.")

                output = output_model.model_validate(json.loads(text))

                return LLMStructuredGeneration(
                    output=output,
                    provider="groq",
                    model=model,
                    latency_ms=int(
                        (time.perf_counter() - started_at) * 1000
                    ),
                    attempts=attempts,
                )
            except Exception as error:
                errors.append(f"{model} json_object: {error}")

    raise RuntimeError(
        "All Groq structured generation attempts failed. "
        + " | ".join(errors)
    )
