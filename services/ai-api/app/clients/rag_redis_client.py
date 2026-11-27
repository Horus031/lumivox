from threading import Lock
from urllib.parse import urlsplit

import httpx

from app.core.config import settings


class RagRedisUnavailable(RuntimeError):
    pass


_lock = Lock()
_client: httpx.Client | None = None


def valid_rag_redis_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        return bool(parsed.scheme == "https" and parsed.hostname and not parsed.username
                    and not parsed.password and not parsed.query and not parsed.fragment
                    and parsed.path in {"", "/"})
    except ValueError:
        return False


def get_rag_redis_http_client() -> httpx.Client:
    global _client
    with _lock:
        if _client is None:
            _client = httpx.Client(timeout=1.0, follow_redirects=False, transport=httpx.HTTPTransport(retries=0))
        return _client


def close_rag_redis_http_client() -> None:
    global _client
    with _lock:
        if _client is not None:
            _client.close()
            _client = None


def execute_rag_redis_command(command: list, *, timeout: float) -> object:
    url, token = settings.upstash_redis_rest_url, settings.upstash_redis_rest_token
    if not url or not valid_rag_redis_url(url) or not token:
        raise RagRedisUnavailable("RAG resource control is unavailable.")
    try:
        response = get_rag_redis_http_client().post(
            url, json=command, headers={"Authorization": f"Bearer {token}"}, timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or "result" not in payload or "error" in payload:
            raise RagRedisUnavailable("RAG resource control is unavailable.")
        return payload["result"]
    except (httpx.HTTPError, ValueError):
        raise RagRedisUnavailable("RAG resource control is unavailable.") from None
