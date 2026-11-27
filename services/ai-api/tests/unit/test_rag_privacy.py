import pytest

from app.security.rag_privacy import RagPrivacyError, assert_safe_rag_provider_text, sanitize_rag_text


@pytest.mark.parametrize("secret", [
    "api_key: phase6d-fixture", "Bearer fixture-token-only", "eyJtestData123.payloadData123.signatureABC123",
    "-----BEGIN PRIVATE KEY-----\nsynthetic example\n-----END PRIVATE KEY-----",
    "postgresql://learner:fixture@example.test/db", "github_pat_fixture_only_0001",
    "refresh_token='quoted fixture value'",
    '"password":"synthetic-json-value"',
])
def test_known_credentials_redacted_before_dispatch(secret):
    with pytest.raises(RagPrivacyError, match="privacy check"):
        assert_safe_rag_provider_text(secret)
    value = sanitize_rag_text(secret, target="provider")
    assert value == "[redacted]"
    assert_safe_rag_provider_text(value)
    assert sanitize_rag_text(value, target="provider") == value


def test_memory_pii_and_legitimate_learning_artifacts():
    exercise = "Sắp xếp [8, 301234567890, 2] rồi tính y = 42."
    personal = "student@example.test, phone: +84 912 345 678"
    original = f"{exercise} {personal} <|fixture|>"
    memory = sanitize_rag_text(original, target="memory")
    assert exercise in memory and "student@example.test" not in memory and "912 345" not in memory
    assert "&lt;|fixture|>" in memory
    assert "student@example.test" in sanitize_rag_text(original, target="provider")
    assert sanitize_rag_text(memory, target="memory") == memory
