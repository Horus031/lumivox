# Phase 04 — Task Scheduling UI Evidence

## Baseline and Verification Scope

- Branch: `feature/learning-schedule-foundation`.
- Starting HEAD: `1e50fa7e95a07ed11ddef2ccf4f3a13964880b37`.
- Verified on 2026-10-27, approximately 19:11–19:22 (Asia/Bangkok).
- Initial working tree: modified `task-details-drawer.tsx`; untracked `task-study-schedule-section.tsx` and `schedule.queries.actions.ts`. Verification includes these changes plus the fixes/tests listed below.
- This is the actual verification report at the filename requested for Step 4.2. The earlier `phase-4-evidence.md` template remains unchanged; its PENDING fields are not substituted for results here.
- No database reset, migration, production operation, commit or push was performed. Local integration fixtures were created and removed through the local admin client.

## Step 4.1 — Schedule Draft Editor and Preview

### Code Review

- Reviewed `apps/web/features/learning-schedule/components/schedule-draft-editor.tsx`.
- Editor keeps local draft state, uses `generateStudyOccurrences()` for preview and passes valid input to its parent callback. There are no Supabase/email calls in the editor source.
- The 8-row preview cap and 21-slot Add control limit were inspected in source; those specific limits were not separately exercised in this run's component tests.

### Executed Tests

- Test file: `apps/web/features/learning-schedule/components/task-scheduling-ui.test.tsx`.
- Five Step 4.1 test cases PASS: render exact engine preview and pass draft without calling mocked persistence/query actions; add/edit/remove slots and recover from overlap; invalid date range; invalid IANA timezone; DST gap plus zero matching dates, empty slots and missing continuation callback.
- Invalid recurrence and valid-but-empty preview disable Continue. Correcting overlap restores a valid preview.
- Final targeted command from `apps/web`: `node node_modules/vitest/vitest.mjs run features/learning-schedule/components/task-scheduling-ui.test.tsx`.
- Result: exit 0; 14/14 tests PASS across Step 4.1 and Step 4.2, duration 4.09 seconds. The Step 4.1 checks are DOM/component tests with real recurrence logic, not a browser E2E run.

Status: VERIFIED within the component-test and code-review coverage above.

## Step 4.2 — Task Details Integration and Schedule Creation

### Integration Placement / Types — Code Review

- Import resolves to `@/features/learning-schedule/components/task-study-schedule-section`.
- `TaskStudyScheduleSection` is inside `TabsContent value="overview"`, below the Task overview, guarded by `!isEditing`.
- It receives `key={currentTask.id}`, the same `taskId`, and eligibility restricted to root Tasks with `todo` or `in_progress` status. Placement matches the supplied instructions.
- `TaskWithGoal` extends the generated `tasks.Row`, which already includes `parent_task_id`. `getTaskDetailsAction()` selects `*` and therefore returns that field; the local integration test confirms it is present. No `any` cast was introduced.
- Reviewed new query action `schedule.queries.actions.ts`: validates UUID, calls `requireUser()`, filters by both task ID and authenticated user ID, and returns the existing schedule summary.

### Fixes Made During Verification

- Drawer detail loading now uses request sequencing to ignore outdated responses, and only displays detail data whose Task ID matches the current prop. This prevents a late response for A from replacing B after switching Tasks; the keyed schedule component is retained.
- Schedule saving now has a synchronous in-flight guard against two Continue calls before React rerenders. A disabled fieldset covers native keyboard and pointer interaction while saving, instead of relying only on `pointer-events-none`.
- Schedule load requests ignore superseded/unmounted responses and handle thrown errors. Creation failure keeps the editor/draft and renders an inline `role="alert"` as well as the toast.
- Existing backend mutation logic, schema, generated types and draft editor implementation were unchanged.

### Required Acceptance Matrix

| # | Required behavior | Executed coverage and actual result |
| --- | --- | --- |
| 1 | Root `todo`, no schedule: Add and save | PASS — real Drawer/component shows Add; local create action/RPC persists one schedule and 3 sessions. |
| 2 | Root `in_progress` may add | PASS — eligibility rendered in the Drawer and real create action/RPC succeeds. |
| 3 | Completed/cancelled/in-review cannot create | PASS — three Drawer DOM cases hide creation; three real action tests reject with `Task is not eligible for scheduling.` and no schedule. |
| 4 | Subtask cannot create | PASS — Drawer hides Add; real action rejects a fixture with a real parent Task. |
| 5 | Existing schedule is summary-only | PASS — component renders dates/timezone/status/revision without Add/editor; local query returns the persisted summary and another create is rejected. |
| 6 | RPC error keeps draft/editor and displays error | PASS — mocked action failure renders inline alert/toast while date input and editor remain; retry can succeed. This failure interaction is a component test, not a browser talking to a failing RPC. |
| 7 | Success displays new schedule and correct count | PASS — component reloads summary and reports the returned `sessionCount`; real local tests independently verify exactly 3 rows and UTC starts matching the recurrence engine. |
| 8 | Switching Tasks does not show old schedule | PASS — actual Drawer + section DOM test switches A to B, resolves B then late A detail responses and verifies no A summary reappears; B remains eligible and delete targets B. |
| 9 | Two Continue clicks do not duplicate | PASS — two immediate DOM clicks call the mocked create action once and set native fieldset disabled. Separately, two real concurrent create action calls persist only one schedule and 3 sessions. |
| 10 | Unscheduled Task retains edit/delete/status | PASS — Drawer edit/cancel and delete interactions remain available; real local `updateTaskAction`, `transitionTaskStatusAction`, and `deleteTaskAction` succeed for a Task without a schedule. Existing task form/workflow regression tests also pass in the complete suite. |

