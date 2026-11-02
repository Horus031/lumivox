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

## Step 3.4B — Individual Session Rescheduling

### Source

- Baseline SHA: `af71d40c2a5258ce40b85e6aaf80141cf7ad8130`, branch `feature/learning-schedule-foundation`, including pre-existing working-tree migration, Server Action and generated-type changes.
- Verified on 2026-10-27, approximately 16:01–16:08 (Asia/Bangkok).
- RPC migration: `supabase/migrations/20261027085534_learning_schedule_single_reschedule.sql`. This is the actual local file; the README's `20261027163000` filename does not exist. No duplicate migration or rename was introduced.
- Server Action: `apps/web/features/learning-schedule/session-reschedule.actions.ts`.
- Added tests: `supabase/tests/learning_schedule_reschedule_rpc.sql`. Uses pgTAP `no_plan()` / `finish()`, authenticated invoker helpers, real fixtures and a deliberately failing audit INSERT trigger. Everything, including the test trigger/helpers, is enclosed in a transaction ending in `ROLLBACK`.

### Database Verification

- Clean migration replay: PASS — `supabase db reset --local`, exit code 0; all 75 migrations replayed through `20261027085534_learning_schedule_single_reschedule.sql`. The local stack was already running, so a separate `supabase start` was unnecessary. Non-fatal messages: deprecated `[inbucket]` configuration and no matching `supabase/seed.sql`.
- Targeted tests: initial `supabase test db --local supabase/tests/learning_schedule_reschedule_rpc.sql` passed 83/83 assertions. Added six Task-status assertions afterward; the final file has 89 assertions, all passing in the complete suite below.
- Complete suite: `supabase test db --local`, exit code 0; `All tests successful. Files=14, Tests=223. Result: PASS`. Includes all 89 reschedule assertions plus 134 pre-existing assertions. Final suite ran after clean replay and after the final test edits.
- Timezones: the common acceptance cases run under schedule timezones `UTC`, `Asia/Ho_Chi_Minh` and `America/New_York`. These are schedule timezone variations, not variations in the host process timezone.
- Valid change / identity: PASS — RPC returns the original Session ID and retains `logical_occurrence_key` and generation `schedule_revision`; new wall-clock/UTC values are stored and `source_slot_id` becomes null.
- Exactly one event: PASS — initial reschedule creates exactly one `rescheduled` audit event with the authenticated actor, previous/new times, and scheduled-to-scheduled status.
- Same-key retry: PASS — retry with the same event UUID and original expected timestamp returns the prior Session ID; full session/event JSON snapshots remain identical, proving no extra event or second update in this test transaction.
- Stale update: PASS — a new event key with an obsolete expected timestamp raises `40001`, exact message `Stale session version`, with no session/event changes.
- Cross-owner denial: PASS — user B cannot reschedule A's session, even with otherwise valid target times; receives `22023`, exact message `Session not found`; no audit events are created by these attempts.
- Eligibility: PASS — completed, missed and past sessions are rejected with `22023`, exact message `Session is not eligible for rescheduling`. Both `todo` and `in_progress` Tasks permit valid changes; completed/cancelled Tasks and closed schedules reject new reschedules.
- Schedule date range: PASS — a new local date outside the owning schedule range is rejected with `22023` / `Invalid new study time`.
- Local-to-UTC validation: PASS — mismatched wall-clock/UTC input is rejected with `22023` / `Local time/UTC mismatch`.
- Overlap: PASS — overlap with another scheduled occurrence on the same schedule raises `23P01` / `Study session overlaps another obligation`; rejected requests leave session/event snapshots unchanged.
- Adjacency: PASS — an occurrence ending exactly when its neighbor starts is allowed, exercising the half-open interval boundary.
- Whole-schedule revision after override: PASS — `ls_revise_schedule` succeeds with revision 2, supersedes the still-future overridden session with `cancelled` / `schedule_changed`, retains its original ID/key/generation revision, and preserves the two preceding reschedule audit events. This does not assert that revision cancellation itself emits an event.
- Audit INSERT failure rollback: PASS — a temporary trigger raises `P0001` / `Injected audit insert failure` after the session UPDATE; complete before/after session and event snapshots remain equal, including version and scheduled times. The failure is expected and asserted, not a suite failure.
- DST gap: PASS — New York `2030-03-10 02:30` is rejected; probes cover both nonpositive UTC duration and positive-duration input that cannot round-trip to the nonexistent local start.
- DST fold: earlier New York `2030-11-03 01:30` instant (`05:30Z`) is accepted. A separate characterization assertion confirms that the direct RPC also accepts the later instant (`06:30Z`); this is a reproduced release blocker, not evidence that earlier-fold enforcement is implemented.
- Failures: no unexpected SQL, migration or pgTAP failures occurred. The documented later-fold and changed-payload replay limitations were reproduced with explicitly named `KNOWN BLOCKER` assertions.

