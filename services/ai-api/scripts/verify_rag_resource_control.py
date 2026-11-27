"""Exercise the provider permit scripts against isolated Redis with synthetic work."""

import argparse
import json
import multiprocessing
import os
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from types import SimpleNamespace
from uuid import uuid4

from app.clients.rag_redis_client import RagRedisUnavailable
from app.core.rag_deadline import RagDeadline
from app.core.rag_execution_context import RagExecutionContext
from app.services import rag_provider_budget as budget
from app.services.rag_provider_execution import RagProviderExecutionError, execute_rag_provider_call


@dataclass(frozen=True)
class Redis:
    host: str
    port: int

    def __call__(self, command, *, timeout=2.0):
        fields = [str(value).encode() for value in command]
        request = f"*{len(fields)}\r\n".encode() + b"".join(
            f"${len(field)}\r\n".encode() + field + b"\r\n" for field in fields
        )
        with socket.create_connection((self.host, self.port), timeout) as connection:
            connection.sendall(request)
            with connection.makefile("rb") as body:
                return self.read(body)

    @classmethod
    def read(cls, body):
        line = body.readline().rstrip(b"\r\n")
        kind, value = line[:1], line[1:]
        if kind == b"*":
            return [cls.read(body) for _ in range(int(value))]
        if kind == b":":
            return int(value)
        if kind == b"+":
            return value.decode()
        if kind == b"$":
            size = int(value)
            return body.read(size + 2)[:-2].decode() if size >= 0 else None
        raise RuntimeError(f"Unexpected isolated Redis response: {line!r}")


def configure(redis, namespace):
    budget.settings.rag_resource_namespace = namespace
    budget.settings.rag_provider_max_concurrency = 4
    budget.execute_rag_redis_command = redis


def worker(redis, namespace, start, active, peak, counts, lock, permits):
    configure(redis, namespace)

    def ask():
        start.wait(timeout=30)
        status, permit = budget.acquire_provider_permit("synthetic", timeout=2)
        with lock:
            counts[status] = counts.get(status, 0) + 1
        if permit is None:
            assert status == "busy"
            return
        with lock:
            permits.append(permit.permit_id)
            active.value += 1
            peak.value = max(peak.value, active.value)
        try:
            time.sleep(0.25)
        finally:
            with lock:
                active.value -= 1
            budget.release_provider_permit(permit, timeout=2)

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(lambda _: ask(), range(10)))


def crash_with_permit(redis, namespace):
    configure(redis, namespace)
    permits, cooldown = budget.provider_keys("synthetic")
    result = redis(["EVAL", budget.ACQUIRE_SCRIPT, 2, permits, cooldown, "crashed", 4, 1_000])
    os._exit(0 if result == ["acquired", "crashed"] else 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--redis-host", default="127.0.0.1")
    parser.add_argument("--redis-port", type=int, default=6379)
    args = parser.parse_args()
    redis = Redis(args.redis_host, args.redis_port)
    namespace = f"stress-{uuid4()}"
    configure(redis, namespace)
    permits_key, cooldown_key = budget.provider_keys("synthetic")
    ctx = multiprocessing.get_context("spawn")
    with ctx.Manager() as manager:
        active, peak = ctx.Value("i", 0), ctx.Value("i", 0)
        counts, permits = manager.dict(), manager.list()
        start, lock = ctx.Barrier(40), ctx.Lock()
        workers = [ctx.Process(target=worker, args=(redis, namespace, start, active, peak, counts, lock, permits))
                   for _ in range(4)]
        for process in workers:
            process.start()
        for process in workers:
            process.join(40)
            assert process.exitcode == 0, process.exitcode
        duplicate_permits = len(permits) - len(set(permits))
        assert 0 < peak.value <= 4
        assert counts["busy"] > 0 and sum(counts.values()) == 40
        assert len(permits) == counts["acquired"] and duplicate_permits == 0
        assert active.value == redis(["ZCARD", permits_key]) == 0
        report = {"workers": 4, "requests": 40, "permit_limit": 4, "synthetic_duration_ms": 250,
                  "observed_peak": peak.value, "admission_counts": dict(counts), "duplicate_permits": duplicate_permits}

    process = ctx.Process(target=crash_with_permit, args=(redis, namespace))
    process.start()
    process.join(10)
    assert process.exitcode == 0
    expiry = time.monotonic() + 3
    while redis(["ZSCORE", permits_key, "crashed"]) is not None:
        assert time.monotonic() < expiry
        time.sleep(0.05)
    status, permit = budget.acquire_provider_permit("synthetic", timeout=2)
    assert status == "acquired" and permit is not None
    budget.release_provider_permit(permit, timeout=2)
    budget.mark_model_cooldown("synthetic", seconds=1, timeout=2)
    assert budget.acquire_provider_permit("synthetic", timeout=2) == ("cooldown", None)
    assert redis(["PTTL", cooldown_key]) > 0
    expiry = time.monotonic() + 3
    while redis(["EXISTS", cooldown_key]):
        assert time.monotonic() < expiry
        time.sleep(0.05)
    status, permit = budget.acquire_provider_permit("synthetic", timeout=2)
    assert status == "acquired" and permit is not None
    budget.release_provider_permit(permit, timeout=2)
    final_permits = redis(["ZCARD", permits_key])
    assert final_permits == 0

    def unavailable(*args, **kwargs):
        raise RagRedisUnavailable("synthetic outage")

    def unexpected_call(**kwargs):
        raise AssertionError("Provider was called during Redis outage")

    budget.execute_rag_redis_command = unavailable
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=unexpected_call)))
    context = RagExecutionContext(RagDeadline.start(5), max_provider_calls=3)
    try:
        execute_rag_provider_call(client=client, request_options={"model": "synthetic", "timeout": 2},
                                  stage="answer", context=context, deadline=context.deadline,
                                  estimated_prompt_tokens=0, classify_error=lambda _: ("unknown", False),
                                  parse_response=lambda response: response)
    except RagProviderExecutionError as error:
        assert error.code == "resource_control_unavailable" and not context.attempts
    else:
        raise AssertionError("Redis outage unexpectedly admitted provider work")
    report.update(final_permits=final_permits, crashed_permit_recovered=True, cooldown_expired=True,
                  outage_provider_calls=0)
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
