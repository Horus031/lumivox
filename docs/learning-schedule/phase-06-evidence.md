# Phase 06 — Analytics & Read Projections Evidence

## Baseline / Scope

- Verification date: **2026-11-02**, Asia/Bangkok (UTC+07:00).
- Branch: `feature/learning-schedule-foundation`.
- Baseline HEAD: **`3c9fce433b1aa17ecb15959364dfd5780579512b`**. Results below include the uncommitted working-tree changes reviewed and completed in this run; they are not execution claims for the baseline commit alone.
- Input: user-supplied “Verify Phase 06A và chuyển sang Phase 06B” guide. Initial working tree already contained six extra core tests and draft read-action/test files. The draft action test repeated core tests instead of exercising the action; it was replaced with action-specific coverage.
- Scope: per-Schedule, owner-scoped, full-history read projection; missing 6A edge cases; local integration and web/database regression. No new migration, Attendance RPC change, write grant, Calendar/Today's Plan UI, commit, push or deployment.

## Step 6A — Analytics Core Edge Cases

| Check                          | Execution / result                                                                |
| ------------------------------ | --------------------------------------------------------------------------------- |
| UT-027 zero due denominator    | Unit test: null Attendance/On-time, future Planned Coverage remains 0             |
| UT-028 8/12 due, 5 on-time     | Unit test: correct rates and counts                                               |
| UT-029 late completion         | Unit test: counts completion, excludes on-time credit                             |
| UT-030 future obligation       | Unit test: included in planned, excluded from due                                 |
| UT-031 proactive cancellation  | Unit test: excluded using authoritative cancellation audit time                   |
| Grace equality                 | Unit test: end + 60 elapsed minutes equals asOf is due                            |
| Completion after asOf          | Unit test: no due or planned completion credit                                    |
| Cancellation after start       | Unit test: remains eligible                                                       |
| Missing cancellation audit     | Unit test: throws; no guessed updated_at timestamp                                |
| Ambiguous logical identity     | Unit test: rejects two eligible candidates                                        |
| Proactive replacement identity | Unit test: excludes proactive historical candidate before coalescing              |
| Persisted Scheduled past grace | Unit test: counts due without rewriting/inventing persisted Missed status         |
| UT-032 local-day grouping      | **NOT EXECUTED / deferred to Calendar projection**; summary does not group by day |

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