### Generated Types and Web Quality Gates

- Types: PASS — `supabase gen types typescript --local`, exit code 0, generated from local `127.0.0.1:55322`; output validated before writing `apps/web/types/database.types.ts`. The generated schema contains `ls_reschedule_session`. CLI notes that generated TypeScript is unformatted; no formatter was installed.
- Lint: PASS — from `apps/web`, `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit code 0; 0 errors, 1 existing `react-hooks/exhaustive-deps` warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`, missing dependency `projection`.
- Unit tests: PASS — `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit code 0; 60 files passed, 1 skipped; 524 tests passed, 1 skipped; duration 57.98 seconds. The Focus PostgREST integration test remains skipped without its required `FOCUS_TEST_SUPABASE_*` variables. Existing Vite ESM/native-config warning is non-fatal.
- Build: PASS — after type generation, `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (includes prebuild), exit code 0; Next.js 16.2.6 compiled in 13.6 seconds, completed TypeScript in 21.5 seconds, generated 98/98 static pages.
- Execution: Supabase commands used the installed CLI executable from the npm cache with Docker access outside the sandbox. Direct Node entry points bypass the broken shell npm/npx shims. Build ran outside the sandbox with existing `.env.local`; no secrets are recorded. No remote project was targeted.

### Coverage Limits / Phase 03.5 Release Blockers

- DB earlier-fold enforcement: NOT IMPLEMENTED; later valid fold acceptance was demonstrated above. Do not enable UI until the database boundary has trustworthy canonicalization/hardening.
- Event key fingerprint: NOT IMPLEMENTED; in all three timezones, reusing the successful event UUID with different proposed times returns the previous ID and leaves the prior row/event intact. This characterizes the README limitation rather than endorsing payload-blind replay.
- Whole-schedule cancellation audit events: NOT IMPLEMENTED; forward-only audit hardening remains necessary.
- Notifications: not implemented; Phase 07 must cancel/replan unsent reminders after rescheduling.
- Actual concurrent connections and retry after a separate durable COMMIT were not exercised. These tests verify stale-version handling and replay against an existing event within one rolled-back transaction. Lock ordering is not marked verified by concurrency testing.
- Existing create/revise RPC concurrency/failure-injection coverage and transactional Task-close integration still require release review. The tests here set Task status as fixtures; they do not prove atomic Task-close integration.
- Server Action was compiled/typechecked but not invoked through a browser or dedicated action unit test. DST tests above call the RPC directly; they do not independently verify Temporal resolution in the Server Action at runtime.

### Status

LOCAL TESTS VERIFIED — the required pgTAP cases and quality gates passed within the documented coverage. Phase 03 remains IN PROGRESS and production/UI release remains BLOCKED by the Phase 03.5 items above. No UI wiring or email sending was added.

Added the SQL acceptance test, regenerated local database types and appended this evidence. Existing migration and Server Action source were preserved. No commit, push or production approval was performed.

## Step 3.5A — Schedule Cancellation Audit

### Source

- Baseline SHA: `81c73bf0c8236f835760839a03d43a37369aef40`, branch `feature/learning-schedule-foundation`, including the pre-existing untracked migration `supabase/migrations/20261027093221_learning_schedule_cancellation_audit.sql`.
- Verified on 2026-10-27, approximately 16:42–16:46 (Asia/Bangkok).
- Updated tests: `supabase/tests/learning_schedule_revise_rpc.sql` and `supabase/tests/learning_schedule_reschedule_rpc.sql`. No migration or runtime implementation was changed in this run.
- Earlier entries above are historical snapshots. This verification supersedes the earlier cancellation-audit `NOT IMPLEMENTED` statement and the old revision/reschedule assertion counts; other release blockers are unchanged.

### Failure and Fix

- Reported failure: tests 27, 50 and 73 expected two total events after whole-schedule revision but observed three. Each overridden session now correctly has two `rescheduled` events plus one new `cancelled` event from the audit trigger.
- Fix: count preserved events with `event_type = 'rescheduled'`, still expecting exactly two. Add separate assertions for exactly one `cancelled` event and its status/actor/reason metadata in each of UTC, Asia/Ho_Chi_Minh and America/New_York. The reschedule file now has 95 assertions instead of 89.
- Revision tests: increased the plan from 16 to 22, included audit events in full before/after snapshots, and added a temporary trigger that fails cancellation-event INSERTs. Test helpers/triggers and fixtures are rolled back; the failure-injection trigger is also explicitly removed before the successful revision case.
- README coverage limitation: the six-case README mentioned in the request was not available in the repository or supplied attachment. The following six cases were verified against the actual migration behavior; this is not a claim of line-by-line compliance with the unavailable README.