### Component Test Boundary

- The same 14-test UI file contains 9 Step 4.2 test cases, with actual Drawer, schedule section and draft editor rendered in jsdom.
- Server Actions, Next router, toasts and unrelated Drawer child panels/edit form/modal shell are mocked. Tests verify component wiring/state, not Next.js HTTP transport, toast portal layout or the actual Task edit form in a browser.
- The complete existing unit suite separately exercises the real Task edit form/workflow with its own action mocks.

### Local Supabase Integration — Executed

- Test file: `apps/web/features/learning-schedule/schedule.integration.test.ts`.
- Command from `apps/web`: `node node_modules/vitest/vitest.mjs run features/learning-schedule/schedule.integration.test.ts --reporter=verbose`.
- Supabase local configuration was read through `supabase status -o json` into process environment variables `LEARNING_SCHEDULE_TEST_URL`, `LEARNING_SCHEDULE_TEST_ANON_KEY`, `LEARNING_SCHEDULE_TEST_SERVICE_KEY`. Credentials were neither printed nor saved. The test refuses non-local hosts or a port other than the configured local API port 55321.
- Result: exit 0; 9/9 tests PASS, duration 2.17 seconds. Two disposable users authenticate through real local Supabase Auth; signed-in clients perform real PostgREST reads and PostgreSQL RPC calls.
- Real application create/query/edit/status/delete action functions execute. `requireUser()` is mocked only to inject the already authenticated fixture client/user instead of Next request cookies. Engagement background scheduling and server translation loading are mocked; no background metrics or email work is run.
- Two root-status persistence cases, three forbidden-status cases, subtask rejection, concurrent duplicate create, cross-user query/create denial and unscheduled Task CRUD all passed.
- Cleanup: both fixture users signed out and were deleted by the local admin client; Task counts for both users were confirmed zero. Cascading schedule/session fixtures were removed with their owning users.
- No full Next.js cookie/session request flow or browser-to-Server-Action E2E was executed; these integration results are not labeled browser E2E.

Status: VERIFIED for the 10 requirements at the explicitly stated component/local-action integration boundaries. Browser E2E remains unverified.

## Quality Gates — Executed for Steps 4.1 and 4.2

All commands below ran from `apps/web`.

