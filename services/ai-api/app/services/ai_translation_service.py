from __future__ import annotations

import hashlib
import os
from typing import Any

from supabase import create_client

from app.clients.llm_client import generate_text
from app.schemas.ai_translation import (
    AITranslationBatchRequest,
    AITranslationBatchResponse,
    AITranslationRequest,
    AITranslationResponse,
)


def _get_supabase_admin():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
        )

    return create_client(supabase_url, service_role_key)


def _hash_source_text(text: str) -> str:
    normalized = "\n".join(line.rstrip() for line in text.strip().splitlines())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _target_language_name(locale: str) -> str:
    if locale == "vi":
        return "Vietnamese"
    return "English"


def _build_translation_prompt(request: AITranslationRequest) -> str:
    target_language = _target_language_name(request.target_locale)

    source_locale_line = (
        "The source language is unknown or mixed."
        if request.source_locale == "auto"
        else f"The source language is {_target_language_name(request.source_locale)}."
    )

    return f"""
You are a precise translation engine for a bilingual learning platform.

Task:
Translate the source text into {target_language}.

Rules:
1. Preserve the original meaning.
2. Preserve Markdown formatting, bullet lists, numbering, and code blocks.
3. Do not translate code, URLs, file names, database table names, function names, or environment variable names.
4. Keep technical terms in English when translating them would reduce clarity, but explain naturally in {target_language} if needed.
5. Do not add new information.
6. Do not summarize.
7. Return only the translated text.

{source_locale_line}

Source text:
{request.source_text}

Translated text:
""".strip()


def _fetch_cached_translation(
    supabase: Any,
    *,
    request: AITranslationRequest,
    source_hash: str,
) -> AITranslationResponse | None:
    response = (
        supabase.table("ai_content_translations")
        .select(
            "entity_type,entity_id,field_name,source_locale,target_locale,"
            "source_hash,translated_text,provider,model_name"
        )
        .eq("owner_id", request.user_id)
        .eq("entity_type", request.entity_type)
        .eq("entity_id", request.entity_id)
        .eq("field_name", request.field_name)
        .eq("target_locale", request.target_locale)
        .eq("source_hash", source_hash)
        .eq("status", "completed")
        .maybe_single()
        .execute()
    )

    if response is None or not response.data:
        return None

    data = response.data

    return AITranslationResponse(
        entity_type=data["entity_type"],
        entity_id=data["entity_id"],
        field_name=data["field_name"],
        source_locale=data["source_locale"],
        target_locale=data["target_locale"],
        source_hash=data["source_hash"],
        translated_text=data["translated_text"],
        provider=data.get("provider"),
        model_name=data.get("model_name"),
        cached=True,
    )


def _upsert_translation(
    supabase: Any,
    *,
    request: AITranslationRequest,
    source_hash: str,
    translated_text: str,
    provider: str | None,
    model_name: str | None,
) -> None:
    payload = {
        "owner_id": request.user_id,
        "entity_type": request.entity_type,
        "entity_id": request.entity_id,
        "field_name": request.field_name,
        "source_locale": request.source_locale,
        "target_locale": request.target_locale,
        "source_hash": source_hash,
        "translated_text": translated_text,
        "provider": provider,
        "model_name": model_name,
        "status": "completed",
        "error_message": None,
    }

    (
        supabase.table("ai_content_translations")
        .upsert(
            payload,
            on_conflict=(
                "owner_id,entity_type,entity_id,field_name,"
                "target_locale,source_hash"
            ),
        )
        .execute()
    )


def translate_ai_content(request: AITranslationRequest) -> AITranslationResponse:
    source_hash = _hash_source_text(request.source_text)

    if request.source_locale == request.target_locale:
        return AITranslationResponse(
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            field_name=request.field_name,
            source_locale=request.source_locale,
            target_locale=request.target_locale,
            source_hash=source_hash,
            translated_text=request.source_text,
            provider=None,
            model_name=None,
            cached=True,
        )

    supabase = _get_supabase_admin()

    cached = _fetch_cached_translation(
        supabase,
        request=request,
        source_hash=source_hash,
    )

    if cached:
        return cached

    prompt = _build_translation_prompt(request)
    generation = generate_text(prompt)

    translated_text = generation.text.strip()

    _upsert_translation(
        supabase,
        request=request,
        source_hash=source_hash,
        translated_text=translated_text,
        provider=generation.provider,
        model_name=generation.model,
    )

    return AITranslationResponse(
        entity_type=request.entity_type,
        entity_id=request.entity_id,
        field_name=request.field_name,
        source_locale=request.source_locale,
        target_locale=request.target_locale,
        source_hash=source_hash,
        translated_text=translated_text,
        provider=generation.provider,
        model_name=generation.model,
        cached=False,
    )


def translate_ai_content_batch(
    request: AITranslationBatchRequest,
) -> AITranslationBatchResponse:
    translated_items = [
        translate_ai_content(item)
        for item in request.items
    ]

    return AITranslationBatchResponse(items=translated_items)