### Database Verification

- Clean migration replay: PASS — `supabase db reset --local`, exit code 0; all 76 migrations replayed, including `20261027093221_learning_schedule_cancellation_audit.sql`. Non-fatal messages: deprecated `[inbucket]` config and missing `supabase/seed.sql`.
- Complete tests: PASS — `supabase test db --local`, exit code 0 after reset; `All tests successful. Files=14, Tests=235. Result: PASS`. Includes all 22 revision assertions and all 95 reschedule assertions.
- Case 1 — one cancellation event: PASS. Successful whole-schedule revision cancels the future scheduled fixture and creates exactly one `cancelled` audit event.
- Case 2 — event metadata: PASS. Event owner/actor equal the authenticated owner; status transition is `scheduled -> cancelled`; deterministic event key is `ls:schedule-change-cancel:<session_id>`; payload contains `schedule_changed`, schedule ID, original generation revision 1, and the previous UTC start/end timestamps.
- Case 3 — preserve historical sessions: PASS. Completed and past scheduled fixtures are preserved apart from the already documented retired slot reference, and receive zero cancellation audit events.
- Case 4 — stale revision / duplication: PASS. A stale request raises `40001`, leaves all five table snapshots unchanged and does not create a second cancellation event. This is sequential stale-version testing, not a multi-connection race test.
- Case 5 — invalid occurrence rollback: PASS. A forged instant rejected after intermediate cancellation/slot changes restores schedules, slots, sessions, revisions and events to their original snapshots. No cancellation event survives the failed revision.
- Case 6 — audit INSERT failure rollback: PASS. The test-only trigger raises `P0001` / `Injected cancellation audit failure`; the RPC fails and all five tables exactly match their prior snapshots. The injected error is expected and asserted, not a test-suite failure.
- Failures in this run: none unexpected. The user's supplied 3-failure log documents the initial regression; after updating the assertions, the complete local suite passed on the replayed schema.

### Web Quality Gates