- Lint: `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit 0; 0 errors, 1 pre-existing `react-hooks/exhaustive-deps` warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6` about `projection`.
- Unit tests: `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit 0; 61 files passed, 2 skipped; 538 tests passed, 10 skipped; duration 40.23 seconds.
- Skip accounting: the plain full-suite process does not receive integration credentials, so it skips the 9 new opt-in schedule integration cases plus the existing Focus PostgREST case. The 9 schedule cases were actually exercised and passed in the dedicated local run above; they are not being counted as 9 passes in the plain suite total. The Focus integration case was not run in this verification.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (including prebuild), exit 0; Next.js 16.2.6 compiled in 13.8 seconds, completed TypeScript in 18.5 seconds and generated 98/98 static pages.
- Existing Vite ESM/native-config warning is non-fatal. Local CLI warns about deprecated `[inbucket]`/`INBUCKET_URL` and lists optional stopped services; the tested Auth/PostgREST/database services were available.
- Direct Node entry points bypass the broken npm/npx shell shims in the agent environment. Local CLI/integration execution and production build ran outside the sandbox with the required permissions. Build used existing `.env.local`; no secret values are recorded.
- React Best Practices review covered stale effect responses, unconditional hooks, synchronous submit locking, accessible error output/native disabled controls and generated Task types. `git diff --check` passed.

## Step 4.3 — Schedule Details and Study Sessions List

### Baseline / Implementation

- Starting HEAD: `e7512f942a71f43828238519a4b973fc78366ce9`, branch `feature/learning-schedule-foundation`; working tree was clean at the start of this step.
- Verified on 2026-10-27, approximately 19:30–19:38 (Asia/Bangkok). Earlier Step 4.1/4.2 results above remain historical snapshots.
- Added `apps/web/features/learning-schedule/session.queries.actions.ts`: strict UUID/page validation, 20 rows per page, authenticated owner filter plus existing RLS, exact total count, stable ascending `scheduled_start_at` then `id`, and bounded offset pagination as specified.
- Added `components/study-sessions-list.tsx` and mounted it below the existing summary in `TaskStudyScheduleSection`, with `key={schedule.id}` and `scheduleId={schedule.id}`. Schedule changes reset internal list state synchronously; request versions ignore old responses and an in-flight guard prevents duplicate page requests.
- Added explicit Retry for initial-load and next-page failures to meet the guide's acceptance criterion; retrying a failed next page retains existing rows. Appended rows are deduplicated by Session ID, including duplicate IDs within a response.
- Rows show stored local date/time, their own timezone, all six status labels and cancellation reason. No completed/missed/skipped controls, attendance mutations, metrics changes or email sending were added. All new application database access is SELECT-only; status changes below are integration fixtures only.

### Acceptance Tests — Executed

| Required behavior | Actual result and boundary |
| --- | --- |
| 3 sessions with correct date/time/status | PASS — list DOM test renders 3 rows with expected local fields; real create/read action integration checks 3 rows, exact total, dates, local start time and scheduled status. |
| More than 20, first-page-only and Load more | PASS — component initially requests page 0 only, then page 1; rapid clicks make one extra request and duplicate IDs are not appended. Real local integration creates 22 occurrences and reads pages of 20 and 2 with exact totals, stable IDs/order and no omissions/duplicates in a static dataset. |
| API error and retry | PASS — initial action failure shows an alert/Retry and retries page 0. A thrown next-page error preserves loaded rows and retries the same page. These failure responses are mocked component cases. |
| Task A -> B clears A sessions | PASS — actual Drawer/section component regression test now includes an A session and verifies it disappears on switching Task; late A Task details do not restore it. |
| Out-of-order requests | PASS — separate initial A/B and late A load-more cases resolve B first, then A; only B rows remain. Component tests also exercise schedule reset without relying on the parent key. |
| Cancelled reason | PASS — DOM shows `Reason: task_closed`; local read returns the fixture cancellation reason without filtering history out. |
| Completed/missed/skipped/in-progress are read-only | PASS — all six labels render without action buttons. Local pagination fixture includes completed, missed, skipped, in-progress and cancelled rows; full before/after session snapshots are identical after reads. |
| User B cannot read A sessions | PASS — two real locally authenticated users; B's action query for A's Schedule returns `sessions: []`, `total: 0`, `hasMore: false`. This checks the action's owner filter together with existing RLS, not RLS in isolation. |

### Test Files and Commands

- Added `components/study-sessions-list.test.tsx`: 8 component tests covering rows, pagination, rapid clicks/deduplication, retry, stale responses, statuses/reason and empty state.
- Added `session.queries.actions.test.ts`: 8 tests covering strict input limits/extra fields, owner/schedule filters, exact-count selection, both order clauses, page range, final/null results and sanitized database/authentication errors.
- Extended `components/task-scheduling-ui.test.tsx` to mock the new read action and verify actual Task switching clears sessions. Existing Step 4.1/4.2 interactions remain covered.
- Targeted command from `apps/web`: `node node_modules/vitest/vitest.mjs run features/learning-schedule/components/study-sessions-list.test.tsx features/learning-schedule/session.queries.actions.test.ts features/learning-schedule/components/task-scheduling-ui.test.tsx`; initial result 3 files / 30 tests PASS. The later full suite includes the final Task-switch assertions.
- Extended `schedule.integration.test.ts` to check real session reads in the existing root-create and cross-owner cases, plus one >20-row/history/read-only pagination case.
- Local integration command: `node node_modules/vitest/vitest.mjs run features/learning-schedule/schedule.integration.test.ts --reporter=verbose`, with local credentials read from `supabase status -o json` into `LEARNING_SCHEDULE_TEST_*` process variables without printing or saving them.
- Integration result: exit 0; 10/10 PASS, duration 1.98 seconds. Auth/PostgREST/PostgreSQL are real local services; `requireUser()` injects each signed-in fixture client instead of Next request cookies. Fixture users sign out and are deleted, and their remaining Task counts are confirmed zero. No remote database was accessed.

### Quality Gates — Executed

- Lint: `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit 0; 0 errors, 1 existing `projection` dependency warning in `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Unit suite: `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit 0; 63 files passed, 2 skipped; 554 tests passed, 11 skipped; duration 68.22 seconds. Default run skips the 10 opt-in Schedule integration cases plus the existing Focus integration case. All 10 Schedule cases were exercised and passed in the separate local integration run above; the Focus case was not run here.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (including prebuild), exit 0; Next.js 16.2.6 compiled in 25.8 seconds, completed TypeScript in 37.6 seconds, generated 98/98 static pages.
- Existing Vite ESM/native-config and local Supabase deprecation/optional-stopped-service notices are non-fatal. Direct Node commands bypass broken npm/npx shell shims. Integration/CLI access and build ran outside the sandbox with the required permissions; existing `.env.local` was used for build. No secrets are recorded.
- React review covered unconditional hooks, keyed state reset, effect cleanup, request deduplication, native disabled controls, status/error semantics and inferred action result types. `git diff --check` passed. No unexpected test or build failure occurred.

