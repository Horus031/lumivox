# RAG Conversation V2 — Phase 6F Observability and Performance

## Objective

Measure request stages and preserve provider accounting across interrupted workers. Enforce distributed Groq model allocations while retaining authorization, recovery and quality policies.

## Implementation

- Ask and New Chat emit one privacy-safe terminal telemetry event. It measures full elapsed time, including completion or transition commit. Replays, abstentions, admission denials, deadlines and unknown outcomes have distinct classifications.
- The durable ledger records authorized dispatch intents and observed results. An intent does not certify dispatch. A finish can retain usage after lease expiry or quarantine without changing conversation state. Accounting queries keep pending intents and unknown usage visible and avoid adding terminal totals to ledger totals.
- Combined Redis admission checks concurrency, cooldown, RPM, TPM and optional input/output dimensions in one call. The quota scope identifies the allocation independently of the application namespace. Token reservations are conservative and verified excess usage increases the charge for the original window.
- The Phase 6E analyzer keeps missing applicable security judgments unknown. Failed Continue operations collect available accounting without replacing the original exception. Frozen Phase 6E data and rubrics retain their existing hashes.
- Operational aggregate queries and incident procedures are in the [runbook](operations-runbook.md).

## Local verification

| Check | Result |
| --- | --- |
| Migration replay and generated types | Local scratch database replay and UTF-8 TypeScript generation |
| PostgreSQL ledger and regression | 1,360 assertions passed in 48 files, including Ask and Continue ledger cases. Local advisors reported no error-level issues. |
| PostgreSQL independent-connection races | 35 passed, including duplicate intents, expiry, quarantine, late recovery and conflicting finishes |
| Redis semaphore and cooldown | 40 requests across four workers, peak four permits, no duplicates or post-outage provider calls |
| Redis throughput and lost admission response | Three of 12 requests admitted under a shared synthetic three-RPM allocation. TPM, ITPM, OTPM, expiry, debt and no dispatch on an unconfirmed result verified. |
| Context quality and deterministic security | 30/30 and 36/36 |
| Comparative offline A–D | 320 executions, 80 per variant |
| Backend regression | 357 tests passed. Compilation and `pip check` passed. |
| Web regression | 1,294 tests passed and 26 skipped in the full run. All 37 focused Study Assistant tests passed after adding the quota denial case. Route type generation, TypeScript, the production build and all 29 production safeguard tests passed. |
| Worker interruption | Two independent synthetic workers exited at the prescribed points. Both left one durable pending intent and null observed usage. The worker before dispatch made zero synthetic provider calls, and the worker after the response made one. |
| Dependency audit | npm and pinned Python audit reported no known vulnerabilities |
| Hosted functional QA | Pass, developer-confirmed in Phase 6G |
| Post-merge staging CI | Pass, cited in the Phase 6G brief |

The existing web lint rules reported 45 warnings and zero errors. The reviewed React compiler groups included 20 effects that set state, 15 ref-access diagnostics, two dependency diagnostics and two purity diagnostics. Existing web components outside the RAG availability notice are outside this change.

## Local performance results

Measured with mocked Gemini/Groq responses, real isolated PostgreSQL and Redis, and the same telemetry enabled under both policies. The baseline disables the new ledger and throughput gate. Each row uses 12 operations. General and Document ran sequentially. Replay used four workers after a successful priming request. These are descriptive local samples.

| Scenario | Baseline P50 | Baseline P95 | Phase 6F P50 | Phase 6F P95 |
| --- | ---: | ---: | ---: | ---: |
| General AI | 442.61 ms | 645.55 ms | 465.52 ms | 698.57 ms |
| Document RAG | 814.97 ms | 990.99 ms | 859.52 ms | 1,150.91 ms |
| Completed replay | 620.75 ms | 743.52 ms | 730.43 ms | 964.59 ms |

Every measured healthy and replay operation completed. Replays made zero provider calls under both policies. Phase 6F reported complete accounting for all General AI samples and partial usage for all Document RAG samples because the embedding provider did not expose token usage in the fixture. Phase 6F P99 values were 802.53 ms, 1,310.22 ms, and 967.18 ms for the respective cohorts. The diagnostic saturation run scheduled 40 operations across eight workers, completed 23, rejected 17, and recorded zero unknown outcomes and a peak of four active provider calls. An earlier run completed 39 and rejected one at a peak of three. The separate Redis stress test also reached the configured peak of four.

The initial staging objectives are at least 99% completion for eligible healthy Ask, General AI P95 at most eight seconds, Document RAG P95 at most twelve seconds, and replay P95 at most one second. The earlier samples collected alongside regression jobs produced replay P95 values of 1,164.40 ms for baseline and 1,333.18 ms for Phase 6F. The diagnostic rerun measured Phase 6F database setup P95 of 948.92 ms on replay. Local timings vary with load and leave the hosted latency gate pending.

Local `EXPLAIN (ANALYZE, BUFFERS)` on an 18-turn synthetic conversation measured 4.36 ms for authorized context, 4.52 ms for summary input, 0.81 ms for turn authorization, 1.83 ms for Continue authorization, and 5.98 ms for scoped vector retrieval. The completed-history sample took 0.24 ms with a scan and a small in-memory sort. Hosted cardinality and plans still need review before any unrelated index or scheduling changes.

## Provider capacity

Account-specific RPM/TPM, input/output and daily limits for GPT-OSS 20B and 120B remain unverified. Shared hosted Redis topology and allocations for non-RAG consumers also remain unverified. The [runbook](operations-runbook.md) inventories provider consumers and records sequencing for a later authorized rollout.

## Release decision

Phase 6F hosted and live functional acceptance is developer-confirmed. Numerical hosted performance and comparative thresholds remain unreported in the supplied evidence. Production activation is tracked separately. The baseline is `product-release` at `7cd362e5fef680ace3e6ae1d8d9e808360b39489`.

## Hosted and Live Verification

Functional hosted QA and live provider checks were accepted from the project developer's confirmation supplied with the Phase 6G preparation brief on 2026-11-27. Phase 6G uses that confirmation for prior-phase functional acceptance. Numerical thresholds still require their measured reports or explicit developer confirmation against those thresholds.
