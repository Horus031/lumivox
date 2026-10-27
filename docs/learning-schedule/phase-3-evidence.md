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
