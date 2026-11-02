# Phase 02 — Database Foundation Evidence

Verified on 2026-10-27, approximately 13:37–13:40 (Asia/Bangkok).

Scope: steps 4–5 only, following the user's updated instruction. Steps 1–3 were reported as completed by the user; migration replay and test expansion were not repeated in this verification run. All database commands below targeted local Supabase, not a linked project.

## Git Baseline
- Branch: `feature/learning-schedule-foundation`
- Commit SHA: `57e765522ca608ed4443ebc8cb5768090bf785b9`
- This SHA identifies the starting checkout, not a commit containing this evidence. Working-tree changes remain uncommitted.
- Hardening migration already present: `supabase/migrations/20261027063026_learning_schedule_constrains_hardening.sql` (untracked at verification time).

## Migration Replay
- Intended command: `supabase db reset --local`.
- Result: not executed in this run, per the updated scope. The user reported steps 1–3 were already done.
- Errors: no reset output was collected; migration replay is not independently marked PASS here.

## Database Security Tests
- Command, from repository root: `supabase test db --local supabase/tests/learning_schedule_security.sql`.
- Execution: invoked the installed Supabase executable from the local npm cache directly because the shell's `npx` shim was broken in the agent environment. Docker access required running outside the sandbox.
- Result: exit code 0; `All tests successful. Files=1, Tests=7. Result: PASS`.
- The file uses pgTAP `plan(7)`, `ok`, `is`, `throws_ok`, and `finish()`. All fixture changes are rolled back.

| Check | Actual result / coverage |
| --- | --- |
| RLS enabled | PASS for `task_study_sessions` only. The other four tables are not asserted by this test file. |
| Owner A | PASS: authenticated A sees exactly one own session and zero B sessions. |
| Owner B | B fixtures exist, but the test does not switch to B to verify reciprocal reads. |
| Anonymous | Not tested by the current file. |
| Direct write restrictions | PASS: authenticated session UPDATE is rejected with SQLSTATE `42501`. INSERT/DELETE and the other four tables are not tested here. |
| Cross-owner FK | PASS: a privileged cross-owner slot INSERT is rejected with `23503`. |
| Invalid time range | PASS: slot end before start is rejected with `23514`. |
| Duplicate slot | PASS: an identical schedule/weekday/time slot is rejected with `23505`. This does not verify partially overlapping slots. |
| Overlap constraint | Not tested by the current file. |
| Completed occurrence uniqueness | Not tested by the current file. |

No security test expansion was performed in this run. Despite the user's report that step 3 was complete, the file inspected and executed still contains only the seven assertions listed above. Its PASS result must not be interpreted as full five-table security coverage.

## Generated TypeScript Types
- Command, from repository root: `supabase gen types typescript --local`.
- Output: `apps/web/types/database.types.ts`, written only after a successful command and validation that output contains `export type Database`.
- Result: exit code 0; generated from local database at `127.0.0.1:55322`.
- All five learning-schedule tables are represented. Compared with the starting checkout, the generated schema content is unchanged; the file diff removes a UTF-8 BOM on its initial blank line.
- CLI notice: generated TypeScript is unformatted. No new formatter was installed.

## Web Quality Gates
Working directory: `apps/web`. Commands below are the package scripts or their direct equivalent.

| Gate | Executed command | Actual result |
| --- | --- | --- |
| Lint | `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`) | Exit 0; 0 errors, 1 warning. |
| Unit tests | `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`) | Exit 0; 58 files passed, 1 file skipped; 505 tests passed, 1 skipped; duration 46.63 seconds. |
| Production build | `npm run build`, invoked through the installed npm CLI using Node | Exit 0 on retry outside the sandbox; compiled successfully, TypeScript completed, 98/98 static pages generated. |

- Lint warning: `features/focus-sessions/use-focus-v2-audio.ts:104:6`, `react-hooks/exhaustive-deps`: effect dependency `projection` is missing. No change was made to this unrelated file.
- Skipped test: `features/focus-sessions/focus-session.integration.test.ts`, which requires `FOCUS_TEST_SUPABASE_URL`, `FOCUS_TEST_SUPABASE_PUBLISHABLE_KEY`, and `FOCUS_TEST_SUPABASE_SECRET_KEY`. At least one required variable was absent in the test process.
- Vitest emitted a Vite configuration warning about ESM syntax in `vitest.config.ts` under CommonJS and future native config loading; it did not fail the tests.
- Initial sandboxed build failed with `EPERM` opening `.next/trace-build`. Repeating the same build outside the sandbox succeeded; this was an execution-permission issue, not a successful first attempt.
- Next.js build used the existing `.env.local`. No environment values are recorded here.

