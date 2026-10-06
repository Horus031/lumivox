import pytest
from fastapi import HTTPException

from app.security import internal_api_key


def test_internal_api_key_uses_constant_time_compare(monkeypatch):
    calls = []

    def fake_compare_digest(
        supplied: str,
        expected: str,
    ) -> bool:
        calls.append(
            (
                supplied,
                expected,
            )
        )

        return True

    monkeypatch.setattr(
        internal_api_key.settings,
        "ai_internal_api_key",
        "expected-key",
    )
    monkeypatch.setattr(
        internal_api_key,
        "compare_digest",
        fake_compare_digest,
    )

    internal_api_key.verify_internal_api_key(
        "supplied-key"
    )

    assert calls == [
        (
            "supplied-key",
            "expected-key",
        )
    ]


def test_internal_api_key_rejects_missing_key():
    with pytest.raises(HTTPException) as exc_info:
        internal_api_key.verify_internal_api_key(None)

    assert exc_info.value.status_code == 401