- Lint: PASS — from `apps/web`, `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit code 0; 0 errors, 1 existing warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6` (`react-hooks/exhaustive-deps`, missing dependency `projection`).
- Unit tests: PASS — `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit code 0; 60 files passed, 1 skipped; 524 tests passed, 1 skipped; duration 67.14 seconds. The Focus PostgREST integration test remains skipped when required `FOCUS_TEST_SUPABASE_*` variables are absent. Existing Vite ESM/native-config warning is non-fatal.
- Build: PASS — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, exit code 0; Next.js 16.2.6 compiled in 19.3 seconds, completed TypeScript in 26.5 seconds and generated 98/98 static pages.
- Execution: Supabase used the installed CLI executable from the npm cache with local Docker access outside the sandbox. Direct Node entry points bypass the broken npm/npx shell shims. Build ran outside the sandbox using existing `.env.local`; no secret values are recorded. No linked or production database was accessed.

### Status

LOCAL VERIFICATION PASS for the cancellation-audit behavior and six cases described above. Phase 03 remains IN PROGRESS: DB earlier-fold enforcement, event-key fingerprint binding, real concurrent execution and transactional Task-close integration still require hardening/review. No UI or email changes were introduced. Only the two SQL test files and this evidence were changed; the user's new migration was preserved. No commit or push was performed.

## Step 3.5B — DST Canonicalization

### Source

- Baseline SHA: `c0189cd3f281f99f530daed9c5ddaa8d8a64c7eb`, branch `feature/learning-schedule-foundation`, including the user's untracked Step 3.5C migration.
- Verified on 2026-10-27, approximately 17:12–17:16 (Asia/Bangkok), together with Step 3.5C below.
- Migration: `supabase/migrations/20261027100125_learning_schedule_dst_canonicalization.sql`.
- Tests: `supabase/tests/learning_schedule_dst_canonicalization.sql` and the DST gap/fold cases in `supabase/tests/learning_schedule_reschedule_rpc.sql`.

### Database Verification

- Clean replay: final `supabase db reset --local` PASS, exit 0; all 78 migrations replayed through `20261027101134_learning_schedule_reschedule_idempotency.sql`. The first attempt failed in the later Step 3.5C migration; see its failure/fix below. Non-fatal messages: deprecated `[inbucket]` config and missing `supabase/seed.sql`.
- Acceptance command: `supabase test db --local supabase/tests/learning_schedule_dst_canonicalization.sql supabase/tests/learning_schedule_reschedule_rpc.sql`.
- Result: PASS, exit 0; 2 files / 151 assertions, comprising 5 DST canonicalizer assertions and 146 reschedule assertions.
- Canonicalizer: all 5 assertions PASS — New York `2026-11-01 01:30` resolves to earlier `05:30Z`, not later `06:30Z`; New York `2026-03-08 02:30` gap resolves to NULL; Vietnam and UTC conversions match expected instants.
- Authenticated RPC guard: PASS — New York `2030-11-03 01:30` accepts earlier `05:30Z` and rejects later `06:30Z` with `22023` / `Noncanonical or nonexistent local study time`. The already-updated assertion expecting rejection remains in place.
- Gap rejection: PASS — existing positive-duration mismatched wall-clock/UTC and nonpositive-duration gap payloads are rejected through the authenticated RPC.
- Complete regression command: `supabase test db --local`; PASS, exit 0; 15 files / 291 assertions, after the final replay and test edits.

### Coverage Limits / Status

- LOCAL ACCEPTANCE PASS for the tested DST dates and zones. Earlier-fold enforcement is now demonstrated through the authenticated reschedule RPC for the New York fold; older `NOT IMPLEMENTED` / known-blocker entries above are historical.
- This does not establish every historical or unusual IANA transition, canonicalizer behavior across every timezone, or Server Action Temporal behavior at runtime. No browser or concurrent-connection test was run.

## Step 3.5C — Reschedule Event-Key Fingerprint

### Source

- Same baseline, branch and verification window as Step 3.5B above.
- Migration: `supabase/migrations/20261027101134_learning_schedule_reschedule_idempotency.sql` (initially untracked).
- Updated test: `supabase/tests/learning_schedule_reschedule_rpc.sql`; 146 assertions after expansion, previously 95.
- Replaced `KNOWN BLOCKER same key with different payload replays ID` with an exact `throws_ok` assertion for SQLSTATE `22023`, message `Event key reused with different request`. Kept the complete session/events unchanged assertion.

### Failures and Repair

- Initial clean replay FAILED, exit 1, SQLSTATE `42601`, syntax error near `FROM` inside `pg_catalog.extract(epoch FROM p_expected_updated_at)`. This prevented the new RPC from being installed.
- Repaired all three expressions in the untracked migration to PostgreSQL's special syntax `EXTRACT(EPOCH FROM ...)` for expected version, start instant and end instant. This retains numeric epoch representation and fingerprint semantics; no RPC signature, schema or generated types changed.
- Repeated clean replay PASS for all 78 migrations. Both targeted acceptance and the full DB suite then PASS; there were no unexpected assertion failures.

### Acceptance Tests

- Same-key identical retry: PASS in UTC, Asia/Ho_Chi_Minh and America/New_York. Original expected timestamp is accepted; Session ID is returned and full session/event snapshots remain equal with a single initial audit event.
- Changed payload: PASS — same key with different proposed start/end raises exact `22023` / `Event key reused with different request`; no session/event changes.
- Per-field fingerprint binding: PASS — separately changing expected timestamp, local date, local start time, local end time, UTC start instant or UTC end instant produces that same exact error. Each attempted mutation has an independent before/after snapshot equality assertion in all three schedule timezones.
- Fingerprint stored: PASS — the successful event contains a 64-character lowercase hexadecimal SHA-256 `requestFingerprint`.
- Replay after newer command: PASS — retrying the identical original command after a later successful reschedule still returns the original Session ID. It neither reverts the newer scheduled times nor duplicates audit events.
- Legacy event replay: PASS — privileged fixtures with no `requestFingerprint` are rejected by the authenticated RPC with the exact `22023` error. Session and event snapshots remain unchanged, including when the original session has since been cancelled by whole-schedule revision.
- Audit failure rollback: PASS — existing test-only INSERT failure raises `P0001` / `Injected audit insert failure`; full session/event snapshots remain equal, proving no update or fingerprint-bearing event survives the failed command.
- Commands/results: targeted two-file acceptance PASS (151 assertions) and full `supabase test db --local` PASS (15 files, 291 assertions), as recorded in Step 3.5B. All fixtures/helpers/test triggers are transaction-local and rolled back.

### Coverage Limits / Status

- LOCAL ACCEPTANCE PASS for fingerprint binding and replay behavior above. Session ID is held constant in per-field mutation tests: event-key uniqueness and replay lookup are scoped to `(session_id, event_key)`, so another session is a different command, not a globally forbidden key reuse.
- Retry is tested against an already-present audit row inside the same rolled-back transaction; separate durable-commit retries and simultaneous connections remain untested. Task-close transactional integration remains outstanding.
- No separate README with additional detailed cases was available; tests implement the retry, per-field changes, old/legacy replay and audit-rollback requirements in the user's instruction. No claim is made about unseen requirements.
- Supabase commands used the installed CLI executable from the npm cache outside the sandbox for local Docker access. No linked/remote database was accessed. Lint/unit/build were not rerun: this request changes SQL tests and SQL migration syntax only; previous web gate results remain historical.
- Changed the reschedule test, repaired the untracked migration syntax and appended these two evidence sections. No UI/email changes, type regeneration, commit or push were performed. Phase 03 remains IN PROGRESS pending the remaining concurrency/integration checks; this is local verification, not production approval.

## Step 3.5D-A — Task Lifecycle Synchronization

### Source

- Baseline SHA: `6683101972dc4a058437409dca11e8dce88496f1`, branch `feature/learning-schedule-foundation`; commit `fix(learning-schedule): synchronize task close and study sessions`. Working tree was clean when verification began.
- Verified on 2026-10-27, approximately 17:52–17:55 (Asia/Bangkok).
- Migration under test: `supabase/migrations/20261027104448_learning_schedule_task_close.sql`, unchanged from the local commit.
- Added `supabase/tests/learning_schedule_task_close.sql`: 31 pgTAP assertions, authenticated invoker helpers, real Task/schedule/session fixtures and a temporary audit INSERT failure trigger. All test objects and fixtures roll back.

### Migration Replay

- Command: `supabase db reset --local` from repository root.
- Result: PASS, exit 0; all 79 migrations replayed through `20261027104448_learning_schedule_task_close.sql`; CLI confirmed reset finished on `feature/learning-schedule-foundation`.
- Non-fatal messages: deprecated `[inbucket]` config and no matching `supabase/seed.sql`. Only the local database was reset; no remote project was accessed.

### Task Lifecycle Assertions

- Command: `supabase test db --local` after replay.
- Result: PASS, exit 0; `All tests successful. Files=16, Tests=322. Result: PASS`. Includes all 31 new Task-close assertions and the 291 previous assertions.
- Both closing statuses: PASS — authenticated owner transitions separate `in_progress` Tasks to `completed` and `cancelled`; each Task stores its requested closed status and its active schedule becomes `closed`.
- Future obligations: PASS — future `scheduled` session becomes `cancelled` with reason `task_closed`; all six session fixtures remain without hard deletion.
- Preserve history: PASS — running, completed, missed, skipped and past scheduled sessions are compared as full JSON rows before/after Task closure and remain exactly unchanged.
- Audit event: PASS — exactly one cancellation event for the affected session, with owner/actor equal to the authenticated user, `scheduled -> cancelled`, key `ls:task-close:<session_id>`, reason `task_closed`, Task ID and closed status, schedule ID and original scheduled start/end. The existing schedule-change trigger adds no duplicate event for this different reason.
- Unaffected sessions: PASS — the five preserved historical/running session fixtures receive zero cancellation events.
- Repeat/reopen behavior: PASS — same-status update adds no event; reopening Task to `in_progress` keeps schedule closed and session cancelled; closing again leaves the existing audit event unchanged.
- Ordinary Task: PASS — a Task without a study schedule still closes successfully.

### Audit Rollback

- Failure injection: a test-only BEFORE INSERT trigger rejects `ls:task-close:*` events with `P0001` / `Injected Task-close audit failure`.
- Completed Task path: PASS — audit failure aborts the Task UPDATE; complete snapshots of Tasks, schedules, sessions and events equal their original state.
- Cancelled Task path: PASS — the same failure and four-table rollback checks pass independently.
- The failure trigger is explicitly removed before successful lifecycle tests. These are expected, asserted exceptions; no unexpected migration/test failure occurred.

### Web Quality Gates

- Working directory: `apps/web`.
- Lint: PASS — `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit 0; 0 errors, 1 existing warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`, missing effect dependency `projection`.
- Unit tests: PASS — `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit 0; 60 files passed, 1 skipped; 524 tests passed, 1 skipped; duration 54.83 seconds. The Focus PostgREST integration test is skipped without required `FOCUS_TEST_SUPABASE_*` variables. Existing Vite ESM/native-config warning remains non-fatal.
- Build: PASS — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (including prebuild), exit 0; Next.js 16.2.6 compiled in 18.5 seconds, completed TypeScript in 23.2 seconds, generated 98/98 static pages.
- Supabase used the installed CLI executable from the npm cache outside the sandbox for Docker access. Direct Node entry points bypass broken shell npm/npx shims. Build ran outside the sandbox with existing `.env.local`; no secret values are recorded.

