# Phase 09 — Focus Integration Evidence

## Step 9A — Study–Focus Attribution Foundation

- **Result: LOCAL PASS**, attribution identity/authorization only. Steps 9B–9D and Phase 08D Tier B remain unexecuted acceptance gates; no production readiness claim.
- **Baseline HEAD:** `b794956553d2c9e0e44015f9b0c76ed1955dd7c9`, branch `feature/learning-schedule-foundation`, clean initially. Executed **2026-11-07**, Asia/Bangkok; results include uncommitted 9A changes. JSON report timestamps are UTC (Nov 6 UTC corresponds to Nov 7 local). No commit/push/deploy or remote DB changes.
- Supabase CLI **2.122.0** generated actual migration **`20261106190648_learning_schedule_focus_attribution.sql`**. Forward-only, no existing migration modified and no Focus-history backfill. Local migration up and final clean replay **PASS: 91 applied migrations** (90 baseline). Reset used `--local --no-seed` only after verifying empty disposable local DB. Docker/Supabase were started locally; credentials were not printed.

### Implemented v1 policy

- Separate `task_study_focus_attributions`, with stable ID, owner, Study/Focus IDs, fixed trusted source `study_session`, creation/update timestamps and an internal Task identity. `UNIQUE(focus_session_id)` guarantees at most one Study occurrence per Focus. Multiple Focus sessions may be explicitly linked to the same Study occurrence.
- Composite foreign keys `(study_session_id,user_id,task_id)` and `(focus_session_id,user_id,task_id)` enforce both ownership and matching Task, including after link creation. Parent unique constraints support those references. An attributed Focus cannot silently be reassigned to a different Task. Focus without a Task is rejected; ordinary Focus creation does not create attribution.
- New links require owned root Task `todo`/`in_progress`, active current schedule revision, Study status `scheduled`/`in_progress`, and Focus status `ongoing`/`paused`. Both Legacy and Pomodoro parents use the same command. No new retrospective links to completed/cancelled Focus or terminal Study sessions. This is a status/identity policy, not an Attendance time-window or launch policy.
- Exact same-pair replay returns the original ID **before** terminal-state eligibility checks, with no timestamp/source change. Thus cancellation/completion/Task close/revision does not invalidate an existing historical pair. Different Study for the same Focus conflicts with **23505**. Wrong owner/Task or inactive new target uses **22023**; unauthenticated command uses **42501**.
- `ls_link_study_focus` derives identity from `auth.uid()`, accepts only two parent IDs, uses empty search path, and is executable by `authenticated` only (PUBLIC/anon/service-role execution revoked). Lock order **Task → Schedule → Study Session → Focus**. Focus row uses **NOWAIT** to avoid an inverse wait with an existing Focus/Task-FK operation; **55P03** means retry the exact pair after the competing transaction finishes.
- Attribution table has RLS and owner-only SELECT; browser direct INSERT/UPDATE/DELETE is not granted. Service role has SELECT only. No unlink/reassignment command was introduced.
- Logical reschedule/revision/cancellation retains parent identities and attribution. Physical parent deletion cascades link cleanup, while existing Focus history follows its existing parent deletion rules. A BEFORE-DELETE Task cleanup removes its attributions before the existing Focus `task_id SET NULL` action, preserving existing hard-delete behavior. This trigger never runs on status changes.
- New `focus-attribution.actions.ts` provides strict authenticated link/read Server Actions, owner-scoped Session existence/history reads, bounded **200 rows + `hasMore`** indicator, safe error classification and timeouts. Unknown mutation outcome is **uncertain**; no retry creates another Focus. These actions have no UI caller yet.
- No timer, Render create/lifecycle endpoint, minutes aggregation, email settings/gates or Attendance command was changed. Attribution writes only its own table; Focus status/minutes changes never complete Attendance through this feature (**BR-021**).

### Executed acceptance

