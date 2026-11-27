from pathlib import Path

import pytest

from app.core.config import settings
from evaluation.rag_dataset import load_context, load_frozen_dataset
from evaluation.rag_variants import VARIANTS, configure_variant, project_context


ROOT = Path("evaluation/comparative_v1")


@pytest.mark.parametrize(("name", "history", "summary", "handoff"), [
    ("A", False, False, False), ("B", True, False, False), ("C", True, True, False), ("D", True, True, True),
])
def test_variant_projection(name, history, summary, handoff):
    cases, _ = load_frozen_dataset(ROOT / "quality_cases.jsonl")
    case = next(case for case in cases if case.id == "EVAL-HANDOFF-003")
    original = load_context(ROOT, case)
    variant = VARIANTS[name]
    with configure_variant(variant):
        assert settings.rag_privacy_filter_enabled and settings.rag_context_isolation_enabled
        assert settings.rag_resource_control_enabled
        projected = project_context(original, variant)
        assert bool(projected.recent_turns) == history
        assert bool(projected.summary) == summary
        assert bool(projected.handoff) == handoff
        assert original.summary and original.handoff


def test_configuration_is_restored_on_failure(monkeypatch):
    monkeypatch.setattr(settings, "rag_context_quality_enabled", True)
    monkeypatch.setattr(settings, "rag_privacy_filter_enabled", False)
    with pytest.raises(RuntimeError), configure_variant(VARIANTS["A"]):
        assert not settings.rag_context_quality_enabled
        assert settings.rag_privacy_filter_enabled
        raise RuntimeError
    assert settings.rag_context_quality_enabled
    assert not settings.rag_privacy_filter_enabled
