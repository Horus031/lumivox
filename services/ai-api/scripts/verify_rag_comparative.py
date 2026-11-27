"""Run a frozen comparative experiment in a dedicated evaluation process."""

import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from app.clients.rag_llm_client import RagLLMError
from app.clients.supabase_client import bounded_rag_supabase, get_supabase_client
from app.core.config import settings
from app.core.rag_deadline import RagDeadline, RagDeadlineExceeded
from app.core.rag_execution_context import RagExecutionContext, RagProviderAttempt, aggregate_attempt_usage
from app.core.rag_token_budget import RagTokenBudgetError
from app.schemas.rag_conversation_handoff import RagNewChatRequest
from app.security.rag_dispatch import RagDispatchAuthorizationError, rag_dispatch_authorization
from app.security.rag_privacy import RagPrivacyError, assert_safe_rag_provider_text, sanitize_rag_text
from app.services.rag_context_builder import build_conversational_context
from app.services.rag_conversation_service import ask_rag_conversation_question
from app.services.rag_conversation_store import RagConversationError, assert_turn_authorized, fail_turn, reserve_turn
from app.services.rag_conversational_generation import generate_conversational_answer
from app.services.rag_document_processing_service import _chunk_text
from app.services.rag_new_chat_service import start_new_conversation
from app.services.rag_provider_execution import RagProviderExecutionError
from app.services.rag_retrieval_context import build_retrieval_query
from evaluation.rag_dataset import load_context, load_frozen_dataset, read_jsonl, sha256
from evaluation.rag_environment import configure_isolated_environment, validate_run_id
from evaluation.rag_metrics import evidence_recall, precision_at_k, recall_at_k, reciprocal_rank_at_k
from evaluation.rag_results import append_jsonl, open_results
from evaluation.rag_scoring import exact_artifacts
from evaluation.rag_variants import VARIANTS, configure_variant, project_context
from scripts.seed_rag_evaluation import verify_identity


def classify_error(error):
    if isinstance(error, (RagPrivacyError, RagDispatchAuthorizationError)):
        return "security_rejected", type(error).__name__
    if isinstance(error, RagTokenBudgetError):
        return "budget_rejected", "prompt_budget"
    if isinstance(error, RagDeadlineExceeded):
        return "timeout", "deadline"
    if isinstance(error, (RagLLMError, RagConversationError, RagProviderExecutionError)):
        code = error.code.lower().removeprefix("rag_")
        if code in {"document_access_denied", "invalid_lease", "memory_quarantined", "session_not_found"}:
            return "security_rejected", code
        if code in {"timeout", "request_deadline_exceeded"}:
            return "timeout", code
        if code in {"rate_limited", "provider_cooldown", "rate_limit"}:
            return "rate_limited", code
        if code in {"provider_busy", "resource_control_unavailable"}:
            return "provider_busy", code
        if code == "provider_call_budget_exceeded":
            return "budget_rejected", code
        if isinstance(error, (RagLLMError, RagProviderExecutionError)) or code == "generation_failed":
            return "provider_error", code
    if isinstance(getattr(error, "code", None), int):
        return ("rate_limited" if error.code == 429 else "provider_error"), str(error.code)
    return "evaluation_error", type(error).__name__


def store_metadata(row, metadata):
    row["estimated_prompt_tokens"] = metadata["estimated_prompt_tokens"]
    row["memory_tokens"] = metadata["summary_tokens_used"] + metadata["handoff_tokens_used"]
    row["citation_validation"] = metadata.get("citation_validation")
    row["context"] = metadata
    row["prompt_budget_violation"] = row["estimated_prompt_tokens"] > settings.rag_max_prompt_tokens
    row["memory_budget_violation"] = row["memory_tokens"] > 500
    row["budget_violation"] = row["prompt_budget_violation"] or row["memory_budget_violation"]


