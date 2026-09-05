from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas.ai_translation import (
    AITranslationBatchRequest,
    AITranslationBatchResponse,
    AITranslationRequest,
    AITranslationResponse,
)
from app.security.internal_api_key import verify_internal_api_key
from app.services.ai_translation_service import (
    translate_ai_content,
    translate_ai_content_batch,
)


router = APIRouter(dependencies=[Depends(verify_internal_api_key)])


@router.post("/translate", response_model=AITranslationResponse)
def translate_content(
    request: AITranslationRequest,
) -> AITranslationResponse:
    return translate_ai_content(request)


@router.post("/batch", response_model=AITranslationBatchResponse)
def translate_content_batch(
    request: AITranslationBatchRequest,
) -> AITranslationBatchResponse:
    return translate_ai_content_batch(request)