### Coverage Limits / Status

- LOCAL VERIFICATION PASS for the lifecycle and rollback cases above. This demonstrates Task/schedule/session/audit atomicity for single-connection Task updates and the injected audit failure; it does not establish concurrency safety against simultaneous create/revise/reschedule commands.
- Fixtures cover one active schedule and one future scheduled session per closing Task, UTC times, and a Task without a schedule. Paused schedules, multiple cancellable future sessions, cross-user Task mutation and browser/Server Action invocation were not independently tested here.
- Reopening remains deliberately non-restoring; no resume-confirmation UI or notification replanning was introduced.
- Earlier notes describing Task-close integration as outstanding are historical; this commit's single-transaction lifecycle behavior is now tested within the limits above. Phase 03 remains IN PROGRESS pending remaining concurrency/release checks; no production approval is implied.
- Only the new SQL test and this evidence section were added. Existing runtime sources, migrations and generated types were unchanged. No commit or push was performed.

## Step 3.5D-B — Real Concurrency

- Two independent PostgreSQL connections: PASS — three independent `psql` processes inside `supabase_db_lumivox-proj`: worker A PID 1696, worker B PID 1695, observer PID 1697. Workers use the authenticated fixture owner; the independent privileged observer verifies locks and committed postconditions. No host `psql` installation or remote DB URL is required.
- Task-close wins over create: PASS, 3/3 — A locks the Task, B attempts creation and is observed waiting; A closes and commits. B resumes with `22023`, exact message `Task is not eligible for scheduling`. Observer sees Task completed and zero schedules. The reverse order also passes 3/3: creation commits first, then close commits with schedule closed and future session cancelled/audited for `task_closed`.
- Concurrent duplicate create: PASS, 3/3 — after the observed lock wait, A commits creation and B receives `23505`. Exactly one schedule, slot, session and initial revision exist; no duplicate active obligation.
- Concurrent revise/revise: PASS, 3/3 — both use expected revision 1; A commits revision 2, B raises `40001` / `Stale schedule revision`. Exactly two revision records and one replacement scheduled session remain; the superseded session has one cancellation audit event.
- Concurrent revise/reschedule: PASS, 3/3 in each order — revision-first causes the waiting reschedule of the superseded session to fail with `22023` / `Session is not eligible for rescheduling`. Reschedule-first then revision succeeds; original ID/key remain in cancellation history with both reschedule and cancellation audit events intact.
- Concurrent reschedule/reschedule: PASS, 3/3 for each variant — different event keys with the same original expected version produce one success and `40001` / `Stale session version`; exact same-key/same-payload waiter returns the same Session ID after A commits, with exactly one event.
- Retry after durable COMMIT: PASS, 3/3 — A commits the reschedule, observer confirms the committed audit row, then B starts a separate transaction and replays the exact original request. Same Session ID returns and complete committed fixture snapshots remain identical, with no second event.
- No deadlocks / timeout leaks: PASS in all tested runs — lock timeout 5s, statement timeout 10s, client command deadline 15s, and observer blocking check deadline 3.5s. All 24 controlled races in the final run explicitly observed A in `pg_blocking_pids(B)` before A released its lock. No deadlock, unexpected SQLSTATE or timeout occurred. After worker rollback/commit and cleanup, observer found zero open worker transactions and zero worker locks; all three clients were closed.
- Final database invariants: PASS after every iteration — at most one schedule, no active schedule or future scheduled session on a closed Task, no duplicate effective logical occurrence or `(session_id,event_key)`, and exactly one cancellation audit event per cancelled fixture session. Only verified fixture Task/user IDs and the known dummy email are deleted; final observer snapshots contain no fixture Task, schedules, slots, sessions, revisions or events.
- Existing pgTAP regression suite: PASS — `supabase test db --local` after concurrency cleanup, exit 0; `Files=17, Tests=322. Result: PASS`. This includes 16 existing SQL suites plus the persistent setup file correctly emitting a TAP SKIP plan. No test assertion was skipped by the setup guard; only the fixture helper file was skipped.
- Audit INSERT failure: PASS, 3/3 for each of reschedule, revision and Task-close — a transaction-local test trigger raises `P0001` / `Injected concurrency audit failure`. After rollback, the third connection sees Tasks, schedules, slots, sessions, revisions and events exactly matching the pre-command committed snapshot. The temporary failure trigger does not remain in `pg_trigger`.

