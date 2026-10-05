from __future__ import annotations

import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Generic, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.core.config import settings


TOutput = TypeVar(
    "TOutput",
    bound=BaseModel,
)


@dataclass(frozen=True)
class ReviewStructuredGeneration(
    Generic[TOutput]
):
    output: TOutput
    provider: str
    model: str
    latency_ms: int
    attempts: int


def _split_chain(
    value: str,
) -> list[str]:
    return [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]


def _apply_strict_object_rules(
    value,
) -> None:
    if isinstance(value, dict):
        if value.get("type") == "object":
            properties = value.get(
                "properties"
            )

            value[
                "additionalProperties"
            ] = False

            if isinstance(
                properties,
                dict,
            ):
                value["required"] = list(
                    properties.keys()
                )

        for child in value.values():
            _apply_strict_object_rules(
                child
            )

    elif isinstance(value, list):
        for child in value:
            _apply_strict_object_rules(
                child
            )


def _to_strict_json_schema(
    schema: dict,
) -> dict:
    strict_schema = dict(schema)

    _apply_strict_object_rules(
        strict_schema
    )

    return strict_schema


@lru_cache(maxsize=1)
def _get_review_groq_client():
    if not settings.review_groq_api_key:
        raise RuntimeError(
            "REVIEW_GROQ_API_KEY "
            "must be configured."
        )

    try:
        from groq import Groq
    except ImportError as error:
        raise RuntimeError(
            "The groq package is required "
            "for AI Review."
        ) from error

    return Groq(
        api_key=(
            settings.review_groq_api_key
        ),
        timeout=(
            settings
            .review_request_timeout_seconds
        ),
    )


@lru_cache(maxsize=1)
def _get_review_gemini_client() -> (
    genai.Client
):
    if not settings.review_gemini_api_key:
        raise RuntimeError(
            "REVIEW_GEMINI_API_KEY "
            "must be configured."
        )

    return genai.Client(
        api_key=(
            settings.review_gemini_api_key
        )
    )


def _attempts_per_model() -> int:
    return max(
        1,
        settings.review_max_attempts_per_model,
    )


def _generate_groq_structured(
    *,
    prompt: str,
    output_model: type[TOutput],
    schema_name: str,
) -> ReviewStructuredGeneration[TOutput]:
    client = _get_review_groq_client()

    models = _split_chain(
        settings.review_groq_structured_models
    )

    if not models:
        raise RuntimeError(
            "No REVIEW_GROQ_STRUCTURED_MODELS "
            "are configured."
        )

    schema = _to_strict_json_schema(
        output_model.model_json_schema()
    )

    started_at = time.perf_counter()

    attempts = 0

    errors: list[str] = []

    for model in models:
        for _ in range(
            _attempts_per_model()
        ):
            attempts += 1

            try:
                response = (
                    client
                    .chat
                    .completions
                    .create(
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
                                "name": (
                                    schema_name
                                ),
                                "schema": schema,
                                "strict": True,
                            },
                        },
                    )
                )

                text = (
                    response
                    .choices[0]
                    .message
                    .content
                )

                if not text:
                    raise RuntimeError(
                        "Groq returned "
                        "an empty response."
                    )

                output = (
                    output_model
                    .model_validate_json(
                        text
                    )
                )

                return (
                    ReviewStructuredGeneration(
                        output=output,
                        provider="groq",
                        model=model,
                        latency_ms=int(
                            (
                                time.perf_counter()
                                - started_at
                            )
                            * 1000
                        ),
                        attempts=attempts,
                    )
                )

            except Exception as error:
                errors.append(
                    f"{model}: {error}"
                )

    raise RuntimeError(
        "Groq review generation failed. "
        + " | ".join(errors)
    )


def _generate_gemini_structured(
    *,
    prompt: str,
    output_model: type[TOutput],
) -> ReviewStructuredGeneration[TOutput]:
    client = _get_review_gemini_client()

    started_at = time.perf_counter()

    errors: list[str] = []

    model = settings.review_gemini_model

    for attempt in range(
        1,
        _attempts_per_model() + 1,
    ):
        try:
            response = (
                client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config={
                        "response_mime_type": (
                            "application/json"
                        ),
                        "response_json_schema": (
                            output_model
                            .model_json_schema()
                        ),
                    },
                )
            )

            text = getattr(
                response,
                "text",
                None,
            )

            if not text:
                raise RuntimeError(
                    "Gemini returned "
                    "an empty response."
                )

            output = (
                output_model
                .model_validate_json(
                    text
                )
            )

            return (
                ReviewStructuredGeneration(
                    output=output,
                    provider="google",
                    model=model,
                    latency_ms=int(
                        (
                            time.perf_counter()
                            - started_at
                        )
                        * 1000
                    ),
                    attempts=attempt,
                )
            )

        except Exception as error:
            errors.append(
                f"{model}: {error}"
            )

    raise RuntimeError(
        "Gemini review generation failed. "
        + " | ".join(errors)
    )


def generate_review_structured(
    *,
    prompt: str,
    output_model: type[TOutput],
    schema_name: str,
) -> ReviewStructuredGeneration[TOutput]:
    providers = _split_chain(
        settings.review_llm_provider_chain
    )

    if not providers:
        raise RuntimeError(
            "REVIEW_LLM_PROVIDER_CHAIN "
            "is empty."
        )

    errors: list[str] = []

    for provider in providers:
        normalized = provider.lower()

        try:
            if normalized == "groq":
                return (
                    _generate_groq_structured(
                        prompt=prompt,
                        output_model=output_model,
                        schema_name=schema_name,
                    )
                )

            if normalized in {
                "google",
                "gemini",
            }:
                return (
                    _generate_gemini_structured(
                        prompt=prompt,
                        output_model=output_model,
                    )
                )

            errors.append(
                "Unsupported review "
                f"provider: {provider}"
            )

        except Exception as error:
            errors.append(
                f"{provider}: {error}"
            )

    raise RuntimeError(
        "All AI Review providers failed. "
        + " | ".join(errors)
    )


def generate_review_embedding(
    *,
    text: str,
    model_name: str,
) -> list[float]:
    """
    Generate a query embedding using the REVIEW Gemini key.

    model_name MUST match the embedding_model stored on the
    document chunks being searched.

    Comparing embeddings produced by different models would
    produce meaningless similarity scores even if vector
    dimensions happen to match.
    """

    client = _get_review_gemini_client()

    result = client.models.embed_content(
        model=model_name,
        contents=text,
        config=types.EmbedContentConfig(
            output_dimensionality=768
        ),
    )

    embeddings = result.embeddings

    if not embeddings:
        raise RuntimeError(
            "Gemini did not return "
            "a review query embedding."
        )

    values = embeddings[0].values

    if not values:
        raise RuntimeError(
            "Gemini returned an empty "
            "review query embedding."
        )

    if len(values) != 768:
        raise RuntimeError(
            "Review embedding dimension "
            f"must be 768, got {len(values)}."
        )

    return [
        float(value)
        for value in values
    ]