| Case  | Actual result                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FA-01 | **PASS**, matching Task/owner link for Legacy and Focus V2, stable attribution ID.                                                                                                                                                                                        |
| FA-02 | **PASS**, different Task and null Task rejected (**22023**); composite FK also prevents linked Focus Task reassignment (**23503**).                                                                                                                                       |
| FA-03 | **PASS**, both cross-owner directions rejected; direct privileged cross-owner insert violates composite FK (**23503**). Actual authenticated local HTTP owner B link denied (**22023**) and read returns zero rows.                                                       |
| FA-04 | **PASS**, anonymous RPC and private table read denied (**42501**); authenticated direct deletion denied too.                                                                                                                                                              |
| FA-05 | **PASS**, exact retry returns same ID and entire persisted row, including timestamps/source, remains identical. Actual local HTTP replay included.                                                                                                                        |
| FA-06 | **PASS**, same Focus/other valid Study occurrence conflicts (**23505**), exactly one persisted link.                                                                                                                                                                      |
| FA-07 | **PASS**, cancelled and completed Study sessions reject new attribution; terminal Focus cannot receive a new retrospective link.                                                                                                                                          |
| FA-08 | **PASS**, actual `ls_reschedule_session` preserves Session and attribution ID.                                                                                                                                                                                            |
| FA-09 | **PASS**, actual `ls_revise_schedule` cancels prior scheduled occurrences but retains all three prior links/Focus records. Exact historical retry still succeeds, including after Task completion.                                                                        |
| FA-10 | **PASS**, actual V2 cancel and complete lifecycle RPCs leave Attendance unchanged; cancelled V2 keeps persisted interrupted focus seconds, Legacy cancelled effort is not overwritten to zero. Task completion does not turn the old cancelled occurrence into completed. |
| FA-11 | **PASS**, real PostgreSQL concurrency and rollback behavior below.                                                                                                                                                                                                        |
| FA-12 | **PASS**, final clean replay of **91 migrations**, then full DB regression.                                                                                                                                                                                               |

- **pgTAP: 38 new assertions PASS** in `supabase/tests/learning_schedule_focus_attribution.sql`. Includes RLS, FK enforcement, idempotency, actual reschedule/revise/V2 lifecycle integration, terminal-state rejection and physical Task delete compatibility. All fixtures rolled back.
- **Concurrency: 12 case executions**, four orders/scenarios × three repetitions: same-pair replay; conflicting Study IDs; first insert rolled back; Focus row busy then exact retry. **9 blockers observed with `pg_blocking_pids()`** for waiting cases. Busy-Focus cases returned **55P03 in 1–2 ms**, with zero inserted rows, then succeeded after the lock was released; those NOWAIT cases intentionally do not require a wait/blocker.
- Actual SQLSTATEs: successful/replay/rollback replacement **00000**; committed conflicting pair **23505**; busy Focus **55P03**, followed by successful retry **00000**. Every concurrency final state: **one link**, correct Study ID, both Study occurrences still `scheduled`, Focus still `ongoing`. No Attendance mutation.
- **6 authenticated local PostgREST/HTTP checks PASS**: owner link/replay, different Study conflict, cross-owner denial, owner read versus other-user isolation, denied browser mutation and anonymous denial. Local Auth fixture accounts were created/confirmed without email, signed out and deleted afterward. This is direct Supabase HTTP integration, not browser/Render launch E2E.
- Report: [`phase-09-focus-attribution.json`](./phase-09-focus-attribution.json), containing baseline SHA, UTC execution times, observed PIDs, SQLSTATEs, latency, final states, HTTP outcomes and cleanup.
- **16 Server Action unit tests PASS**: strict input/no client owner, auth before DB access, exact RPC parameters, conflict/NOWAIT/uncertain mapping, owner-scoped reads, failure handling and explicit overflow signaling. They mock the Next authentication/client boundary; DB authorization is exercised independently by pgTAP/HTTP.

### Actual effort / double-counting boundary