### Reproduction and Results

- Baseline SHA: `07136165899fd169cd3c6c4055ffdf76c9618751`, branch `feature/learning-schedule-foundation`; clean working tree before adding this harness.
- Verified on 2026-10-27, approximately 18:17–18:22 (Asia/Bangkok). The final instrumented run started at `2026-10-27T11:21:56.732Z` and finished at `2026-10-27T11:22:02.160Z`.
- Persistent setup: `supabase/tests/concurrency/learning_schedule_setup.sql`, using the Task/user IDs in the supplied instructions and explicit `BEGIN`/`COMMIT`. Requires `LS_CONCURRENCY_SETUP=1`; without that variable it emits a TAP SKIP plan so automatic pgTAP discovery cannot accidentally persist rows.
- Harness: `scripts/test-learning-schedule-concurrency.mjs`; instructions: `supabase/tests/concurrency/README.md`.
- Command from repository root: `node scripts/test-learning-schedule-concurrency.mjs --iterations 3`. Result: exit 0, 12 scenarios x 3 iterations = 36/36 PASS, fixture cleanup PASS. An earlier 36-run pass was followed by the final run with stricter exact-message and transaction/lock-cleanup checks; the saved report describes the final run only.
- Machine-readable evidence: `docs/learning-schedule/concurrency-results.json`, recording baseline, actual backend PIDs, observed blockers, SQLSTATE/messages, iteration durations, committed fixture snapshots and cleanup checks.
- Regression command: `supabase test db --local`, invoked through the installed CLI executable from the npm cache. Local Docker access required execution outside the sandbox. `node --check scripts/test-learning-schedule-concurrency.mjs` and `git diff --check` also passed.

