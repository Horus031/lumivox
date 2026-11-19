# Phase 10 — Reliability & Operations

## Step 10A — Operational Observability

- Status **Local PASS**.
- Baseline HEAD `b2e0022331b132d32c8037cb388610736a8b414a` on `feature/learning-schedule-foundation`, with a clean worktree at start.
- Supabase CLI generated `20261107074822_learning_schedule_operational_observability.sql`. The final local replay applied **93 migrations** and TypeScript types were regenerated. Earlier migrations were reused as applied.
- The service-role-only RPC is `SECURITY INVOKER` with an empty search path and a single `statement_timestamp()`. It reads both gate rows strictly, performs no claim, reconciliation or state transition, and returns aggregates without IDs or provider diagnostics.
- Each aggregate samples at most 1,001 matching rows. A count of 1,001 is a lower bound listed under `capped`. The ordered due and webhook scans retain the oldest timestamp even at the cap. The RPC requests a 2-second statement timeout through PostgREST hoisting and a 500 ms database lock timeout. Local authenticator configuration has an 8-second fallback. The Next.js call has a 3-second abort deadline. [PostgREST transaction settings](https://docs.postgrest.org/en/stable/references/transactions.html)

### Metric definitions

| Signal                                            | Definition                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch.pendingDue`                             | Pending jobs whose due and retry timestamps are both at or before the snapshot. Age is measured from the oldest qualifying `due_at`. It is null when the set is empty.                        |
| `dispatch.activeLeases`, `dispatch.expiredLeases` | Leased jobs split at `lease_until`, with equality in the expired set.                                                                                                                         |
| `dispatch.uncertainAttempts`                      | Current uncertain delivery attempt rows across both existing providers.                                                                                                                       |
| `dispatch.unmatchedWebhooks`                      | Unmatched receipts. Age uses receipt ingestion time, independent of provider timestamps.                                                                                                      |
| `dispatch.acceptedSubmissions24h`                 | Resend attempts with provider acceptance in the last 24 hours. An accepted attempt can later bounce.                                                                                          |
| `dispatch.deliveryFailures24h`                    | Resend attempts currently failed, bounced or complained and updated in the last 24 hours. This is a status-based diagnostic gauge.                                                            |
| `missedSweep.eligibleBacklog`                     | Scheduled occurrences past the inclusive 60-minute grace boundary, on active schedules for eligible root Tasks. Locks and gates are evaluated separately from this read.                      |
| `focus.activeSessions`                            | Ongoing and paused Focus sessions.                                                                                                                                                            |
| Focus launch conflicts                            | Countable FastAPI `study_focus_launch_conflict` events with allowlisted outcomes for HTTP 409, 423 and 429. Counts come from the log collector. The snapshot contains the active Focus gauge. |

### Health and alert policy

`GET /api/internal/learning-schedule/health` uses a separate server-only `LEARNING_SCHEDULE_MONITORING_SECRET` of at least 32 characters. The route rejects the dispatcher secret and uses no browser session. Responses use `Cache-Control: no-store`.

- **401** for missing or invalid monitoring authentication.
- **200** with liveness `live` and readiness `ready` for a valid snapshot. Operational status is `normal` or `attention`. A database gate being intentionally OFF is valid.
- **503** with liveness `live`, readiness `unavailable` and operational status `unknown` for a failed or malformed read. The body exposes only a stable error code. Next.js logs a redacted `snapshot_unavailable` outcome so repeated 5xx can be counted against a measured baseline.
- The initial thresholds are expired leases across two consecutive observations, any uncertain attempt, due age over 300 seconds when Dispatch is ON, unmatched receipt age over 900 seconds, and Sweep backlog increasing across three ordered, enabled, uncapped samples. The endpoint evaluates immediate alerts. The pure evaluator also accepts prior snapshots for monitoring clients that maintain history.
- Alert transport, scheduling, cooldown and deduplication are outside 10A. No live email, Slack notification or recovery action is triggered by health reads.

### Query plans

Executed local `EXPLAIN (ANALYZE, BUFFERS)` on scratch distributions of 30,000 rows per queue, receipt and delivery table. The fixture recreated the existing claim index and compared the same queries before and after adding the measured partial indexes.

| Query                                      | Baseline → candidate execution time                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Due backlog ordered by due date            | 0.670 → 0.327 ms. Ordered index scan removed the sort.                                                                                                    |
| Unmatched receipts ordered by ingestion    | 3.124 → 0.329 ms. Removed a full receipt scan.                                                                                                            |
| Uncertain attempts                         | 3.222 → 0.199 ms. Removed a full delivery scan.                                                                                                           |
| Accepted submissions, quiet 24-hour window | 3.482 → 0.027 ms. Removed a full delivery scan for zero results. In the busy capped fixture the candidate cost 0.319 ms versus 0.231 ms for the baseline. |
| Recent delivery failures                   | 3.460 → 0.042 ms. Removed a full delivery scan for five matches.                                                                                          |

The migration reuses existing lease, scheduled-end and active-Focus indexes. These measurements describe the scratch distribution and are separate from the Phase 10C load and latency work.

### Executed gates

| Gate                           | Actual result                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local migration replay / types | **PASS**, 93 migrations and generated local TypeScript types                                                                                                                                                                                                                                                      |
| Full pgTAP                     | **PASS**, 973 assertions across 35 entries, including 22 new assertions and one existing fixture-only skip                                                                                                                                                                                                        |
| Targeted Vitest                | **PASS**, 11 tests in 2 files                                                                                                                                                                                                                                                                                     |
| Full Vitest                    | **PASS**, 1,068 passed / 26 skipped, 93 files passed / 5 skipped, 241.18s                                                                                                                                                                                                                                         |
| FastAPI Focus V2 regression    | **PASS**, 9 tests including conflict log redaction                                                                                                                                                                                                                                                                |
| Chromium Phase 09 regression   | **PASS**, 5 tests in 1.3 minutes. Live local FastAPI emitted the allowlisted `activeFocusConflict` outcome during the race tests.                                                                                                                                                                                 |
| ESLint                         | **PASS**, zero errors and one existing missing-`projection` dependency warning                                                                                                                                                                                                                                    |
| Standalone TypeScript          | **PASS**                                                                                                                                                                                                                                                                                                          |
| Next.js production build       | **PASS**, 16.2.6, compiled in 21.5s, 106 pages. The npm prebuild cleanup was skipped.                                                                                                                                                                                                                             |
| Local HTTP integration         | **PASS** against the Next.js production build and local Supabase. Missing, wrong and dispatcher credentials returned 401. POST returned 405. Idle gates-OFF returned 200/normal and the seeded uncertain attempt returned 200/attention. Pausing local PostgREST returned 503/unknown and unpausing restored 200. |
| Security advisors              | Existing mutable search-path warning for `public.set_updated_at`. No new findings.                                                                                                                                                                                                                                |

### Acceptance and reproduction

- **OP-01–OP-07** passed with a fixed reference timestamp in rollback-only pgTAP fixtures. These exercise due/retry boundaries, active and exactly expired leases, uncertain attempts, unmatched receipts, accepted/failure counts, and the inclusive sweep grace boundary.
- **OP-08** passed under the anonymous and authenticated roles. **OP-09–OP-10** passed through the real HTTP endpoint. The response validator also rejects extra properties, malformed counts and undisclosed caps.
- **OP-11** passed both as a row comparison in pgTAP and as matching before/after digests of the HTTP fixture's queue, lease, delivery, receipt, session and Attendance rows. The HTTP fixture used a disposable database and restored the paused PostgREST container in a `finally` block.
- **OP-12** passed. Final local read verified 93 applied migrations, zero fixture users, Tasks, jobs, deliveries and webhook receipts, zero reminder Cron jobs and both gates **OFF**. The installed snapshot still used `statement_timestamp()`. PostgREST was running, and the Next.js and FastAPI test servers were stopped.

```powershell
# Repo root, Supabase CLI 2.122.0, verified disposable local database
supabase migration new learning_schedule_operational_observability
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
supabase db advisors --local --type security --fail-on none --output-format json
node scripts/test-learning-schedule-operational-health.mjs

# apps/web, isolated local environment
node node_modules/vitest/vitest.mjs run features/learning-schedule/operations --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3119
node node_modules/@playwright/test/cli.js test tests/study-focus-launch.spec.ts tests/study-focus-effort.spec.ts tests/study-learning-journey.spec.ts --project=chromium --workers=1 --reporter=line

# services/ai-api, with verified local Supabase
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8096 --lifespan off
```

The HTTP harness requires the local build server at `OPERATIONAL_HEALTH_TEST_URL=http://127.0.0.1:3119`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`, and the same distinct test-only monitoring and dispatcher secrets as the server. Run it only against the empty disposable stack because it temporarily pauses local PostgREST. The service key is only configured on the server.

For the Phase 09 browser regression, reuse the loopback FastAPI/proxy and fixture configuration documented in [phase-09-evidence.md](./phase-09-evidence.md).

### Limits and follow-up

- The endpoint does not persist monitoring history. Operators need a collector for Focus conflict counts, repeated 5xx baselines and multi-snapshot alert rules. No production alert thresholds or load SLOs were measured here.
- Failure injection and recovery workflows, production-scale load, operational runbooks, staging rollout and live Resend Tier B remain later checkpoints.

## Step 10B — Failure Injection & Recovery

- Status **Local PASS**.
- Baseline HEAD `8fc249cf3dfdb159f06524e80f1d15afd804993b` on `feature/learning-schedule-foundation`. The worktree was clean at start. The existing 93-migration schema and worker state machines were reused.
- [Recovery report](./phase-10-recovery.json) contains persisted state and Operational Snapshot reads before and after each notification fault, including intermediate held states, child exit signals, mock call counts and cleanup. The harness runs the actual dispatcher, Supabase store and Resend adapter. The injected SDK port can only call a fake HTTP provider on loopback. [Node.js child process API](https://nodejs.org/api/child_process.html)
- Child workers stop at explicit IPC barriers after the relevant PostgREST request commits. The parent terminates only its own child and advances the fixture's lease timestamp to force expiry deterministically. Browser faults are injected by the existing loopback proxy after real FastAPI commits. No fault controls are exposed by the application runtime.
- The pure operator policy returns `safe_to_retry` for eligible pre-handoff work with no live lease and remaining claim budget, `hold_for_review` for submitting/uncertain outcomes or an active lease, and `terminal` for known final/ineligible states. It has no mutation or network path.

### Notification recovery and observability

| Case        | Actual result                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01       | Child terminated after claim commit. One expired lease was visible. Restart recovered and sent once to the fake provider, using the existing key. Attempt count advanced from 1 to 2.                                                                         |
| FR-02       | Child terminated after payload preparation. Restart used the same persisted envelope and token, with one fake submission and no duplicate token.                                                                                                              |
| FR-03       | Child terminated after durable handoff, before provider invocation. Restart cleared the expired lease and converted the single submitting delivery to uncertain. The failed job stayed held with zero submissions.                                            |
| FR-04       | The fake provider recorded acceptance and destroyed the socket. The worker persisted uncertain. Restart performed zero further submissions. Trusted correlation using the fake provider's known ID settled the same handoff and cleared the uncertain gauge.  |
| FR-05       | Real PostgreSQL trigger forced the outcome write to roll back with `P0001` after fake acceptance. The committed handoff remained submitting. On lease expiry, restart moved it to uncertain without sending again. Trusted correlation settled that same row. |
| FR-06–FR-07 | A delivery webhook reached the existing ingestion RPC before outcome persistence. The unmatched gauge moved from 1 to 0 after correlation. Duplicate and older events left the delivery in `delivered`, with two unique receipts and one submission total.    |
| FR-08       | Both commit orders ran. Opt-out before handoff produced zero submissions. Opt-out after handoff preserved the committed attempt and its one accepted outcome. Consent was OFF in both final states.                                                           |
| FR-09       | After a successful fake batch, disabling Dispatch made the next batch inspect zero jobs. Its pending job kept attempt count 0.                                                                                                                                |
| FR-10       | After a prepared-payload crash, the wrong key failed closed, retained the one payload/token and made zero provider calls. Restoring the key while one attempt remained reused the same payload and key and submitted once.                                    |

The known-ID correlation in FR-04/05 used fake-provider evidence already available to the harness. This is separate from the automatic restart, which held each unknown outcome. A health snapshot never invokes recovery.

### Focus and Attendance recovery

| Case  | Actual result                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-11 | The loopback proxy destroyed its downstream socket after the real FastAPI launch returned success. Retry used the identical payload and key and returned the original ID, with one launch record and one attribution.                                               |
| FR-12 | A separate test withheld the response after upstream success until Next.js timed out. The active Focus gauge stayed at one before and after replay.                                                                                                                 |
| FR-13 | Two authenticated browser contexts submitted completion of the same segment through Next.js. FastAPI returned 200 and 409. PostgreSQL persisted one completed 1,500-second segment and zero Attendance events. The parent remained active for its remaining rounds. |
| FR-14 | PostgreSQL reported an Attendance lock wait while the browser completed Focus. After releasing the lock, one manual Attendance event committed. The final snapshot showed zero active Focus sessions.                                                               |
| FR-15 | Launch waited on the Task close transaction and then returned HTTP 410. The snapshot showed zero active Focus sessions and no Focus row was created.                                                                                                                |
| FR-16 | pgTAP injected a real attribution INSERT failure. Focus parent, plan, segments and launch record rolled back. The snapshot agreed with the zero-active state.                                                                                                       |
| FR-17 | The query-action test injected a short page and verified `incompleteData`. The local browser separately verified that a missing persisted segment hid Recorded Focus while Attendance stayed visible.                                                               |
| FR-18 | A fresh browser with no saved launch key opened the existing timer after the uncertain result and retained it on reload. It sent no new launch request.                                                                                                             |

### Quality gates

| Gate                                     | Actual result                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full pgTAP                               | **PASS**, 974 assertions across 35 entries. One new post-rollback snapshot assertion, one existing fixture-only skip.                                                                                                                                         |
| Recovery harness                         | **PASS**, 11 notification executions covering FR-01–FR-10, including both opt-out commit orders. Four child processes terminated with SIGTERM. Eight fake submissions total, including the successful batch before gate OFF, and zero real provider requests. |
| Targeted Vitest                          | **PASS**, 29 tests in 4 files                                                                                                                                                                                                                                 |
| Full Vitest                              | **PASS**, 1,076 passed / 26 skipped, 94 files passed / 5 skipped, 202.81s                                                                                                                                                                                     |
| FastAPI Focus V2 regression              | **PASS**, 9 tests                                                                                                                                                                                                                                             |
| Chromium Focus and Attendance regression | **PASS**, 7 tests in 1.4 minutes                                                                                                                                                                                                                              |
| ESLint                                   | **PASS**, zero errors, one existing missing-`projection` dependency warning                                                                                                                                                                                   |
| TypeScript                               | **PASS**, standalone and production build typecheck                                                                                                                                                                                                           |
| Next.js production build                 | **PASS**, Next.js 16.2.6, compiled in 16.9s. npm prebuild cleanup was skipped.                                                                                                                                                                                |

### Reproduction

```powershell
# Repository root, verified disposable local Supabase
supabase status -o json
supabase test db --local
node scripts/test-learning-schedule-recovery.mjs

# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/operations features/learning-schedule/study-focus-effort.queries.actions.test.ts --maxWorkers=2 --reporter=dot
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
node node_modules/@playwright/test/cli.js test tests/study-focus-launch.spec.ts tests/study-focus-effort.spec.ts tests/study-learning-journey.spec.ts --project=chromium --workers=1 --reporter=line

# services/ai-api, local Supabase and test-only internal key
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
```

The Node harness requires verified `LEARNING_SCHEDULE_TEST_URL=http://127.0.0.1:55321` and the local `LEARNING_SCHEDULE_TEST_SERVICE_KEY`. It verifies empty tables, both gates OFF and zero reminder Cron jobs before fixture writes. Use the existing [Phase 09 local browser configuration](./phase-09-evidence.md) for the FastAPI/Next.js regression.

Final database read verified 93 applied migrations, zero fixture users, Tasks, Study Sessions, Focus sessions, jobs, deliveries and receipts. The fault trigger/function were removed, Dispatch and Missed Sweep were **OFF**, and there were zero reminder Cron jobs. Both local test servers were stopped.

### Limits

- Lease expiry was advanced on disposable fixture rows. Worker termination was real and limited to the harness's own child processes.
- Webhook recovery was exercised at the trusted ingestion RPC boundary. Signed webhook HTTP coverage remains in the earlier Phase 08 suites. FR-17 injects a short page at the query adapter boundary.
- Live provider reconciliation, automatic operator commands, production load and alert collection remain outside this checkpoint.

## Step 10C — Load & Performance

- Status **Local benchmark complete. Medium Study Plan latency target missed.** Small and Medium both finished the four workload groups and passed the persisted correctness assertions. Large was deferred because Medium exceeded its trial latency target.
- Baseline HEAD `7f0453ffc7fd774d53961dd73b29569fd98fd783` on `feature/learning-schedule-foundation`, with a clean worktree at start. The benchmark uses the existing 93-migration schema.
- [Performance report](./phase-10-performance.json) records environment, sample counts, latency percentiles, throughput, response size, PostgREST calls/rows, SQL execution time, process memory, observed blockers and persisted invariants.
- Windows 11 build 26200, Intel Core i7-9850H with 12 logical CPUs, 31.76 GiB host RAM, Docker with 12 CPUs and about 15.5 GiB RAM, Node 22.13.1. All servers, database requests and injected provider responses are local.
- Study Plan measures complete HTTP bodies on the production Next.js build. After a warm-up, each persona uses three requests per concurrent client. Concurrent clients share one authenticated persona within a batch. The fixture uses separate schedules of at most 50 days and contains completed and cancelled history. The linked persona has 201 Focus attributions on one occurrence.
- The loopback proxy counts PostgREST calls and rows. SQL execution time is the delta of matching `pg_stat_statements` entries in the isolated window. The residual after subtracting summed PostgREST round trips is approximate because requests can overlap. It is not a measurement of application CPU time. Memory is the Next.js process lifetime peak working set. [PostgreSQL statement statistics](https://www.postgresql.org/docs/current/pgstatstatements.html)
- Schedule and Focus batches use distinct authorized owners. Separate contention scenarios deliberately share a schedule or hold a database lock. Focus percentiles are measured at FastAPI or PostgREST. A separate Chromium sample measures the browser through Next.js to FastAPI and Supabase.
- Notification drain uses five concurrent invocations of the actual dispatcher, store and adapter, batch size 5, and 100 jobs spread across 10 owners. Only the SDK send port is replaced. Delay and errors are injected locally. Lease expiry is advanced on fixtures after the harness child exits or after a gate-off interruption.

### Study Plan results

| Profile / persona                    | Samples |               p50 / p95 / p99 (ms) | PostgREST calls / rows per request | Mean HTML bytes |
| ------------------------------------ | ------: | ---------------------------------: | ---------------------------------: | --------------: |
| Small, 12 sessions                   |      15 |           272.01 / 347.62 / 347.62 |                             8 / 22 |         179,732 |
| Small, 20 sessions and 201 links     |      15 |           288.75 / 304.65 / 304.65 |                           14 / 634 |         179,794 |
| Medium, 12 sessions                  |      60 |           877.96 / 916.76 / 925.06 |                             8 / 22 |         179,621 |
| Medium, 1,500 sessions and 201 links |      60 | 3,386.38 / **3,457.98** / 3,487.35 |                         54 / 2,554 |         559,372 |

- Small used **10 owners / 500 Study Sessions / 5 concurrent clients**. Medium used **100 / 10,000 / 20**. The full run reported zero measured Study Plan errors. Both profiles rendered the correct 201-minute effort and showed the incomplete-data state when the proxy shortened a real page while preserving its declared count.
- The Medium linked owner's peak Next.js working set was **541 MiB**. Across 60 requests, aggregate request time was **197,396 ms**, measured PostgREST round trips were **21,143 ms**, and matching SQL execution time was **2,444 ms**. These are summed measurements from different layers under concurrency.
- Medium EXPLAIN probes for the Study page and cancellation lookup executed in **0.508 ms** and **0.264 ms**. They show an indexed session lookup with incremental sort and a bitmap index scan for the cancellation query. The probes use simplified query shapes. The aggregate evidence does not isolate a single SQL query or prove a specific index would recover the end-to-end latency. No index, RPC or application read strategy changed.

### Mutation, Focus and queue results

| Workload                                    |                    Small |                   Medium |
| ------------------------------------------- | -----------------------: | -----------------------: |
| Schedule create p95                         |                146.90 ms |                285.43 ms |
| Schedule revise p95                         |                 62.53 ms |                197.26 ms |
| Same-schedule reschedule p95                |                 32.33 ms |                 27.75 ms |
| Manual Attendance plus exact replay p95     |                 21.61 ms |                130.82 ms |
| Focus ordinary / attributed create p95      |         35.99 / 24.26 ms |         85.52 / 60.47 ms |
| Focus pause / resume / segment complete p95 | 18.17 / 17.95 / 18.34 ms | 73.87 / 73.27 / 73.44 ms |
| Focus cancel / active read / replay p95     | 26.24 / 13.64 / 20.67 ms | 60.17 / 22.56 / 58.74 ms |
| Browser launch via Next.js, one sample      |                587.08 ms |                551.84 ms |
| Queue drain, terminal jobs per second       |                    13.06 |                    15.08 |
| Queue accepted jobs per second              |                    12.67 |                    14.63 |
| Queue worker batch p95                      |              2,136.87 ms |              1,719.06 ms |

- Real lock waits were observed in both profiles via `pg_blocking_pids()`. Revision versus Attendance finished successfully, with one manual completion event. Task close versus launch returned the expected HTTP 410 with zero attribution. Opt-out versus handoff refused authorization before provider invocation. Per-case statement observations and wall-clock timings are in the JSON.
- All Focus load samples completed with expected statuses, including HTTP 423 for a new key during active Focus. Exact launch replay returned the original ID with zero extra Focus rows. The transition p95 figures above are below the **500 ms** FastAPI trial target. The one-sample Chromium results represent click-to-timer latency through the full stack.
- Each queue drained **100 jobs** to **97 sent and 3 failed**, with zero unexpected duplicate submissions. The child process was stopped after claim commit, and the recovered job submitted once within the 3-claim budget. Gate OFF prevented new durable handoffs. Twenty stranded pre-handoff leases were observed in each run and expired on the fixtures before resuming. Five workers used fake delays of 35/350 ms, two injected 429s and one uncertain outcome per profile.
- The existing worker persisted the two injected 429s as terminal failures, even though the adapter classifies rate limits as retryable. It held the uncertain attempt without sending again. No retry policy change was made in this benchmark.
- Both profiles ended with zero extra Focus rows, duplicate attributions, lost Attendance events and unexpected duplicate submissions. There were no observed deadlocks or unexpected measured errors in the final run.

### Harness corrections

- Initial read assertions confused strings from the embedded translation catalog with rendered messages. The harness now checks rendered markup. A separate warm-up attempt saw a local profiles HTTP 401. Warm-up failures are tracked separately, and the final run had none.
- A preliminary queue run expected exactly two claims after a child crash. The gate closed during the recovered job's next lease, so the final claim count was three. The harness now verifies the existing budget and exactly one submission.
- A preliminary Medium run saw one ordinary Focus transport failure in 20 attempts. The final run used a fresh loopback connection per direct FastAPI request and captured transport error codes. No mutation is retried automatically by the benchmark.

### Reproduction

```powershell
# Repo root, verified disposable Supabase local
supabase status -o json
supabase test db --local
node scripts/test-learning-schedule-load.mjs

# apps/web
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build

# services/ai-api, with local Supabase and a test-only internal API key
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
```

Build Next.js with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8098` and the local publishable key so the benchmark can instrument the Data API. The harness expects `LEARNING_SCHEDULE_TEST_URL=http://127.0.0.1:55321`, local anon/service keys in `LEARNING_SCHEDULE_TEST_ANON_KEY` and `LEARNING_SCHEDULE_TEST_SERVICE_KEY`, and a test-only `AI_INTERNAL_API_KEY`. It starts its own Next.js, FastAPI and loopback proxy processes. Optional positional profile names are `small`, `medium` and `large`.

| Regression gate             | Actual result                                                             |
| --------------------------- | ------------------------------------------------------------------------- |
| Full pgTAP                  | **PASS**, 974 assertions across 35 entries                                |
| Full Vitest                 | **PASS**, 1,076 passed / 26 skipped, 94 files passed / 5 skipped, 194.13s |
| FastAPI Focus V2 regression | **PASS**, 9 tests                                                         |
| ESLint                      | **PASS**, zero errors, existing missing-`projection` dependency warning   |
| TypeScript                  | **PASS**, standalone and Next.js build typecheck                          |
| Next.js production build    | **PASS**, compiled in 14.2s, 106 pages. npm prebuild cleanup was skipped. |

The post-benchmark pgTAP rerun also passed all 974 assertions. The final local database had **93 migrations**, zero fixture users, Tasks, Study Sessions, events, Focus sessions, attributions, jobs, deliveries, payloads, tokens and receipts. Dispatch and Missed Sweep were **OFF**, with zero reminder Cron jobs. The harness ports were closed and the provider used only the injected fake SDK port.

## Step 10C.1 — Performance Remediation

**Status: Local PASS (PE-01 through PE-10).**

- Baseline HEAD `e333e30a061e36e1e3c3e9309430dbfd395558ed`. The benchmark report retains the original Small and Medium results and appends the follow-up under `remediation`.
- Study Plan now reads the owner's cancellation events in exact-count pages rather than fetching once per 50 session IDs. The read still checks for duplicate, missing and contradictory cancellation events, and rejects audits outside the session snapshot. Attendance formulas and the 201-link effort calculation are unchanged.
- Today resolves the current date once per timezone. Calendar validates each visible date once. Both retain nanosecond ordering and stable ID tie-breaking, with each visible instant parsed once per list.
- Opt-in `STUDY_PLAN_PERF_TIMING=true` emits fixed stage names and timings only. The harness records the plan and effort stages, render preparation, response bytes and the full request time. The remainder includes React rendering, serialization, queuing and other app work. It is not a direct CPU profile.
- The CLI-generated migration `20261107114955_learning_schedule_resend_rate_limit_retry.sql` adds a service-role-only command for confirmed `rate_limit_exceeded`. The adapter routes only that allowlisted, retryable result to the command. Other rejection, accepted and uncertain results keep their existing persistence paths. [Resend API errors](https://resend.com/docs/api-reference/errors)
- The database validates the original handoff and payload fingerprint under owner → job → delivery locks. A confirmed 429 releases the lease and schedules a new claim in 30 seconds if the job is still eligible, the backoff ends before scheduled start, and fewer than three claims have been consumed. It preserves the payload, unsubscribe token and idempotency key. Replay of the same outcome does not extend the backoff. [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- The first remediation run improved the 60-sample Medium heavy p95 from 3,457.98 ms to 2,679.71 ms and calls per request from 54 to 25. HTML size remained 559,372 bytes. Mean effort time was 904.29 ms across the request stages, with negligible pure calculation time. This motivated raising the bounded Focus read chunk from 60 to 120 and slimming the Today/Calendar props to the fields they display.
- The local notification fixture verified two 429 jobs stayed pending with a future `next_attempt_at`. After waiting for the persisted backoff, both completed on a second provider call with identical body and idempotency key. Quota, payload mismatch and uncertainty stayed terminal for automatic sending. The database also exercised relevance expiry, claim exhaustion and unauthorized access. The provider was an injected local fake.
- With the smaller payload and larger Focus batch, the next 60-sample Medium heavy trial reached 2,594.12 ms p95. That still exceeded the unchanged 2,500 ms threshold. The next refinement reads independent Task and audit data concurrently and reads remaining exact-count pages two at a time after the first page establishes the total. It still validates counts, page lengths and duplicate IDs before using the results.

The remediation run uses the same Medium fixture generator, machine, loopback proxy and production build workflow as Step 10C. Auth identities are regenerated for each disposable run. The 20-client comparisons use 60 measured requests for each persona. The JSON also keeps separate 1-client and 5-client measurements.

### Measured results

| Medium clients | Samples per persona | Light p50 / p95 / p99 (ms) |     Heavy p50 / p95 / p99 (ms) |
| -------------: | ------------------: | -------------------------: | -----------------------------: |
|              1 |                   3 |    85.92 / 123.74 / 123.74 |       237.17 / 250.44 / 250.44 |
|              5 |                  15 |   255.29 / 280.86 / 280.86 |       639.88 / 748.16 / 748.16 |
|             20 |                  60 |   850.79 / 872.06 / 878.72 | 1,979.12 / 2,093.65 / 2,096.17 |

At 20 clients, heavy p95 improved from 3,457.98 ms to **2,093.65 ms**. PostgREST calls fell from 54 to 17 per request, with 2,554 rows per request in the final trial. Mean response size fell from 559,372 to 511,226 bytes. Mean Study Plan, Focus effort and render preparation times were 718.57, 560.86 and 0.07 ms respectively. The process lifetime peak working set was 474,169,344 bytes. Every measured request returned HTTP 200. The short-page probe still rejected incomplete data.

The final timing run isolated Study Plan reads after the pagination change. The earlier complete Medium runs exercised schedule, contention, Focus and the durable retry path. The notification workload ended with 97 sent jobs and three jobs failed for automatic sending, with zero unexpected duplicate submissions. The browser regression also exercises the exact effort total and the preserved Attendance read paths.

| Checkpoint | Result                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| PE-01      | **PASS**, 60 heavy samples at 20 clients, p95 2,093.65 ms against the unchanged 2,500 ms gate               |
| PE-02      | **PASS**, zero measured errors and short-page rejection at all three concurrency levels                     |
| PE-03      | **PASS**, the heavy fixture includes 201 Focus links on one occurrence and checks the complete effort total |
| PE-04      | **PASS**, existing Attendance formulas retained and covered by the regressions                              |
| PE-05      | **PASS**, two confirmed rate limits requeued durably and retried with identical bodies and keys             |
| PE-06      | **PASS**, quota and payload mismatch stayed terminal and pgTAP covered window and claim exhaustion          |
| PE-07      | **PASS**, uncertain timeout stayed on hold for automatic sending                                            |
| PE-08      | **PASS**, zero unexpected duplicate submissions to the injected provider                                    |
| PE-09      | **PASS**, full local regression and quality gates below                                                     |
| PE-10      | **PASS**, fixture data removed, harness listeners closed, Dispatch and Missed Sweep OFF                     |

| Local gate                                            | Result                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean migration replay and TypeScript type generation | **PASS**, 94 migrations                                                                                                                         |
| pgTAP                                                 | **PASS**, 983 assertions across 35 files                                                                                                        |
| Vitest                                                | **PASS**, 1,077 passed and 26 skipped. After the final pagination typecheck fix, all 45 focused Study Plan and Focus effort tests passed again. |
| FastAPI Focus V2                                      | **PASS**, 9 tests                                                                                                                               |
| Chromium on the final production build                | **PASS**, 7 tests in 1.3 minutes                                                                                                                |
| ESLint                                                | **PASS**, one existing hook dependency warning in `use-focus-v2-audio.ts`                                                                       |
| Standalone TypeScript and Next.js production build    | **PASS**                                                                                                                                        |
| Harness syntax and Git diff whitespace                | **PASS**                                                                                                                                        |

The database after Chromium contained 94 migrations and zero fixture users, Tasks, Study Sessions, session events, Focus sessions, attributions, notification jobs, deliveries, payloads, unsubscribe tokens and webhook receipts. Dispatch and Missed Sweep were both OFF. There were zero reminder Cron jobs and zero listeners on the three harness ports.

These results apply to the local Medium workload with a fake provider. The benchmark provides no staging or production latency measurement, and Phase 08D Tier B live Resend remains pending.

### Reproduction

```powershell
# Repo root, verified disposable Supabase local
supabase migration up --local
supabase db reset --local --no-seed
supabase gen types typescript --local
supabase test db --local
node scripts/test-learning-schedule-load.mjs --remediation medium
node scripts/test-learning-schedule-load.mjs --remediation --reads-only medium
node scripts/test-learning-schedule-load.mjs --browser-regression

# apps/web, with the same loopback build settings as Step 10C
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build

# services/ai-api, local configuration
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
```

## Step 10D — Operational Runbooks & Recovery Operations

**Status: Local PASS (OR-01 through OR-12).**

- Baseline HEAD `910e8dfedee508591bcaf011fe172cd5131a6cad`. The branch was 20 commits ahead and zero behind the local `origin/product-release` tracking ref. Medium heavy p95 was 2,093.65 ms in the recorded Step 10C.1 trial. Step 10D uses this result as historical evidence.
- [Incident runbooks](operations/incident-runbooks.md), [recovery matrix](operations/recovery-decision-matrix.md), [kill switches and rollback](operations/rollback-and-kill-switches.md), and [release checklist](operations/operational-release-checklist.md) document the operator boundaries.
- The operator CLI uses the existing internal health endpoint and its dedicated monitoring credential. Commands select aggregate views of the same snapshot. The CLI emits fixed failure messages, disallows redirects, and uses HTTPS outside local loopback. It has no service key, mutation path or raw-record output.
- The recovery drill uses existing database RPCs and the local fake provider. No migration is needed. The drill uses an independent pair of database connections for the Dispatch claim fence and checks the persisted handoff outcomes. The signed webhook HTTP regression remains part of Vitest. The local operations fixture separately exercises the unmatched-receipt database path.

### Operational acceptance

| Case  | Observed result                                                                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OR-01 | **PASS**. The CLI read both persisted gates OFF and zero pending due jobs. The real-send endpoint separately returned HTTP 503 `real_send_disabled`.                                                                                                                                                                                   |
| OR-02 | **PASS**. Missing, wrong and dispatch credentials returned HTTP 401. CLI denial returned exit 3 with empty stdout. Anonymous and authenticated roles lacked snapshot RPC execution privileges.                                                                                                                                         |
| OR-03 | **PASS**. The fake provider accepted one submission and dropped the response. The attempt became uncertain, appeared in diagnostics and stayed held after gate re-enable with zero additional submissions.                                                                                                                             |
| OR-04 | **PASS**. `pg_blocking_pids()` showed the open claim blocking gate disable. Once disable committed, the next claim returned zero jobs. The bounded RPC released the expired pre-handoff lease to pending with zero deliveries and zero submissions.                                                                                    |
| OR-05 | **PASS**. Disabling Dispatch while idle consumed zero claims. Disabling before durable handoff produced zero deliveries and zero provider submissions.                                                                                                                                                                                 |
| OR-06 | **PASS**. Disabling after durable handoff allowed the authorized attempt to finish. One fake submission was recorded and the delivery stayed accepted with the job sent.                                                                                                                                                               |
| OR-07 | **PASS**. The CLI reported one unmatched webhook receipt through the existing aggregate.                                                                                                                                                                                                                                               |
| OR-08 | **PASS**. Sweep was observed ON then OFF. The gated entrypoint returned zero marked sessions with one eligible session present, and persisted rows were unchanged.                                                                                                                                                                     |
| OR-09 | **PASS**. Pausing the local DB caused CLI exit 1 with empty stdout. Diagnostics recovered after DB resume. Stopping the Next.js process also failed closed.                                                                                                                                                                            |
| OR-10 | **PASS**. All five CLI commands emitted only approved aggregate fields. Injected private fixture values and credentials were absent, and database contents were unchanged by the reads.                                                                                                                                                |
| OR-11 | **PASS**. Swapped the current Next.js build for the distinct artifact built from `e333e30a061e36e1e3c3e9309430dbfd395558ed`. Health recovered with both gates OFF, one overdue session and one pending reminder still visible. The Task, Schedule, Session, audit, reminder job and migration-history digest matched before and after. |
| OR-12 | **PASS**. Cleanup verified 94 migrations, zero fixture rows, both database gates OFF, zero reminder Cron jobs and zero harness listeners. All local regressions below passed.                                                                                                                                                          |

The [operations report](phase-10-operations.json) contains the final drill observations. The notification cases made two total submissions to the fake provider and zero to real Resend. The rollback exercise covered local artifact compatibility and database persistence. Staging, live Resend Tier B and deployment are outside this evidence.

| Local regression                        | Observed result                                                           |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Supabase clean replay and pgTAP         | **PASS**, 94 migrations, 983 assertions across 35 files                   |
| Vitest                                  | **PASS**, 1,077 passed and 26 skipped                                     |
| FastAPI Focus V2                        | **PASS**, 9 tests                                                         |
| Chromium                                | **PASS**, 7 tests                                                         |
| Next.js production build and TypeScript | **PASS**, 106 generated pages, standalone TypeScript passed               |
| ESLint                                  | **PASS**, one existing hook dependency warning in `use-focus-v2-audio.ts` |

### Reproduction on disposable local Supabase

```powershell
supabase db reset --local --no-seed
supabase test db --local
# Export the same loopback test settings as 10C.1. Build Next.js with the
# Supabase loopback proxy origin http://127.0.0.1:8098.
node scripts/test-learning-schedule-operations.mjs
node scripts/test-learning-schedule-load.mjs --browser-regression
```

For the distinct-artifact rollback check, export `apps/web` from the chosen ancestor SHA into a separate temporary directory, install its locked dependencies and build it with the same loopback settings. Write its full source SHA to `.ops-source-sha` in that web directory, then set `LEARNING_SCHEDULE_OPS_ROLLBACK_WEB` to the directory before running the drill. The harness checks the ancestor and distinct build ID. Without that artifact, the harness records only a baseline restart for OR-11.