### Coverage Limits / Status

- Offset pagination follows the approved simple local implementation. Deduplication protects repeated IDs but cannot guarantee against missing/stale rows if sessions move between pages during concurrent rescheduling. Integration tested a static dataset; cursor pagination or refresh strategy remains a consideration before concurrent-mutation rollout.
- UI/query tests use jsdom and mocked read actions; local integration calls real action functions with an injected authenticated client. Browser E2E, Next cookie/HTTP transport, visual/mobile review and EN/VI translations are not verified here and remain Step 4.6 work.
- Step 4.3: LOCAL VERIFICATION PASS within the documented boundaries. The application additions are read-only; no attendance or notification implementation, migration or database reset was introduced.
- No commit or push was performed, per the user's instruction.


## Step 4.4 — Whole-Schedule Revision UI

### Baseline / Review Findings

- Starting HEAD: `90af77a0f03ebf6a71b908864499ae64b72513be`, branch `feature/learning-schedule-foundation`.
- Verified on 2026-10-28 (Asia/Bangkok). Earlier Step 4.1–4.3 figures remain historical results.
- Initial working tree contained the user's two untracked files: `schedule-editor.queries.actions.ts` and `components/schedule-revision-editor.tsx`. Their paths, owner filters, time-to-HH:mm conversion and reuse of `ScheduleDraftEditor` matched the guide.
- Missing requirements found and fixed: editor integration in Task Details, confirmation before mutation, metadata revision/status recheck after reading slots, load Retry, explicit conflict recovery, and revision-aware session-list remount.
- No migration, database reset, generated-type change, email sending, attendance control, commit or push was performed. Existing local schema/RPCs were used.

### Implementation / Behavior

- `getStudyScheduleEditorAction` authenticates, filters all three reads by owner, loads ordered weekly slots, converts seconds to HH:mm, and rereads revision/status after slots. If revision changed, status ceased to be active, or the row disappeared, it rejects the read instead of returning a mixed-version draft. This follows the guide's recheck option; it is not a database snapshot function.
- `ScheduleRevisionEditor` retains the saved dates, timezone and weekly slots. It uses the existing recurrence engine for preview. It displays current/prospective revision and explains replacement of future scheduled sessions, including individual overrides, while keeping completed/past history.
- Continue opens the existing accessible Dialog primitives; only Confirm revision calls the mutation action. Back to draft and Cancel do not mutate. Native fieldsets/buttons disable interaction while saving; a synchronous ref guards duplicate confirmations. Keyed editor state and effect cleanup ignore stale reads, and an unmounted editor ignores mutation responses.
- Save failures keep the edited draft and show an alert. A revision conflict disables resubmission, keeps the draft visible, and offers explicit `Discard draft and reload`; this operation intentionally discards the draft only after the user chooses it.
- Date policy is explicit: the original startsOn is never silently advanced. Continue rejects startsOn before today in the selected timezone and occurrences at/before the current instant, explaining how to choose a valid future range. Database validation remains authoritative if time advances before confirmation.
- `TaskStudyScheduleSection` exposes Edit only for eligible Tasks with an active Schedule. Existing Add Schedule branches remain. Successful revisions reload summary and mount sessions with `key={schedule.id + '-' + schedule.revision}`; sessions restart at page 0.

### Acceptance Tests — Executed