### Coverage Limits

- These are real separate connections and durable commits, with controlled interleavings under PostgreSQL's default READ COMMITTED isolation. An explicit Task row lock gates each race, following Test A in the supplied instructions. Observed waits prove contention and revalidation for these schedules; they are not a proof for every possible lock ordering or arbitrary high-load interleaving.
- Fixtures cover one owner, one Task at a time, one initial occurrence, one-day 2030 dates and Asia/Ho_Chi_Minh. Cross-tenant races, multiple Tasks, broad randomized stress and other isolation levels are not tested here. Existing pgTAP DST/security/lifecycle tests passed separately.
- No database reset, production operation, application source change, migration, UI or email integration was introduced. Only the harness, guarded fixture setup, local usage README, JSON results and this evidence were added. Web lint/unit/build were not rerun because this step adds standalone SQL/Node verification tooling rather than application code; earlier web results remain historical.

Status: LOCAL CONCURRENCY ACCEPTANCE PASS for the scenarios and limits above. Phase 03 remains subject to broader release review; this result is not production approval. No commit or push was performed.

## Step 3.6 — Phase 03 Final Acceptance

### Baseline
- Branch: feature/learning-schedule-foundation
- HEAD SHA: `d7173707b976b86566046b6795b1138bca273566`. Verified on 2026-10-27, approximately 18:38–18:42 (Asia/Bangkok).
- Working tree: at verification start, `docs/learning-schedule/concurrency-results.json` and this evidence file already had uncommitted changes; no runtime/migration/test source changes. Both existing edits were preserved. This run fills Step 3.6 and adds a separate final-concurrency report; results therefore describe this HEAD plus documentation/report changes, not a clean committed evidence snapshot.
- Compared with product-release: local `product-release` is `fb2d8fe5e84fcc19033eba463976550129a8d99a`; `git rev-list --left-right --count product-release...HEAD` returns `0 16` (HEAD ahead by 16, behind by 0). `git diff --stat product-release...HEAD`: 37 files, 9,033 insertions, 1 deletion. Comparison uses local refs only; no fetch or remote synchronization claim.

### Database
- Clean migration replay: PASS — `supabase db reset --local`, exit 0; replay completed on the foundation branch. Only local Supabase was reset. Non-fatal messages: deprecated `[inbucket]` configuration and missing `supabase/seed.sql`.
- Total migrations: 79 SQL migrations replayed, ending at `20261027104448_learning_schedule_task_close.sql`; live local `supabase_migrations.schema_migrations` confirms latest version `20261027104448`.
- pgTAP: PASS — after concurrency cleanup, `supabase test db --local`, exit 0; `Files=17, Tests=322. Result: PASS`. All 322 assertions passed; the persistent concurrency setup helper alone emits TAP SKIP to prevent accidental fixture COMMIT during discovery.
- DST canonicalization: PASS — all 5 canonicalizer assertions and authenticated reschedule gap/fold assertions passed in the complete suite. Earlier New York fold instant accepted, later instant rejected with `22023`; nonexistent local times rejected. This is coverage of the tested dates/zones, not all IANA transitions.
- Security/RLS: PASS within existing coverage — all 20 security assertions passed, including owner A/B session visibility, anonymous zero-row visibility, cross-owner FK rejection and direct-write denial. Additional read-only live metadata check confirms all 5 learning-schedule tables have RLS enabled and one policy each; authenticated SELECT is granted but INSERT/UPDATE/DELETE are denied on every table; anon has no EXECUTE privilege on create/revise/reschedule RPCs. Metadata does not replace exhaustive behavioral isolation tests; revision/event cross-owner fixtures in the existing security file remain limited.
- Audit and rollback: PASS — create/revise/reschedule/Task-close regression tests passed, including 22 revision and 31 Task lifecycle assertions. Real-connection failure injection also passed for reschedule, revision and Task-close, with committed snapshots restored after rollback. Cancellation events, reschedule fingerprint binding, historical identity and Task reopen behavior remain covered within the stated fixture scope.

