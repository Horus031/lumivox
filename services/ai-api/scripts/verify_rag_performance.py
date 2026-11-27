"""Measure authorized RAG operations against an isolated evaluation corpus."""

import argparse
import json
import logging
import os
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import get_context
from pathlib import Path
from time import perf_counter, sleep
from types import SimpleNamespace
from uuid import uuid4

from app.clients import rag_llm_client
from app.clients.supabase_client import get_supabase_client
from app.core.config import settings
from app.core.rag_model_registry import validate_rag_configuration
from app.core.rag_execution_context import RagExecutionContext
from app.services import rag_chat_service, rag_provider_budget
from app.services.rag_attempt_ledger import SupabaseRagAttemptLedger
from app.services.rag_conversation_service import ask_rag_conversation_question
from evaluation.rag_environment import configure_isolated_environment, validate_run_id
from evaluation.rag_performance_metrics import summarize_operations
from scripts.seed_rag_evaluation import verify_identity
from scripts.verify_rag_comparative import create_focus
from scripts.verify_rag_resource_control import Redis


_event = None
CRASH_SCENARIOS = {"crash-before-dispatch", "crash-after-response"}
CRASH_EXIT = 42


class CaptureTelemetry(logging.Handler):
    def emit(self, record):
        global _event
        event = json.loads(record.getMessage())
        if event.get("event") == "rag.operation.finished":
            _event = event


def configure(mode, policy, run_id, redis_port, counters):
    configure_isolated_environment(embedding=mode == "live", answers=mode == "live")
    settings.rag_conversation_v2_enabled = True
    settings.rag_operation_recovery_enabled = True
    settings.rag_privacy_filter_enabled = True
    settings.rag_context_isolation_enabled = True
    settings.rag_context_quality_enabled = True
    settings.rag_resource_control_enabled = True
    settings.rag_observability_enabled = True
    settings.rag_durable_accounting_enabled = policy == "phase6f"
    settings.rag_provider_throughput_enabled = mode == "live" or policy == "phase6f"
    settings.rag_resource_namespace = run_id
    if mode == "synthetic":
        settings.upstash_redis_rest_url = "https://redis-synthetic.example.invalid"
        settings.upstash_redis_rest_token = "local-synthetic"
        settings.rag_provider_quota_scope = run_id
        models = (settings.rag_chat_models + "," + settings.rag_summary_models).split(",")
        settings.rag_provider_quotas_json = json.dumps({
            model.strip(): {"rpm": 100, "tpm": 1_000_000} for model in models if model.strip()
        })
        rag_provider_budget.execute_rag_redis_command = Redis("127.0.0.1", redis_port)
        vector = [1.0] + [0.0] * 767
        rag_chat_service.get_gemini_client = lambda: SimpleNamespace(models=SimpleNamespace(
            embed_content=lambda **_: SimpleNamespace(embeddings=[SimpleNamespace(values=vector)]),
        ))
        active, peak = counters

        def answer(**_):
            with active.get_lock():
                active.value += 1
                peak.value = max(peak.value, active.value)
            try:
                sleep(0.06)
                return SimpleNamespace(
                    usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20, total_tokens=120),
                    choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content="Synthetic study answer."))],
                )
            finally:
                with active.get_lock():
                    active.value -= 1

        rag_llm_client._get_rag_groq_client = lambda: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=answer)),
        )
    validate_rag_configuration()
    logger = logging.getLogger("app.core.rag_telemetry")
    logger.setLevel(logging.INFO)
    logger.addHandler(CaptureTelemetry())


def run_operation(arguments):
    global _event
    _event = None
    started = perf_counter()
    try:
        ask_rag_conversation_question(**arguments)
    except Exception:
        pass
    if _event is not None:
        return {key: value for key, value in _event.items() if key != "trace_id"}
    return {"outcome": "unknown", "elapsed_ms": round((perf_counter() - started) * 1000, 2)}


def crash_worker(setup, scenario, arguments):
    configure(*setup)
    if scenario == "crash-before-dispatch":
        begin = SupabaseRagAttemptLedger.begin

        def begin_then_stop(self, *args):
            created = begin(self, *args)
            if created:
                os._exit(CRASH_EXIT)
            return created

        SupabaseRagAttemptLedger.begin = begin_then_stop
    else:
        def stop_before_finish(*_):
            os._exit(CRASH_EXIT)

        RagExecutionContext.finish_attempt = stop_before_finish
    run_operation(arguments)