| ID | Actual verification | Result |
| --- | --- | --- |
| REV-01 | Section component with an active Schedule and eligible Task exposes Edit; opening it loads the real editor component. | PASS |
| REV-02 | Component cases cover closed, paused and ineligible Task; editor action tests reject closed/paused metadata. | PASS — mocked component/query boundaries |
| REV-03 | Action tests verify owner filtering, both slot sort clauses, HH:mm conversion and final revision/status recheck. Local authenticated integration loads the exact saved draft at revisions 1 and 2. | PASS |
| REV-04 | Real draft editor changes start/end dates, weekday and start/end time; preview shows the expected Tuesday occurrences and total 3. Existing recurrence-engine tests also run in the full suite. | PASS — component/engine |
| REV-05 | Continue opens confirmation without an action call; Back keeps edited input; Cancel invokes only the close callback. | PASS — component |
| REV-06 | Real authenticated action/RPC changes revision 1 to 2, then 2 to 3; replacement count is exactly 3 each time. Duplicate confirmation clicks make one action call. | PASS |
| REV-07 | Two concurrent action calls with expectedRevision 1 yield one success and one conflict, saved revision 2 and exactly 3 scheduled replacements. See the timeout failure and mitigation below. | PASS with bounded-request mitigation |
| REV-08 | Section component completes two successive revisions, reloads summary each time and requests sessions page 0 again. Local action integration rereads totals 6 then 9 and replacement/history rows at revisions 2 and 3. | PASS — composed component + separate local integration |
| REV-09 | Local privileged fixtures model a completed historical row and a past scheduled row. IDs, status, local_date, UTC instants, completed_at and logical keys remain identical after revision. Source-slot references may be nulled by the existing FK when slots are replaced; full-row immutability is not claimed. | PASS |
| REV-10 | One original future row becomes cancelled with schedule_changed and exactly one cancellation audit carrying actor/from/to/reason/schedule/revision. After another revision, all 3 revision-2 rows are cancelled and 3 revision-3 rows are scheduled. | PASS — real local RPC and audit trigger |
| REV-11 | Mocked RPC failure preserves edited draft, shows error, emits no success toast and supports retry. Real in-progress-session and past-date rejections leave all session rows and schedule revision unchanged. | PASS |
| REV-12 | A second real signed-in user cannot load A's editor or revise A's schedule through the actions. Existing session read isolation remains covered. | PASS — owner filters plus RLS |

### Test Files / Commands / Local Results

- Added `components/schedule-revision-editor.test.tsx`: 12 component cases (including parameterized eligibility cases) covering preview, confirmation/back/cancel, duplicate saves, loading/retry, draft retention, conflict/reload, date policy, stale reads and two successive summary/list reloads.
- Added `schedule-editor.queries.actions.test.ts`: 8 cases including concurrent revision/status/deletion recheck failures.
- Added `schedule-revision.actions.test.ts`: 5 cases for bounded RPC, direct 40001, failed/aborted response plus changed owned revision, and unchanged/unreadable revision without inferred success.
- Extended `schedule.integration.test.ts` from 10 to 13 cases: revision/history/audit/two successive revisions, concurrent same-revision saves, and real rejected revision/no-change cases. The existing cross-owner case now checks editor read and revision denial too.
- Targeted command from `apps/web`: `node node_modules/vitest/vitest.mjs run features/learning-schedule/components/schedule-revision-editor.test.tsx features/learning-schedule/schedule-editor.queries.actions.test.ts features/learning-schedule/schedule-revision.actions.test.ts features/learning-schedule/components/task-scheduling-ui.test.tsx`.
- Targeted result: exit 0; 4 files / 39 tests PASS, duration 5.60 seconds, including the existing Step 4.1/4.2 regression tests.
- Local command: `node node_modules/vitest/vitest.mjs run features/learning-schedule/schedule.integration.test.ts --reporter=verbose`. Credentials were read from local CLI `supabase status -o json` into `LEARNING_SCHEDULE_TEST_*` process variables without printing or saving them. The test rejects non-loopback endpoints and any API port other than 55321.
- Final local result: exit 0; 13/13 PASS, duration 7.74 seconds. The concurrent revision case completed in 5.108 seconds. Real Auth/PostgREST/Postgres were used; `requireUser` injects signed-in fixture clients instead of Next request cookies. Users sign out and are deleted, and remaining Task counts are checked as zero.

### Failure Found / Mitigation / Remaining Boundary

- Initial local run: 12 PASS / 1 FAIL, concurrent same-revision test timed out at 5 seconds. Raising only the test deadline to 15 seconds still failed; an isolated diagnostic run also failed at 15 seconds. These were actual failed runs, not acceptance passes.
- Local PostgREST reports version 14.5. Postgres logs showed the losing RPC repeatedly executing and raising `Stale schedule revision` after the winning request committed. An activity sample did not show a persistent blocking transaction; the observed failure was repeated stale-RPC execution, not evidence of a durable lock deadlock.
- Mitigation in `schedule-revision.actions.ts`: bound the RPC HTTP request with `AbortSignal.timeout(5000)`. Preserve direct 40001 mapping; for other failed/aborted responses, reread the authenticated owner's revision and return conflict if it changed. Otherwise return a generic failure. Never infer success or automatically replay a failed mutation.
- The concurrent integration test retains a 15-second deadline to accommodate the intentional 5-second request bound and fixture/assertion overhead. It now passes with one committed revision and one conflict.
- This is an application-level response bound, not a fix to PostgREST's internal retry behavior and not proof that abort always cancels server-side execution immediately. A timeout can also represent an unknown commit outcome, so the UI requires reload instead of reporting success. Investigate/harden server-side serialization-error handling before production release; no database migration or SQLSTATE contract was changed here.

