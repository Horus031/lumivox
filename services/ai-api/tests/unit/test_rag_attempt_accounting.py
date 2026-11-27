from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext, RagProviderAttempt, aggregate_attempt_usage


def test_failed_and_unknown_attempts_preserve_observed_usage():
    attempts = [
        RagProviderAttempt("answer", "groq", "primary", "failed", prompt_tokens=12, completion_tokens=4, total_tokens=16),
        RagProviderAttempt("answer", "groq", "fallback", "unknown"),
    ]
    aggregate = aggregate_attempt_usage(attempts)
    assert aggregate == {
        "provider_calls": 2,
        "known_usage": {"prompt_tokens": 12, "completion_tokens": 4, "total_tokens": 16},
        "unknown_usage_attempts": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 1},
        "usage_complete": {"prompt_tokens": False, "completion_tokens": False, "total_tokens": False},
    }
    assert RagExecutionContext(RagDeadline.start(1), 2, attempts=attempts).accounting()[1]["total_tokens"] is None


def test_optional_summary_preserves_embedding_and_answer_slots():
    context = RagExecutionContext(RagDeadline.start(1), 4, answer_call_reserve=2, needs_embedding=True)
    assert context.has_provider_budget("rolling_summary")
    context.attempts.append(RagProviderAttempt("rolling_summary", "groq", "model"))
    assert not context.has_provider_budget("rolling_summary")
    assert context.has_provider_budget("embedding")
    context.attempts.append(RagProviderAttempt("embedding", "google", "model"))
    assert context.has_provider_budget("answer")
