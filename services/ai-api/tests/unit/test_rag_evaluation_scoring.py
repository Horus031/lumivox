from pathlib import Path

from app.schemas.rag_evaluation import ReviewScore
from evaluation.rag_dataset import load_frozen_dataset, sha256
from evaluation.rag_results import append_jsonl
from evaluation.rag_scoring import exact_artifacts, scored_correctness
from scripts.export_rag_blind_review import blind_items


ROOT = Path("evaluation/comparative_v1")


def test_contradictory_final_array_fails_and_labeled_input_is_permitted():
    expected = [[1, 3, 5, 8, 9]]
    assert exact_artifacts("Input: [8, 3, 5, 9, 1]. Final: [1, 3, 5, 8, 9].", expected)
    assert not exact_artifacts("Result [1, 3, 5, 8, 9]. The final answer is [9, 8, 5, 3, 1].", expected)
    assert exact_artifacts("No artifact requested.", []) is None


def test_missing_score_is_unknown_and_provider_failure_is_incorrect():
    cases, _ = load_frozen_dataset(ROOT / "quality_cases.jsonl")
    case = cases[0]
    assert scored_correctness({"status": "completed", "mode": "live"}, case, None) is None
    assert scored_correctness({"status": "rate_limited", "mode": "live"}, case, None) is False
    assert scored_correctness({"status": "not_run", "mode": "live"}, case, None) is None


def test_missing_security_review_cannot_pass_an_applicable_case():
    cases, _ = load_frozen_dataset(ROOT / "quality_cases.jsonl")
    row = {"status": "completed", "mode": "live"}
    score = ReviewScore(
        correctness=2, completeness=2, context_continuity=None, grounding=None, language=2, clarity=2,
        overall_correct=True,
    )
    assert scored_correctness(row, cases[0], score) is True
    assert scored_correctness(row, cases[0], score, security_review_required=True) is None
    verified = score.model_copy(update={
        "unauthorized_information_exposed": False, "credential_leaked": False,
        "adversarial_instruction_followed": False,
    })
    assert scored_correctness(row, cases[0], verified, security_review_required=True) is True
    assert scored_correctness(row, cases[0], verified.model_copy(update={"credential_leaked": True}),
                              security_review_required=True) is False


def test_blind_export_does_not_expose_variant_or_model(tmp_path):
    dataset = ROOT / "quality_cases.jsonl"
    cases, _ = load_frozen_dataset(dataset)
    path = tmp_path / "answers.jsonl"
    with path.open("x", encoding="utf-8") as file:
        append_jsonl(file, {"plan": {
            "mode": "live", "dataset": dataset.name, "subset": "main", "dataset_sha256": sha256(dataset),
            "freeze_sha256": sha256(ROOT / "manifest.json"),
        }})
        append_jsonl(file, {"case_id": cases[0].id, "status": "completed", "answer": "Answer",
                            "variant": "D", "model": "model-name", "provider": "groq", "mode": "live",
                            "repetition": 1, "run_id": "smoke", "allowed_evidence": []})
    [(answer, mapping)] = blind_items([path], ROOT)
    assert answer["overall_correct"] is None
    assert not {"variant", "model", "provider", "case_id", "run_id"} & answer.keys()
    assert mapping["variant"] == "D" and mapping["review_id"] == answer["review_id"]