### Quality Gates — Final Run

- Lint: `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit 0; 0 errors, 1 existing missing `projection` useEffect dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Full unit suite: `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit 0; 66 files passed / 2 skipped; 579 tests passed / 14 skipped (593 total), duration 57.87 seconds. Default suite skips the 13 opt-in Schedule integration cases plus 1 existing Focus integration case. Schedule integration was actually exercised separately (13/13 PASS above); Focus integration was not run.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0; Next.js 16.2.6 compiled in 13.8 seconds, TypeScript completed in 52 seconds and generated 98/98 static pages in 1973 ms. This final build includes the bounded revision action change.
- Direct Node entry points bypass the environment's broken npm/npx shims. Local CLI/integration and build ran with the required permissions; build used existing `.env.local`. No credentials are recorded. Existing Vite config-loader and Supabase inbucket/optional-stopped-service notices remain non-fatal.
- React review covered unconditional hooks, keyed state reset, stale response cleanup, native disabled controls, confirmation dialog semantics and duplicate-submit guards. `git diff --check` passed; line-ending normalization notices are not whitespace failures.

### Coverage Limits / Status

- Step 4.4: LOCAL VERIFICATION PASS for REV-01–REV-12 within the boundaries above, including the documented PostgREST mitigation and unresolved server-side retry concern.
- No authenticated browser E2E/Next cookie transport, visual/mobile review or browser focus/keyboard verification was run. Component tests use jsdom and mocked actions; integration calls the action functions against real local services. These are separate layers, not a browser-to-database E2E claim.
- Loading/confirmation/conflict/error cases are simulated in component tests. Completed/past history states are deliberately created by a privileged local fixture client; no attendance UI was introduced.
- Offset pagination can still miss/stale rows during mutations from another client between page loads. Successful edits in this UI reset the list; that does not establish snapshot consistency across other concurrent clients. Existing overrides' cancellation policy is shown in UI, but a new override-then-revise integration scenario was not rerun in this step.
- Fresh migration replay, audit-failure injection, the independent Phase 03 concurrency harness, translations and browser E2E were not rerun here. Historical Phase 03 evidence is not represented as a new execution.
- User will handle commit and push.


## Step 4.5 — Single-Session Reschedule UI

### Baseline / Implementation

- Starting HEAD: `1eda1d3a5e841a9fda1cae9c0129cf9efd06b47d`, branch `feature/learning-schedule-foundation`; initial working tree was clean.
- Verified on 2026-10-28, approximately 15:16–15:27 (Asia/Bangkok). Earlier Step 4.1–4.4 results remain historical snapshots.
- Added `components/session-reschedule-dialog.tsx`. It uses the existing Dialog/Button controls, initializes stored local date and HH:mm times, displays the session timezone, validates real calendar dates and ordered same-day times, and requires explicit Confirm reschedule. Cancel does not mutate.
- Added `updated_at` to the sessions SELECT; the inferred row type supplies the exact database version to the Dialog without any cast to any. `canReschedule` defaults false and is enabled in Task Details only for an eligible Task and active Schedule. Each row also requires scheduled status and a future scheduled_start_at; the RPC rechecks these rules at transaction time.
- A frozen submission object contains sessionId, expectedUpdatedAt, localDate, startTime, endTime and a UUID eventKey. Retrying unchanged input reuses it; editing input after a definitive rejection clears it so the next command gets a new key. A synchronous ref prevents duplicate submissions; fields and close controls are disabled while saving.
- Unknown outcomes lock the draft and expose `Retry exact command` and `Check latest session`. Retry sends the same object, key, payload and expected version; no automatic replay occurs. Check latest discards the draft and reloads database state. A confirmed conflict also blocks overwrite and offers reload. Unmounted forms ignore late responses, and session ID/version changes remount the form.
- `StudySessionsList` now supports mutation refresh: the wrapper increments a refresh key used in the actual SessionRows key. Save or Check latest remounts the rows, invalidates old requests, clears accumulated pages and starts one new page-0 load. The existing schedule/revision keys are retained.
- `rescheduleStudySessionAction` retains authenticated owner-filtered reads and Temporal conversion using the owning Schedule timezone. It now rejects end <= start before authentication, bounds the RPC HTTP request to 5 seconds, and treats transport/abort results as uncertain. A bounded owner-version reread detects an accompanying version change; it never infers a successful commit. The existing RPC, DST guard and request-fingerprint contract were not changed.
- No migration, database reset, type regeneration, attendance controls, email sending, commit or push was performed.

