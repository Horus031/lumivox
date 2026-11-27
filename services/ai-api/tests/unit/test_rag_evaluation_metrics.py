import pytest

from evaluation.rag_metrics import evidence_recall, paired_comparison, precision_at_k, recall_at_k, reciprocal_rank_at_k
from scripts.analyze_rag_comparative import rate


def test_rank_cutoff_denominators_and_overlap():
    retrieved = ["noise", "first", "first", "other"]
    gold = {"first", "second"}
    assert recall_at_k(retrieved, gold, 5) == 0.5
    assert precision_at_k(retrieved, gold, 5) == 0.2
    assert reciprocal_rank_at_k(retrieved, gold, 5) == 0.5
    assert evidence_recall(retrieved, [{"first", "second"}, {"other"}]) == 1
    assert recall_at_k(retrieved, set(), 5) is None
    assert reciprocal_rank_at_k(retrieved, set(), 5) is None
    with pytest.raises(ValueError):
        precision_at_k(retrieved, gold, 0)


def test_failures_remain_in_scheduled_denominator_and_missing_is_explicit():
    assert rate([True, False])["rate"] == 0.5
    result = rate([True, False, None])
    assert (result["scheduled"], result["missing"], result["rate"]) == (3, 1, None)
    assert result["wilson_95"] is None


def test_paired_comparison_uses_case_ids_and_preserves_failed_cases():
    report = paired_comparison({"a": False, "b": True, "c": None}, {"a": True, "b": True, "c": True})
    assert report["paired"] == 2
    assert report["improved"] == 1
    assert report["difference"] == 0.5
    assert report["unpaired_or_unscored"] == 1
