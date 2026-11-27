import json
import re
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import settings


class RagModelQuota(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)

    rpm: int = Field(gt=0, le=1000)
    tpm: int = Field(gt=0, le=100_000_000)
    itpm: int | None = Field(default=None, gt=0, le=100_000_000)
    otpm: int | None = Field(default=None, gt=0, le=100_000_000)


class RagQuotaConfigurationError(ValueError):
    pass


@lru_cache(maxsize=16)
def _parse(scope: str | None, raw: str):
    if not scope or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", scope) or scope.startswith(("gsk_", "sk-")):
        raise RagQuotaConfigurationError("A valid RAG quota scope is required.")
    if len(raw) > 8192:
        raise RagQuotaConfigurationError("Invalid RAG model quotas.")
    try:
        values = json.loads(raw)
        return {model: RagModelQuota.model_validate(quota) for model, quota in values.items()}
    except (ValueError, AttributeError, ValidationError):
        raise RagQuotaConfigurationError("Invalid RAG model quotas.") from None


def configured_quotas():
    if settings.rag_provider_quota_scope in {
        settings.groq_api_key, settings.upstash_redis_rest_token, settings.supabase_secret_key,
    }:
        raise RagQuotaConfigurationError("A valid RAG quota scope is required.")
    return _parse(settings.rag_provider_quota_scope, settings.rag_provider_quotas_json)


def validate_provider_quotas(chat_models, summary_models):
    quotas = configured_quotas()
    for model in {*chat_models, *summary_models}:
        output = max(
            settings.rag_max_completion_tokens if model in chat_models else 0,
            settings.rag_summary_completion_tokens if model in summary_models else 0,
        )
        prompt = settings.rag_max_prompt_tokens
        quota = quotas.get(model)
        if quota is None or quota.tpm < prompt + output or (
            quota.itpm is not None and quota.itpm < prompt
        ) or (quota.otpm is not None and quota.otpm < output):
            raise RagQuotaConfigurationError("Each RAG model quota must admit one maximum-size request.")