## Remaining Issues
- Full RLS coverage across all five tables, reciprocal owner B checks, anonymous access, overlapping slots, and duplicate completed occurrences are not demonstrated by the current security test. These remain unverified; step 3 was outside this run's scope.
- Migration replay has no independently captured output in this run.
- One lint warning and one skipped integration test remain as documented above.
- Hardening migration, earlier security-test changes, generated types, and this evidence have not been committed or pushed by this run.

## Final Status
- Step 4: existing security test PASS (7/7), local TypeScript types regenerated, lint PASS with one warning, unit tests PASS with one skip, production build PASS.
- Step 5: actual results recorded in this file.
- Overall Phase 02: not declared fully verified. A complete acceptance decision still requires the missing security coverage and migration-replay evidence above.


## Final Acceptance — Step 2.4

Verified on 2026-10-27, approximately 13:50–13:53 (Asia/Bangkok), on
`feature/learning-schedule-foundation`, starting commit
`1db7ec0bae9425c36a2c5b28bf4ae4ca4f669811` with working-tree changes.
This section records a new verification run and supersedes the earlier run's
pending migration replay and seven-assertion security results above.
Only the local Supabase stack was reset/tested. Supabase commands were executed
using the installed CLI executable in the npm cache; web commands used Node
directly where needed to avoid the broken shell npm/npx shims. Docker and build
commands ran outside the sandbox with the required permissions.

### Clean Migration Replay
- Command: supabase db reset --local
- Result: PASS, exit code 0. CLI reported `Finished supabase db reset on branch feature/learning-schedule-foundation.`
- Applied migrations: all 72 SQL migrations, from `20260514043306_init_lumivox_core_schema.sql` through `20261027063026_learning_schedule_constrains_hardening.sql`, including `20261027060524_learning_schedule_foundation.sql`.
- Non-fatal messages: `[inbucket]` configuration is deprecated in favor of `[local_smtp]`; no files matched `supabase/seed.sql`. Schema replay completed successfully; no seed data was loaded from that missing file.

### Database Security
- Command: supabase test db --local
- Result: PASS, exit code 0, run after the clean migration replay. `All tests successful. Files=11, Tests=110. Result: PASS`.
- Assertions: all 20 assertions in `learning_schedule_security.sql` passed; the remaining 90 assertions in the other 10 SQL test files also passed.
- Test fixtures are enclosed in transactions ending in `ROLLBACK`.

### Constraints
- Overlapping slots: PASS. Inserting Monday 20:00–21:00 into a schedule already containing Monday 19:00–20:30 is rejected with SQLSTATE `23P01`.
- Completed occurrence uniqueness: PASS. After marking the original occurrence completed, recreating its `(schedule_id, logical_occurrence_key)` as a new scheduled session is rejected with SQLSTATE `23505`.

### Authorization
- User A: PASS for the assertions present: reads one own session, one own schedule and one own slot; sees zero B sessions, revisions and events.
- User B: PASS: reads one own session and sees zero A sessions after switching the JWT subject to B.
- Anonymous access: PASS: after switching to `anon` and clearing JWT claims, the session query returns zero rows. The assertion checks RLS visibility rather than expecting permission error `42501` because table-level SELECT is granted to `anon`.
- Direct write restrictions: PASS, SQLSTATE `42501` for authenticated UPDATE sessions, UPDATE schedules, DELETE slots, INSERT revisions and DELETE session events.
- Ownership FK: PASS, SQLSTATE `23503` for a cross-owner slot insertion.
- Coverage limit: no revision/event fixtures are inserted, so the zero-row checks for those two tables alone do not prove cross-owner isolation. Explicit RLS-enabled metadata is asserted only for sessions. These results cover the current 20 assertions, not an exhaustive security review of every operation on all five tables.

### Quality Gates
- Working directory: `apps/web`.
- Lint: PASS, exit code 0. Executed `node node_modules/eslint/bin/eslint.js .` (equivalent to `npm run lint`); 0 errors, 1 warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6` for missing effect dependency `projection`.
- Unit tests: PASS, exit code 0. Executed `node node_modules/vitest/vitest.mjs run` (equivalent to `npm run test:unit`); 58 files passed, 1 skipped; 505 tests passed, 1 skipped; duration 63.16 seconds. The skipped Focus PostgREST integration test requires `FOCUS_TEST_SUPABASE_*` environment variables, at least one of which is absent. The existing Vite ESM/native-config warning remains non-fatal.
- Build: PASS, exit code 0. Executed `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build` (the package's `npm run build`, including prebuild). Next.js 16.2.6 compiled successfully in 18.8 seconds, completed TypeScript in 22.9 seconds, and generated 98/98 static pages. Used existing `.env.local`; no secret values are recorded here.

### Final Review
- Phase 02 status: PASS for the Step 2.4 commands and assertions specified above, with one lint warning, one skipped integration test, and the documented security-coverage limits.
- No runtime files, migration files or test assertions were changed during this verification run. Only this evidence section was filled in; pre-existing test edits were preserved.
- No commit, push or remote database operation was performed.
