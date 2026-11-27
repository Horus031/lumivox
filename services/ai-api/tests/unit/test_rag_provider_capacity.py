import pytest

from evaluation.rag_performance_metrics import capacity_ceiling


def test_capacity_is_minimum_of_three_constraints():
    result = capacity_ceiling(4, 3, 30, 1.2, 8000, 2400)
    assert result["operations_per_minute"] == pytest.approx(3.333333)
    assert result["bottleneck"] == "tpm"
    with pytest.raises(ValueError):
        capacity_ceiling(4, 0, 30, 1.2, 8000, 2400)
