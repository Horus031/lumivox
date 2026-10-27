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

## Remaining Work / Final Decision

- Steps 4.1 and 4.2: local verification PASS within the boundaries above.
- EN/VI strings, responsive/visual review, browser keyboard flow, focus behavior and authenticated browser E2E still need later Phase 04 verification. The new scheduling text remains English; i18n completion is not claimed.
- Phase 04 overall: IN PROGRESS — Steps 4.3–4.7 have not been verified here.
- Production deployment authorized: NO.
- No commit or push was performed. This report and the added tests/fixes remain working-tree changes.
