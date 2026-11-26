import pytest

from app.services.rag_chat_service import (
    MARKDOWN_FORMATTING_RULES,
    _build_general_prompt,
    _build_grounded_prompt,
    _build_no_rule_prompt,
)


SAMPLE_CHUNKS = [
    {
        "file_name": "algorithms.pdf",
        "chunk_index": 0,
        "content": "Binary search has logarithmic time complexity.",
    },
]


@pytest.mark.parametrize(
    "expected",
    [
        "GitHub Flavored Markdown",
        "Markdown tables",
        "fenced code",
        "$...$",
        "$$",
        "raw HTML",
        "nested lists",
    ],
)
def test_formatting_contract(expected):
    assert expected in MARKDOWN_FORMATTING_RULES


def test_general_prompt_preserves_locale_and_study_scope():
    question = "Explain binary search."
    prompt = _build_general_prompt(question, "vi")

    assert MARKDOWN_FORMATTING_RULES in prompt
    assert "Respond STRICTLY in Vietnamese." in prompt
    assert "Do not answer questions outside study scope" in prompt
    assert question in prompt


def test_grounded_prompt_preserves_locale_and_document_grounding():
    question = "What is the time complexity of binary search?"
    prompt = _build_grounded_prompt(
        question=question, chunks=SAMPLE_CHUNKS, preferred_locale="en"
    )

    assert MARKDOWN_FORMATTING_RULES in prompt
    assert "Respond STRICTLY in English." in prompt
    assert "Use only the information from the retrieved context." in prompt
    assert "[Source 1: algorithms.pdf - chunk 0]" in prompt
    assert SAMPLE_CHUNKS[0]["content"] in prompt
    assert question in prompt


def test_no_rule_prompt_preserves_locale_and_optional_document_context():
    question = "What is the time complexity of binary search?"
    prompt = _build_no_rule_prompt(
        question=question, chunks=SAMPLE_CHUNKS, preferred_locale=None
    )

    assert MARKDOWN_FORMATTING_RULES in prompt
    assert "respond strictly in that same language" in prompt
    assert "Use the following document context if it is useful." in prompt
    assert "[Source 1: algorithms.pdf - chunk 0]" in prompt
    assert SAMPLE_CHUNKS[0]["content"] in prompt
    assert question in prompt
