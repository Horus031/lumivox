from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Locale = Literal["auto", "en", "vi"]


class AITranslationRequest(BaseModel):
    user_id: str
    entity_type: str = Field(min_length=1, max_length=80)
    entity_id: str
    field_name: str = Field(min_length=1, max_length=80)
    source_text: str = Field(min_length=1)
    source_locale: Locale = "auto"
    target_locale: Literal["en", "vi"]


class AITranslationResponse(BaseModel):
    entity_type: str
    entity_id: str
    field_name: str
    source_locale: Locale
    target_locale: Literal["en", "vi"]
    source_hash: str
    translated_text: str
    provider: str | None = None
    model_name: str | None = None
    cached: bool


class AITranslationBatchRequest(BaseModel):
    items: list[AITranslationRequest] = Field(min_length=1, max_length=30)


class AITranslationBatchResponse(BaseModel):
    items: list[AITranslationResponse]