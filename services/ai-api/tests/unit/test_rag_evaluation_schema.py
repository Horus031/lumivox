from collections import Counter
from pathlib import Path
import shutil

import pytest
from pydantic import ValidationError

from app.schemas.rag_evaluation import EvaluationCase
from evaluation.rag_dataset import load_frozen_dataset
from evaluation.rag_environment import validate_local_target


ROOT = Path("evaluation/comparative_v1")


def test_frozen_fixtures_validate_with_the_prespecified_coverage():
    cases, manifest = load_frozen_dataset(ROOT / "quality_cases.jsonl")
    security, _ = load_frozen_dataset(ROOT / "security_live_cases.jsonl")
    assert len(cases) == 80
    assert Counter(case.locale for case in cases) == {"en": 40, "vi": 40}
    assert len(security) == len(manifest["security"]) == 36


@pytest.mark.parametrize("changes", [
    {"mode": "document"},
    {"document_keys": ["policy"]},
    {"expected": {"reference_answer": "   ", "required_facts": ["fact"]}},
    {"expected": {"reference_answer": "fact", "required_facts": []}},
    {"expected": {"reference_answer": "fact", "requires_citation": True, "required_facts": ["fact"]}},
])
def test_case_scope_and_empty_rubric_are_rejected(changes):
    case = dict(id="fixture", category="standalone", locale="en", mode="general",
                difficulty="easy", question="What is the answer?",
                expected={"reference_answer": "fact", "required_facts": ["fact"]})
    with pytest.raises(ValidationError):
        EvaluationCase.model_validate(case | changes)


def test_manifest_detects_tampering(tmp_path):
    corpus = tmp_path / "corpus"
    shutil.copytree(ROOT, corpus, ignore=shutil.ignore_patterns("results"))
    dataset = corpus / "quality_cases.jsonl"
    dataset.write_bytes(dataset.read_bytes() + b"\n")
    with pytest.raises(ValueError, match="digest"):
        load_frozen_dataset(dataset)


@pytest.mark.parametrize("url", [
    "https://project.supabase.co",
    "http://127.0.0.1.external.example:54321",
    "http://user@127.0.0.1:54321",
    "http://localhost:54321",
    "http://127.0.0.1:54321/path",
])
def test_hosted_or_ambiguous_targets_are_rejected(url):
    with pytest.raises(ValueError):
        validate_local_target(url)


def test_isolated_local_target_is_allowed():
    validate_local_target("http://127.0.0.1:54321")
