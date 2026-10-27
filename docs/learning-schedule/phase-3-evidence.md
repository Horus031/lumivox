# Phase 03 — Schedule Engine Evidence

## Step 3.1 — Recurrence Engine

- Engine committed: YES — base engine committed in `4a55924ccccbdb783c0ee66ec2d1694ae1c630f1`; Step 3.2 engine edits and the boundary test file remain uncommitted at verification time.
- Temporal dependency: YES — `@js-temporal/polyfill` (`^0.5.1`) is declared and imported by the engine; dependency resolved successfully during tests and build.
- Unit test result: PASS — `schedule-engine.test.ts`: 6/6; `schedule-engine.boundaries.test.ts`: 13/13; 19/19 tests across 2 files, exit code 0 (3.51 seconds). Covers inclusive Monday/Wednesday/Friday recurrence, UTC conversion, adjacent/overlapping slots, malformed input, and the Step 3.2 cases below.

## Step 3.2 — Timezone and Boundary Hardening

- IANA timezone validation: PASS — rejects `Bad/Zone` and fixed offset `+07:00`; accepts named timezone `UTC` and converts `Asia/Ho_Chi_Minh` local times to the expected UTC instants.
- DST tests: PASS — rejects nonexistent `2026-03-08 02:30` in `America/New_York`; selects the earlier instant in the `2026-11-01 01:30` fall-back fold (`05:30Z` start, `07:30Z` end).
- Leap-year / year-boundary tests: PASS — generates the `2028-02-29` occurrence and the expected Monday occurrences spanning `2026-12-28` to `2027-01-04`; one-day inclusive and no-matching-weekday cases also pass.
- Input limits: PASS — rejects inverted date ranges, schedules exceeding 366 days, zero slots, more than 21 slots, more than 1,000 occurrences, and weekdays `0`, `8`, `1.5`. Invalid date and HH:mm inputs are also rejected.
- Deterministic occurrence identity: PASS for identical input — repeated generation produces identical results and key `2026-11-02|1|19:00|20:30`. Identity across schedule revisions remains Step 3.3.

## Quality Gates

- Lint: PASS — exit code 0; 0 errors, 1 existing warning in `features/focus-sessions/use-focus-v2-audio.ts:104:6` (`react-hooks/exhaustive-deps`, missing dependency `projection`).
- Unit tests: PASS — exit code 0; 60 files passed, 1 skipped; 524 tests passed, 1 skipped; duration 39.39 seconds. The Focus PostgREST integration test is skipped when required `FOCUS_TEST_SUPABASE_*` variables are absent. Vite's existing ESM/native-config warning is non-fatal.
- Build: PASS — exit code 0; Next.js 16.2.6 compiled in 15.4 seconds, completed TypeScript in 22.0 seconds and generated 98/98 static pages. Build used existing `.env.local`; no secret values are recorded.

## Notes / Outstanding Risks

