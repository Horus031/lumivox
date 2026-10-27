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