def offline(case, context, manifest, root, row):
    sources = []
    for key in case.document_keys if case.evidence_fixture != "no_hits" else []:
        content = (root / manifest["documents"][key]["path"]).read_text(encoding="utf-8")
        for index, chunk in enumerate(_chunk_text(content, chunk_size=1800, overlap=250, max_chunks=5)):
            sources.append({
                "document_id": key, "chunk_id": f"{key}-{index}", "file_name": f"{key}.txt",
                "chunk_index": index, "similarity": 1.0, "content": chunk,
            })
    question = sanitize_rag_text(case.question, target="provider")
    query = build_retrieval_query(question, context.recent_turns, context.summary, context.handoff) if case.document_keys else None
    built = build_conversational_context(
        question=question, context=context, sources=sources[:5], document_mode=bool(case.document_keys),
        preferred_locale=case.locale, prompt_variant="grounded_rule",
        retrieval_strategy=query.strategy if query else "none",
    )
    for message in built.messages:
        assert_safe_rag_provider_text(message["content"])
    store_metadata(row, built.metadata.model_dump())
    row.update(provider_calls=0, unknown_usage_attempts=0, out_of_scope_retrieval=None,
               out_of_scope_packed=sum(source["document_id"] not in case.document_keys for source in built.sources))


def record_usage(row, attempts):
    usage = aggregate_attempt_usage([RagProviderAttempt(**attempt) for attempt in attempts])
    unknown = usage["unknown_usage_attempts"]
    known = usage["known_usage"]
    row.update(
        provider_calls=usage["provider_calls"], unknown_usage_attempts=unknown["total_tokens"],
        actual_prompt_tokens=known["prompt_tokens"] if not unknown["prompt_tokens"] else None,
        actual_completion_tokens=known["completion_tokens"] if not unknown["completion_tokens"] else None,
        known_provider_tokens=known["total_tokens"] if len(attempts) > unknown["total_tokens"] else None,
        provider_attempts=attempts,
    )


def create_focus(db, user_id):
    ended = datetime.now(timezone.utc)
    row = db.table("focus_sessions").insert({
        "user_id": user_id, "planned_minutes": 25, "actual_focus_minutes": 25, "status": "completed",
        "started_at": (ended - timedelta(minutes=25)).isoformat(), "ended_at": ended.isoformat(),
    }).execute().data[0]
    return str(row["id"])


