from math import comb, sqrt


def recall_at_k(retrieved_ids, relevant_ids, k):
    if k <= 0:
        raise ValueError("k must be positive")
    return len(set(retrieved_ids[:k]) & relevant_ids) / len(relevant_ids) if relevant_ids else None


def precision_at_k(retrieved_ids, relevant_ids, k):
    if k <= 0:
        raise ValueError("k must be positive")
    return len(set(retrieved_ids[:k]) & relevant_ids) / k


def reciprocal_rank_at_k(retrieved_ids, relevant_ids, k):
    if k <= 0:
        raise ValueError("k must be positive")
    if not relevant_ids:
        return None
    return next((1 / rank for rank, key in enumerate(retrieved_ids[:k], start=1) if key in relevant_ids), 0.0)


def evidence_recall(retrieved_ids, evidence_units):
    retrieved = set(retrieved_ids)
    return sum(bool(retrieved & ids) for ids in evidence_units) / len(evidence_units) if evidence_units else None


def wilson_interval(successes, total, z=1.95996398454):
    if total == 0:
        return None
    rate = successes / total
    denominator = 1 + z * z / total
    center = (rate + z * z / (2 * total)) / denominator
    margin = z * sqrt((rate * (1 - rate) + z * z / (4 * total)) / total) / denominator
    return max(0, center - margin), min(1, center + margin)


def paired_comparison(first, second):
    shared = set(first) & set(second)
    eligible = [key for key in shared if first[key] is not None and second[key] is not None]
    improved = sum(not first[key] and second[key] for key in eligible)
    regressed = sum(first[key] and not second[key] for key in eligible)
    discordant = improved + regressed
    return {
        "paired": len(eligible), "unpaired_or_unscored": len(set(first) | set(second)) - len(eligible),
        "improved": improved, "regressed": regressed,
        "both_correct": sum(first[key] and second[key] for key in eligible),
        "both_incorrect": len(eligible) - improved - regressed - sum(first[key] and second[key] for key in eligible),
        "difference": (improved - regressed) / len(eligible) if eligible else None,
        "mcnemar_exact_p": (
            min(1.0, 2 * sum(comb(discordant, i) for i in range(min(improved, regressed) + 1)) / 2**discordant)
            if eligible else None
        ),
    }
