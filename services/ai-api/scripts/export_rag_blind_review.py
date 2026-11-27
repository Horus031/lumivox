"""Shuffle completed answer records and write their private IDs separately."""

import argparse
import json
from pathlib import Path
from random import SystemRandom
from uuid import uuid4

from app.security.rag_privacy import sanitize_rag_text
from evaluation.rag_dataset import load_frozen_dataset, read_jsonl, sha256
from evaluation.rag_results import append_jsonl


def row_identity(row, plan):
    return {key: row[key] for key in ("run_id", "case_id", "variant", "repetition", "mode")} | {
        "dataset": plan["dataset"], "subset": plan["subset"], "dataset_sha256": plan["dataset_sha256"],
    }


def blind_items(result_files, root):
    items = []
    seen = set()
    for path in result_files:
        header, *rows = read_jsonl(path)
        plan = header["plan"]
        if plan["mode"] not in {"live", "lifecycle"}:
            continue
        dataset = root / plan["dataset"]
        cases, _ = load_frozen_dataset(dataset)
        if sha256(dataset) != plan["dataset_sha256"] or sha256(root / "manifest.json") != plan["freeze_sha256"]:
            raise ValueError("Result freeze is not the review freeze")
        by_id = {case.id: case for case in cases}
        for row in rows:
            if row["status"] != "completed" or row["answer"] is None:
                continue
            case = by_id[row["case_id"]]
            identity = row_identity(row, plan)
            key = tuple(identity.values())
            if key in seen:
                raise ValueError("Duplicate result identity")
            seen.add(key)
            review_id = uuid4().hex
            review = {
                "review_id": review_id,
                "question": sanitize_rag_text(case.question, target="provider"),
                "reference_answer": case.expected.reference_answer,
                "allowed_evidence": row["allowed_evidence"],
                "generated_answer": row["answer"],
                "required_facts": case.expected.required_facts,
                "prohibited_claims": case.expected.prohibited_claims,
                "expected_arrays": case.expected.expected_arrays, "preferred_locale": case.locale,
                **dict.fromkeys(("correctness", "completeness", "context_continuity", "grounding", "language",
                                 "clarity", "overall_correct", "abstained", "adversarial_instruction_followed",
                                 "unauthorized_information_exposed", "credential_leaked")),
                "review_notes": "", "supported_citations": 0, "evaluated_citations": 0,
                "supported_claims": 0, "grounding_required_claims": 0, "unsupported_claims": 0,
                "failure_codes": [],
            }
            items.append((review, {"review_id": review_id, **identity}))
    SystemRandom().shuffle(items)
    return items


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", nargs="+", type=Path, required=True)
    parser.add_argument("--dataset-root", type=Path, default=Path("evaluation/comparative_v1"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    args = parser.parse_args()
    items = blind_items(args.results, args.dataset_root)
    if not items:
        parser.error("There are no completed answer rows to review")
    if args.output.resolve() == args.mapping.resolve() or args.output.exists() or args.mapping.exists():
        parser.error("Provide two distinct unused output paths")
    with args.output.open("x", encoding="utf-8") as public, args.mapping.open("x", encoding="utf-8") as private:
        for review, identity in items:
            append_jsonl(public, review)
            append_jsonl(private, identity)


if __name__ == "__main__":
    main()
