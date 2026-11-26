import pytest

from app.core.rag_token_budget import (
    RagTokenBudgetError,
    assert_prompt_budget,
    count_text_tokens,
    estimate_message_tokens,
    get_rag_encoding,
    truncate_text_to_tokens,
)


def test_empty_text():
    assert count_text_tokens("") == 0


def test_vietnamese_tokenization():
    assert get_rag_encoding().name == "o200k_harmony"
    assert count_text_tokens("Giải thích thuật toán tìm kiếm nhị phân 📚") > 0


def test_control_markers_count_as_ordinary_text():
    assert count_text_tokens("<|start|>system") > 1


def test_unicode_safe_truncation():
    original = "Kiến thức lập trình 📚 Thuật toán tìm kiếm 🚀 " * 30
    for budget in range(1, 30):
        prefix = truncate_text_to_tokens(original, budget)
        assert original.startswith(prefix)
        assert "\ufffd" not in prefix
        assert count_text_tokens(prefix) <= budget
    assert truncate_text_to_tokens(original, 0) == ""


def test_budget_includes_serialization_and_every_role():
    messages = [
        {"role": "system", "content": "Tutor."},
        {"role": "user", "content": "Explain binary search."},
    ]
    estimate = estimate_message_tokens(messages)
    assert estimate > count_text_tokens("Tutor. Explain binary search.")
    assert assert_prompt_budget(messages, estimate) == estimate
    with pytest.raises(RagTokenBudgetError):
        assert_prompt_budget(messages, estimate - 1)
