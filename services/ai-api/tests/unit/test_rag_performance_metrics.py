from evaluation.rag_performance_metrics import summarize_operations


def test_failure_latency_and_unmeasured_usage_remain_separate():
    result = summarize_operations([
        {"outcome": "completed", "elapsed_ms": 20, "provider_calls": 1, "unknown_usage_attempts": 1},
        {"outcome": "unknown", "elapsed_ms": 300, "provider_calls": None, "known_provider_tokens": None},
        {"outcome": "provider_busy", "elapsed_ms": 10, "provider_calls": 0},
    ])
    assert result["unknown_operations"] == result["rejected_operations"] == 1
    assert result["known_provider_tokens"] is None and result["unknown_usage_attempts"] == 1
    assert result["success_latency_ms"]["p95"] == 20
    assert result["failure_latency_ms"]["max"] == 300
