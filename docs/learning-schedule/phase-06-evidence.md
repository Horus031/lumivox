# Phase 06 — Analytics & Read Projections Evidence

## Baseline / Scope

- Verification date: **2026-11-02**, Asia/Bangkok (UTC+07:00).
- Branch: `feature/learning-schedule-foundation`.
- Baseline HEAD: **`3c9fce433b1aa17ecb15959364dfd5780579512b`**. Results below include the uncommitted working-tree changes reviewed and completed in this run; they are not execution claims for the baseline commit alone.
- Input: user-supplied “Verify Phase 06A và chuyển sang Phase 06B” guide. Initial working tree already contained six extra core tests and draft read-action/test files. The draft action test repeated core tests instead of exercising the action; it was replaced with action-specific coverage.
- Scope: per-Schedule, owner-scoped, full-history read projection; missing 6A edge cases; local integration and web/database regression. No new migration, Attendance RPC change, write grant, Calendar/Today's Plan UI, commit, push or deployment.

## Step 6A — Analytics Core Edge Cases

| Check | Execution / result |
| --- | --- |
| UT-027 zero due denominator | Unit test: null Attendance/On-time, future Planned Coverage remains 0 |
| UT-028 8/12 due, 5 on-time | Unit test: correct rates and counts |
| UT-029 late completion | Unit test: counts completion, excludes on-time credit |
| UT-030 future obligation | Unit test: included in planned, excluded from due |
| UT-031 proactive cancellation | Unit test: excluded using authoritative cancellation audit time |
| Grace equality | Unit test: end + 60 elapsed minutes equals asOf is due |
| Completion after asOf | Unit test: no due or planned completion credit |
| Cancellation after start | Unit test: remains eligible |
| Missing cancellation audit | Unit test: throws; no guessed updated_at timestamp |
| Ambiguous logical identity | Unit test: rejects two eligible candidates |
| Proactive replacement identity | Unit test: excludes proactive historical candidate before coalescing |
| Persisted Scheduled past grace | Unit test: counts due without rewriting/inventing persisted Missed status |
| UT-032 local-day grouping | **NOT EXECUTED / deferred to Calendar projection**; summary does not group by day |

Core implementation behavior was retained. Its documentation now correctly calls asOf a caller-supplied instant: this adapter uses application-server time, not a database timestamp.

## Step 6B.1 — Owner-scoped Read Action

- Added/completed `apps/web/features/learning-schedule/attendance-analytics.queries.actions.ts`.
- Strict UUID input is validated before Auth; `requireUser()` supplies the authenticated client. Schedule lookup, every Session page and every cancellation-event query include an explicit `user_id` predicate in addition to RLS.
- All Schedule revisions are read: no current-revision-only or status filter. Session pagination orders by `scheduled_start_at, id`, with 500 rows/page and a hard limit of 20,000 Sessions. Local `supabase/config.toml` has `api.max_rows = 1000`.
- Each Session page requests `count: "exact"`; expected page size, total count consistency, duplicate Session IDs and allowed status values are checked. Null count, short/truncated page, changing cardinality or excessive history returns `incompleteData`, never a partial summary.
- Cancellation audits are read in 50-Session chunks with exact counts and explicit pagination ordered by `created_at, id`. Missing, duplicate, truncated or contradictory cancellation audits fail closed. Cancellation time comes from event `created_at`, never Session `updated_at`.
- Query/Auth failures return safe `loadFailed`; an invisible Schedule returns `notAuthorized`. The action creates no privileged client, performs no writes and uses no service-role/secret key.

## Step 6B.2–6B.3 — Action Tests and Real Local Integration

### Mocked action tests

Coverage includes invalid/extra input before Auth; unauthenticated access; User B Schedule denial without a Session query; empty summary N/A; owner filters; exact counts; 499/500/501/1,000/20,000 row boundaries and over-limit rejection; identical timestamp ordering by ID; 50-ID event chunks; proactive and after-start cancellation; missing/duplicate/contradictory audit; failure at each query stage and on the second Session page; Session/event truncation or unavailable count; cardinality change; repeated IDs; invalid persisted status; ambiguous logical keys; and oversized duplicate audit history.

These pagination-limit/error cases use mocks. They are not claims of seeding 20,000 rows or changing the live PostgREST cap. Audit ordering/count/range calls are exercised; malformed duplicate audit history is rejected on its first page, not accepted as a valid multi-page cancellation history.

### Real Supabase local integration

File: `apps/web/features/learning-schedule/attendance-analytics.integration.test.ts`.

- The opt-in harness refuses a non-loopback endpoint or port other than **55321**. Credentials are obtained from local CLI status at execution time, kept in process environment and never printed or saved. Admin credentials are limited to fixture Auth/profile setup and cleanup; the actual read action and create/reschedule/revise/Task-close operations use the public-key, signed-in owner client.
- Creates two independent test users, profiles and isolated Tasks. Auth uses `createUser` with confirmed fixture emails; no real email sending.
- Owner A creates a three-occurrence future Schedule through `ls_create_schedule`, then reschedules one Session through `ls_reschedule_session`. The same Session ID is returned; projection has **3 eligible planned / 0 due / 0% planned coverage**.
- Owner A invokes `ls_revise_schedule`, revision **1 -> 2**. Database has **6 historical Sessions**, including three cancelled revision-1 Sessions. The rescheduled Session retains its original logical key and null source slot. Projection still has **3 eligible planned**, with no ambiguity/double counting.
- Owner A closes the Task through its authenticated update. Persisted audit totals are **1 rescheduled + 6 cancelled events**, including **3 task_closed cancellations**. Projection returns **0 eligible planned / 0 due**, Attendance and Planned Coverage **null**.
- Owner B receives `notAuthorized` from the real action; a direct RLS-scoped Session query for A's Schedule returns an empty array.
- Teardown signs out and deletes both fixture users; checks **0 remaining Tasks, Schedules, Sessions and Session events** per fixture owner. Cleanup assertions passed.
- Only `requireUser` request-cookie binding is mocked in this integration; Auth, authenticated clients, HTTP/PostgREST, RLS, RPCs, audit triggers and analytics mapping are real. This is not a browser/Next transport E2E run.