- **Source reviewed, no 9C projection implemented:** current V2 cancellation sums persisted `focus` segment `actual_seconds` for `completed`/`interrupted` segments and caches floored minutes on the parent. Legacy already stores `actual_focus_minutes`. The V2 cancellation test confirms nonzero persisted effort survives cancellation.
- Future 9C must use one authoritative source per mode, exclude breaks/planned duration and document rounding; parent V2 minutes and child seconds must never be added together. Attribution itself does not compute totals or equate cancelled work with zero effort. No analytics/time-projection PASS is inferred from 9A tests.

### Commands / quality gates

```powershell
# repo root; local-only installed Supabase CLI 2.122.0
supabase migration new learning_schedule_focus_attribution
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
node scripts/test-learning-schedule-focus-attribution.mjs
supabase db advisors --local --type security --fail-on none --output-format json

# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/focus-attribution.actions.test.ts --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

| Gate                       | Actual result                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Final clean replay         | **91 migrations PASS**                                                                                                                |
| Full pgTAP                 | **919 assertions PASS / 33 files** reported; one existing fixture-only concurrency entry intentionally skipped; baseline 881 retained |
| Attribution Server Actions | **16 PASS / 1 file / 5.66s**                                                                                                          |
| Full Vitest                | **1037 PASS / 26 skipped**, **89 files passed / 5 skipped (94)**, **180.69s**, start **02:23:34 UTC+7**, Nov 7                        |
| ESLint                     | **PASS**, zero errors; one existing `use-focus-v2-audio.ts:104` missing-`projection` dependency warning                               |
| TypeScript                 | **PASS**, standalone `--noEmit --incremental false --pretty false` and actual build typecheck                                         |
| Production build           | **PASS**, Next **16.2.6**, compile **14.7s**, TypeScript **25.9s**, **105 pages / 810ms**                                             |
| Generated types            | **PASS**, final local schema with both `public` and `graphql_public`; contents/exit checked before replacing output                   |
| Security advisors          | One pre-existing `public.set_updated_at` mutable-search-path WARN; no new attribution findings                                        |

- Build used local Supabase process env and reminder flags OFF. `.env.local`, timer/Render code and dependencies unchanged; `.next/dev` retained. `--ignore-scripts` skipped prebuild cleanup only; actual `next build` ran.
- **Corrected failure:** initial composite FK implementation obstructed physical Task deletion because existing Focus rows use `SET NULL`. Added narrowly scoped BEFORE-DELETE cleanup in the new migration and an indexed Task lookup, then clean-replayed and reran full pgTAP plus concurrency. Both hard-delete regression assertions now pass; logical cancellation/revision history remains preserved.
- Final local DB read: **91 applied migrations**, **0 users / Tasks / Study Sessions / Focus Sessions / attributions**, Dispatch **OFF**, Missed Sweep **OFF**, **0 reminder Cron**. Fixtures cleaned and Auth sessions signed out. No real email/provider call, staging/production migration or operational configuration change.

### Not executed / next steps

- **NOT EXECUTED:** Study Plan launch UI, Focus timer integration, Next → Render → Supabase create-and-link workflow, partial-create/timeout reconciliation, minutes/analytics projection and browser Focus E2E. These belong to **9B–9D**; 9A introduces no timer button or automatic attribution on ordinary `/focus` starts.
- Read action returns the first bounded page with `hasMore`; it must not be treated as a complete aggregate when true. Full history pagination/effort projection remains later work. No production load/deployment checks are claimed.
- **Phase 08D Tier B remains NOT EXECUTED**, retained as a release gate. No live Resend approval or activation is inferred from continuing Phase 09.
- Primary references checked for constraints/RLS: [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Local execution above, not source review alone, supports Step 9A PASS.

## Step 9B — Launch Focus from Study Plan

- Status **Local PASS**.
- Baseline HEAD `208fcfe6151af6e5a8ee1d6e2d9b63f6f779527e` on `feature/learning-schedule-foundation`. The worktree was clean before implementation.
- Supabase CLI 2.122.0 generated `20261107062738_learning_schedule_focus_launch.sql`. Clean local replay applied **92 migrations**. The prior Focus V2 and Step 9A migrations were reused as applied.
- Next.js authenticates the user and passes that identity through the existing internal-key boundary to FastAPI. The service-role-only RPC checks ownership and derives the Task from the Study Session. It creates the existing V2 parent, plan and segments, then writes attribution and the launch record in one transaction.
- BR-053 and BR-054 in [business-rules.md](./business-rules.md) record the launch window, lifecycle eligibility and replay rules. The window is **[scheduled start − 15 minutes, scheduled end)**. Replay keys are owner-scoped and bind the Study Session plus all seven Pomodoro settings. Physical deletion of the attribution cascades to its launch record.

### PostgreSQL and FastAPI execution

| Case                       | Actual result                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FL-01, FL-02, FL-03, FL-04 | **PASS**. Launch uses the owning Study Session's Task and returns the attributed Focus ID. Cross-owner returns SQLSTATE `PT403` and HTTP 403. FastAPI rejects a supplied `task_id` with 422. A completed Study Session, a launch too early and a launch after scheduled end return `PT422`. An invalid internal key returns 401. |
| FL-05                      | **PASS**. A separate PostgreSQL transaction held the Task close uncommitted. The launch waited, with a blocker observed via `pg_blocking_pids()`. Once Task close committed, the launch returned HTTP 410 and zero Focus rows persisted.                                                                                         |
| FL-06, FL-07, FL-08        | **PASS**. Exact retry returns the same ID. Changed Study ID or Pomodoro settings with the same key returns `PT409`. Three overlapping HTTP requests produced 200/200/423, one original launch, one replay and one persisted launch record. A Task lock wait was observed.                                                        |
| FL-09                      | **PASS**. Injected attribution INSERT failure `P0001` left zero Focus, plan, segment and launch rows. Removing the fault let the same key create Focus successfully.                                                                                                                                                             |
| FL-11, FL-12               | **PASS**. A new key with active Focus returns `PT423`. In a separate ordinary-create race, the Study launch waited on a Task lock while ordinary Focus created successfully with HTTP 200. The Study request then returned 423 and the ordinary Focus had no attribution.                                                        |
| FL-13, FL-16               | **PASS**. An attributed Focus completed through the existing V2 transition RPC and left the Study Session scheduled with zero Attendance events. The FastAPI suite also exercised cancel for both attributed and ordinary Focus.                                                                                                 |

### Browser E2E

- **FL-10 PASS.** Chromium submitted the real Next.js Server Action. A loopback proxy forwarded it to the actual FastAPI route backed by local PostgREST, received HTTP 200 after commit, and withheld the response until the Next.js HTTP client timed out. The UI displayed an uncertain result. Retrying sent the same request ID and configuration, received the original Focus ID with `replay: true`, and opened the existing `/focus` timer. The database had one attribution for that Focus, one active Focus for the owner and a Study Session still marked `scheduled`.
- **FL-14 and FL-15 PASS.** Chromium checked English and Vietnamese planner labels at 390 px, the Today and Calendar entry points, no launch action for a skipped session, and no horizontal overflow. Enter opened the task-bound Pomodoro setup and submitted the form. The submit button was disabled while the HTTP request was pending. A component test also dispatched two submits in the same render and verified that only one request was sent.
- Opening the Study Focus link again with an active Focus displayed the active-session message and existing timer. Final Playwright run **2 passed in 40.8s**, covering one FastAPI/PostgreSQL integration case and one Chromium E2E case.

### Commands and quality gates

```powershell
# Repo root, disposable Supabase local
supabase migration new learning_schedule_focus_launch
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
supabase db advisors --local --type security --fail-on none --output-format json