def verify_interruption(ctx, setup, scenario, arguments, db, peak):
    worker = ctx.Process(target=crash_worker, args=(setup, scenario, arguments))
    worker.start()
    worker.join(40)
    if worker.is_alive():
        worker.terminate()
        worker.join(5)
        raise RuntimeError("Synthetic crash test worker did not exit.")
    if worker.exitcode != CRASH_EXIT:
        raise RuntimeError("Synthetic worker did not reach the prescribed crash point.")
    turns = db.table("rag_chat_turns").select("id,status").eq(
        "user_id", arguments["user_id"],
    ).eq("client_request_id", arguments["client_request_id"]).execute().data
    if len(turns) != 1 or turns[0]["status"] != "processing":
        raise RuntimeError("Interrupted operation should retain its processing lease.")
    attempts = db.table("rag_provider_attempts").select("status,total_tokens").eq(
        "turn_id", turns[0]["id"],
    ).eq("user_id", arguments["user_id"]).execute().data
    dispatches = int(peak.value > 0)
    if attempts != [{"status": "dispatch_pending", "total_tokens": None}] or dispatches != (
        0 if scenario == "crash-before-dispatch" else 1
    ):
        raise RuntimeError("Interrupted accounting did not preserve the expected uncertainty.")
    print(json.dumps({"scenario": scenario, "durable_pending_intents": 1, "known_provider_tokens": None,
                      "observed_synthetic_dispatches": dispatches, "turn_status": "processing"}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("synthetic", "live"), required=True)
    parser.add_argument("--policy", choices=("baseline", "phase6f"), default="phase6f")
    parser.add_argument("--scenario", choices=("general", "document", "replay", *sorted(CRASH_SCENARIOS)), required=True)
    parser.add_argument("--corpus-manifest", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--requests", type=int, default=8)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--redis-port", type=int)
    args = parser.parse_args()
    validate_run_id(args.run_id)
    if not 1 <= args.concurrency <= min(8, args.requests) or not 1 <= args.requests <= 40:
        parser.error("Use 1–40 requests and at most 8 concurrent workers.")
    if args.mode == "live" and (args.concurrency > 2 or not settings.rag_provider_throughput_enabled):
        parser.error("Live mode requires verified quota configuration and at most 2 workers.")
    if args.mode == "synthetic" and not args.redis_port:
        parser.error("Synthetic mode requires the port of a disposable loopback Redis instance.")
    if args.scenario in CRASH_SCENARIOS and (
        args.mode != "synthetic" or args.policy != "phase6f" or args.concurrency != 1 or args.requests != 1
    ):
        parser.error("Crash scenarios require one synthetic Phase 6F operation.")
    ctx = get_context("spawn")
    counters = (ctx.Value("i", 0), ctx.Value("i", 0))
    setup = (args.mode, args.policy, args.run_id, args.redis_port, counters)
    configure(*setup)
    corpus = json.loads(args.corpus_manifest.read_bytes())
    if not corpus.get("complete") or corpus.get("target") != settings.supabase_url:
        parser.error("The completed corpus manifest must match the isolated database.")
    db = get_supabase_client()
    user = corpus["users"]["owner"]
    verify_identity(db, corpus["run_id"], "owner", user)
    docs = [corpus["documents"]["synthetic_course_policy"]["document_id"]] if args.scenario == "document" else []
    question = "How many lab submissions does LX-204 require?" if docs else "Explain an invariant in a simple loop."
    plan = [
        {"user_id": user, "question": question, "selected_document_ids": docs,
         "focus_session_id": create_focus(db, user), "session_id": None, "client_request_id": str(uuid4()),
         "top_k": 5, "prompt_variant": "grounded_rule", "preferred_locale": "en"}
        for _ in range(1 if args.scenario == "replay" else args.requests)
    ]
    if args.scenario in CRASH_SCENARIOS:
        verify_interruption(ctx, setup, args.scenario, plan[0], db, counters[1])
        return 0
    if args.scenario == "replay":
        primed = run_operation(plan[0])
        if primed["outcome"] != "completed":
            parser.error("Replay fixture could not be primed.")
        plan *= args.requests
        peak = counters[1]
        peak.value = 0
    with ProcessPoolExecutor(
        max_workers=args.concurrency, mp_context=ctx, initializer=configure, initargs=setup,
    ) as pool:
        rows = list(pool.map(run_operation, plan))
    report = summarize_operations(rows)
    report.update(scenario=args.scenario, mode=args.mode, policy=args.policy, concurrency=args.concurrency,
                  peak_concurrency=counters[1].value if args.mode == "synthetic" else None,
                  rpm_limit_violations=None, tpm_limit_violations=None)
    print(json.dumps(report, indent=2))
    if args.scenario == "replay":
        return int(report["provider_attempts"] != 0 or report["completed_operations"] != args.requests)
    return int(report["completed_operations"] == 0 or report["unknown_operations"] > 0)


if __name__ == "__main__":
    raise SystemExit(main())
