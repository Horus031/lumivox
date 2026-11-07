# Phase 10 — Reliability & Operations

## Step 10A — Operational Observability

- Status **Local PASS**.
- Baseline HEAD `b2e0022331b132d32c8037cb388610736a8b414a` on `feature/learning-schedule-foundation`, with a clean worktree at start.
- Supabase CLI generated `20261107074822_learning_schedule_operational_observability.sql`. The final local replay applied **93 migrations** and TypeScript types were regenerated. Earlier migrations were reused as applied.
- The service-role-only RPC is `SECURITY INVOKER` with an empty search path and a single `statement_timestamp()`. It reads both gate rows strictly, performs no claim, reconciliation or state transition, and returns aggregates without IDs or provider diagnostics.
- Each aggregate samples at most 1,001 matching rows. A count of 1,001 is a lower bound listed under `capped`. The ordered due and webhook scans retain the oldest timestamp even at the cap. The RPC requests a 2-second statement timeout through PostgREST hoisting and a 500 ms database lock timeout. Local authenticator configuration has an 8-second fallback. The Next.js call has a 3-second abort deadline. [PostgREST transaction settings](https://docs.postgrest.org/en/stable/references/transactions.html)

### Metric definitions

| Signal | Definition |
| --- | --- |
| `dispatch.pendingDue` | Pending jobs whose due and retry timestamps are both at or before the snapshot. Age is measured from the oldest qualifying `due_at`. It is null when the set is empty. |
| `dispatch.activeLeases`, `dispatch.expiredLeases` | Leased jobs split at `lease_until`, with equality in the expired set. |
| `dispatch.uncertainAttempts` | Current uncertain delivery attempt rows across both existing providers. |
| `dispatch.unmatchedWebhooks` | Unmatched receipts. Age uses receipt ingestion time, independent of provider timestamps. |
| `dispatch.acceptedSubmissions24h` | Resend attempts with provider acceptance in the last 24 hours. An accepted attempt can later bounce. |
| `dispatch.deliveryFailures24h` | Resend attempts currently failed, bounced or complained and updated in the last 24 hours. This is a status-based diagnostic gauge. |
| `missedSweep.eligibleBacklog` | Scheduled occurrences past the inclusive 60-minute grace boundary, on active schedules for eligible root Tasks. Locks and gates are evaluated separately from this read. |
| `focus.activeSessions` | Ongoing and paused Focus sessions. |
| Focus launch conflicts | Countable FastAPI `study_focus_launch_conflict` events with allowlisted outcomes for HTTP 409, 423 and 429. Counts come from the log collector. The snapshot contains the active Focus gauge. |

### Health and alert policy

`GET /api/internal/learning-schedule/health` uses a separate server-only `LEARNING_SCHEDULE_MONITORING_SECRET` of at least 32 characters. The route rejects the dispatcher secret and uses no browser session. Responses use `Cache-Control: no-store`.

- **401** for missing or invalid monitoring authentication.
- **200** with liveness `live` and readiness `ready` for a valid snapshot. Operational status is `normal` or `attention`. A database gate being intentionally OFF is valid.
- **503** with liveness `live`, readiness `unavailable` and operational status `unknown` for a failed or malformed read. The body exposes only a stable error code. Next.js logs a redacted `snapshot_unavailable` outcome so repeated 5xx can be counted against a measured baseline.
- The initial thresholds are expired leases across two consecutive observations, any uncertain attempt, due age over 300 seconds when Dispatch is ON, unmatched receipt age over 900 seconds, and Sweep backlog increasing across three ordered, enabled, uncapped samples. The endpoint evaluates immediate alerts. The pure evaluator also accepts prior snapshots for monitoring clients that maintain history.
- Alert transport, scheduling, cooldown and deduplication are outside 10A. No live email, Slack notification or recovery action is triggered by health reads.

### Query plans

Executed local `EXPLAIN (ANALYZE, BUFFERS)` on scratch distributions of 30,000 rows per queue, receipt and delivery table. The fixture recreated the existing claim index and compared the same queries before and after adding the measured partial indexes.

| Query | Baseline → candidate execution time |
| --- | --- |
| Due backlog ordered by due date | 0.670 → 0.327 ms. Ordered index scan removed the sort. |
| Unmatched receipts ordered by ingestion | 3.124 → 0.329 ms. Removed a full receipt scan. |
| Uncertain attempts | 3.222 → 0.199 ms. Removed a full delivery scan. |
| Accepted submissions, quiet 24-hour window | 3.482 → 0.027 ms. Removed a full delivery scan for zero results. In the busy capped fixture the candidate cost 0.319 ms versus 0.231 ms for the baseline. |
| Recent delivery failures | 3.460 → 0.042 ms. Removed a full delivery scan for five matches. |

The migration reuses existing lease, scheduled-end and active-Focus indexes. These measurements describe the scratch distribution and are separate from the Phase 10C load and latency work.

### Executed gates

| Gate | Actual result |
| --- | --- |
| Local migration replay / types | **PASS**, 93 migrations and generated local TypeScript types |
| Full pgTAP | **PASS**, 973 assertions across 35 entries, including 22 new assertions and one existing fixture-only skip |
| Targeted Vitest | **PASS**, 11 tests in 2 files |
| Full Vitest | **PASS**, 1,068 passed / 26 skipped, 93 files passed / 5 skipped, 241.18s |
| FastAPI Focus V2 regression | **PASS**, 9 tests including conflict log redaction |
| Chromium Phase 09 regression | **PASS**, 5 tests in 1.3 minutes. Live local FastAPI emitted the allowlisted `activeFocusConflict` outcome during the race tests. |
| ESLint | **PASS**, zero errors and one existing missing-`projection` dependency warning |
| Standalone TypeScript | **PASS** |
| Next.js production build | **PASS**, 16.2.6, compiled in 21.5s, 106 pages. The npm prebuild cleanup was skipped. |
| Local HTTP integration | **PASS** against the Next.js production build and local Supabase. Missing, wrong and dispatcher credentials returned 401. POST returned 405. Idle gates-OFF returned 200/normal and the seeded uncertain attempt returned 200/attention. Pausing local PostgREST returned 503/unknown and unpausing restored 200. |
| Security advisors | Existing mutable search-path warning for `public.set_updated_at`. No new findings. |

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

| Case | Actual result |
| --- | --- |
| FR-01 | Child terminated after claim commit. One expired lease was visible. Restart recovered and sent once to the fake provider, using the existing key. Attempt count advanced from 1 to 2. |
| FR-02 | Child terminated after payload preparation. Restart used the same persisted envelope and token, with one fake submission and no duplicate token. |
| FR-03 | Child terminated after durable handoff, before provider invocation. Restart cleared the expired lease and converted the single submitting delivery to uncertain. The failed job stayed held with zero submissions. |
| FR-04 | The fake provider recorded acceptance and destroyed the socket. The worker persisted uncertain. Restart performed zero further submissions. Trusted correlation using the fake provider's known ID settled the same handoff and cleared the uncertain gauge. |
| FR-05 | Real PostgreSQL trigger forced the outcome write to roll back with `P0001` after fake acceptance. The committed handoff remained submitting. On lease expiry, restart moved it to uncertain without sending again. Trusted correlation settled that same row. |
| FR-06–FR-07 | A delivery webhook reached the existing ingestion RPC before outcome persistence. The unmatched gauge moved from 1 to 0 after correlation. Duplicate and older events left the delivery in `delivered`, with two unique receipts and one submission total. |
| FR-08 | Both commit orders ran. Opt-out before handoff produced zero submissions. Opt-out after handoff preserved the committed attempt and its one accepted outcome. Consent was OFF in both final states. |
| FR-09 | After a successful fake batch, disabling Dispatch made the next batch inspect zero jobs. Its pending job kept attempt count 0. |
| FR-10 | After a prepared-payload crash, the wrong key failed closed, retained the one payload/token and made zero provider calls. Restoring the key while one attempt remained reused the same payload and key and submitted once. |

The known-ID correlation in FR-04/05 used fake-provider evidence already available to the harness. This is separate from the automatic restart, which held each unknown outcome. A health snapshot never invokes recovery.

### Focus and Attendance recovery

| Case | Actual result |
| --- | --- |
| FR-11 | The loopback proxy destroyed its downstream socket after the real FastAPI launch returned success. Retry used the identical payload and key and returned the original ID, with one launch record and one attribution. |
| FR-12 | A separate test withheld the response after upstream success until Next.js timed out. The active Focus gauge stayed at one before and after replay. |
| FR-13 | Two authenticated browser contexts submitted completion of the same segment through Next.js. FastAPI returned 200 and 409. PostgreSQL persisted one completed 1,500-second segment and zero Attendance events. The parent remained active for its remaining rounds. |
| FR-14 | PostgreSQL reported an Attendance lock wait while the browser completed Focus. After releasing the lock, one manual Attendance event committed. The final snapshot showed zero active Focus sessions. |
| FR-15 | Launch waited on the Task close transaction and then returned HTTP 410. The snapshot showed zero active Focus sessions and no Focus row was created. |
| FR-16 | pgTAP injected a real attribution INSERT failure. Focus parent, plan, segments and launch record rolled back. The snapshot agreed with the zero-active state. |
| FR-17 | The query-action test injected a short page and verified `incompleteData`. The local browser separately verified that a missing persisted segment hid Recorded Focus while Attendance stayed visible. |
| FR-18 | A fresh browser with no saved launch key opened the existing timer after the uncertain result and retained it on reload. It sent no new launch request. |

### Quality gates

| Gate | Actual result |
| --- | --- |
| Full pgTAP | **PASS**, 974 assertions across 35 entries. One new post-rollback snapshot assertion, one existing fixture-only skip. |
| Recovery harness | **PASS**, 11 notification executions covering FR-01–FR-10, including both opt-out commit orders. Four child processes terminated with SIGTERM. Eight fake submissions total, including the successful batch before gate OFF, and zero real provider requests. |
| Targeted Vitest | **PASS**, 29 tests in 4 files |
| Full Vitest | **PASS**, 1,076 passed / 26 skipped, 94 files passed / 5 skipped, 202.81s |
| FastAPI Focus V2 regression | **PASS**, 9 tests |
| Chromium Focus and Attendance regression | **PASS**, 7 tests in 1.4 minutes |
| ESLint | **PASS**, zero errors, one existing missing-`projection` dependency warning |
| TypeScript | **PASS**, standalone and production build typecheck |
| Next.js production build | **PASS**, Next.js 16.2.6, compiled in 16.9s. npm prebuild cleanup was skipped. |

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