def snapshot(case, context, corpus, row):
    documents = corpus["documents"]
    user_id = corpus["users"]["owner"]
    document_ids = [documents[key]["document_id"] for key in case.document_keys]
    evidence = {
        key: set(ids) for doc in case.document_keys for key, ids in documents[doc]["evidence"].items()
        if key in case.expected.relevant_evidence_keys
    }
    gold_ids = set().union(*evidence.values())

    def observe(value):
        raw = [chunk for chunk, _ in value.retrieved]
        packed = [chunk for chunk, _ in value.packed]
        row.update(
            retrieved_chunk_ids=raw, packed_chunk_ids=packed, retrieval_strategy=value.strategy,
            retrieval_latency_ms=value.latency_ms if document_ids else None,
            retrieval_recall_at_5=recall_at_k(raw, gold_ids, 5),
            retrieval_precision_at_5=precision_at_k(raw, gold_ids, 5) if document_ids else None,
            retrieval_mrr_at_5=reciprocal_rank_at_k(raw, gold_ids, 5),
            retrieval_evidence_recall=evidence_recall(raw[:5], list(evidence.values())),
            packed_evidence_recall=evidence_recall(packed, list(evidence.values())),
            sources_truncated=value.sources_truncated,
            out_of_scope_retrieval=sum(doc not in document_ids for _, doc in value.retrieved),
            out_of_scope_packed=sum(doc not in document_ids for _, doc in value.packed),
            has_retrieved_evidence=bool(raw),
        )
        if row["out_of_scope_retrieval"] or row["out_of_scope_packed"]:
            raise RagDispatchAuthorizationError("Evaluation retrieval escaped document scope")

    execution = RagExecutionContext(
        RagDeadline.start(settings.rag_request_deadline_seconds), settings.rag_max_provider_calls_per_ask,
        needs_embedding=bool(document_ids),
    )
    deadline = execution.deadline.bounded(
        settings.rag_generation_deadline_seconds, reserve=settings.rag_completion_reserve_seconds,
    )
    focus = create_focus(get_supabase_client(), user_id)
    with bounded_rag_supabase(execution.deadline, completion_reserve=settings.rag_completion_reserve_seconds) as db:
        reserved = reserve_turn(
            db, user_id=user_id, session_id=None, focus_session_id=focus, client_request_id=str(uuid4()),
            request_payload={"question": case.question, "selected_document_ids": sorted(document_ids), "top_k": 5,
                             "prompt_variant": "grounded_rule", "preferred_locale": case.locale},
        )
        if reserved.get("outcome") != "reserved":
            raise RagDispatchAuthorizationError("Snapshot did not acquire an evaluation turn lease")
        identity = {"user_id": user_id, "turn_id": reserved["turn_id"], "lease_token": reserved["lease_token"]}
        def authorize():
            assert_turn_authorized(db, session_id=reserved["session_id"], **identity)
        generation_failed = False
        try:
            with rag_dispatch_authorization(authorize):
                answer = generate_conversational_answer(
                    supabase=db, user_id=user_id, question=case.question, selected_document_ids=document_ids,
                    top_k=5, prompt_variant="grounded_rule", preferred_locale=case.locale, context=context,
                    deadline=deadline, execution_context=execution, observe_retrieval=observe,
                    retrieval_only=row["mode"] == "retrieval",
                )
            store_metadata(row, answer.context.model_dump())
            packed_content = {source["chunk_id"]: source["content"] for source in answer.sources}
            passages = {key: corpus["passages"][key] for key in evidence}
            missed_units = sum(
                bool(ids & set(row["retrieved_chunk_ids"]))
                and not any(passages[key] in packed_content.get(chunk, "") for chunk in ids)
                for key, ids in evidence.items()
            )
            row["relevant_evidence_truncated"] = missed_units if row["sources_truncated"] else 0
            row["packed_evidence_recall"] = (
                sum(any(passages[key] in packed_content.get(chunk, "") for chunk in ids)
                    for key, ids in evidence.items()) / len(evidence) if evidence else None
            )
            row["provider_call_budget_violation"] = len(execution.attempts) > settings.rag_max_provider_calls_per_ask
            row["budget_violation"] |= row["provider_call_budget_violation"]
            if row["mode"] == "live":
                row["answer"] = answer.answer
                row["allowed_evidence"] = [source["content"] for source in answer.sources]
                row["exact_artifact"] = exact_artifacts(answer.answer, case.expected.expected_arrays)
                if answer.generation:
                    row.update(provider=answer.generation.provider, model=answer.generation.model)
        except Exception:
            generation_failed = True
            raise
        finally:
            attempts = execution.accounting()
            record_usage(row, attempts)
            try:
                # Snapshot answers use injected history and must never complete a persisted turn.
                if not fail_turn(db, **identity, error_code="generation_failed", attempts=attempts):
                    raise RagConversationError("RAG_PERSISTENCE_UNAVAILABLE", 503)
            except RagConversationError:
                row["snapshot_cleanup_failed"] = True
                if not generation_failed:
                    raise


