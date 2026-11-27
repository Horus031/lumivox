import os
import re
from urllib.parse import urlsplit

from app.clients.rag_redis_client import valid_rag_redis_url
from app.core.config import settings


def validate_local_target(url: str) -> None:
    target = urlsplit(url)
    if (
        target.scheme != "http" or target.hostname not in {"127.0.0.1", "::1"}
        or not target.port or target.username or target.password
        or target.query or target.fragment or target.path not in {"", "/"}
    ):
        raise ValueError("Evaluation requires an explicit loopback Supabase URL and port")


def validate_run_id(run_id: str) -> None:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", run_id):
        raise ValueError("Use a unique lowercase evaluation run ID")


def configure_isolated_environment(*, embedding=False, answers=False):
    # Read evaluation-specific process variables. Settings from the app's dotenv
    # files must never supply the database or credentials for a real evaluation.
    url = os.environ.get("LUMIVOX_EVAL_SUPABASE_URL", "")
    validate_local_target(url)
    keys = {
        "supabase_secret_key": "LUMIVOX_EVAL_SUPABASE_KEY",
        **({"gemini_api_key": "LUMIVOX_EVAL_GEMINI_KEY"} if embedding else {}),
        **({
            "groq_api_key": "LUMIVOX_EVAL_GROQ_KEY",
            "upstash_redis_rest_url": "LUMIVOX_EVAL_REDIS_URL",
            "upstash_redis_rest_token": "LUMIVOX_EVAL_REDIS_TOKEN",
        } if answers else {}),
    }
    values = {name: os.environ.get(env, "") for name, env in keys.items()}
    if missing := [keys[name] for name, value in values.items() if not value]:
        raise ValueError(f"Evaluation credentials missing: {', '.join(missing)}")
    for name in ("gemini_api_key", "groq_api_key", "upstash_redis_rest_token"):
        if name in values and values[name] == getattr(settings, name):
            raise ValueError("Evaluation provider and Redis credentials must be dedicated")
    if answers and (
        not valid_rag_redis_url(values["upstash_redis_rest_url"])
        or values["upstash_redis_rest_url"].rstrip("/") == (settings.upstash_redis_rest_url or "").rstrip("/")
    ):
        raise ValueError("A separate evaluation Redis HTTPS endpoint is required")
    settings.supabase_url = url.rstrip("/")
    for name, value in values.items():
        setattr(settings, name, value)
    if not answers:
        settings.groq_api_key = None
        settings.upstash_redis_rest_url = None
        settings.upstash_redis_rest_token = None
