"""Compare the baseline and adaptive policies on fixed synthetic context fixtures."""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from statistics import mean

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.clients.rag_llm_client import RagLLMError, generate_rag_chat
from app.core.config import settings
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.core.rag_token_budget import RagTokenBudgetError
from app.schemas.rag_conversation_context import RagCompletedTurn, RagConversationContext
from app.schemas.rag_conversation_handoff import RagStoredHandoff
from app.schemas.rag_conversation_summary import RagConversationSummary, RagStoredSummary
from app.services.rag_context_builder import build_conversational_context
from app.services.rag_learning_artifacts import NUMERIC_ARRAY_PATTERN
from app.services.rag_retrieval_context import build_retrieval_query
from app.services.rag_summary_builder import build_extractive_summary
from app.services.rag_topic_context import classify_question_intent


def memory(topic="", hint=""):
    return RagConversationSummary(
        main_topic=topic, continuation_hint=hint, learning_objective="", covered_concepts=[],
        important_user_context=[], unresolved_questions=[], document_references=[], uncertainties=[],
    )


def contains_array(text, expected):
    for match in NUMERIC_ARRAY_PATTERN.finditer(text):
        try:
            if json.loads(match.group()) == expected:
                return True
        except json.JSONDecodeError:
            continue
    return False


def fixture(case, adaptive):
    turns = [RagCompletedTurn.model_validate(value) for value in case.get("history", [])]
    coverage = case.get("summary_coverage", 0)
    summary = None
    if coverage:
        covered = [turn for turn in turns if turn.turn_index <= coverage]
        value = (build_extractive_summary(previous_summary=None, turns=covered, max_tokens=500)
                 if case["category"] == "worked_exercises" else memory(case["summary_topic"]))
        summary = RagStoredSummary(
            id="synthetic-summary", version=1, schema_version=1, covered_turn_index=coverage,
            covered_turn_count=len(covered), summary=value, generation_method="extractive",
        )
    handoff = None
    if inherited := case.get("handoff_topic"):
        handoff = RagStoredHandoff(
            id="11111111-1111-4111-8111-111111111111", source_session_id="22222222-2222-4222-8222-222222222222",
            target_session_id="33333333-3333-4333-8333-333333333333", source_completed_turn_count=24,
            source_last_completed_turn_index=24, schema_version=1, summary=memory(inherited),
            generation_method="extractive", token_count=50,
        )
    window = settings.rag_history_candidate_turns if adaptive else settings.rag_recent_turns
    return RagConversationContext(
        session_id="33333333-3333-4333-8333-333333333333",
        current_turn_index=max((turn.turn_index for turn in turns), default=0) + 1,
        completed_turn_count=len(turns), recent_turns=turns[-window:], summary=summary, handoff=handoff,
    )