# services/ai-api, with local SUPABASE_URL, SUPABASE_SECRET_KEY, AI_INTERNAL_API_KEY
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8096 --lifespan off

# apps/web, with local Supabase and Focus V2 creation enabled
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3119
node node_modules/@playwright/test/cli.js test tests/study-focus-launch.spec.ts --reporter=list
```

For Playwright, use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3119`, `STUDY_FOCUS_TEST_BACKEND=http://127.0.0.1:8096`, `STUDY_FOCUS_TEST_PROXY_PORT=8097`, the local `LEARNING_SCHEDULE_TEST_URL` and `LEARNING_SCHEDULE_TEST_SERVICE_KEY`, and the same test-only `AI_INTERNAL_API_KEY` as both servers. Configure Next.js with `AI_API_BASE_URL=http://127.0.0.1:8097` for the response-loss fixture. Build skipped the npm prebuild cleanup and ran the actual Next.js build.

| Gate                           | Actual result                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean migration replay / types | **PASS**, 92 applied migrations and regenerated local TypeScript types                                                                                                     |
| Full pgTAP                     | **PASS**, 948 assertions across 34 entries, including 29 new Step 9B assertions. Existing fixture-only concurrency entry intentionally skipped.                            |
| FastAPI Focus V2 regression    | **PASS**, 8 tests                                                                                                                                                          |
| Full Vitest                    | **PASS**, 1038 passed / 26 skipped, 89 files passed / 5 skipped, 201.37s                                                                                                   |
| Lint                           | **PASS**, zero errors and one existing missing-`projection` dependency warning in `use-focus-v2-audio.ts`                                                                  |
| TypeScript                     | **PASS**, standalone typecheck and Next.js build typecheck                                                                                                                 |
| Production build               | **PASS**, Next.js 16.2.6, compiled in 14.1s, generated 105 pages                                                                                                           |
| Security advisors              | Existing `public.set_updated_at` mutable search-path warning. No new findings. [Supabase Data API access controls](https://supabase.com/docs/guides/api/securing-your-api) |

The initial standalone typecheck found an untyped Playwright Supabase client. Typing it with the generated `Database` fixed the fixture inserts. Standalone TypeScript and the production build typecheck passed afterward.

Final database read showed **92 applied migrations** and **zero** Auth users, Tasks, Study Sessions, Focus Sessions, attributions and launch records. Dispatch and Missed Sweep were **OFF**, with **zero** reminder Cron jobs. The local Next.js and FastAPI test servers were stopped after the run.

### Limits

- **NOT EXECUTED:** clock-controlled assertions at the exact launch-window endpoints, multi-browser retry after tab storage is cleared, and remote Render deployment checks.
- Phase 09C actual study time, Phase 09D integration acceptance, and Phase 08D Tier B remain separate.

## Step 9C — Actual Study Time Projection

- Status **Local PASS**.
- Baseline HEAD `4289ed27291a551fcf464d99fc31c5d8975e54dd` on `feature/learning-schedule-foundation`. The worktree was clean before implementation. The read projection uses the existing 92-migration schema and RLS policies.
- Legacy effort uses `focus_sessions.actual_focus_minutes × 60`. Pomodoro effort uses persisted `actual_seconds` from Focus segments, including interrupted segments and any saved time on active segments. Breaks and unstarted segments contribute zero. The pure model sums seconds across attributed Focus sessions before deriving whole minutes with `floor(totalSeconds / 60)`.
- Today and Calendar share one deduplicated batch. Each row displays Recorded Focus and can expand to show planned duration and an active Focus notice. Planned duration uses the persisted start/end instants. Attendance Rate, On-Time Rate and Planned Coverage keep their existing formulas. Revision retains the old Study ID and its recorded effort. The replacement starts with its own attribution history.
- The authenticated action first checks Study ownership. It then reads links with exact counts, stable ID ordering and 200-row pages. Parent queries embed the plan and segments so each parent and its children share a query snapshot. Expected segment positions and the plan's round count detect missing children. The action checks owner/Task/IDs and re-reads attribution membership before returning.
- Caps are 2,000 requested Study IDs and 4,000 links per batch, with up to 60 IDs per filter and a 15-second database read budget. Short pages, changed links and missing or conflicting records yield `incompleteData`. Database failures yield `loadFailed`. The planner shows effort unavailable while retaining the Attendance metrics. [Supabase range reference](https://supabase.com/docs/reference/javascript/range)
- `asOf` is application-server read completion time. Each PostgREST call has its own snapshot, so a batch can include Focus records read at different instants. Recorded Focus describes persisted data, with no client-clock extrapolation.

### Acceptance matrix

| Case        | Executed coverage                                                                                                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FE-01–FE-02 | Unit and local browser verify complete zero without attribution and seven persisted Legacy minutes.                                                                                                                                                                          |
| FE-03–FE-07 | Unit and real `focus_v2_create_session` / `focus_v2_transition` RPCs cover completed Focus rounds, a completed break, interrupted Focus, a pending round and aggregation across multiple attributed Focus sessions.                                                          |
| FE-08–FE-09 | Pure model rejects duplicate Focus IDs within one Study or across two Studies.                                                                                                                                                                                               |
| FE-10       | Local authenticated PostgREST queries from another owner return no Study, attribution or Focus parent/child records.                                                                                                                                                         |
| FE-11–FE-13 | Unit tests cover missing parent/segment, owner/Task mismatch, changing links, a short page and the cap. The browser suite also reads 201 links from local PostgREST and injects one missing segment to verify the unavailable state while Attendance remains visible.        |
| FE-14–FE-16 | Real reschedule keeps the original Study ID and effort. Real revision preserves effort on the cancelled occurrence and leaves the replacement at zero before adding its own fixtures. Focus complete/cancel leaves the original Study scheduled with zero Attendance events. |
| FE-17       | Chromium uses EN/VI at 390 px and keyboard expansion of the planned duration.                                                                                                                                                                                                |
| FE-18       | Full pgTAP and Vitest plus FastAPI Focus V2 regression and the local Chromium integration run.                                                                                                                                                                               |

### Commands and results

```powershell
# repo root
supabase test db --local

# apps/web, local Supabase process environment
node node_modules/vitest/vitest.mjs run features/learning-schedule/study-focus-effort.test.ts features/learning-schedule/study-focus-effort.queries.actions.test.ts features/learning-schedule/components/study-plan-content.test.tsx --maxWorkers=2 --reporter=dot
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3119
node node_modules/@playwright/test/cli.js test tests/study-focus-effort.spec.ts --reporter=list

# services/ai-api, local Supabase process environment
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
```

For Playwright, set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3119` and provide the verified loopback `LEARNING_SCHEDULE_TEST_URL`, `LEARNING_SCHEDULE_TEST_ANON_KEY` and `LEARNING_SCHEDULE_TEST_SERVICE_KEY`. The harness requires an empty disposable local database and checks both operational gates before inserting fixtures.

| Gate                        | Actual result                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted Vitest             | **PASS**, 24 tests in 3 files                                                                                                                                                                                     |
| Full Vitest                 | **PASS**, 1,057 passed / 26 skipped, 91 files passed / 5 skipped, 216.85s                                                                                                                                         |
| Full pgTAP                  | **PASS**, 948 assertions across 34 entries, including one existing fixture-only skip                                                                                                                              |
| FastAPI Focus V2 regression | **PASS**, 8 tests                                                                                                                                                                                                 |
| Playwright Chromium         | **PASS**, 1 end-to-end scenario, 8.3s total. Recorded Focus displayed 18 minutes from 1,111 persisted seconds (420 Legacy + 600 completed Pomodoro + 91 interrupted). The 60-second completed break was excluded. |
| ESLint                      | **PASS**, zero errors and one existing missing-`projection` dependency warning                                                                                                                                    |
| TypeScript                  | **PASS**, standalone typecheck and Next.js build typecheck                                                                                                                                                        |
| Production build            | **PASS**, Next.js 16.2.6, 105 pages. Actual `next build` ran with npm prebuild cleanup skipped.                                                                                                                   |

The first Chromium run reached the missing-segment UI, then failed because the test looked for “Attendance Rate” while the page renders “Attendance”. The locator was corrected to match the existing label.

Final database read showed **92 applied migrations**, zero fixture users, Tasks, Study Sessions, Focus Sessions and attributions. Dispatch and Missed Sweep were **OFF**, with zero reminder Cron jobs. The Next.js test server was stopped after the run.

### Limits

- Step 9C added no migration, so clean replay was not rerun. Full pgTAP ran against the local schema.
- Cross-request snapshot guarantees, production-scale latency and Phase 09D end-to-end acceptance were not tested. Phase 08D Tier B remains a separate release gate.

## Step 9D — Full Learning Journey and Integration Acceptance

- Status **Local PASS**.
- Baseline HEAD `9ad106153507ee8b064939630e6761b2fcef2e8c` on `feature/learning-schedule-foundation`. The worktree was clean before implementation. Test-only changes use the existing 92-migration schema.
- Chromium runs against the production Next.js build, with the existing internal auth boundary to local FastAPI and local Supabase. A loopback proxy forwards real requests and can withhold the upstream response after commit. Each suite requires a disposable local database and checks Dispatch and Missed Sweep before writing fixtures.
- Exact launch cutoffs run against the installed RPC definition inside the rollback-only pgTAP transaction. The test replaces just the eligibility clock expression with a transaction-local timestamp. It neither waits for a wall-clock cutoff nor persists a clock override. `pg_get_functiondef()` reconstructs the installed definition used by the test. [PostgreSQL system information functions](https://www.postgresql.org/docs/current/functions-info.html)

### Acceptance matrix

| Cases          | Actual result                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E-01–E2E-02  | **PASS**. Browser created a Task and Schedule, opened Pomodoro setup from Today, and launched through the real Next.js → FastAPI → Supabase path. Database assertions verified Task/Study IDs, launch record, plan and segments. After the first Focus completed, Study remained `scheduled` with zero Attendance events.                                              |
| E2E-03–E2E-06  | **PASS**. Browser completed a two-round Focus with a break, cancelled a second Focus during a round, and completed a third. The persisted sum was **991 Focus seconds**, including **91 interrupted seconds**, plus **60 excluded break seconds**. Study Plan showed **16 minutes** after manual completion, with three attributed Focus IDs and one Attendance event. |
| E2E-07–E2E-08  | **PASS**. Real reschedule preserved the Study ID and effort. Real revision kept 18 recorded minutes on the cancelled historical occurrence and initially displayed zero on the replacement.                                                                                                                                                                            |
| E2E-09         | **PASS**. Task completion while Focus was active closed the schedule. Focus remained `ongoing` and linked to the still-`scheduled` Study occurrence whose scheduled start had passed. That occurrence had no Attendance events. The future occurrence became `cancelled` with reason `task_closed` and one cancellation audit.                                         |
| E2E-10–E2E-11  | **PASS**. Cross-owner launch returned HTTP 403. The other owner could not read Study, attribution or Focus records through PostgREST. Ordinary Legacy creation through the authenticated Focus insert boundary and ordinary V2 creation produced no attribution.                                                                                                       |
| E2E-12, E2E-17 | **PASS**. The proxy withheld the response after FastAPI returned HTTP 200. Next.js timed out and the browser showed uncertainty. A new browser context with no saved request key reached the existing active timer without issuing a launch. Retry in the original tab sent the identical payload and got the original Focus ID with `replay: true`.                   |
| E2E-13–E2E-15  | **PASS**. Exact opening created Focus. One millisecond early and exact scheduled end both returned SQLSTATE `PT422`. The same key succeeded at opening after both denied attempts.                                                                                                                                                                                     |
| E2E-16         | **PASS**. Two independently authenticated Chromium contexts submitted Start from setup. One opened the timer and the other received the active Focus conflict. Database verified one active Focus, one launch record and one attribution for the winner.                                                                                                               |
| E2E-18         | **PASS**. A separate database connection held the Study row. The browser submitted manual Attendance, and `pg_blocking_pids()` confirmed it waited on that connection. Focus completed through its existing browser timer while Study remained scheduled and event count stayed zero. After release, Study became completed with one manual `completed` event.         |

The combined run exercised four lock-wait scenarios with a blocker observed in each. The Task-close launch race returned HTTP 410. The concurrent launch/replay group returned 200/200/423. The ordinary-versus-attributed creation race returned 200/423. The Attendance-versus-Focus case verified both commits from persisted state. Browser actions report HTTP/UI outcomes and do not expose raw SQLSTATEs.

Chromium covered EN/VI at **390 px**, tablet at **768 px**, keyboard launch and detail expansion, pending/uncertain/retry states and saved effort while the timer is active. The Calendar kept the UTC local date and times for a session whose instants corresponded to the next day in the browser's Pacific/Kiritimati timezone. Deleting a fixture segment made Recorded Focus unavailable while leaving Attendance visible.

### Commands and quality gates

```powershell
# Repo root, verified Supabase local
supabase status -o json
supabase test db --local

# services/ai-api, verified local Supabase and test-only internal key
.venv/Scripts/python.exe -m pytest -q tests/api/test_focus_v2_routes.py tests/unit/test_focus_v2_service.py
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8096 --lifespan off

# apps/web, verified local Supabase, Focus V2 creation enabled and real send disabled
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3119
node node_modules/@playwright/test/cli.js test tests/study-focus-launch.spec.ts tests/study-focus-effort.spec.ts tests/study-learning-journey.spec.ts --project=chromium --workers=1 --reporter=line
```

The Playwright suites use the local `LEARNING_SCHEDULE_TEST_URL`, `LEARNING_SCHEDULE_TEST_ANON_KEY` and `LEARNING_SCHEDULE_TEST_SERVICE_KEY`. Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3119`, `STUDY_FOCUS_TEST_BACKEND=http://127.0.0.1:8096`, `STUDY_FOCUS_TEST_PROXY_PORT=8097` and the same test-only `AI_INTERNAL_API_KEY` as both servers. Next.js uses `AI_API_BASE_URL=http://127.0.0.1:8097`.

| Gate                         | Actual result                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Schema                       | 92 migrations. No migration or generated types change for 9D.                                                                 |
| Full pgTAP                   | **PASS**, 951 assertions across 34 entries, including three new exact-window assertions. Existing fixture-only entry skipped. |
| Full Vitest                  | **PASS**, 1,057 passed / 26 skipped, 91 files passed / 5 skipped, 195.63s                                                     |
| FastAPI Focus V2 regression  | **PASS**, 8 tests                                                                                                             |
| ESLint                       | **PASS**, zero errors, existing missing-`projection` dependency warning                                                       |
| TypeScript                   | **PASS**, standalone and build typecheck                                                                                      |
| Next.js production build     | **PASS**, 16.2.6, compiled in 17.5s. The npm prebuild cleanup was skipped.                                                    |
| Combined Playwright Chromium | **PASS**, 5 tests, 1.2 minutes                                                                                                |

The initial browser attempts timed out while locating the new Task in a goal-filtered board and while looking for a standard dialog for the destructive Focus confirmation. The harness now verifies the Task insert and reopens the all-Tasks board, and locates the confirmation by its actual `alertdialog` role. The full combined suite passed afterward.

Final local database read verified 92 applied migrations, zero fixture users, Tasks, Study Sessions, Focus sessions, attributions, launch records and Attendance events. The installed RPC used `clock_timestamp()` again and contained no test clock override. Dispatch and Missed Sweep remained **OFF**, with zero reminder Cron jobs. Both local test servers were stopped.

### Scope limits

- Exact cutoffs use a deterministic database test clock. Browser and HTTP cases use the real local clock with fixture segment start times advanced by backdating the persisted start only.
- Production-scale performance, shared snapshot guarantees for effort reads, remote Render deployment and Phase 08D Tier B live email remain outside this local acceptance.
