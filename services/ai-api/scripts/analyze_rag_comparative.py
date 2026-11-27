"""Aggregate scheduled outcomes, blind scoring and paired case-level comparisons."""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from random import Random
from statistics import mean

from app.schemas.rag_evaluation import ReviewScore
from evaluation.rag_dataset import load_frozen_dataset, read_jsonl, sha256
from evaluation.rag_metrics import paired_comparison, wilson_interval
from evaluation.rag_scoring import scored_correctness
from scripts.export_rag_blind_review import row_identity


PROVIDER_FAILURES = {"rate_limited", "provider_busy", "timeout", "provider_error"}
DIMENSIONS = ("correctness", "completeness", "context_continuity", "grounding", "language", "clarity")


def rate(counts):
    successes = counts.count(True)
    evaluated = len(counts) - counts.count(None)
    return {
        "correct": successes, "evaluated": evaluated, "scheduled": len(counts),
        "missing": counts.count(None),
        "rate": successes / len(counts) if counts and evaluated == len(counts) else None,
        "wilson_95": wilson_interval(successes, len(counts)) if evaluated == len(counts) else None,
    }


def average(rows, key):
    values = [row[key] for row in rows if row.get(key) is not None]
    return mean(values) if values else None


def measured_total(rows, key):
    values = [row[key] for row in rows if row.get(key) is not None]
    return sum(values) if values else None


def percentile(values, fraction):
    if not values:
        return None
    index = (len(values) - 1) * fraction
    lower = int(index)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (index - lower) * (values[upper] - values[lower])


def paired_effect(first, second):
    result = paired_comparison(first, second)
    differences = [int(second[key]) - int(first[key]) for key in sorted(set(first) & set(second))
                   if first[key] is not None and second[key] is not None]
    rng = Random(612)
    bootstrap = sorted(mean(rng.choices(differences, k=len(differences))) for _ in range(2_000)) if differences else []
    result["paired_bootstrap_95"] = [percentile(bootstrap, 0.025), percentile(bootstrap, 0.975)] if bootstrap else None
    return result


def reviewed(path, mapping):
    if not path:
        return {}
    seen = {}
    for item in read_jsonl(path):
        review_id = item.pop("review_id")
        if review_id not in mapping:
            raise ValueError("Review ID is absent from mapping")
        key = tuple(mapping[review_id].items())
        if key in seen:
            raise ValueError("Duplicate review result")
        seen[key] = ReviewScore.model_validate({k: v for k, v in item.items() if k in ReviewScore.model_fields})
    return seen


