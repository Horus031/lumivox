from collections import Counter
from math import isfinite


def capacity_ceiling(concurrency, active_seconds, rpm, attempts, tpm, reserved_tokens):
    values = (concurrency, active_seconds, rpm, attempts, tpm, reserved_tokens)
    if any(not isfinite(value) or value <= 0 for value in values):
        raise ValueError("Capacity estimates require positive finite inputs.")
    capacities = {
        "concurrency": 60 * concurrency / active_seconds,
        "rpm": rpm / attempts,
        "tpm": tpm / reserved_tokens,
    }
    bottleneck = min(capacities, key=capacities.get)
    return {"operations_per_minute": capacities[bottleneck], "bottleneck": bottleneck, **capacities}


def latency_distribution(samples):
    values = sorted(samples)
    if not values:
        return {"count": 0, "p50": None, "p95": None, "p99": None, "max": None}

    def percentile(fraction):
        index = (len(values) - 1) * fraction
        lower = int(index)
        return round(values[lower] + (index - lower) * (values[min(lower + 1, len(values) - 1)] - values[lower]), 2)

    return {"count": len(values), "p50": percentile(.50), "p95": percentile(.95),
            "p99": percentile(.99), "max": values[-1]}


def summarize_operations(rows):
    counts = Counter(row["outcome"] for row in rows)
    successful = {"completed", "deterministic_abstention", "replayed"}
    rejected = {"admission_rejected", "authorization_rejected", "provider_busy", "provider_rate_limited", "in_progress"}
    stages = {stage for row in rows for stage in row.get("stages", {})}

    def total(field):
        values = [row[field] for row in rows if row.get(field) is not None]
        return sum(values) if values else None

    return {
        "scheduled_operations": len(rows), "completed_operations": sum(counts[key] for key in successful),
        "rejected_operations": sum(counts[key] for key in rejected), "unknown_operations": counts["unknown"],
        "failed_operations": sum(count for key, count in counts.items()
                                 if key not in successful | rejected | {"unknown"}),
        "outcomes": dict(counts), "provider_attempts": total("provider_calls"),
        "known_provider_tokens": total("known_provider_tokens"), "unknown_usage_attempts": total("unknown_usage_attempts"),
        "latency_ms": latency_distribution(row["elapsed_ms"] for row in rows),
        "success_latency_ms": latency_distribution(row["elapsed_ms"] for row in rows if row["outcome"] in successful),
        "failure_latency_ms": latency_distribution(row["elapsed_ms"] for row in rows if row["outcome"] not in successful),
        "stage_latency_ms": {
            stage: latency_distribution(row["stages"][stage]["total_ms"] for row in rows if stage in row.get("stages", {}))
            for stage in sorted(stages)
        },
        "accounting_states": dict(Counter(row["accounting_state"] for row in rows if "accounting_state" in row)),
    }