def lifecycle(case, corpus, row):
    db = get_supabase_client()
    user_id = corpus["users"]["owner"]
    focus = create_focus(db, user_id)
    docs = [corpus["documents"][key]["document_id"] for key in case.document_keys]
    session = None
    attempts = []
    audit = []
    common = {"user_id": user_id, "focus_session_id": focus, "top_k": 5, "preferred_locale": case.locale,
              "prompt_variant": "grounded_rule"}
    row["operation_audit"] = audit
    def track(table, request_id, operation, ceiling):
        fields = "provider_attempt_metadata" if operation == "continue" else "provider,model_name,provider_attempt_metadata"
        result = db.table(table).select(fields).eq("user_id", user_id).eq("client_request_id", request_id).execute().data
        if not result:
            audit.append({"operation": operation, "provider_calls": None})
            return {}
        operation_attempts = result[0]["provider_attempt_metadata"]
        if operation_attempts is not None:
            attempts.extend(operation_attempts)
            record_usage(row, attempts)
            row["provider_call_budget_violation"] = row.get("provider_call_budget_violation", False) or (
                len(operation_attempts) > ceiling
            )
        audit.append({"operation": operation,
                      "provider_calls": len(operation_attempts) if operation_attempts is not None else None})
        return result[0]

    def ask(question):
        request_id = str(uuid4())
        try:
            result = ask_rag_conversation_question(
                **common, question=question, session_id=session, client_request_id=request_id,
                selected_document_ids=docs,
            )
        except RagConversationError:
            track("rag_chat_turns", request_id, "ask", settings.rag_max_provider_calls_per_ask)
            raise
        usage = track("rag_chat_turns", request_id, "ask", settings.rag_max_provider_calls_per_ask)
        return result, usage

    for question in case.lifecycle_turns:
        result, _ = ask(question)
        session = result["session_id"]
    if case.category == "handoff":
        request_id = str(uuid4())
        transition = start_new_conversation(RagNewChatRequest(
            **common, source_session_id=session, client_request_id=request_id, mode="continue", selected_document_ids=docs,
        ))
        track("rag_chat_preparations", request_id, "continue", settings.rag_max_provider_calls_per_handoff)
        session = str(transition.target_session_id)
        row["has_handoff"] = transition.has_handoff
    result, usage = ask(case.question)
    row.update(provider=usage.get("provider"), model=usage.get("model_name"))
    row["answer"] = result["answer"]
    row["allowed_evidence"] = [source["content"] for source in result["sources"]]
    row["exact_artifact"] = exact_artifacts(result["answer"], case.expected.expected_arrays)
    if metadata := result.get("context"):
        store_metadata(row, metadata)
    row["budget_violation"] = row.get("budget_violation", False) or row.get("provider_call_budget_violation", False)
    row["out_of_scope_packed"] = sum(source["document_id"] not in docs for source in result["sources"])


def run_case(case, variant, mode, run_id, repetition, root, manifest, corpus):
    started = perf_counter()
    row = dict.fromkeys((
        "answer", "provider", "model", "estimated_prompt_tokens", "actual_prompt_tokens", "actual_completion_tokens",
        "known_provider_tokens", "unknown_usage_attempts", "provider_calls", "citation_validation", "scores", "error_code",
    ))
    row.update(run_id=run_id, case_id=case.id, variant=variant, mode=mode, repetition=repetition,
               category=case.category, locale=case.locale, retrieved_chunk_ids=[], packed_chunk_ids=[],
               status="completed", timestamp=datetime.now(timezone.utc).isoformat())
    try:
        if mode == "lifecycle":
            lifecycle(case, corpus, row)
        else:
            context = project_context(load_context(root, case), VARIANTS[variant])
            if mode == "offline":
                offline(case, context, manifest, root, row)
            else:
                snapshot(case, context, corpus, row)
    except Exception as error:
        row["status"], row["error_code"] = classify_error(error)
        row["answer"] = None
        if row["status"] == "budget_rejected":
            key = "prompt_budget_violation" if row["error_code"] == "prompt_budget" else "provider_call_budget_violation"
            row[key] = row["budget_violation"] = True
    if row["answer"] is not None:
        raw_answer = row["answer"]
        secure_answer = sanitize_rag_text(raw_answer, target="provider")
        row["credential_detected_in_output"] = raw_answer != secure_answer
        row["answer"] = secure_answer
        if security := manifest["security"].get(case.id):
            row["security_group"] = security["group"]
            row["synthetic_marker_in_output"] = security["marker"].casefold() in raw_answer.casefold()
            row["private_distractor_marker_in_output"] = "EVAL_PRIVATE_DISTRACTOR" in raw_answer.upper()
    row["latency_ms"] = round((perf_counter() - started) * 1000)
    return row