### Acceptance Tests — Executed

| ID | Actual verification and boundary | Result |
| --- | --- | --- |
| RS-01 | List component exposes exactly one Reschedule button for a future scheduled row when canReschedule is enabled; disabling parent permission removes it. | PASS |
| RS-02 | List component hides controls for completed, missed, skipped, cancelled and in-progress rows. Local action tests additionally exercise real rejection of all five statuses without row changes. Status changes are privileged fixtures only. | PASS |
| RS-03 | List component hides Reschedule for a past scheduled row; local authenticated action rejects an actual past scheduled fixture with no writes. | PASS |
| RS-04 | Dialog prefills local values/timezone, edits date/start/end, and sends the selected values with the original database updated_at. | PASS — component |
| RS-05 | Equal, earlier and empty end times disable Confirm. Server Action validates ordering independently. | PASS — component/action |
| RS-06 | Real authenticated reschedule returns and retains the original Session ID, logical_occurrence_key and generation revision; source_slot_id becomes null. | PASS |
| RS-07 | Complete before/after session snapshots prove every unselected session remains byte-for-byte equivalent as returned by PostgREST. Only the chosen session is moved. | PASS |
| RS-08 | Exactly one real rescheduled audit event exists for the chosen ID/key and owning actor. | PASS |
| RS-09 | A second command with the original stale updated_at returns failure/conflict after a winning move. Entire winning session snapshot and audit remain unchanged. Component conflict test retains draft, disables save and provides reload. Local PostgREST uses the bounded unknown-outcome path described below. | PASS with documented timeout boundary |
| RS-10 | Local overlapping move fails, direct authenticated RPC returns 23P01, and complete sessions/audit snapshots are unchanged. An adjacent move starting at the other session's end is accepted. | PASS |
| RS-11 | America/New_York 2030-03-10 gap: action rejects it and direct invalid UTC RPC returns 22023 without changes. 2030-11-03 fold: direct later-fold RPC returns 22023 without changes; action uses the earlier 05:30Z instant and succeeds. | PASS — Temporal + real DB boundary |
| RS-12 | Same-key/same-payload action replay returns the original ID; session and event snapshots remain exactly equal with one event. Component unknown-outcome retry uses the very same frozen submission object. | PASS |
| RS-13 | Changed time under a used key fails via the action; direct RPC confirms 22023 / Event key reused with different request. Rows/audit remain unchanged. Component test confirms a new payload gets a new UUID. | PASS |
| RS-14 | A second real authenticated user cannot load the owner's session through the reschedule action and receives Study session not found. Owner filters and existing RLS are both active; this is not an isolated RLS-only test. | PASS |
| RS-15 | Actual list/Dialog component test loads page 1, reschedules its row, closes the Dialog, discards old pages and requests page 0 again. Check latest after unknown outcome also reloads page 0 and does not replay a mutation. | PASS — component |

### Individual Override -> Whole-Schedule Revision — Executed

- Created a real local recurring Schedule, moved its first session to 2030-01-08 18:00–19:00 through the authenticated reschedule action, then revised the recurring slots through the authenticated revision action.
- The original Session ID remains in the session query as cancelled with reason schedule_changed and its overridden local date.
- Its original rescheduled audit row is preserved exactly, and one additional cancelled audit event records scheduled -> cancelled / schedule_changed. Exactly two events remain for this session. Replacement sessions are generated by the existing revision RPC; no history is deleted.
- This is a real local action/RPC integration flow with injected authenticated clients, not an authenticated browser E2E claim.

### Test Files / Commands / Actual Results