### Concurrency
- Harness command: `node scripts/test-learning-schedule-concurrency.mjs --iterations 3 --output docs/learning-schedule/phase-03-final-concurrency-results.json`, exit 0, after the clean replay and before pgTAP. Separate output preserves the pre-existing modified `concurrency-results.json`.
- Scenarios/iterations: PASS — 12 scenarios x 3 iterations = 36/36; backend PIDs A=426, B=425, observer=424. Final report records baseline SHA, SQLSTATE/messages, committed fixture snapshots and all run results. Started `2026-10-27T11:40:48.822Z`, finished `2026-10-27T11:40:53.548Z`.
- Blocking observed: PASS — 24/24 controlled races explicitly observed A in `pg_blocking_pids(B)` before release. Both create/close orders and both revise/reschedule orders passed, along with duplicate create, revise stale version, reschedule conflict and concurrent exact retry. No deadlock or timeout occurred with lock=5s, statement=10s and client=15s deadlines.
- Durable commit retry: PASS, 3/3 — observer sees A's committed audit event before B starts a new transaction and replays the identical request; same Session ID, no extra event and no changed committed snapshot.
- Final invariants: PASS after every scenario — at most one schedule, no active schedule/future scheduled session on a closed Task, unique effective occurrence identities and audit keys, exactly one cancellation event per cancelled fixture. Testing is deterministic READ COMMITTED interleavings on one owner/Task, not arbitrary load or all isolation levels.
- Fixture cleanup: PASS — Task, owner and related fixture rows removed; zero open worker transactions, zero worker locks; all clients closed. Final pgTAP run then passed independently.

### Web Gates
- Lint: PASS — from `apps/web`, `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`), exit 0; 0 errors, 1 warning.
- Unit tests: PASS — `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`), exit 0; 60 files passed, 1 skipped; 524 tests passed, 1 skipped; duration 46.08 seconds.
- Build: PASS — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (including prebuild), exit 0; Next.js 16.2.6 compiled in 16.0 seconds, completed TypeScript in 18.2 seconds and generated 98/98 static pages. Used existing `.env.local`; no secrets recorded.
- Known warnings/skips: existing missing `projection` effect dependency at `features/focus-sessions/use-focus-v2-audio.ts:104:6`; existing Vite ESM/native-config warning. Focus PostgREST integration test skipped because required `FOCUS_TEST_SUPABASE_*` variables are absent. These are recorded limitations; the skipped test is not counted as passed. Supabase CLI used the installed npm-cache executable with Docker access outside the sandbox; build also ran outside the sandbox. Direct Node commands bypass the broken npm/npx shell shims.

### Outstanding
- Out-of-scope work deferred to Phase 04–11: schedule UI/API wiring (04), remaining attendance/recovery flows (05), calendar/progress/Today's Plan (06), notification preferences/outbox/cron (07), email delivery/templates/webhooks (08), Focus/Engagement integration (09), staging E2E/load/security evidence (10), feature-flagged rollout/monitoring (11), per `architecture.md`. Existing backend rescheduling implemented here does not imply those later user flows are complete.
- Residual risks: no browser invocation of the new Server Actions, one skipped PostgREST integration test, limited revision/event RLS fixtures, selected DST dates/timezones only, and controlled single-owner concurrency rather than broad randomized or multi-tenant stress. Evidence/report changes remain uncommitted; review/preservation of this final verification snapshot is still required.
- Release blockers: none observed for the local Phase 03 gates listed here. Production release remains blocked pending UI/notification integration, staging E2E/security/load checks, environment-specific migration review and rollout approval in later phases. Historical earlier-fold/fingerprint/Task-close blockers above have local tests now; that does not authorize deployment.

### Final Decision
- Phase 03: PASS — local final-acceptance gates above passed with explicitly documented warnings, skip and coverage limits. No unexpected reset, SQL test, concurrency, lint, unit-test or build failure occurred in this run.
- Ready for Phase 04: YES — proceed with local UI/API integration while retaining the residual risks and later release gates above. This is not a claim that Phase 04–11 is complete.
- Production deployment authorized: NO