def run_case(case, adaptive, live):
    context = fixture(case, adaptive)
    expected = case["expected"]
    grounded = case["mode"] == "document"
    retrieval = build_retrieval_query(case["question"], context.recent_turns, context.summary, context.handoff) if grounded else None
    scope = set(case.get("selected_document_ids", []))
    built = build_conversational_context(
        question=case["question"], context=context, document_mode=grounded, preferred_locale=case["locale"],
        sources=[source for source in case.get("sources", []) if source["document_id"] in scope],
        prompt_variant="grounded_rule", retrieval_strategy=retrieval.strategy if retrieval else "none",
    )
    metadata = built.metadata
    prompt = "\n".join(message["content"] for message in built.messages)
    checks = {
        "retrieval": metadata.retrieval_strategy == expected["retrieval_strategy"],
        "coverage": (metadata.history_turns_used + metadata.summary_covered_turn_count
                     + metadata.omitted_history_turns == context.completed_turn_count) if adaptive else None,
        "intent": classify_question_intent(case["question"]) == expected["intent"] if adaptive and "intent" in expected else None,
    }
    category = case["category"]
    if category == "long_range_recall":
        checks["category"] = expected["past_answer"] in prompt
    elif category == "contextual_followups":
        checks["category"] = checks["retrieval"] and expected["query_contains"] in retrieval.text
    elif category == "topic_switch":
        checks["category"] = checks["retrieval"] and not (metadata.summary_tokens_used or metadata.handoff_tokens_used)
    elif category == "worked_exercises":
        checks["category"] = all(contains_array(built.messages[-1]["content"], array) for array in expected["arrays"])
    else:
        checks["category"] = (checks["retrieval"] and [source["chunk_id"] for source in built.sources] == expected["chunk_ids"]
                              and "Use only the fresh document evidence" in built.messages[0]["content"])

    result = {
        "id": case["id"], "category": category, "checks": checks,
        "prompt_tokens": metadata.estimated_prompt_tokens,
        "memory_tokens": metadata.summary_tokens_used + metadata.handoff_tokens_used,
        "out_of_scope_sources": sum(source["document_id"] not in scope for source in built.sources),
        "provider_calls": 0, "live_accuracy": None,
    }
    if live:
        if grounded and not built.sources:
            result["live_accuracy"] = not expected["chunk_ids"]
            return result
        execution = RagExecutionContext(
            RagDeadline.start(settings.rag_request_deadline_seconds), settings.rag_max_provider_calls_per_ask,
        ) if settings.rag_resource_control_enabled else None
        try:
            generation = generate_rag_chat(built.messages, execution_context=execution)
            result["provider_calls"] = generation.attempts
            result["live_accuracy"] = all(
                value.casefold() in generation.text.casefold() for value in expected.get("answer_contains", [])
            ) and all(contains_array(generation.text, array) for array in expected.get("arrays", []))
        except RagLLMError as error:
            result["provider_calls"] = len(execution.attempts) if execution else len(error.attempts)
            result["live_error"] = error.code
            result["live_accuracy"] = False
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--variant", choices=("baseline", "adaptive"), required=True)
    parser.add_argument("--mode", choices=("offline", "live"), required=True)
    parser.add_argument("--max-cases", type=int)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    cases = [json.loads(line) for line in args.dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.max_cases is not None:
        if args.max_cases <= 0:
            parser.error("--max-cases must be positive")
        # Interleave categories so a limited live run keeps a stratified subset.
        offsets = Counter()
        ranked = []
        for case in cases:
            ranked.append((offsets[case["category"]], case["id"], case))
            offsets[case["category"]] += 1
        cases = [case for _, _, case in sorted(ranked)[:args.max_cases]]

    adaptive = args.variant == "adaptive"
    settings.rag_context_quality_enabled = adaptive
    settings.rag_rolling_summary_enabled = True
    settings.rag_new_chat_enabled = True
    settings.rag_handoff_enabled = True
    results = []
    for case in cases:
        try:
            results.append(run_case(case, adaptive, args.mode == "live"))
        except RagTokenBudgetError:
            results.append({
                "id": case["id"], "category": case["category"], "checks": {"category": False},
                "prompt_tokens": None, "memory_tokens": None, "out_of_scope_sources": 0, "provider_calls": 0,
                "live_accuracy": False if args.mode == "live" else None, "error": "prompt_budget",
            })
    prompt_tokens = [item["prompt_tokens"] for item in results if item["prompt_tokens"] is not None]
    report = {
        "variant": args.variant, "mode": args.mode, "scenario_count": len(results),
        "provider_calls": sum(item["provider_calls"] for item in results),
        "prompt_budget_violations": sum(item.get("error") == "prompt_budget" or (item["prompt_tokens"] or 0) > 4000
                                        for item in results),
        "memory_budget_violations": sum((item["memory_tokens"] or 0) > 500 for item in results),
        "out_of_scope_sources": sum(item["out_of_scope_sources"] for item in results),
        "mean_prompt_tokens": round(mean(prompt_tokens), 1) if prompt_tokens else None,
        "max_prompt_tokens": max(prompt_tokens, default=None),
        "max_memory_tokens": max((item["memory_tokens"] or 0 for item in results), default=None),
        "categories": {
            name: {"passed": sum(item["checks"]["category"] is True for item in results if item["category"] == name),
                   "total": count}
            for name, count in Counter(item["category"] for item in results).items()
        },
    }
    for metric, key in (("topic_classification_correct", "intent"), ("history_coverage_correct", "coverage")):
        measured = [item["checks"].get(key) for item in results if item["checks"].get(key) is not None]
        report[metric] = {"passed": sum(measured), "total": len(measured)} if measured else None
    report["artifact_retention_correct"] = report["categories"].get("worked_exercises")
    report["live_accuracy"] = {"passed": sum(item["live_accuracy"] is True for item in results),
                               "total": len(results)} if args.mode == "live" else None
    report["failed_cases"] = [item for item in results
                              if False in item["checks"].values() or item["live_accuracy"] is False]
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return int(args.strict and bool(
        len(results) != 30 or report["failed_cases"] or report["prompt_budget_violations"]
        or report["memory_budget_violations"] or report["out_of_scope_sources"]
    ))


if __name__ == "__main__":
    raise SystemExit(main())
