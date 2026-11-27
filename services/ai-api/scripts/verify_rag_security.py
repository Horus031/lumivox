"""Verify context boundaries with synthetic fixtures and zero provider dispatches."""

import argparse
import json
from collections import Counter
from pathlib import Path

from app.core.config import settings
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.schemas.rag_conversation_handoff import RagStoredHandoff
from app.schemas.rag_conversation_summary import RagStoredSummary
from app.security.rag_citations import validate_rag_citations
from app.security.rag_privacy import assert_safe_rag_provider_text
from app.services.rag_context_builder import build_conversational_context
from scripts.verify_rag_context_quality import memory


def verify(case):
    kind, content = case["category"], case["untrusted_content"]
    expected = case["expected"]
    if kind == "unsupported_citation":
        answer, rejected = validate_rag_citations(content, expected["authorized_source_count"])
        return rejected and r"\[source unavailable\]" in answer and expected["protected_text"] in answer

    context = RagConversationContext(session_id="synthetic", current_turn_index=2, completed_turn_count=1)
    source = []
    if kind == "document_instruction_conflict":
        source = [{"chunk_id": "fixture", "document_id": "authorized", "chunk_index": 0,
                   "file_name": "notes.txt", "content": content}]
    if kind == "historical_instruction_conflict":
        context.recent_turns = [RagCompletedTurn(turn_index=1, question="Earlier topic", answer=content)]
    if kind == "summary_contamination":
        context.summary = RagStoredSummary(
            id="summary", version=1, schema_version=1, covered_turn_count=1, covered_turn_index=1,
            generation_method="extractive", summary=memory("Binary search", content),
        )
    if kind == "handoff_contamination":
        context.handoff = RagStoredHandoff(
            id="11111111-1111-4111-8111-111111111111", source_session_id="22222222-2222-4222-8222-222222222222",
            target_session_id="33333333-3333-4333-8333-333333333333", source_completed_turn_count=1,
            source_last_completed_turn_index=1, schema_version=1, summary=memory("Binary search", content),
            generation_method="extractive", token_count=60,
        )
    question = case["question"]
    if kind == "sensitive_data":
        question = f"{question}\n{content}"
    built = build_conversational_context(
        question=question, context=context, document_mode=bool(source), sources=source,
        prompt_variant="grounded_rule", preferred_locale=case["locale"],
    )
    for message in built.messages:
        assert_safe_rag_provider_text(message["content"])
    system, user = built.messages
    if (case["question"] not in user["content"] or built.metadata.estimated_prompt_tokens > 4000
        or built.metadata.summary_tokens_used + built.metadata.handoff_tokens_used > 500
        or len(built.sources) != expected["authorized_source_count"]):
        return False
    marker = expected["marker"]
    if kind == "sensitive_data":
        return marker not in user["content"] and "[redacted]" in user["content"] and "[8, 3, 5]" in user["content"]
    return marker in user["content"] and marker not in system["content"] and "untrusted" in system["content"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    args = parser.parse_args()
    settings.rag_context_quality_enabled = True
    settings.rag_context_isolation_enabled = True
    settings.rag_privacy_filter_enabled = True
    settings.rag_rolling_summary_enabled = True
    settings.rag_new_chat_enabled = True
    settings.rag_handoff_enabled = True
    coverage, failed = Counter(), []
    for line in args.dataset.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        case = json.loads(line)
        if verify(case):
            coverage[case["category"]] += 1
        else:
            failed.append(case["id"])
    print(json.dumps({"mode": "offline", "passed": sum(coverage.values()), "provider_calls": 0,
                      "passed_by_category": dict(coverage), "failed_cases": failed}, indent=2))
    return int(bool(failed))


if __name__ == "__main__":
    raise SystemExit(main())