- Occurrence identity and revisions: Step 3.3
- Transactional persistence: Step 3.3
- No Supabase writes introduced
- Verified on 2026-10-27, approximately 14:34–14:38 (Asia/Bangkok), on `feature/learning-schedule-foundation` at starting HEAD `4a55924ccccbdb783c0ee66ec2d1694ae1c630f1`, including the existing working-tree engine edits and boundary tests.
- Commands executed from `apps/web`: `node node_modules/vitest/vitest.mjs run features/learning-schedule/schedule-engine.test.ts features/learning-schedule/schedule-engine.boundaries.test.ts --reporter=verbose`; `node node_modules/eslint/bin/eslint.js .`; `node node_modules/vitest/vitest.mjs run`; `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (the package's production build, including prebuild).
- Direct Node entry points avoid the broken npm/npx shell shims in the agent environment. Production build ran outside the sandbox with the required permission.
- The test named "does not alter output based on system local timezone" repeats generation in the same process; it does not vary the process timezone. This run does not independently establish behavior across multiple host timezone settings.
- Verification changed only this evidence file. Existing engine/test edits were preserved; no database operations, commit or push were performed.

## Status

- Step 3.1 and Step 3.2: VERIFIED for the tests and quality gates listed above, with one lint warning and one skipped integration test.
- Phase 03: IN PROGRESS — Step 3.3 occurrence identity/revisions and transactional persistence remain outstanding.

## Step 3.3 — Atomic Schedule Creation

### Source

- RPC migration: 20261027075532_learning_schedule_create_rpc.sql
- Server Action: apps/web/features/learning-schedule/schedule.actions.ts
- RPC tests: supabase/tests/learning_schedule_create_rpc.sql (8 pgTAP assertions; untracked at verification time).
- Verified on 2026-10-27, approximately 15:25–15:28 (Asia/Bangkok), on `feature/learning-schedule-foundation` at starting HEAD `1d54544e88450f7069618a5b0a515447edf085fb`, including existing working-tree changes. Earlier Step 3.1/3.2 results and status above are historical snapshots.

### Database Verification

- Clean migration replay: PASS — `supabase db reset --local`, exit code 0. All 73 migrations replayed, from `20260514043306_init_lumivox_core_schema.sql` through `20261027075532_learning_schedule_create_rpc.sql`. CLI reported reset finished on `feature/learning-schedule-foundation`. Non-fatal notices: deprecated `[inbucket]` config and missing `supabase/seed.sql`; no seed file was loaded.
- RPC pgTAP tests: PASS — `supabase test db --local`, exit code 0 after the clean reset. All 12 files / 118 assertions passed, including all 8 assertions in `learning_schedule_create_rpc.sql` and all 20 security assertions. Supabase commands used the installed CLI executable from the local npm cache, outside the sandbox for Docker access; no linked/remote database was used.
- Valid schedule creation: PASS — an authenticated owner creates a one-day Monday schedule on `2030-01-07`, 19:00–20:30 `Asia/Ho_Chi_Minh`, using the expected 12:00–13:30 UTC instants.
- Schedule/slot/session/revision persistence: PASS — after the RPC returns, the test sees exactly one schedule, one weekly slot, one study session, and one initial revision (`revision = 1`). These assertions verify visibility inside the test transaction; fixtures are rolled back at the end, not durably committed. Failure-injection rollback verification remains outstanding below.
- Duplicate schedule rejection: PASS — a second creation request for the same task is rejected with SQLSTATE `23505`. This tests sequential duplication; concurrent requests remain outstanding.
- Cross-owner rejection: PASS for the existing assertion — user A attempting to schedule user B's task is rejected with SQLSTATE `22023`. Coverage limit: that request also supplies an empty occurrences array and the assertion checks only the error code; it does not independently isolate ownership validation from payload validation.
- Forged timestamp rejection: PASS — a payload claiming local 19:00 but UTC start `13:00Z` instead of `12:00Z` is rejected with SQLSTATE `22023`. DST fold offset enforcement remains outstanding.

### Web Quality Gates

- Lint: PASS — from `apps/web`, `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit code 0; 0 errors, 1 existing `react-hooks/exhaustive-deps` warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6` for missing dependency `projection`.
- Unit tests: PASS — from `apps/web`, `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit code 0; 60 files passed, 1 skipped; 524 tests passed, 1 skipped; duration 47.56 seconds. The Focus PostgREST integration test remains skipped when required `FOCUS_TEST_SUPABASE_*` variables are absent. Existing Vite ESM/native-config warning is non-fatal. No dedicated `schedule.actions.ts` unit test exists in the inspected learning-schedule directory; the eight creation checks above exercise the SQL RPC directly.
- Build: PASS — from `apps/web`, `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, exit code 0; Next.js 16.2.6 compiled in 14.2 seconds, completed TypeScript in 19.2 seconds and generated 98/98 static pages. Included the package prebuild step; ran outside the sandbox with existing `.env.local`. No environment secrets are recorded.

### Outstanding

- Concurrent creation test
- Transaction rollback failure injection
- DST fold offset enforcement
- Schedule revisions and rescheduling (Step 3.4)

### Status

VERIFIED for the existing Step 3.3 migration replay, 8 RPC assertions and web quality gates, with one lint warning, one skipped integration test and the coverage limits above. Phase 03 remains IN PROGRESS: the listed concurrency, failure-injection, DST fold and Step 3.4 work are still outstanding.

Only this evidence section was updated during verification. Existing source, migration and test files were preserved. No commit, push or remote database operation was performed.

## Step 3.4A — Schedule Revisions

- Migration replay: PASS — `supabase db reset --local`, exit code 0. All 74 migrations replayed successfully, including `20261027083912_learning_schedule_revise_rpc.sql`. Non-fatal messages: deprecated `[inbucket]` config and missing `supabase/seed.sql`; no seed file was loaded. Only the local Supabase stack was reset.
- Server Action typecheck/build: PASS — from `apps/web`, `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, exit code 0. Next.js 16.2.6 compiled in 16.1 seconds, completed TypeScript in 32.8 seconds and generated 98/98 static pages. Covers compilation of `schedule-revision.actions.ts` with the existing working-tree generated types; does not exercise the Server Action through a browser or a dedicated action unit test.
- Revision increment: PASS — a valid owner request with expected revision 1 returns 2, stores revision 2 on the schedule, keeps revision 1 and inserts revision 2 with change reason `schedule_edited`. The new slot and scheduled occurrence are persisted with the expected UTC instant and revision 2.
- Optimistic concurrency: PASS for the stale-revision guard — a subsequent request with expected revision 1 is rejected with SQLSTATE `40001` and exact message `Stale schedule revision`; full schedule/slot/session/revision snapshots remain unchanged. Simultaneous requests from separate connections were not tested.
- Preserve completed/past sessions: PASS with an explicit reference-change exception — completed and past scheduled fixtures retain every field except `source_slot_id`, which is intentionally nulled by the FK when old slots are deleted. Completion timestamps, statuses, scheduled times and original revision are preserved; all three original sessions remain without hard deletion. This is not a claim that historical rows are byte-for-byte unchanged.
- Cancel future scheduled sessions: PASS — the original future scheduled fixture remains in history with status `cancelled` and cancellation reason `schedule_changed`; a new revision-2 scheduled occurrence replaces the plan.
- Rollback on invalid occurrence: PASS — a forged UTC instant causes SQLSTATE `22023`, exact message `Invalid occurrence instant`, after the function has reached cancellation and slot replacement. Complete before/after snapshots of schedules, slots, sessions and revisions are equal, proving those intermediate writes rolled back for this failure path.
- Cross-owner authorization: PASS — user B supplies an otherwise valid payload for user A's schedule and receives SQLSTATE `22023`, exact message `Schedule not found`. After switching back to A, all four table snapshots match their original state.
- Cancellation audit events: NOT IMPLEMENTED
- DST fold hardening: NOT IMPLEMENTED