| Gate                                                 | Actual result                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted analytics core + action + local integration | **PASS**, exit 0; **3 files / 44 tests / 0 skipped**: core 12, action 30, real local integration 2; **5.56s**, started **22:20:47 UTC+07:00**                                                                                                                       |
| ESLint                                               | **PASS**, exit 0; 0 errors / 1 existing `projection` hook-dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104`                                                                                                                                 |
| Full Vitest                                          | **PASS**, exit 0; **73 files passed / 3 skipped**, **714 tests passed / 22 skipped**, **193.73s**, started **22:16:29 UTC+07:00**. Includes two intentionally opt-in new integration tests skipped here and executed separately above; 20 pre-existing skips remain |
| Standalone TypeScript                                | **PASS**, exit 0                                                                                                                                                                                                                                                    |
| Next.js production build                             | **PASS**, exit 0; Next **16.2.6**, compile **20.4s**, TypeScript **33.2s**, **98/98** pages in **1646ms**                                                                                                                                                           |
| Database regression                                  | **PASS**, exit 0; **26 files / 516 assertions / 0 failures**, 2 wall-clock seconds; persistent concurrency setup intentionally skipped                                                                                                                              |
| Migration inventory                                  | **84 SQL files**; no migration added, clean migration replay **NOT EXECUTED** in this read-adapter checkpoint                                                                                                                                                       |
| Whitespace / final scope review                      | **PASS**: `git diff --check`, explicit trailing-whitespace checks for new untracked files, and final six-file scope review; no migration/RPC/config/lockfile diff                                                                                                   |

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

## Step 6C — Study Calendar & Today's Plan

**Baseline:** `6d66a6a33fca0472bb63ba22523994e7b67c146b`, branch `feature/learning-schedule-foundation`; clean working tree before implementation. Executed **2026-11-03**, Asia/Bangkok. Results cover this baseline plus the uncommitted changes. No commit/push, remote database access, deployment or new migration.

### Implementation / scope

- Added protected `/[locale]/study-plan`, existing PageHeader/Card/Badge/Link primitives, full EN/VI catalogs, loading/empty/error states, Calendar and Today's Plan components and three whole-history KPI cards. Added Study Planner to navigation and the Supabase proxy protected-path registry. The four existing mobile primary destinations remain Dashboard / Workspace / Roadmaps / Focus; Study Planner is accessible in More.
- Pure projection uses Temporal for each Session's own IANA-local Today predicate. Calendar groups by persisted `local_date`, retains cancellation history and orders by actual UTC instant then Session ID. The browsing month defaults to UTC on the server; it is never reused as the business-day predicate.
- New read action validates a strict `month` input, accepts no browser-supplied userId, calls `requireUser()` and owner-scopes every Session, Task-title and audit query. Reads full owner history on the server (500-row pages, 20,000-row bound), including old revisions. This avoids an unproven UTC envelope and supports whole-history KPI calculation.
- Exact counts, stable ordering, changing counts, duplicate IDs, missing Task titles, invalid statuses/timezones, audit absence/duplicates/truncation/status contradictions and ambiguous logical obligations fail closed. Task titles and audits use 50-ID chunks. A maximum of **2,000 returned Session entries across month and Today** bounds serialized output; excess returns `incompleteData`, without partial totals. The client never receives the full 20,000-obligation analytics input.
- KPI counts use the same deduplicated obligations across Schedules, not average percentages. Weighted **1/1 + 5/10 = 6/11** is action-tested. Scope text explicitly identifies whole-history/current-state metrics; changing the calendar month does not redefine their denominator.
- All Session rows display Task title, saved local date/time, IANA timezone and a textual status. Month navigation uses named links; day indicators expose counts and text statuses, not color alone. Task links use existing `/workspace?task=<id>` routing; real E2E opens the correct Task drawer.
- Best-effort independent PostgREST reads and application-server `asOf` remain the accepted v1 contract from 6B. **No shared PostgreSQL snapshot or historical analytics guarantee is claimed.** No Attendance/Task status is mutated by this feature's read path.

### Execution evidence

| Layer / case              | Actual evidence                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure projection           | **15 tests**: UT-032 with coherent Tokyo/New York UTC fixtures, cancelled history, all status handling, invalid/empty months, year rollover, DST spring/fall, actual-instant ordering, cross-Task ID ties and non-mutating input                                                                                       |
| Mocked read action        | **28 tests**: strict/auth input, 501-row pagination and owner predicates across tables, count/truncation/query failures, Task-title isolation, audit integrity, cross-timezone Today independent of month, weighted aggregate KPI, row/output caps and malformed/ambiguous data                                        |
| EN/VI components          | **6 tests**: matching catalogs, N/A/empty states, dates/times/zones, six textual statuses, Task links, table headers and accessible December–January links. Weekdays are asserted against catalog labels                                                                                                               |
| Navigation regression     | **3 tests**: nine desktop destinations, Study Planner accessible in mobile More, original four primary destinations retained, active/nested routes and sidebar behavior                                                                                                                                                |
| Targeted combined         | **52/52 PASS**, 4 files, **8.82s** before the final weekday hydration fix; final full-suite execution below includes the updated catalog-label assertion                                                                                                                                                               |
| Real browser + database   | `tests/study-plan.spec.ts`, Chromium, one worker, Europe/London browser timezone; **3/3 PASS / 0 skipped** on the final production build, **13.5s**, zero Planner console/page errors                                                                                                                                  |
| SP-01                     | Owner A's two Tasks have actual persisted Completed/Skipped Sessions in **Pacific/Kiritimati** and **Etc/GMT+12**. These zones differ by 26 hours, so Today has two different local dates at the same instant. Authenticated server reads show both, with correct status/time/zone; Task link opens matching drawer    |
| SP-02                     | Authenticated `ls_create_schedule` and `ls_revise_schedule` produce revision 2, **4 historical Sessions / 2 cancellation audits** across December 2030 and January 2031. Calendar shows Cancelled and Scheduled for the correct persisted days. Keyboard Enter on Next and Previous navigation cross the year boundary |
| SP-03                     | EN/VI mobile **390×844**, no horizontal document overflow, real screenshots, empty month, localized invalid-input alert and anonymous redirect to login                                                                                                                                                                |
| Owner isolation / cleanup | Separate owner B has its own Task/Schedule/Session. It is absent from A's Today and Calendar. Both fixture users are deleted; teardown asserts 0 owner Tasks, Schedules, Sessions and events. Sweep processing gate checked **OFF** before and after                                                                   |

The Completed/Skipped states are isolated fixture inserts by the local-only test administrator, not new browser attendance-transition coverage. Generation/revision and cancellation audits are real authenticated RPC/trigger executions. No Auth/DB/action responses are mocked in Playwright. Pure/mock tests cover row limits; no 20,000-row live fixture or load benchmark was run.

Artifacts: [browser report](./phase-06-study-plan-browser.json), [English mobile](./evidence/step-6c/planner-en-mobile.png), [Vietnamese mobile](./evidence/step-6c/planner-vi-mobile.png). The JSON records baseline, fixture IDs/dates/zones, per-case results and cleanup; no credentials.

### Quality gates / commands

From `apps/web`:

```powershell
node node_modules/vitest/vitest.mjs run features/app-shell/components/app-shell-navigation.test.tsx features/learning-schedule/study-plan-projection.test.ts features/learning-schedule/study-plan.queries.actions.test.ts features/learning-schedule/components/study-plan.test.tsx --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
node node_modules/@playwright/test/cli.js test tests/study-plan.spec.ts --project=chromium --workers=1 --reporter=line --output=test-results/study-plan
# Repository root:
supabase test db --local
```

| Gate                                | Actual result                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                              | **PASS**, exit 0; 0 errors / 1 existing Focus `projection` hook-dependency warning                                                                                                                     |
| Standalone TypeScript               | **PASS**, exit 0                                                                                                                                                                                       |
| Full Vitest (final)                 | **PASS**, exit 0; **763 passed / 22 skipped**, **76 files passed / 3 skipped**, **179.00s**, started **12:21:13 UTC+07:00**, after the weekday hydration fix. Opt-in integration skips remain explicit |
| Next production build (final)       | **PASS**, exit 0; Next **16.2.6**, compile **15.2s**, TypeScript **33.7s**, **100/100** pages in **1212ms**; `/[locale]/study-plan` is dynamic                                                         |
| Playwright production build (final) | **PASS**, exit 0; **3/3**, **13.5s** against `next start` on port 3100; report interval **2026-11-03T05:23:36.465Z–05:23:48.225Z**                                                                     |
| pgTAP local regression              | **PASS**, exit 0; **26 files / 516 assertions / 0 failures**, 6 wall-clock seconds. Persistent concurrency fixture setup intentionally skipped                                                         |
| Migration replay                    | **NOT EXECUTED**; no new SQL/migration or schema changes in 6C                                                                                                                                         |

Local test credentials are injected from CLI status into process environment only; `.env.local` is unchanged. Browser testing uses isolated port 3100. The temporary dev cache/helper was removed and tsconfig restored. Build skips only prebuild to retain `.next/dev`; actual `next build` runs. Some test/build runners overlapped, so elapsed times are not performance measurements.

### Failures found and resolved / limits

1. Initial mocked Today fixture had an end instant preceding its new start instant; analytics correctly failed closed. Corrected the fixture's end, preserving interval validation.
2. Initial browser Task navigation assertion timed out at 5 seconds during cold compilation. Now awaits the actual Workspace URL and drawer readiness with a bounded 30-second assertion. A separate error selector was scoped to `main` to avoid matching Next's route announcer.
3. Real anonymous navigation initially showed the application error boundary because the new route was absent from `PROTECTED_PATH_PREFIXES`. Added `/study-plan` to the existing auth proxy registry. No data leak occurred; server Auth and owner-scoped reads still rejected unauthenticated data access.
4. Full regression initially had two app-shell expectation failures for the added navigation entry. Updated the nine-link/More expectations and preserved the original four mobile primary destinations.
5. Additional production-browser console assertions caught **React hydration error #418** in VI after an earlier visual-only browser run passed. Direct comparison proved Node's weekday abbreviations (`Th 2`) differ from Chromium's (`Thứ 2`). Calendar now uses shared EN/VI catalog weekdays, with no hydration suppression. Final browser run must have zero Planner console/page errors before PASS; afterEach failures are recorded as failures in the report.

**Limits:** no shared snapshot, deterministic live clock/DST mutation, cross-browser matrix beyond Chromium, large-history performance test, staging/production execution, loadFailed/incompleteData UI fault injection or full Phase 06 acceptance. Those action failures are mocked and localized in source; invalid input is exercised through the browser. Loading UI is source-checked, not a timing-based browser acceptance claim. 6D remains next; commit/push and release actions remain with the user.

**Final controls:** final report has three passed cases, fixture cleanup **PASS**, Sweep gate **false**; source inventory remains **84 migrations**. Owned dev/production test servers stopped, temporary dev cache/helper removed, `.next/dev` retained, `tsconfig.json` has zero diff. `git diff --check` and explicit whitespace checks on untracked text files passed. No dependency/lockfile/schema/RPC/Attendance mutation change.

**Decision: Step 6C Local PASS** for projection, owner-scoped read action and real Chromium UI within the accepted best-effort v1 contract. Phase 06 overall acceptance remains **PENDING** for 6D; no release approval. The user will commit/push.

## Step 6D — Final Integration

**Baseline:** `1deebfd84f1afc2b165ee0e0ee864fcab20cb20e`, clean `feature/learning-schedule-foundation` before this run; **2026-11-03**, Asia/Bangkok. Results cover the baseline plus uncommitted 6D changes. No new migration or data-layer rewrite. Added the EN/VI reload explanation; extracted the existing server content renderer into `study-plan-content.tsx` to test its real failure UI with a mocked action boundary.

| Acceptance case            | Actual execution / outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SP-04 Recovery → analytics | **Real browser PASS**: one two-local-days-old Missed obligation; Attendance **0/1 → 1/1**, On-time **0/1 → 0/1**, Coverage **0/1 → 1/1**. Real Recover UI and confirmation, then real navigation back to Planner. Database: Completed, non-null completed_at, exactly **1 recovered event**, parent Task **todo**, actual_study_minutes **null**; Calendar shows Completed on the original date                                                                                                                                                                                  |
| SP-05 Skip                 | **Real browser PASS**: Scheduled → Skipped through UI, exactly **1 skipped event**, no completion/time credit. This fixture is before end + 60m, so due counts remain **0/0 (N/A)** and planned coverage remains **0/1**. Calendar and Today show Skipped                                                                                                                                                                                                                                                                                                                        |
| SP-06 Task closure         | **Real browser + authenticated Task update PASS**: before planned **0/2**, after **0/0 (N/A)**; **2 future Sessions cancelled + 2 cancellation audits**, retained on Calendar, removed from Today. No completion event or actual study minutes. Owner client closes the Task through the existing transactional trigger; no service-role Session update after the command                                                                                                                                                                                                        |
| SP-07 Query failure        | **2 component tests PASS (EN/VI)**, mocked action `loadFailed`, real content renderer displays localized error/retry and no KPI/Calendar. Existing action tests separately exercise underlying read-query errors                                                                                                                                                                                                                                                                                                                                                                 |
| SP-08 Incomplete data      | **2 component tests PASS (EN/VI)**, mocked action `incompleteData`, no partial views. Existing action tests exercise missing/duplicate cancellation audit and page truncation                                                                                                                                                                                                                                                                                                                                                                                                    |
| SP-09 Interleaved read     | **Real local integration PASS**: authenticated RPC creates **730 Sessions**. Fetch wrapper waits for page 1's real HTTP response (**500 Scheduled rows**), commits a real authenticated Task-close, then releases that response and reads page 2 (**230 Cancelled rows**). All **730 cancellation audits** exist; mixed status/audit projection returns exactly **incompleteData**, without partial results. Fresh read succeeds with planned denominator **0** and **62** retained January history rows. Only request-cookie binding is mocked; HTTP/RLS/data/mutation are real |
| SP-10 Owner isolation      | **Real browser PASS**: simultaneous A/B Auth contexts open Planner; each sees only its own Task/Session, reciprocal titles absent across Today/Calendar and planned denominator **1** per owner                                                                                                                                                                                                                                                                                                                                                                                  |
| SP-11 No schedules         | **Real browser + component PASS**: owner A's isolated fixtures cleaned to zero Schedules; three N/A KPIs, both empty states, valid month links, no error                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Browser artifacts:** [Phase 06 report](./phase-06-study-plan-browser.json) now has **8 passed / 0 skipped** browser cases (SP-01–06, SP-10–11), **51.6s**, report interval **2026-11-03T06:12:28Z–06:13:18Z**, with actual KPI strings/persisted mutation outcomes and successful cleanup. SP-07/08/09 are deliberately documented at their component/integration layers, not counted as browser cases. [Attendance regression report](./phase-05-attendance-browser.json) was refreshed at the same HEAD with **7 passed**, including exact retry, stale update, keyboard/focus, mobile and cross-owner HTTP denial. The separate Schedule suite adds **10 passed**; combined regression command **17/17**, **1.2m**. Study Planner EN/VI mobile screenshots were refreshed for the reload explanation.

### Final gates (run sequentially as requested)

- Initial targeted component run: **5/5 PASS**, 4.53s. Opt-in local integration run: **22/22 PASS / 0 skipped**, 3 files, **13.64s** (19 Schedule Server Action tests, 2 analytics integration tests, 1 new interleaved-read test). Credentials were injected from local CLI status, never saved/printed. A skipped test is not counted as a pass.
- Browser sequence: `study-plan.spec.ts` → combined `learning-schedule-attendance.spec.ts learning-schedule.spec.ts`, Chromium / one worker / local port 3100. **25/25 browser cases PASS**, no Planner console/page errors. Fixture setup uses admin only for seeding/cleanup; commands under test use UI or authenticated owner clients.
- Then `node node_modules/eslint/bin/eslint.js .`: **PASS**, exit 0, 0 errors / 1 existing Focus `projection` hook-dependency warning.
- Then `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot`: **PASS**, exit 0; **77 files passed / 4 skipped**, **768 tests passed / 23 skipped**, **144.85s**, started **13:20:38 UTC+07:00**. The 22 Learning Schedule opt-in tests were separately executed above; the remaining default skip is not claimed as PASS.
- Then `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: **PASS**, exit 0.
- Then `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build`: **PASS**, exit 0; compile **13.3s**, TypeScript **22.9s**, **100/100** pages in **928ms**. **Prebuild NOT EXECUTED** to preserve `.next/dev`; actual Next **16.2.6** production build completed with process-only local Supabase configuration. `.env.local` unchanged.
- Then repository-root `supabase test db --local`: **PASS**, exit 0; **26 files / 516 assertions / 0 failures**, **2 wall-clock seconds**. Persistent concurrency fixture setup is intentionally skipped; it is not counted as new independent-connection coverage.
- Final read-only local verification: **Sweep gate false / 84 applied migrations / 0 matching Auth fixture users**. Per-suite teardown also asserts zero owned Tasks/Schedules/Sessions/events. Owned server/cache/helper removed, tsconfig restored with zero diff, `.next/dev` retained. `git diff --check` and explicit whitespace checks on new text files **PASS**; no remote query/deploy, schema/RPC/permission or dependency changes.

