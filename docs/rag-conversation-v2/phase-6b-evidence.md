# RAG Conversation V2 — Phase 6B Provider and Resource Control

## Objective

Bound RAG v2 provider consumption while preserving conversation idempotency, authorization, and recovery.

## Implementation

- Redis Lua admits logical Ask and New Chat operations by authenticated user, operation, request ID, and canonical fingerprint. Independent transport quotas also apply to replays.
- Groq generation uses expiring, ownership-aware distributed permits, a model-specific cooldown, and a shared per-operation call budget. Redis admission fails closed.
- The cooperative deadline bounds summary, retrieval, and generation. Terminal persistence retains a bounded attempt for a generated answer, including when its outcome is uncertain.
- New Chat reserves a durable preparation before generation. Its commit atomically records the transition and any handoff and completes the preparation. Recovery exposes lease status through metadata only.
- Ask and New Chat persist bounded provider attempt metadata, total known tokens, and the count of attempts with unknown usage.

## Verification

Local verification used Supabase CLI 2.122.0, Python 3.12.13, and an isolated Redis 7 container.

| Verification | Result |
| --- | --- |
| Redis atomic admission, duplicate quota, fingerprint conflict, and namespace isolation | PASS — ADM01–ADM12 |
| Distributed concurrency, simulated Redis outage, and permit expiry | PASS — four worker processes against local Redis |
| Model cooldown and fallback | PASS — Redis cooldown expiry and application fallback tests |
| Shared deadline, retrieval timeout, terminal persistence, and usage accounting | PASS — Python tests with an injected clock and synthetic provider responses |
| New Chat preparation migration | PASS — clean local reset, migration history, and 32 regenerated RAG table/RPC signatures verified as UTF-8 |
| Preparation authorization, privileges, recovery, and existing database regression | PASS — 1,281 pgTAP assertions, including 27 Phase 6B assertions |
| Preparation and Ask concurrency | PASS — 24 PostgreSQL races, including the six new scenarios |
| Backend full regression | PASS — compileall and 267 pytest tests |
| Frontend full regression | PASS — 1,288 Vitest tests passed and 26 skipped across four shards. The final Redis and Ask action run passed all 19 targeted tests. |
| Production safeguards | PASS — 29 Node tests |
| Frontend lint and typecheck | PASS — lint reported four existing warnings and zero errors |
| Frontend production build | PASS — Next.js 16.2.6 production build |
| GitHub Actions CI | NOT RUN — local changes are unpushed |
| Hosted QA | NOT RUN — the Phase 6B build has yet to be deployed to staging |

The database privilege check returned zero executable preparation and provider-accounting functions for both `anon` and `authenticated`.

## Multi-worker Stress Evidence

| Metric | Measured |
| --- | ---: |
| Worker processes | 4 |
| Simultaneous logical requests | 40 |
| Permits configured | 4 |
| Synthetic provider duration | 250 ms |
| Observed peak | 4 |
| Admitted calls | 4 |
| Busy denials | 36 |
| Duplicate permit IDs | 0 |
| Permits remaining | 0 |
| Provider calls during simulated Redis outage | 0 |

A crashed worker's permit expired and capacity recovered. The harness also verified that a model became eligible again when its cooldown expired.

## Provider Usage Evidence

The pgTAP fixture persisted two synthetic calls, 17 known tokens, and one attempt with unknown usage. The provider tests confirmed that incomplete responses can contribute usage and that connection timeouts retain their permits and record unknown usage.

Live call volume, success and failure counts, token totals, cooldown activations, admission denials, and deadline failures are pending hosted measurement. The stress harness makes zero live Groq calls.

## Data Consistency

| Violation checked on the replayed local database | Rows |
| --- | ---: |
| More than one processing preparation per source | 0 |
| Concurrent processing Ask and New Chat for the same source | 0 |
| Completed preparation without matching transition provenance | 0 |
| Processing preparation on a closed session | 0 |
| Invalid Ask provider accounting totals | 0 |

The concurrency harness exercised competing transactions and verified the durable results before cleaning up its fixtures.

## Limitations

- Logical admission retains fingerprints for 24 hours. Durable database idempotency continues to govern persisted operations.
- Expiring permits and cooperative transport deadlines bound local resource use. Remote calls can continue after a transport timeout.
- Known usage may account for only part of provider billing. The permits govern RAG v2 Groq calls.
- Model-specific TPM limits require validation against the actual provider account and staging workload.

## Release Decision

Pending GitHub Actions, hosted browser QA, and staging resource measurements. Keep production RAG v2 disabled through that release gate.

## Hosted and Live Verification

Functional hosted QA and live provider checks were accepted from the project developer's confirmation supplied with the Phase 6G preparation brief on 2026-11-27. Phase 6G uses that confirmation for prior-phase functional acceptance. Numerical thresholds still require their measured reports or explicit developer confirmation against those thresholds.