Verification: 2026-10-27, approximately 15:44–15:47 (Asia/Bangkok), on `feature/learning-schedule-foundation`, starting HEAD `c27ad22238b46f78367bd284fe20f08407336d0c`, including existing working-tree migration, action and generated-type changes.

Tests: added `supabase/tests/learning_schedule_revise_rpc.sql` because no revision-specific test file existed. It contains 16 pgTAP assertions, temporary invoker-only helpers and snapshots, with all fixtures enclosed in a transaction ending in `ROLLBACK`. Executed `supabase test db --local` after clean replay: exit code 0, all 13 files / 134 assertions PASS, including all 16 revision assertions. Supabase used the installed CLI executable from the npm cache outside the sandbox for Docker access. Build also ran outside the sandbox with existing `.env.local`; no secrets are recorded here.

Scope: this run checked the Step 3.4A items above. Lint and the web unit-test suite were not rerun because they are not listed in this section; their earlier results remain historical. Server Action runtime error mapping, cancellation audit events, DST fold enforcement, and real concurrent RPC execution are not established by these tests.

Status: IN PROGRESS — migration replay, Server Action typecheck/build and the six revision behavior checks above are verified within their stated coverage. Cancellation audit events and DST fold hardening remain unimplemented. Added the revision test file and filled this section; no existing migration, runtime source or generated types were edited by this verification run. No commit, push or remote database operation was performed.