## Commands / Quality Gates

Commands run from `apps/web` unless noted. `supabase` below is the installed CLI binary, version **2.122.0**, executed from the repository root or with explicit `--workdir D:\lumivox-proj`.

```powershell
node node_modules/vitest/vitest.mjs run `
  features/learning-schedule/attendance-analytics.test.ts `
  features/learning-schedule/attendance-analytics.queries.actions.test.ts `
  features/learning-schedule/attendance-analytics.integration.test.ts `
  --maxWorkers=2 --reporter=verbose

node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
# Repository root, LOCAL ONLY:
supabase test db --local
```

For the targeted integration run, `LEARNING_SCHEDULE_TEST_URL`, `LEARNING_SCHEDULE_TEST_ANON_KEY`, and `LEARNING_SCHEDULE_TEST_SERVICE_KEY` are injected from CLI local status. The normal full Vitest run omits this opt-in environment; separate targeted execution is the evidence for the two new local integration tests.

| Gate | Actual result |
| --- | --- |
| Targeted analytics core + action + local integration | **PASS**, exit 0; **3 files / 44 tests / 0 skipped**: core 12, action 30, real local integration 2; **5.56s**, started **22:20:47 UTC+07:00** |
| ESLint | **PASS**, exit 0; 0 errors / 1 existing `projection` hook-dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104` |
| Full Vitest | **PASS**, exit 0; **73 files passed / 3 skipped**, **714 tests passed / 22 skipped**, **193.73s**, started **22:16:29 UTC+07:00**. Includes two intentionally opt-in new integration tests skipped here and executed separately above; 20 pre-existing skips remain |
| Standalone TypeScript | **PASS**, exit 0 |
| Next.js production build | **PASS**, exit 0; Next **16.2.6**, compile **20.4s**, TypeScript **33.2s**, **98/98** pages in **1646ms** |
| Database regression | **PASS**, exit 0; **26 files / 516 assertions / 0 failures**, 2 wall-clock seconds; persistent concurrency setup intentionally skipped |
| Migration inventory | **84 SQL files**; no migration added, clean migration replay **NOT EXECUTED** in this read-adapter checkpoint |
| Whitespace / final scope review | **PASS**: `git diff --check`, explicit trailing-whitespace checks for new untracked files, and final six-file scope review; no migration/RPC/config/lockfile diff |

Build uses process-only Supabase local URL/keys; `.env.local` is unchanged. `--ignore-scripts` skips the project's destructive prebuild deletion of `.next/dev`, while still executing the actual Next production build. Existing development cache is retained. The build and full Vitest runners overlapped; durations are not performance benchmarks.

## Failures / Limits / Decision

- An initial standalone typecheck failed with **TS2345** because generated database types represent Session status as `string`. Resolved using a runtime status guard and a narrowed value, with no `any` or unsafe type cast. An unsupported persisted status now has a dedicated fail-closed test.
- The first core+action run passed **41/41** before the additional invalid-status test; the first real integration run passed **2/2** in **1.75s**. Final counts below supersede these intermediate checks.
- Final Vitest version was **4.1.11**. Existing Vite config-loader warnings and Supabase CLI v3/config deprecation notices were informational; no dependency/config upgrade was made. Lint's existing Focus warning is disclosed above.
- **Snapshot consistency is NOT PROVIDED.** Independent PostgREST requests are not one PostgreSQL snapshot. Exact counts, duplicate checks and audit/status consistency checks detect certain concurrent changes, but cannot detect every same-cardinality replacement, timestamp/order change, reschedule, completion or mutation after the last page. Successful output is a best-effort current-state projection, not a historical or atomic asOf snapshot. No controlled concurrent mutation test or SQL read-snapshot function was added.
- `asOf` is captured from the application server after the reads (`source: "application-server"`), without database-clock authority. Exact database grace/recovery cutoff or wall-clock synchronization is not established by these analytics tests.
- Local integration uses real future Sessions and cancellation histories; completed/past percentages and 20,000-row limits are unit/mock coverage, not newly seeded equivalent integration datasets.
- Calendar, Today's Plan UI, UT-032 day grouping, browser E2E, staging/production execution, performance/load tests and remote CI are **NOT EXECUTED** in this checkpoint.
- Final checkpoint decision: **6A core execution and 6B local adapter checks PASS within the explicitly non-snapshot v1 scope**. All requested local gates executed successfully. Phase 06 overall and snapshot-consistent analytics acceptance remain **PENDING**; this evidence does not approve a release. A strict atomic read path requires a separately reviewed read-only database projection/snapshot design before claiming that guarantee.