### Phase 06 acceptance checklist

- [x] UT-027–032 and analytics formulas verified.
- [x] Owner-scoped reads and multi-Schedule projections verified.
- [x] Calendar/Today use stored local dates and per-Session IANA timezones.
- [x] Real Attendance mutation updates Planner KPI counts.
- [x] Skip/Recovery/Task-close preserve the correct denominators without double counting.
- [x] Failure/empty UI, EN/VI and mobile verified at the documented layers.
- [x] Browser suites and all final quality gates passed.
- [x] Cross-owner isolation verified with simultaneous Auth contexts.
- [x] Best-effort read limitation explicitly accepted, not mislabeled snapshot consistency.
- [x] Final Sweep OFF / no remote deployment controls confirmed.

**Limits retained:** independent PostgREST reads plus application-server asOf do **not** form an atomic or historical snapshot. SP-09 characterizes one detectable interleave; it does not guarantee detection of all same-cardinality replacements, reschedules, completions or changes after the last request. No snapshot RPC, controlled live clock/exact-cutoff test, production/staging execution, non-Chromium matrix or new load benchmark. No Realtime subscription: EN/VI copy tells users to reload for later attendance changes. No acceptance test failed in this run. Existing Vite/Supabase deprecation notices and the Focus lint warning remain disclosed.

**Decision: Step 6D and Phase 06 Local v1 PASS — 10/10 acceptance items**, within the explicitly best-effort current-state read contract. This does not mark atomic snapshot analytics or production release approved. Phase 07 not started. No commit/push/deployment; the user handles version control.
