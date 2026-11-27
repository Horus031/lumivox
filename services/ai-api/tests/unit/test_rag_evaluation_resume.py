import pytest

from evaluation.rag_dataset import read_jsonl
from evaluation.rag_results import append_jsonl, open_results


def test_resume_preserves_prior_attempts_including_failure(tmp_path):
    path = tmp_path / "attempts.jsonl"
    plan = {"case_ids": ["first", "second"], "dataset_sha256": "digest", "variant": "D",
            "repetition": 1, "configuration": {"model": "stable"}}
    first = {"case_id": "first", "status": "rate_limited"}
    second = {"case_id": "second", "status": "completed"}
    with open_results(path, plan, False) as (file, completed):
        assert not completed
        append_jsonl(file, first)
    with pytest.raises(FileExistsError), open_results(path, plan, False):
        pass
    for change in ({"repetition": 2}, {"variant": "A"}, {"dataset_sha256": "other"},
                   {"configuration": {"model": "different"}}):
        with pytest.raises(ValueError, match="Resume plan"), open_results(path, plan | change, True):
            pass
    with open_results(path, plan, True) as (file, completed):
        assert completed == {"first"}
        with pytest.raises(OSError), open_results(path, plan, True):
            pass
        append_jsonl(file, second)
    assert read_jsonl(path) == [{"plan": plan}, first, second]