def summarize(plan, rows, cases, frozen, review):
    row_by_id = {row["case_id"]: row for row in rows}
    if len(row_by_id) != len(rows) or set(row_by_id) - set(plan["case_ids"]):
        raise ValueError("Result contains duplicate or unscheduled cases")
    scores, by_category, statuses = {}, defaultdict(list), Counter()
    failures = Counter()
    semantic = Counter()
    completed, abstention = [], Counter()
    security = defaultdict(Counter)
    for case_id in plan["case_ids"]:
        case = cases[case_id]
        row = row_by_id.get(case_id, {"status": "not_run"})
        status = row["status"]
        statuses[status] += 1
        score = review.get(tuple(row_identity(row, plan).items())) if status == "completed" else None
        correctness = scored_correctness(
            row, case, score, security_review_required=case_id in frozen["security"],
        ) if plan["mode"] in {"live", "lifecycle"} else None
        scores[case_id] = correctness
        by_category[case.category].append(correctness)
        if status == "completed":
            completed.append(correctness)
        if score is not None:
            for field in ("supported_citations", "evaluated_citations", "supported_claims",
                          "grounding_required_claims", "unsupported_claims"):
                semantic[field] += getattr(score, field)
            failures.update(score.failure_codes)
            if score.abstained is not None:
                abstention[f'{"unanswerable" if case.expected.should_abstain else "answerable"}_'
                           f'{"abstained" if score.abstained else "answered"}'] += 1
        elif status in PROVIDER_FAILURES:
            failures["provider_failure"] += 1
        elif status == "evaluation_error":
            failures["fixture_error"] += 1
        elif status == "security_rejected":
            failures["security_failure"] += 1
        if security_case := frozen["security"].get(case_id):
            group = security[security_case["group"]]
            group["scheduled"] += 1
            group["completed"] += status == "completed"
            group["automatic_marker_observed"] += row.get("synthetic_marker_in_output") is True
            group["credential_detected_in_output"] += row.get("credential_detected_in_output") is True
            group["unsupported_citation_observed"] += row.get("citation_validation") == "unsupported"
            group["unauthorized_marker_observed"] += row.get("private_distractor_marker_in_output") is True
            group["boundary_rejected"] += status == "security_rejected"
            group["legitimate_correct"] += correctness is True
            if score is not None:
                for field in ("adversarial_instruction_followed", "unauthorized_information_exposed", "credential_leaked"):
                    checked = getattr(score, field)
                    group[field + "_evaluated"] += checked is not None
                    group[field] += checked is True
    security_metrics = {}
    for name, group in security.items():
        evaluated = group["adversarial_instruction_followed_evaluated"]
        security_metrics[name] = {
            **group,
            "incomplete_executions": group["scheduled"] - group["completed"],
            "unevaluated_attack_outcomes": group["scheduled"] - evaluated,
            "attack_success_rate": group["adversarial_instruction_followed"] / evaluated if evaluated else None,
        }
    latencies = sorted(row["latency_ms"] for row in rows if row["status"] == "completed" and row.get("latency_ms") is not None)
    measured_completed = [value for value in completed if value is not None]
    metrics = {
        "scheduled_correctness": rate(list(scores.values())),
        "completed_evaluable_correctness": rate(measured_completed),
        "completed_missing_review": completed.count(None),
        "category_correctness": {category: rate(values) for category, values in by_category.items()},
        "statuses": dict(statuses),
        "provider_failure_rate": sum(statuses[status] for status in PROVIDER_FAILURES) / len(plan["case_ids"]),
        "semantic_citation_precision": (semantic["supported_citations"] / semantic["evaluated_citations"]
                                        if semantic["evaluated_citations"] else None),
        "semantic_citation_completeness": (semantic["supported_claims"] / semantic["grounding_required_claims"]
                                           if semantic["grounding_required_claims"] else None),
        "semantic_counts": dict(semantic),
        "abstention_matrix": dict(abstention), "failure_counts": dict(failures), "security": security_metrics,
        "p50_latency_ms": percentile(latencies, 0.50), "p95_latency_ms": percentile(latencies, 0.95),
        "observed_no_hits": sum(row.get("has_retrieved_evidence") is False
                                and cases[row["case_id"]].expected.should_abstain for row in rows),
        "observed_unanswerable_with_hits": sum(row.get("has_retrieved_evidence") is True
                                               and cases[row["case_id"]].expected.should_abstain for row in rows),
    }
    for key in ("retrieval_recall_at_5", "retrieval_precision_at_5", "retrieval_mrr_at_5", "retrieval_evidence_recall",
                "packed_evidence_recall", "estimated_prompt_tokens"):
        metrics[f"mean_{key}"] = average(rows, key)
    for key in ("known_provider_tokens", "unknown_usage_attempts", "provider_calls", "out_of_scope_retrieval",
                "out_of_scope_packed", "budget_violation", "prompt_budget_violation", "memory_budget_violation",
                "provider_call_budget_violation", "relevant_evidence_truncated"):
        metrics[key] = measured_total(rows, key)
    return metrics, scores


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", nargs="+", type=Path, required=True)
    parser.add_argument("--dataset-root", type=Path, default=Path("evaluation/comparative_v1"))
    parser.add_argument("--review", type=Path)
    parser.add_argument("--second-review", type=Path)
    parser.add_argument("--mapping", type=Path)
    args = parser.parse_args()
    if (args.review or args.second_review) and not args.mapping:
        parser.error("Scoring requires the private review mapping")
    mapping = {item.pop("review_id"): item for item in read_jsonl(args.mapping)} if args.mapping else {}
    review = reviewed(args.review, mapping)
    alternate = reviewed(args.second_review, mapping)
    reports, groups, comparisons = [], defaultdict(dict), []
    for path in args.results:
        header, *rows = read_jsonl(path)
        plan = header["plan"]
        dataset_path = args.dataset_root / plan["dataset"]
        cases, frozen = load_frozen_dataset(dataset_path)
        if sha256(dataset_path) != plan["dataset_sha256"] or sha256(args.dataset_root / "manifest.json") != plan["freeze_sha256"]:
            raise ValueError("Result freeze differs from current verification freeze")
        by_id = {case.id: case for case in cases}
        metrics, scores = summarize(plan, rows, by_id, frozen, review)
        reports.append({"plan": plan, "metrics": metrics})
        if plan["mode"] == "live" and plan["dataset"] == "quality_cases.jsonl":
            fixed_settings = {key: value for key, value in plan["configuration"].items()
                              if key not in {"rag_context_quality_enabled", "rag_rolling_summary_enabled",
                                             "rag_handoff_enabled"}}
            group_key = json.dumps({key: plan[key] for key in (
                "run_id", "subset", "repetition", "corpus_sha256", "revision", "dataset_sha256",
                "embedding_model", "embedding_dimensions", "runtime_sha256", "chunking",
            )} | {"settings": fixed_settings}, sort_keys=True)
            variants = groups[group_key]
            if plan["variant"] in variants:
                raise ValueError("More than one result file for the same paired variant")
            variants[plan["variant"]] = scores, by_id
    for variants in groups.values():
        for left, right, category in (
            ("A", "B", "referential_followup"), ("B", "C", "long_range_recall"), ("C", "D", "topic_switch"),
            ("C", "D", "worked_exercise"), ("C", "D", "handoff"), ("A", "D", None), ("A", "D", "grounded_answer"),
            ("A", "D", "context_dependent"), ("A", "D", "standalone_and_grounded"),
        ):
            if left in variants and right in variants:
                first, cases = variants[left]
                second, _ = variants[right]
                applicable = {
                    "context_dependent": {"referential_followup", "long_range_recall", "topic_switch", "worked_exercise", "handoff"},
                    "standalone_and_grounded": {"standalone", "grounded_answer"},
                }.get(category, {category})
                first = {key: value for key, value in first.items() if category is None or cases[key].category in applicable}
                second = {key: value for key, value in second.items() if category is None or cases[key].category in applicable}
                comparisons.append({"pair": [left, right], "category": category, **paired_effect(first, second)})
    agreement = {
        field: rate([getattr(review[key], field) == getattr(alternate[key], field) for key in review.keys() & alternate.keys()
                     if getattr(review[key], field) is not None and getattr(alternate[key], field) is not None])
        for field in (*DIMENSIONS, "overall_correct")
    } if alternate else None
    print(json.dumps({"reports": reports, "comparisons": comparisons, "reviewer_agreement": agreement}, indent=2))


if __name__ == "__main__":
    main()
