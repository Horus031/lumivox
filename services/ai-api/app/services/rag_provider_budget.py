from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Literal
from uuid import uuid4

from app.clients.rag_redis_client import RagRedisUnavailable, execute_rag_redis_command
from app.core.config import settings
from app.core.rag_provider_quotas import RagQuotaConfigurationError, configured_quotas
from app.services.rag_provider_throughput import ACQUIRE_WITH_QUOTA_SCRIPT, SETTLE_DEBT_SCRIPT, quota_arguments


ACQUIRE_SCRIPT = """
local permits_key = KEYS[1]
local cooldown_key = KEYS[2]
local permit_id = ARGV[1]
local limit = tonumber(ARGV[2])
local lease_ms = tonumber(ARGV[3])
local clock = redis.call("TIME")
local now_ms = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call("ZREMRANGEBYSCORE", permits_key, "-inf", now_ms)
if redis.call("EXISTS", cooldown_key) == 1 then return {"cooldown", "0"} end
if redis.call("ZSCORE", permits_key, permit_id) then return {"acquired", permit_id} end
if redis.call("ZCARD", permits_key) >= limit then return {"busy", "0"} end
redis.call("ZADD", permits_key, now_ms + lease_ms, permit_id)
if redis.call("PTTL", permits_key) < lease_ms then redis.call("PEXPIRE", permits_key, lease_ms) end
return {"acquired", permit_id}
"""

COOLDOWN_SCRIPT = """
local duration = tonumber(ARGV[1])
if redis.call("PTTL", KEYS[1]) < duration then
  redis.call("SET", KEYS[1], "1", "PX", duration)
end
return 1
"""


@dataclass(frozen=True)
class RagProviderPermit:
    key: str
    permit_id: str
    quota_keys: tuple[str, str] | None = None


def provider_keys(model: str) -> tuple[str, str]:
    if settings.rag_provider_throughput_enabled:
        configured_quotas()
        prefix = f"lumivox:rag:quota:{{{settings.rag_provider_quota_scope}:groq}}"
    else:
        prefix = f"lumivox:rag:provider:{{{settings.rag_resource_namespace}:groq}}"
    return f"{prefix}:permits", f"{prefix}:cooldown:{model}"


def acquire_provider_permit(
    model: str, *, timeout: float, input_tokens: int = 0, output_tokens: int = 0,
) -> tuple[Literal["acquired", "busy", "cooldown", "rpm_limited", "tpm_limited", "quota_unavailable"],
           RagProviderPermit | None]:
    permit_id = str(uuid4())
    try:
        permits, cooldown = provider_keys(model)
        quota = configured_quotas()[model] if settings.rag_provider_throughput_enabled else None
    except (RagQuotaConfigurationError, KeyError):
        return "quota_unavailable", None
    keys = [permits, cooldown]
    args = [permit_id, settings.rag_provider_max_concurrency, settings.rag_provider_lease_seconds * 1000]
    quota_keys = None
    if quota is not None:
        quota_keys = (f"{cooldown}:timestamps", f"{cooldown}:weights")
        keys.extend(quota_keys)
        args.extend(quota_arguments(quota, input_tokens, output_tokens))
    result = execute_rag_redis_command([
        "EVAL", ACQUIRE_WITH_QUOTA_SCRIPT if quota else ACQUIRE_SCRIPT, len(keys), *keys, *args,
    ], timeout=timeout)
    if isinstance(result, list) and len(result) == 2:
        if result == ["acquired", permit_id]:
            return "acquired", RagProviderPermit(permits, permit_id, quota_keys)
        if result == ["busy", "0"]:
            return "busy", None
        if result == ["cooldown", "0"]:
            return "cooldown", None
        if quota and result in (["rpm_limited", "0"], ["tpm_limited", "0"]):
            return result[0], None
        if quota and result in (["existing", "0"], ["unavailable", "0"]):
            return "quota_unavailable", None
    raise RagRedisUnavailable("RAG resource control is unavailable.")


def settle_provider_debt(permit: RagProviderPermit, *, input_tokens: int, output_tokens: int, total_tokens: int,
                         timeout: float) -> None:
    if permit.quota_keys is None:
        return
    result = execute_rag_redis_command([
        "EVAL", SETTLE_DEBT_SCRIPT, 2, *permit.quota_keys, permit.permit_id, input_tokens, output_tokens, total_tokens,
    ], timeout=timeout)
    if type(result) is not int or result not in {0, 1}:
        raise RagRedisUnavailable("RAG quota settlement is unavailable.")


def release_provider_permit(permit: RagProviderPermit, *, timeout: float) -> None:
    result = execute_rag_redis_command(["ZREM", permit.key, permit.permit_id], timeout=timeout)
    if type(result) is not int or result not in {0, 1}:
        raise RagRedisUnavailable("RAG resource control is unavailable.")


def retry_after_seconds(value: str | None) -> int:
    if value and len(value) <= 100:
        if value.isascii() and value.isdecimal():
            return max(1, min(int(value), 120))
        try:
            when = parsedate_to_datetime(value)
            if when.tzinfo is not None:
                return max(1, min(round((when - datetime.now(timezone.utc)).total_seconds()), 120))
        except (ValueError, TypeError, OverflowError):
            pass
    return settings.rag_provider_cooldown_seconds


def mark_model_cooldown(model: str, *, seconds: int, timeout: float) -> None:
    _, cooldown = provider_keys(model)
    result = execute_rag_redis_command([
        "EVAL", COOLDOWN_SCRIPT, 1, cooldown, max(1, min(seconds, 120)) * 1_000,
    ], timeout=timeout)
    if type(result) is not int or result != 1:
        raise RagRedisUnavailable("RAG resource control is unavailable.")