- Added `components/session-reschedule-dialog.test.tsx`: 11 cases including parameterized invalid end-time cases, confirmation/cancel, duplicate submission, key lifetime, immutable unknown-outcome retry, check latest, conflict and a stale mutation response after switching sessions.
- Added `session-reschedule.actions.test.ts`: 12 cases including strict validation, owner filters, timezone/UTC arguments, actual Temporal gap/fold handling, SQLSTATE handling, abort/transport uncertainty and missing-owner denial.
- Extended `components/study-sessions-list.test.tsx` from 8 to 11 cases: eligibility/status/past-time filtering, reschedule from a loaded second page then page-0 refresh, and explicit latest-state refresh after unknown outcome. Existing initial/load-more stale-response tests remain in the suite.
- Extended `session.queries.actions.test.ts` to assert updated_at is selected.
- Targeted command from `apps/web`: `node node_modules/vitest/vitest.mjs run features/learning-schedule/components/session-reschedule-dialog.test.tsx features/learning-schedule/session-reschedule.actions.test.ts features/learning-schedule/components/study-sessions-list.test.tsx features/learning-schedule/session.queries.actions.test.ts`.
- Final targeted result: exit 0; 4 files / 42 tests PASS, duration 9.66 seconds, after the query-chain typing correction below.
- Extended `schedule.integration.test.ts` from 13 to 19 cases with six new scenarios covering identity/unchanged peers/audit/idempotency/fingerprint, stale version, overlap/adjacency, owner/status/past-time denial, DST gap/fold and override -> whole revision history.
- Local command: `node node_modules/vitest/vitest.mjs run features/learning-schedule/schedule.integration.test.ts --reporter=verbose`. Local credentials came from CLI `supabase status -o json` into LEARNING_SCHEDULE_TEST_* process variables without printing/saving them. The test guards loopback host and API port 55321.
- Final local result: exit 0; 19/19 PASS, duration 14.01 seconds, after the query-chain correction. The stale-session case took 5.145 seconds; the previous same-revision race regression took 5.104 seconds. An earlier complete local run also passed 19/19 in 14.78 seconds.
- Real Supabase Auth, PostgREST and Postgres were used. requireUser injects each signed-in fixture client rather than Next request cookies. Sign-out, deletion of both fixture users and zero remaining fixture Task counts all passed. No remote database was accessed.

### Quality Gates / Failure Corrected

- Lint: `node node_modules/eslint/bin/eslint.js .` (equivalent to npm run lint), exit 0; 0 errors and 1 existing projection dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Full unit suite: `node node_modules/vitest/vitest.mjs run` (equivalent to npm run test:unit), exit 0; 68 files passed / 2 skipped; 605 tests passed / 20 skipped (625 total), duration 68.85 seconds. The default run skips 19 opt-in Schedule integration tests and 1 existing Focus integration test. Schedule integration passed separately above; Focus integration was not run.
- The first build failed TypeScript because abortSignal was chained after maybeSingle on the version reread; the installed SDK's maybeSingle return type does not expose that method. Fixed by calling abortSignal before maybeSingle, without any cast. The matching action test builder was corrected too. The targeted 42 tests and all 19 real integration tests were rerun successfully after this change; the full 605-test run predates this small chain-order correction.
- Final build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in 15.1 seconds, TypeScript completed in 23.0 seconds and generated 98/98 static pages in 781 ms.
- React review covered unconditional hooks, keyed state reset, stale-response cleanup, native disabled controls, Dialog semantics, exact-command retries and duplicate-submit guards. `git diff --check` passed; line-ending notices are not failures.
- Direct Node commands bypass broken npm/npx shell shims. Integration/CLI access and build used the required permissions; build used existing .env.local. Existing Vite config-loader and Supabase inbucket/optional-stopped-service notices remain non-fatal. No credentials are recorded.

### Coverage Limits / Status

- Step 4.5: LOCAL VERIFICATION PASS for RS-01–RS-15 and the override -> revision integration scenario within the boundaries above.
- PostgREST serialization-error retry behavior found in Step 4.4 remains unresolved at the server layer. The stale-session test also reaches the 5-second HTTP bound. Abort is not proof of rollback or immediate server-side cancellation; a changed version alone is not treated as proof that this request committed. The UI requires an explicit latest-state check or exact-command retry.
- Uncertain outcomes and retry UI are tested with mocked action results/transport exceptions; real idempotent RPC replay and the real stale-RPC timeout path are separately verified against local Supabase. A deliberately severed network connection after a successful commit was not injected in this step.
- Exact retries retain the original client command while the Dialog remains mounted. Closing/reloading discards it; no durable retry store across navigation is implemented. If another operation changes the owning Schedule timezone between attempts, the Server Action resolves UTC against that newly saved timezone and the DB fingerprint remains authoritative; concurrent timezone-change/replay was not tested here.
- Offset pagination still lacks snapshot consistency against changes from another client. This UI's own successful reschedule reloads page 0; it does not solve all concurrent pagination cases.
- Browser E2E/Next cookie transport, visual/mobile review, browser focus/keyboard flow, EN/VI localization, fresh migration replay, audit failure injection and the independent Phase 03 concurrency harness were not run here. No attendance or notification functionality is claimed.
- No commit or push was performed; the user will handle both.

## Remaining Work / Final Decision

- Steps 4.1, 4.2, 4.3, 4.4 and 4.5: local verification PASS within the boundaries above; Step 4.4 includes the documented bounded-request mitigation and server retry limitation.
- EN/VI strings, responsive/visual review, browser keyboard flow, focus behavior and authenticated browser E2E still need later Phase 04 verification. The new scheduling text remains English; i18n completion is not claimed.
- Phase 04 overall: IN PROGRESS — Steps 4.6–4.7 have not been verified here.
- Production deployment authorized: NO.
- No commit or push was performed. This report and the added tests/fixes remain working-tree changes.