def main(*, security_only=False):
    parser = argparse.ArgumentParser(description=__doc__)
    default = "security_live_cases.jsonl" if security_only else "quality_cases.jsonl"
    parser.add_argument("--dataset", type=Path, default=Path("evaluation/comparative_v1") / default)
    parser.add_argument("--variant", choices=("D",) if security_only else tuple(VARIANTS),
                        required=not security_only, default="D")
    parser.add_argument("--mode", choices=("live",) if security_only else ("offline", "retrieval", "live", "lifecycle"),
                        required=not security_only, default="live")
    parser.add_argument("--subset", choices=("smoke", "main", "stability"), default="main")
    parser.add_argument("--run-id", default="offline")
    parser.add_argument("--repetition", type=int, default=1)
    parser.add_argument("--corpus-manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    validate_run_id(args.run_id)
    if args.repetition < 1 or (args.mode == "lifecycle" and args.variant != "D"):
        parser.error("Repetition must be positive and lifecycle runs use variant D")
    root = args.dataset.parent
    cases, manifest = load_frozen_dataset(args.dataset)
    if (args.dataset.name == "security_live_cases.jsonl") != security_only:
        parser.error("Use the dedicated entry point for the security dataset")
    if args.mode == "lifecycle":
        cases = [case for case in cases if case.lifecycle_turns]
    elif args.subset != "main":
        cases = [case for case in cases if case.id in manifest[args.subset]]
    if not cases:
        parser.error("The requested schedule contains no cases")
    corpus = None
    if args.mode != "offline":
        if args.run_id == "offline" or not args.corpus_manifest:
            parser.error("Real evaluation needs a unique run ID and an isolated corpus manifest")
        configure_isolated_environment(embedding=True, answers=args.mode != "retrieval")
        corpus = json.loads(args.corpus_manifest.read_text(encoding="utf-8"))
        if (not corpus["complete"] or corpus["target"] != settings.supabase_url
            or corpus["freeze_sha256"] != sha256(root / "manifest.json")
            or corpus["embedding_model"] != settings.gemini_embedding_model):
            parser.error("Corpus does not match the target, freeze or embedding model")
        validate_run_id(corpus["run_id"])
        verify_identity(get_supabase_client(), corpus["run_id"], "owner", corpus["users"]["owner"])
        corpus["passages"] = {key: text for entry in manifest["documents"].values()
                              for key, text in entry["evidence"].items()}
        settings.rag_resource_namespace = f"eval-{args.run_id}"

    with configure_variant(VARIANTS[args.variant]):
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        code_digest = hashlib.sha256()
        for directory in ("app", "scripts", "evaluation"):
            for source in sorted(Path(directory).rglob("*.py")):
                code_digest.update(source.as_posix().encode() + b"\0")
                code_digest.update(source.read_text(encoding="utf-8").encode() + b"\0")
        plan = {
            "run_id": args.run_id, "case_ids": [case.id for case in cases], "variant": args.variant,
            "mode": args.mode, "dataset": args.dataset.name, "subset": args.subset, "repetition": args.repetition,
            "dataset_sha256": sha256(args.dataset), "freeze_sha256": sha256(root / "manifest.json"),
            "corpus_sha256": sha256(args.corpus_manifest) if corpus else None, "revision": revision,
            "runtime_sha256": code_digest.hexdigest(),
            "embedding_model": settings.gemini_embedding_model, "embedding_dimensions": 768,
            "configuration": {key: value for key, value in settings.model_dump().items() if key.startswith("rag_")},
            "chunking": {key: os.getenv(key) for key in ("RAG_CHUNK_SIZE_CHARS", "RAG_CHUNK_OVERLAP_CHARS",
                                                        "RAG_MAX_CHUNKS_PER_DOCUMENT")},
        }
        with open_results(args.output, plan, args.resume) as (file, completed):
            for case in cases:
                if case.id in completed:
                    continue
                row = run_case(case, args.variant, args.mode, args.run_id, args.repetition, root, manifest, corpus)
                append_jsonl(file, row)
                if row["status"] != "completed" or row.get("budget_violation") or row.get("out_of_scope_packed"):
                    if args.mode != "offline":
                        print(f"Stopped after {case.id}: {row['status']} ({row['error_code']})")
                        return 1
                    completed.add(case.id)
        if args.mode == "offline":
            return int(any(row["status"] != "completed" or row.get("budget_violation") or row["out_of_scope_packed"]
                           for row in read_jsonl(args.output)[1:]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
