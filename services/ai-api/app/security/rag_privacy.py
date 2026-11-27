import re
from typing import Literal

RagPrivacyTarget = Literal["provider", "memory", "title", "log"]

_CREDENTIAL_PATTERNS = (
    re.compile(r"-----BEGIN [^\r\n-]*PRIVATE KEY-----.*?(?:-----END [^\r\n-]*PRIVATE KEY-----|\Z)", re.DOTALL),
    re.compile(r"(?i)\b(?:postgres(?:ql)?(?:\+[a-z0-9_]+)?|mysql|mongodb(?:\+srv)?|rediss?)://[^\s<>\"']+@[^\s<>\"']+"),
    re.compile(r"(?i)\bbearer[ \t]+[A-Za-z0-9._~+/=-]{8,}"),
    re.compile(
        r"(?i)(?<!\w)[\"']?(?:password|passwd|pwd|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token)"
        r"[\"']?[^\S\r\n]*[:=][^\S\r\n]*(?:\"[^\"\n]*\"|'[^'\n]*'|[^\s,;]+)"
    ),
    re.compile(r"\b(?:gsk_|sk-|ghp_|github_pat_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]{12,}"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
)
_EMAIL = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_LABELED_PHONE = re.compile(
    r"(?i)\b(?:phone(?: number)?|mobile|tel|điện thoại|số điện thoại)[ \t]*[:=][ \t]*"
    r"\+?\d[\d(). \t-]{5,22}\d\b"
)


class RagPrivacyError(ValueError):
    pass


def escape_model_control_markers(text: str) -> str:
    return text.replace("<|", "&lt;|")


def sanitize_rag_text(text: str, *, target: RagPrivacyTarget) -> str:
    for pattern in _CREDENTIAL_PATTERNS:
        text = pattern.sub("[redacted]", text)
    if target != "provider":
        text = _EMAIL.sub("[redacted]", text)
        text = _LABELED_PHONE.sub("[redacted]", text)
    return escape_model_control_markers(text)


def assert_safe_rag_provider_text(text: str) -> None:
    # Validate the completed representation without rewriting serialized JSON.
    if text != sanitize_rag_text(text, target="provider"):
        raise RagPrivacyError("RAG provider input failed the privacy check.")
