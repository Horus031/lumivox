# Phase 05 — Attendance & Recovery Evidence

## Baseline and Scope

- Branch: `feature/learning-schedule-foundation`.
- Starting HEAD: `89be637e275db37854dc9bacb8e083dbd7f25a4e` (`test(learning-schedule): complete phase 04 acceptance`).
- Verified on 2026-10-31, approximately 14:11–14:20, Asia/Bangkok.
- Initial working tree: one untracked, empty (0-byte) migration, `supabase/migrations/20261031071036_learning_schedule_start_attendance.sql`; no Start acceptance test or Phase 05 evidence file existed. After this was identified, the user explicitly authorized writing the SQL according to the supplied guide.
- Implemented content in the migration the user already created; did not create/rename another migration. Added rollback-only pgTAP acceptance tests and a repeatable independent-connection Start concurrency harness.
- Phase 04 handoff remains local PASS according to its existing final report. Those historical results are not counted as fresh Phase 05 executions below.
- This report covers Step 5.1 RPC/state transition only. No Attendance UI, Next.js Start Server Action, Focus integration, notification/email sending, generated TypeScript binding, commit, push or production deployment was added/performed.

## Step 5.1 — Attendance State Machine and Start Session RPC

### Implementation / Contracts

- Migration: `supabase/migrations/20261031071036_learning_schedule_start_attendance.sql`.
- RPC: `public.ls_start_study_session(p_session_id uuid, p_expected_updated_at timestamptz, p_event_key text) RETURNS uuid`.
- SECURITY DEFINER is required for the existing authenticated read-only table model. The function sets an empty search_path, revokes execution from PUBLIC/anon, grants it only to authenticated, checks auth.uid and ownership before reading/replaying/writing the command, and never trusts user-editable metadata.
- Row locks are acquired in Task -> Schedule -> Session order, matching existing scheduling commands. Task must be a root in todo/in_progress, Schedule active, and Session scheduled.
- Start window: inclusive scheduled_start_at and exclusive scheduled_end_at + 60 elapsed minutes. Uses clock_timestamp after locks so waiting does not freeze eligibility at transaction-begin time. Starting after scheduled end is allowed only while still before grace cutoff.
- Request fingerprint hashes a typed canonical object with command=start, Session ID and expected-version epoch. The event key is scoped by the existing unique (session_id,event_key) constraint. Exact replay is checked before state/window/stale checks and returns the prior ID without another event. A reused key with another version or incompatible prior event fails closed.
- Transition updates only status to in_progress (plus the existing updated_at trigger), then inserts one started audit event with owner/actor, from/to states, event key, fingerprint, expected version and server-observed startedAt. Both writes are atomic.
- Does not complete the Task, set completed_at, write actual_study_minutes, create a Focus timer, or send email. Original session identity and planned time are retained.

### SQLSTATE / HTTP Contract

| Condition                                                                              | SQLSTATE           | Verified HTTP response                              |
| -------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------- |
| Missing authentication / non-owner / inaccessible session                              | 42501              | Cross-owner authenticated request: 403              |
| Invalid key/version input, invalid state/window, changed payload under an existing key | 22023              | Changed same-key payload: 400                       |
| Stale expected version on an otherwise eligible scheduled session                      | PT409              | 409, observed in 26 ms                              |
| Valid Start / identical replay                                                         | Success, same UUID | 200                                                 |
| Injected audit failure in test only                                                    | P0001              | SQL-only rollback test; not an HTTP acceptance case |

- Business stale errors deliberately use PT409 rather than 40001. This follows [PostgREST custom HTTP error codes](https://docs.postgrest.org/en/v14/references/errors.html) and [Supabase guidance on custom serialization errors/retry loops](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions). The HTTP mapping and absence of the previous multi-second stale response were actually probed locally; it is not a source-review-only claim.
- Existing Phase 03 reschedule/revise RPC SQLSTATE contracts were not changed by this migration.

### Acceptance Matrix — Executed

| ID       | Actual test / result                                                                                                                                                                                                                                                 | Status                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| START-01 | Owner starts eligible session; same UUID, status in_progress, original logical identity retained, completed_at/actual_study_minutes remain null and parent Task stays todo.                                                                                          | PASS                    |
| START-02 | Exactly one started event with scheduled -> in_progress, owning actor and nonnull fingerprint. Real Auth/PostgREST probe also verifies one event.                                                                                                                    | PASS                    |
| START-03 | Original expected version/key replay succeeds after status/version change without another event. Independent-transaction durable replay also passes in the concurrency harness.                                                                                      | PASS                    |
| START-04 | Same session/key with a different expected version fails 22023 / Event key reused with different request. Real HTTP probe returns 400; event count stays one.                                                                                                        | PASS                    |
| START-05 | Future session (one hour ahead) rejected as outside the start window.                                                                                                                                                                                                | PASS                    |
| START-06 | Session more than 60 minutes after scheduled end rejected; a separate fixture after end but still inside grace starts successfully.                                                                                                                                  | PASS                    |
| START-07 | Completed, cancelled, missed, skipped and already-in-progress fixtures rejected.                                                                                                                                                                                     | PASS                    |
| START-08 | Completed/cancelled Task and paused Schedule rejected. Existing Task-close integration/guards remain intact.                                                                                                                                                         | PASS                    |
| START-09 | User B denied with 42501 and cannot read A's row through RLS. Real locally signed-in B receives HTTP 403. Missing auth identity is rejected, anon cannot execute, authenticated has execution permission.                                                            | PASS                    |
| START-10 | Stale version does not overwrite scheduled status or timestamp; SQLSTATE PT409. Real authenticated PostgREST stale request returns 409 in 26 ms without changing the row.                                                                                            | PASS                    |
| START-11 | Temporary BEFORE INSERT audit trigger throws after attempted status update; complete session/event snapshots match the prior snapshot, including updated_at. Trigger/helper/fixture changes roll back.                                                               | PASS                    |
| START-12 | Separate A/B/observer PostgreSQL connections: distinct-key double Start has one transition and one 22023 loser; exact-key double Start returns the same ID to both with only one event. Both scenarios repeated three times and observed blocked by A before commit. | PASS — real concurrency |

### Database Replay / pgTAP — Actual Commands and Results

- LOCAL ONLY, from repo root: `supabase db reset --local`, exit 0. All 80 migrations replayed, including the new Start migration. Independent migration-history count confirmed 80. No linked/remote database was used.
- Warning: no files matched supabase/seed.sql; no seed file was present. Migration replay still completed successfully.
- `supabase test db --local`, exit 0: Files=18, Tests=355, Result=PASS, 1 wallclock second. This includes 33 new Start assertions plus the 322 existing database assertions.
- Start test file: `supabase/tests/learning_schedule_start_attendance.sql`. It uses BEGIN/ROLLBACK, two Auth/profile owners, authenticated role/JWT claims, realistic current-window/future/expired fixtures, error assertions and audit-insert failure injection.
- Fixture timezone is chosen between UTC and a fixed-offset IANA zone to keep local start/end away from midnight at any UTC execution hour. Original updated_at is intentionally older than the test transaction so version-change/replay assertions remain meaningful despite PostgreSQL transaction timestamps.
- Persistent Phase 03 concurrency setup emits one intentional TAP SKIP; it is not a skipped Start acceptance case. START-12 is verified by its separate new real harness, not by sequential pgTAP statements.

### START-12 — Real Concurrency / Durable Replay

- Script: `scripts/test-learning-schedule-start-concurrency.mjs`; run from repo root with `node scripts/test-learning-schedule-start-concurrency.mjs`.
- Exit 0; 6/6 races PASS (two scenarios x three iterations), all six blocking relations observed through pg_blocking_pids. A/B/observer are three distinct local psql backends inside supabase_db_lumivox-proj. No remote DB URL is accepted.
- Worker A holds the Task lock and performs uncommitted Start. Worker B issues Start under a separate authenticated transaction. Observer proves B waits for A before A commits; the result is checked after both transactions finish.
- Distinct-key case: A succeeds, B rejects ineligible in_progress state with 22023, not an invented second transition. Exact-key case: A/B return the same UUID. Each final state has one started event, in_progress status, null minutes/completion and unchanged todo Task.
- An additional exact replay runs in a new transaction after durable commit for every race; all 6/6 preserve the final snapshot/event count.
- Deadlines inherited from the existing connection helper pattern: lock timeout 5s, statement timeout 10s, client command deadline 15s; observed wait deadline 3.5s. The helper is copied into the dedicated script; the existing Phase 03 harness was not modified.
- Report: [phase-05-start-concurrency.json](./phase-05-start-concurrency.json). status=PASS, cleanup=PASS, openWorkerTransactions=0, remainingWorkerLocks=0. Fixture UUIDs are fresh per run and cleanup checks ownership/title before deletion.

### Authenticated HTTP Probe — Actual Results

- Local Node stdin probe executed from apps/web with @supabase/supabase-js and Temporal already installed. LEARNING_SCHEDULE_TEST_URL/ANON_KEY/SERVICE_KEY came from CLI status into process variables without printing or saving credential values. Guard required loopback host/API port 55321.
- Created two disposable locally signed-in users and a valid Start-window fixture; invoked the actual ls_start_study_session endpoint with a 5-second bound on the stale probe.
- 6/6 checks PASS: stale PT409/HTTP 409 (26 ms); cross-owner 42501/HTTP 403; valid Start 200; identical replay 200; changed same-key request 22023/HTTP 400; exactly one started event and no completion/minutes afterward.
- Report: [phase-05-start-http.json](./phase-05-start-http.json). status=PASS, cleanup=PASS. Users signed out/deleted, and remaining Task counts were confirmed zero.
- This is real Auth/JWT/PostgREST verification of the RPC contract. It is not a Next.js Start Server Action or browser attendance E2E test; those have not been implemented here.

### Web Quality Gates — Actual Results

- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors and 1 existing missing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Unit suite: `node node_modules/vitest/vitest.mjs run`, exit 0; 69 files passed / 2 skipped; 612 tests passed / 20 skipped (632 total), duration 90.42 seconds. Skips are the 19 opt-in Phase 04 Schedule integration cases and 1 existing Focus integration case; these were not separately rerun in this Step 5.1 verification. New attendance acceptance executes in pgTAP, its real concurrency harness and the HTTP probe above.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0; Next.js 16.2.6 compiled in 25.2 seconds, TypeScript completed in 48 seconds and generated 98/98 static pages in 1142 ms.
- Web source/generated types were unchanged by this backend-only step. The web gates were executed against the unchanged application during SQL implementation; no new Start RPC binding or UI type coverage is claimed.
- Direct Node entry points bypass the environment's broken npm/npx shims. Existing Vite native config-loader and local Supabase inbucket/optional-stopped-service notices are non-fatal. No failed migration, pgTAP, concurrency, HTTP, lint, unit or build run occurred after SQL implementation in this step.
- Final independent DB query: migrations=80, remaining attendance fixture users=0, start_test_audit_failure triggers=0. `git diff --check` passed.

### Coverage Limits / Decision

- Step 5.1 RPC/state-transition acceptance: LOCAL PASS for START-01–START-12 within the boundaries above. All success decisions use executed results, not source review alone.
- Concurrency coverage is controlled same-session double Start with distinct/exact keys plus durable replay under READ COMMITTED. Start versus Task-close/revise/reschedule/missed sweep, audit failure under competing requests, arbitrary load and other isolation levels remain Step 5.6 hardening work. The previous 36-case Phase 03 harness was not rerun here.
- Time tests cover future, valid, expired and within-grace fixtures. The code defines inclusive start/exclusive grace cutoff; an exact microsecond cutoff or a wait crossing that cutoff was not separately injected. Complete/Missed Sweep must adopt the same explicit policy in subsequent steps.
- No Focus-session creation/minute accounting is implemented. Actual study duration must not be inferred from the planned duration. No attendance UI, Start Server Action, browser E2E or generated RPC types were added in this step.
- Existing Phase 03 RPCs still have their documented 40001/HTTP-timeout limitation; this migration's PT409 contract does not repair those older functions. Durable client command storage across navigation remains outside this SQL step.
- Phase 05 overall: IN PROGRESS. Steps 5.2–5.8 have not been executed. Ready to develop Step 5.2 locally; production deployment authorized: NO.
- No commit or push was performed; the user will handle both.

## Step 5.2 — Complete Session RPC

### Baseline / Reviewed Changes

- Checked HEAD: `3e90ade177779fc1fe7c6117e332768d60aa37fa`, branch `feature/learning-schedule-foundation`.
- Verified on 2026-10-31, approximately 14:45–14:50, Asia/Bangkok. Step 5.1 results above remain historical snapshots.
- Initial working tree contained two user-supplied untracked files: the Complete migration and its SQL acceptance test. This verification did not modify their implementation, create/rename another migration, add application code, regenerate types, commit or push.
- Actual existing migration filename: `supabase/migrations/20261031073306_learning_schedule_complete_attendance.sql`. This is the supplied CLI-named migration used for replay, not an invented timestamp or a migration generated again during verification.
- Acceptance file reviewed and executed: `supabase/tests/learning_schedule_complete_attendance.sql`.
- RPC: `public.ls_complete_study_session(uuid,timestamptz,text) RETURNS uuid`. Reviewed Task -> Schedule -> Session locking, auth.uid/owner guards, root Task todo/in_progress eligibility, active Schedule, scheduled/in_progress source states, exact replay before eligibility/staleness, canonical fingerprint, completed_at and atomic completed audit.
- Completion policy in source: inclusive scheduled_start_at, exclusive scheduled_end_at + 60 elapsed minutes. Uses clock_timestamp after row locks. Sets status=completed and completed_at to the same server instant recorded in audit; wasLate is true only after planned end. Does not change Task status, Focus data or actual_study_minutes.

### Clean Replay / pgTAP — Executed

- From repo root: `supabase db reset --local`, exit 0. Clean replay applied all 81 migrations, including `20261031073306_learning_schedule_complete_attendance.sql`. Independent database history count confirmed 81.
- Then `supabase test db --local`, exit 0; Files=19, Tests=381, Result=PASS, 6 wallclock seconds. Includes 26 new Complete assertions plus 355 existing assertions.
- The persistent concurrency setup file emits its intentional TAP SKIP; this is not a concurrency test for Complete and is not counted as one. Existing pgtap extension notices are non-fatal.
- Missing supabase/seed.sql warning was observed; no seed file was present and replay still completed. Only Supabase local was reset; no linked/remote database was used.

### Complete Acceptance — Executed Results

| Area / test                           | Actual coverage                                                                                                                                                                                               | Result                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| COMPLETE-01: scheduled -> completed   | Original Session UUID returned; completed status and nonnull completed_at persisted; actual_study_minutes stays null.                                                                                         | PASS — pgTAP and HTTP           |
| COMPLETE-02: in_progress -> completed | Original UUID returned; HTTP probe additionally verifies completed state/time and audit from_status=in_progress.                                                                                              | PASS                            |
| COMPLETE-03: within grace             | Fixture ended 10 minutes ago; completion accepted with wasLate=true. Other HTTP fixtures complete before end with wasLate=false.                                                                              | PASS                            |
| COMPLETE-04: authoritative audit      | Exactly one completed event with correct from/to, owning actor and fingerprint. HTTP verifies 64-hex fingerprint and equality of audit completedAt and persisted completed_at as instants.                    | PASS                            |
| COMPLETE-05: exact replay             | Original expected version/key succeeds after completion; one event only. HTTP compares full session snapshots before/after replay, preserving completed_at/updated_at and UUID.                               | PASS                            |
| COMPLETE-06: key fingerprint          | Changing expected version under a used key rejects with 22023 / Event key reused with different request before completed-state/stale handling. Event count and full HTTP row snapshot remain unchanged.       | PASS                            |
| COMPLETE-07: timing rejection         | Future fixture and expired grace-window fixture reject 22023 / Session is outside the completion window.                                                                                                      | PASS — pgTAP                    |
| COMPLETE-08: disallowed states        | Already completed, cancelled, missed and skipped fixtures reject 22023. Late recovery is not silently treated as ordinary Complete.                                                                           | PASS — pgTAP                    |
| COMPLETE-09: parent eligibility       | Completed Task and paused Schedule fixtures reject 22023. Other parent eligibility branches were source-reviewed, not individually exercised in this new suite.                                               | PASS for executed cases         |
| COMPLETE-10: stale PT409              | Otherwise eligible stale scheduled row remains scheduled with null completion and original timestamp. HTTP 409/PT409 observed in 13 ms; independent full-row before/after comparison is equal.                | PASS                            |
| COMPLETE-11: user isolation           | User B cannot complete A's session: SQLSTATE 42501; real authenticated HTTP response is 403. No owner-row change follows denial.                                                                              | PASS                            |
| COMPLETE-12: Task/Focus separation    | Task stays todo, minutes stay null; no Focus-start or Task-completion call exists in this function. Focus table snapshots were not independently compared in this step.                                       | PASS within stated boundary     |
| COMPLETE-13: audit rollback           | Temporary BEFORE INSERT completed-event trigger raises P0001 after attempted completion. Complete session/event snapshots equal the pre-command snapshot, including timestamps; the error aborts both writes. | PASS — pgTAP                    |
| Execution privileges                  | anon cannot execute; authenticated can execute the reviewed RPC. Security-definer owner checks precede replay/mutation and empty search_path is retained.                                                     | PASS — pgTAP plus source review |

### HTTP Contract — Supabase Local

- Ran a local Node stdin probe from apps/web using existing @supabase/supabase-js and Temporal packages. The probe guarded loopback host and API port 55321; URL/anon/service credentials came from local CLI status into process variables without printing or saving secrets.
- Created two disposable users, signed in with real Auth/JWT clients, and used actual PostgREST RPC requests against scheduled, in_progress and post-end/in-grace fixtures. No requireUser injection or fake RPC response was used; no Next.js attendance Server Action or browser UI exists in this verification.
- 14/14 checks PASS. [Raw report: phase-05-complete-http.json](./phase-05-complete-http.json).

| Request                                    | HTTP / SQLSTATE | Actual result                                                         |
| ------------------------------------------ | --------------- | --------------------------------------------------------------------- |
| Stale expected version on eligible session | 409 / PT409     | Rejected in 13 ms; row unchanged; 5-second request bound not reached. |
| Another authenticated owner                | 403 / 42501     | Denied; row unchanged.                                                |
| Complete from scheduled                    | 200             | Same UUID; completed timestamp and one event.                         |
| Complete from in_progress                  | 200             | Same UUID; correct audit source state.                                |
| Complete after end, inside grace           | 200             | wasLate=true; completion time persisted.                              |
| Exact replay of each successful command    | 200             | Same UUID and entire completed row; no extra event.                   |
| Changed version under each used key        | 400 / 22023     | Rejected; row and one-event count unchanged.                          |

- Both probe users signed out and were deleted; remaining per-user Task counts were zero. Final independent query confirmed 0 completion fixture users and 0 complete_test_audit_failure triggers. pgTAP fixtures/helpers/injected trigger rolled back.

### Application Quality Gates — Executed

- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors and 1 existing missing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Vitest: `node node_modules/vitest/vitest.mjs run`, exit 0; 69 files passed / 2 skipped; 612 tests passed / 20 skipped (632 total), duration 98.06 seconds.
- Skip accounting: 19 opt-in Phase 04 direct integration cases and 1 existing Focus integration case were not separately run in Step 5.2. The new Complete checks ran in pgTAP and the real HTTP probe above; they are not included in the 612 Vitest passes.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in 13.4 seconds, TypeScript completed in 26.2 seconds and generated 98/98 static pages in 967 ms.
- Direct Node entry points bypass the broken npm/npx shell shims. Existing .env.local was not edited; build used it normally. Local database/HTTP/build commands ran with the required permissions. Existing Vite config-loader and Supabase deprecated inbucket/optional stopped-service notices remain non-fatal.
- No test, replay, HTTP or build failure occurred in this verification. `git diff --check` passed for tracked edits. No application source, generated types or migration/test implementation was changed by this verification.

### Explicit Limits / Remaining Work

- **Two-connection Complete concurrency: NOT EXECUTED.** This suite uses sequential pgTAP calls and sequential HTTP requests. Neither proves race safety. Lock order was source-reviewed only for Complete; prior Start/Phase 03 concurrency reports do not establish Complete versus Complete/Start/Task-close/sweep behavior. Add independent PostgreSQL connections, observed lock waits, final audit counts and cleanup checks in Step 5.6.
- **Exactly at grace cutoff: NOT EXECUTED.** Tests cover valid-before-end, 10 minutes after end but before the 60-minute cutoff, future and expired fixtures. The SQL specifies a strict exclusive cutoff, but no controlled exact-microsecond boundary, just-before/just-after pair or lock wait crossing the cutoff was injected. Do not mark that boundary test PASS from source review.
- Additional not-newly-executed cases include null/whitespace key variants for Complete, mismatched historical event types/legacy fingerprints, cancelled Task specifically, other Task status/subtask branches and replay after later Task/Schedule changes. Existing source guards are not substituted for these tests.
- No generated Complete RPC TypeScript binding, authenticated Next.js Complete action, Attendance UI/browser E2E, Focus integration, minutes accounting, reminder/email handling or production deployment was added/tested. Web type/build success does not prove a future Complete client binding.
- Step 5.2: LOCAL PASS for the executed sequential RPC, HTTP, rollback, ownership and web regression checks above; concurrency and exact-cutoff acceptance remain open, not implied complete.
- Phase 05 overall remains IN PROGRESS; Steps 5.3–5.8 have not been executed here. Production deployment authorized: NO. No commit or push was performed.

## Step 5.3 — Skip Study Session

### Baseline

- Branch: `feature/learning-schedule-foundation`; verified locally on 2026-10-31 (Asia/Bangkok).
- HEAD SHA: `78d30e41e04a83b61c06fcc8f84c0e84a71b01cc` — `feat(learning-schedule): add audited study session completion RPC`. The new Skip migration/test were untracked working-tree additions at verification time; this SHA identifies the baseline, not a commit containing Skip.
- Migration filename: `supabase/migrations/20261031075444_learning_schedule_skip_attendance.sql`. Reviewed alongside `supabase/tests/learning_schedule_skip_attendance.sql`; both user-supplied files were tested without implementation edits. Only this evidence and the HTTP report were added/updated by verification. No commit or push.

### Database

- Clean replay: PASS — ran local CLI `supabase db reset --local`, then `supabase test db --local`, both exit 0. Commands used the installed Windows Supabase executable directly because the npm/npx shell shims are broken. No remote database was targeted.
- Total migrations: **82**, independently confirmed from `supabase_migrations.schema_migrations` after clean replay.
- pgTAP: **PASS — 20 files, 409 assertions, 0 failures**, 2 wall-clock seconds. The existing fixture/setup skip is not a new Skip assertion. SQL fixtures and injected audit-failure trigger run inside a rolled-back transaction.
- Existing assertions: **381**, including Start, Complete and existing Learning Schedule/Focus/Workspace suites, passed again in the full run.
- New Skip assertions: **28**, all passed in `learning_schedule_skip_attendance.sql`. Covers successful transitions/identity, audit, replay, reason fingerprint, timing/state/parent eligibility rejection, stale version, ownership/RLS, reason/key validation, Task separation, audit rollback and execution privileges.

### Functional

- scheduled -> skipped: PASS — current and future scheduled sessions return the original UUID and become skipped; planned time/logical occurrence identity is retained, completed_at and actual_minutes remain null. Verified by pgTAP and actual HTTP row snapshots.
- missed -> skipped: PASS — a missed session inside its recovery window becomes skipped; the audit source status is missed. Verified by pgTAP and HTTP.
- Optional reason: PASS — omitted reason, explicit null, empty string and ordinary-space-only reason are accepted as the same no-reason request via HTTP replay. A reason exceeding 500 characters rejects with 22023; audit stores normalized optional reason.
- Reason normalization: PASS for executed ordinary-space cases — leading/trailing spaces are trimmed; `  Personal appointment  ` and `Personal appointment` replay identically. Source uses PostgreSQL `btrim`, so this does not establish normalization of tabs/newlines or arbitrary Unicode whitespace.
- Idempotency: PASS — the original event key/version and equivalent normalized reason return the same UUID after the transition. Full persisted session and event snapshots stay equal; exactly one skipped audit event exists. Seven sequential HTTP replay requests passed across scheduled/future/missed fixtures.
- Fingerprint mismatch: PASS — changing reason under an already-used key returns 22023 / `Event key reused with different request`; full session/event snapshots remain unchanged. Source review confirms fingerprint also binds command, session ID and expected-version epoch; changing each of those fields was not separately exercised in the new HTTP probe.
- Recovery-window rejection: PASS for away-from-boundary fixtures — expired scheduled grace (end + 60 elapsed minutes) and missed recovery reject 22023 without mutation. A 2-day-old missed fixture succeeds; a 10-day-old fixture rejects. Source defines missed cutoff as exclusive local midnight at historical session local_date + 8 in the session timezone, rather than 7 x 24 UTC hours. Exactly-at-cutoff/DST behavior remains unexecuted below.
- Stale PT409: PASS — otherwise eligible stale scheduled session rejects PT409 and stays unchanged. Real PostgREST response was HTTP 409 in **32 ms**, within the probe's 5-second bound.
- Cross-owner denial: PASS — user B receives 42501 when targeting A's session; SQL RLS read isolation and HTTP full-row invariance passed. Anonymous execute denied and authenticated execute allowed by pgTAP.
- Audit rollback: PASS — pgTAP injects a BEFORE INSERT skipped-event failure (P0001). Full session/event snapshots equal the originals after failure, including timestamps; no partial skipped transition/event survives. Final independent query found **0** `skip_test_audit_failure` triggers.
- Parent Task unchanged: PASS — Task remains todo after successful Skip. Completed Task and paused Schedule fixtures reject 22023. Other Task-status/subtask branches were source-reviewed, not individually executed by this new suite. No Task completion, Focus start, minutes accounting or email is invoked in the reviewed RPC; no independent Focus table snapshot was taken.

### HTTP

- Valid: PASS — actual Supabase local Auth/JWT + PostgREST requests, no mocked RPC: scheduled, future scheduled and missed all return HTTP 200 / original UUID. Verified skipped status, preserved identity/time, null completion/minutes, unchanged Task and one authoritative event with actor, from/to status, normalized reason and a 64-hex fingerprint. **25/25 checks PASS**; [raw report](./phase-05-skip-http.json). Probe ran at 2026-10-31 08:10:57–08:10:58 UTC against loopback API port 55321. Credentials came from local CLI status into process variables and were not saved in the report.
- Exact retry: PASS — HTTP 200 for all seven canonical retries; entire session and event snapshots unchanged. Omitted/null/empty/ordinary-space-only reasons normalize to the same request; padded/trimmed non-empty reasons also replay.
- Different payload: PASS — changed reason under the same key returns HTTP 400 / 22023 / `Event key reused with different request`, with no mutation.
- Stale conflict: PASS — HTTP 409 / PT409 in 32 ms, row unchanged; no automatic retry timeout observed.
- Cross-owner: PASS — a separately authenticated user receives HTTP 403 / 42501; owner row unchanged.
- Invalid state: PASS — in_progress, completed, cancelled and already-skipped fixtures reject HTTP 400 / 22023 with zero events and unchanged rows. Expired missed/scheduled fixtures also reject 400 / 22023; oversized reason rejects 400 / 22023. Both disposable users were signed out/deleted; final database query found **0** skip fixture users. Temporary probe script was removed; only the secret-free JSON report remains.

### Regression

- Lint: PASS — from `apps/web`, `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors, 1 existing warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6` (missing projection dependency).
- Vitest: PASS — `node node_modules/vitest/vitest.mjs run`, exit 0; **69 files passed / 2 skipped; 612 tests passed / 20 skipped**, 94.68 seconds. The skipped cases comprise 19 opt-in Phase 04 direct integration tests and 1 existing Focus integration test; they were not separately executed here. New Skip coverage is in pgTAP/HTTP above, not included in the 612 web unit passes.
- TypeScript: PASS — `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: PASS — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in 24.4 seconds, TypeScript finished in 47 seconds, generated **98/98** pages in 1036 ms. Existing .env.local was not edited. Supabase inbucket deprecation/optional stopped-service notices were non-fatal. No replay, test or quality-gate failure occurred in this verification.

### Limits

- Two-connection concurrency pending Step 5.6 — **NOT EXECUTED** for Skip. Sequential pgTAP and HTTP do not prove race safety; Task -> Schedule -> Session lock order was source-reviewed only. Earlier Start/Phase 03 concurrency reports do not establish Skip race behavior.
- Exact DST recovery cutoff pending Step 5.6 — **NOT EXECUTED**. Fixtures use UTC or a fixed-offset timezone and valid/expired times away from the boundary. No DST transition, exact cutoff, just-before/just-after controlled pair, historical-timezone-change case or lock wait crossing cutoff was injected.
- Attendance UI pending Step 5.7 — no Skip Server Action, UI binding, generated RPC type or browser E2E was added/tested here. Web quality gates establish regression health, not an attendance UI flow.
- Additional unexecuted cases include changed expected version under a used Skip key, mismatched historical event types/legacy fingerprints, and replay after later Task/Schedule changes. Source guards are not substituted for these acceptance tests. Phase 05 remains IN PROGRESS.

### Decision

- Step 5.3: **PASS (LOCAL)** for the executed sequential RPC, HTTP, rollback, ownership and regression scope above; pending boundary/concurrency work remains explicitly open.
- Ready for Step 5.4: **YES**, with the Step 5.6/5.7 limits retained.
- Production authorized: **NO**.

## Step 5.4 — Automatic Missed Sweep

### Baseline

- Branch: `feature/learning-schedule-foundation`; verified locally on 2026-10-31 (Asia/Bangkok).
- HEAD SHA: `67bdea65a9e8128f1092bfbd941562f162621b54` — `feat(learning-schedule): add audited study session skip RPC`. New Sweep migration/test were untracked working-tree additions; the SHA identifies the baseline, not a commit containing Sweep.
- Migration filename: `supabase/migrations/20261031082113_learning_schedule_missed_sweep.sql`; reviewed together with `supabase/tests/learning_schedule_missed_sweep.sql`. Both user-supplied implementation files were tested without edits. Verification updates this evidence and adds the local result report; no commit/push.
- Supabase local version: CLI **2.122.0**, database **PostgreSQL 17.6**, **pg_cron 1.6.4**; container `supabase_db_lumivox-proj`. CLI invoked by its installed Windows executable because npm/npx shell shims are broken.

### Database

- Clean replay: **PASS** — executed `supabase db reset --local` followed by `supabase test db --local`, both exit 0. All commands targeted local Supabase; no production activation or remote database operation.
- Total migrations: **83**, independently confirmed by querying `supabase_migrations.schema_migrations` after clean replay.
- pgTAP: **PASS — 21 files, 433 assertions, 0 failures**, 6 wall-clock seconds. The persistent concurrency fixture setup file intentionally emits a TAP skip. Existing extension notices and absent optional seed.sql warning were non-fatal.
- Existing assertions: **409**, all passed again, including Start/Complete/Skip and earlier Learning Schedule/Focus/Workspace coverage.
- New sweep assertions: **24**, all passed in `learning_schedule_missed_sweep.sql`. Fixtures and audit-failure trigger were rolled back. Additional committed fixtures for real local connections/Cron were created and cleaned by a temporary Node/psql probe; [raw local probe report](./phase-05-missed-sweep-local.json).

### Batch Processor

- Scheduled after grace: **PASS** — overdue scheduled fixtures ended 3 hours before the anchor; eligible active-root-Task sessions become missed. Additional committed-fixture probe verifies same UUID, preserved scheduled end, Task todo and one system audit. Source evaluates clock_timestamp after Task -> Schedule -> Session locks and accepts elapsed grace >= 60 minutes; exact equality was not tested.
- Scheduled before grace: **PASS** — fixture ended 15 minutes before anchor remains scheduled with no marked_missed event.
- In-progress deferred: **PASS** — overdue in_progress remains unchanged. Additional probe compares the full row and events, rather than only status, after a batch scan. No Focus reconciliation is implied.
- Completed/skipped/cancelled preserved: **PASS** — no marked_missed events in pgTAP; independent committed-fixture probe additionally confirms full row/event snapshots remain equal for all three states.
- Closed Task / paused Schedule: **PASS for executed cases** — completed Task and paused Schedule fixtures produce no marked_missed events. Closed-Task lifecycle hooks may already change eligibility; this assertion does not prove that every closed-Task branch reached the sweep's own post-lock guard. Other Task status/subtask branches were source-reviewed only.
- Batch size limit: **PASS** — batch size 1 marks exactly one of two eligible rows; a second batch marks the remaining row. Inputs 0 and 501 reject 22023 / `Invalid missed sweep batch size`. Source also rejects null/negative sizes and bounds discovery at p_batch_size * 10; null/negative/500-boundary and saturated-discovery/fairness cases were not independently tested.
- Repeated execution: **PASS** — pgTAP repeated batch returns marked=0 with event total unchanged. Independent-connection probe repeats after each committed Double Sweep and verifies the full final snapshot stays equal.
- Audit event count: **PASS** — exactly one marked_missed event per transitioned session, from scheduled to missed, actor_id null, source attendance_sweep, reason grace_expired, graceMinutes 60. Committed-fixture probe also checks deterministic key `ls:missed:<session UUID>`; no user event key is needed.
- Audit failure rollback: **PASS** — temporary BEFORE INSERT marked_missed trigger raises P0001 / `Injected missed audit failure`. Full session row, including timestamps, is restored and no audit survives. Executed failure injection covers one eligible transition; rollback of multiple earlier successful rows in the same failing batch was not separately injected.
- Execution permissions: **PASS** — pgTAP confirms anon/authenticated cannot execute the batch, service_role can, and authenticated cannot update the control gate. Additional real database connection executes a successful batch under `SET ROLE service_role` and resets role afterward. Wrapper/table revocations, RLS and empty function search_path were source-reviewed; this step did not run browser or PostgREST permission probes.

### Cron

- Job registered: **PASS** — exactly the reviewed named job `lumivox-learning-schedule-missed-5m` was observed as jobid 2, active=true, schedule `*/5 * * * *`, database postgres, username postgres, command `SELECT public.ls_run_missed_sweep_if_enabled();`. Active Cron registration and disabled processing gate are separate controls.
- Default gate disabled: **PASS** — fresh replay yields enabled=false. Disabled wrapper returns 0 and leaves an eligible committed fixture's complete row/events unchanged.
- Trusted manual execution: **PASS** — with gate still disabled, service_role directly calls `ls_mark_missed_batch(100)` and receives marked=1/examined=1. Direct trusted batch deliberately bypasses the wrapper gate; ordinary users lack execute privilege.
- Local Cron activated: **PASS** — only on local, temporarily applied `cron.alter_job(2, schedule := '1 second')` and set control enabled=true for a disposable overdue fixture. The registered command was unchanged. Accelerated scheduling uses the supported interval syntax in the [pg_cron documentation](https://github.com/citusdata/pg_cron#cron-syntax); no migration was edited to enable the gate or change the default schedule.
- Job run history: **PASS** — actual `cron.job_run_details` records runid 1 and 2, status succeeded, worker PIDs 539/540, at **2026-10-31 08:32:12 and 08:32:13 UTC**. These differ from the probe's independent connection PIDs 536/537/538. Cron's return_message is `1 row`, the SQL result-row count, not proof of one transition per run.
- Automatic local transition: **PASS** — after enabling the gate, the probe only polls snapshots/history; Cron workers invoke the registered wrapper. The committed overdue fixture becomes missed with exactly one marked_missed event, preserved ID/end time and unchanged parent Task.
- Repeated-run idempotency: **PASS** — after at least two successful automatic runs, the fixture still has exactly one event and its completed snapshot is unchanged after gate disable. This verifies automatic behavior using the temporary 1-second cadence; a full pair of original 5-minute intervals was not awaited.
- Gate disabled after test: **PASS** — enabled=false, original schedule `*/5 * * * *` restored and registered job active=true. Cleanup confirmed 0 probe fixture users/Tasks, 0 injected audit-failure triggers, 0 worker transactions and 0 worker locks. Temporary probe script was removed; the secret-free JSON report remains. Cron history is retained as local evidence.

### Concurrency

- Double Sweep: **PASS — 3/3 controlled interleavings**, using two independent worker psql connections and a third observer. A runs the batch but holds its transaction open; B scans the same still-visible candidate and returns marked=0/examined=1 via SKIP LOCKED. After both transactions commit, observer sees missed plus exactly one event; another batch returns 0 with full snapshot unchanged. This is transaction overlap with a fixed ordering, not random simultaneous-start load testing.
- Locked candidate retry: **PASS — 3/3 cases**, separately holding Task, Schedule and Session row locks on A. Observer confirms the holder's granted transaction lock; B examines the candidate, skips it without transition/event and returns 0. After A commits, B retries and marks it once. No blocking wait is expected or claimed because these paths use SKIP LOCKED. No worker locks/transactions remain after cleanup.
- Deferred cross-command scenarios: **NOT EXECUTED** — Complete-vs-Sweep, Skip-vs-Sweep, Start-vs-Sweep, Task-close/revision-vs-Sweep and lock waits crossing cutoff remain for the broader Step 5.6 acceptance work. Earlier command-specific concurrency evidence is not substituted for these races.

### Regression

- Lint: **PASS** — from apps/web, `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors and 1 existing missing projection dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Vitest: **PASS** — `node node_modules/vitest/vitest.mjs run`, exit 0; **69 files passed / 2 skipped; 612 tests passed / 20 skipped**, duration **120.54 seconds**. The 19 opt-in Phase 04 direct integration cases and 1 existing Focus integration case were not separately run here. New Sweep checks are pgTAP/local SQL/Cron checks, not part of the 612 web passes.
- TypeScript: **PASS** — `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: **PASS** — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in **34.1 seconds**, TypeScript finished in **76 seconds**, generated **98/98** pages in **862 ms**. Existing .env.local was unchanged. Non-fatal Vite config-loader and Supabase deprecated inbucket notices remain. No replay, pgTAP, probe or web quality-gate failure occurred in this verification.

### Known Limits

- In-progress Focus reconciliation deferred — only scheduled -> missed is automatic; no trustworthy Study Session/Focus linkage was introduced or tested.
- Complete-vs-Sweep concurrency deferred to Step 5.6 — not executed.
- Skip-vs-Sweep concurrency deferred to Step 5.6 — not executed.
- Exact grace-cutoff testing deferred to Step 5.6 — away-from-boundary fixtures only; no exact/just-before/just-after controlled clock or lock crossing the cutoff.
- No production Cron activation — local gate is OFF again. Original 5-minute registration was verified and restored; actual automatic execution was tested with an accelerated local cadence. No production deployment/authorization is implied.
- Further limits: no saturated discovery/starvation/load validation, no multi-row partial-batch failure injection, no new UI/browser attendance flow, no email/notification delivery and no Focus/minutes mutations verified. Phase 05 remains IN PROGRESS.

### Final Decision

- Step 5.4: **PASS (LOCAL)** for executed replay, batch, audit rollback, permissions, Double Sweep/locked-candidate checks, actual local Cron and regression scope above; deferred acceptance cases remain open.
- Ready for Step 5.5: **YES**, retaining the Step 5.6 concurrency/boundary work and deferred Focus/UI scope.
- Production authorized: **NO**.

## Step 5.5 — Late Recovery

### Baseline

- Branch: `feature/learning-schedule-foundation`; verified locally on 2026-10-31 (Asia/Bangkok).
- HEAD SHA: `c9a6ae23f77576083e4f491dce329b187b0f244f` — `feat(learning-schedule): add guarded automatic missed sweep`. New Late Recovery migration/test were untracked working-tree additions; the SHA identifies the baseline, not a commit containing Recovery.
- Migration filename: `supabase/migrations/20261031091300_learning_schedule_late_recovery.sql`.
- Reviewed test: `supabase/tests/learning_schedule_late_recovery.sql`. Both user-supplied SQL files were tested unchanged. This verification appends evidence and adds the HTTP result report; no commit/push or production deployment.

### Database — Executed

- Clean replay: **PASS** — `supabase db reset --local`, followed by `supabase test db --local`, both exit 0, using the installed Windows Supabase CLI directly. No remote database was targeted.
- Total migrations: **84** after clean replay, independently confirmed from `supabase_migrations.schema_migrations`.
- pgTAP: **PASS — 22 files, 459 assertions, 0 failures**, 9 wall-clock seconds. The existing persistent concurrency setup file intentionally emits a TAP skip; it does not execute concurrent Recovery commands.
- Existing assertions: **433**, all passed again, including Start, Complete, Skip, Sweep and earlier Learning Schedule/Focus/Workspace coverage.
- New Late Recovery assertions: **26**, all passed. The new suite uses real authenticated database roles/JWT claims and rolled-back fixtures; these are sequential SQL assertions, not a two-connection concurrency test.
- Final independent query: **0** recovery fixture users and **0** recovery_test_audit_failure triggers. Sweep gate remains **false**; original Cron schedule remains `*/5 * * * *`. No Cron activation was performed in Step 5.5.

### Functional Acceptance — Executed

| Coverage                      | Actual result                                                                                                                                                                                                                                            | Status                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| REC-01 missed -> completed    | Returns original session UUID, persists completed_at, retains logical occurrence identity and null actual_study_minutes.                                                                                                                                 | PASS — pgTAP + HTTP                         |
| REC-02 skipped -> completed   | Returns original UUID and completed state; source status retained in audit.                                                                                                                                                                              | PASS — pgTAP + HTTP                         |
| REC-03 authoritative audit    | One recovered event with owning actor, correct source/target state, wasLate=true and fingerprint. HTTP also checks 64-hex fingerprint, sourceStatus, original local date/timezone, computed cutoff and equality of recoveredAt/completed_at as instants. | PASS — pgTAP + HTTP                         |
| REC-04 exact replay           | Original key/version returns same UUID after completion; no additional event. HTTP compares the entire completed row and event array before/after retry, preserving timestamps.                                                                          | PASS — pgTAP + HTTP                         |
| REC-05 fingerprint mismatch   | Changed expected version under a used key rejects 22023 / Event key reused with different request; HTTP confirms unchanged row/events.                                                                                                                   | PASS — pgTAP + HTTP                         |
| REC-06 expired window         | 10-day-old missed/skipped reject 22023. HTTP additionally checks both states on local day 8; both reject without mutation.                                                                                                                               | PASS for executed away-from-cutoff fixtures |
| REC-07 disallowed states      | scheduled, in_progress, completed and cancelled reject 22023; HTTP confirms unchanged rows and zero events.                                                                                                                                              | PASS — pgTAP + HTTP                         |
| REC-08 future obligation      | Future missed rejects Session has not started; HTTP additionally checks future skipped with the same rejection and no mutation.                                                                                                                          | PASS — pgTAP + HTTP                         |
| REC-09 parent eligibility     | Completed Task and paused Schedule reject Session is not eligible for recovery. Other Task status/subtask branches were source-reviewed only.                                                                                                            | PASS for executed pgTAP cases               |
| REC-10 stale version          | Otherwise eligible stale request returns PT409; row remains missed with original updated_at and null completion. HTTP returns 409/PT409 and compares full row/events.                                                                                    | PASS — pgTAP + HTTP                         |
| REC-11 owner isolation        | B cannot recover A's session: 42501. Real HTTP is 403/42501; B's user-scoped SELECT returns zero rows, and A's row is unchanged.                                                                                                                         | PASS — pgTAP + HTTP                         |
| REC-12 parent Task separation | Task stays todo; minutes remain null. HTTP confirms Task status and original session identity/time/revision/source slot. No independent Focus table snapshot was taken.                                                                                  | PASS within executed scope                  |
| REC-13 audit rollback         | BEFORE INSERT recovered-event trigger raises P0001 / Injected recovery audit failure. Full fixture session/event snapshots match their originals after failure, including timestamps.                                                                    | PASS — pgTAP                                |
| REC-14 execution privileges   | anon cannot execute, authenticated can execute the reviewed RPC. Empty search_path and owner authorization before replay/mutation were also source-reviewed.                                                                                             | PASS — pgTAP plus stated source review      |

### HTTP Contract — Supabase Local

- **28/28 checks PASS** using actual Supabase Auth/JWT clients and PostgREST RPC calls, with a loopback/port guard for `127.0.0.1:55321`. No fake RPC, injected requireUser or browser flow was used. [Raw HTTP report](./phase-05-recovery-http.json).
- Probe execution: **2026-10-31 09:21:59–09:22:00 UTC**. Local CLI status credentials were passed only through process variables; no credentials/passwords are stored in the report.
- Success: four fixtures, missed/skipped on local days 2 and 7, return HTTP **200** / same UUID, persist completion and exactly one recovered event.
- Exact retry: four HTTP **200** responses; full persisted session/event snapshots remain equal. Changing expected version under each used key returns **400 / 22023**, with message `Event key reused with different request`, and no mutation.
- Stale: **409 / PT409**, observed in **25 ms** including the probe's subsequent no-mutation reads, within a 5-second request bound; no retry timeout occurred. Cross-owner: **403 / 42501**, row unchanged and RLS read denied.
- Invalid/expired/future cases: **400 / 22023** for scheduled/in_progress/completed/cancelled, missed/skipped on day 8 and day 10, and future missed/skipped. Each rejected case has unchanged full row and zero events.
- Both disposable users signed out and were deleted; per-user Task counts are zero afterward. Temporary probe script removed; only the secret-free JSON report remains.

### Boundary Coverage / REC-B

- Source rule: cutoff is exclusive midnight at the start of `session.local_date + 8`, calculated in the **historical session timezone**. Source uses clock_timestamp after acquiring Task -> Schedule -> Session locks. These observations are source review, not boundary acceptance results.
- **Executed:** pgTAP accepts 2-day-old sessions and rejects 10-day-old sessions. Real HTTP additionally accepts both missed/skipped on local day 7 and rejects both on day 8; audit recoveryCutoff is compared with an independently calculated Temporal midnight. Executed HTTP timezone was **UTC**. These fixtures were hours away from midnight and establish calendar-day samples only.
- A separate REC-B case matrix/numbered definitions was not present in the checked repository files. No missing REC-B identifier is assigned a PASS or inferred mapping from ordinary REC-01–REC-14 assertions. The unexecuted boundary scenarios below remain explicit acceptance gaps.

| Boundary scenario                                                                                         | Execution status |
| --------------------------------------------------------------------------------------------------------- | ---------------- |
| Exact cutoff instant, just-before and just-after controlled boundary pair                                 | **NOT EXECUTED** |
| DST spring-forward or fall-back recovery window; prove calendar-day semantics versus 7 x 24 elapsed hours | **NOT EXECUTED** |
| Different historical session timezone versus subsequently changed schedule/device timezone                | **NOT EXECUTED** |
| Multiple non-UTC timezones or unusual midnight timezone transition                                        | **NOT EXECUTED** |
| Lock wait crosses recovery cutoff; true clock rechecked after waiting                                     | **NOT EXECUTED** |
| Exact replay after cutoff or later Task/Schedule eligibility changes                                      | **NOT EXECUTED** |

- The cutoff expression, earlier replay check and post-lock clock placement are **SOURCE REVIEW ONLY** for those scenarios. They do not change any NOT EXECUTED result to PASS. Broader REC-B acceptance remains open for Step 5.6/additional dedicated tests.

### Web Gates — Executed

- Lint: **PASS** — from apps/web, `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors and 1 existing missing projection dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Vitest: **PASS** — `node node_modules/vitest/vitest.mjs run`, exit 0; **69 files passed / 2 skipped; 612 tests passed / 20 skipped**, **133.32 seconds**. The 19 opt-in Phase 04 direct integration cases and 1 existing Focus integration case were not separately executed here. New Recovery coverage is pgTAP/HTTP, not included in the 612 web passes.
- TypeScript: **PASS** — `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: **PASS** — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in **34.1 seconds**, TypeScript finished in **71 seconds**, generated **98/98** pages in **1372 ms**. Existing .env.local was unchanged.
- Existing Vite config-loader and Supabase inbucket/optional stopped-service/missing optional seed notices were non-fatal. No replay, pgTAP, HTTP or web gate failure occurred. `git diff --check` passed after evidence update.

### Limits / Decision

- **Two-connection Recovery concurrency: NOT EXECUTED.** No double-Recover, Recovery-vs-Skip/Complete/Sweep, Task-close/revision race or observed lock wait was run. Existing Start/Sweep/Phase 03 reports do not establish Recovery race safety.
- Other additional unexecuted cases include null/invalid event-key variants, legacy/mismatched event fingerprints and changed command/session payload combinations under a historical key. Source validation is not a substitute for these tests.
- No generated Recovery TypeScript binding, authenticated Next.js Recovery action, attendance UI/browser E2E, Focus integration, minutes accounting, notification/email handling or production deployment was added/tested. The reviewed RPC changes only completion and its audit; web gates do not prove a future UI flow.
- Step 5.5 executed core sequential RPC/HTTP, audit rollback, owner isolation and web gates: **LOCAL PASS within the stated executed scope**.
- **Full Step 5.5 boundary/REC-B acceptance: PENDING — NOT EXECUTED cases above remain open.** Do not treat this evidence as an unconditional final acceptance of those cases. Phase 05 remains **IN PROGRESS**.
- Production authorized: **NO**. No commit or push was performed.

## Step 5.6A — Cross-Command Concurrency Foundation

### Baseline

- Branch: `feature/learning-schedule-foundation`; verified locally on 2026-10-31 (Asia/Bangkok).
- HEAD SHA: `0684e02a8df0168e421111dd3516a3a6f11cd380`. The new attendance concurrency harness, boundary SQL test and initial report were untracked working-tree additions at review time; this SHA identifies the committed baseline, not a commit containing those additions.
- PostgreSQL version: **17.6**, local container `supabase_db_lumivox-proj`.
- Supabase local version: installed CLI **2.122.0**; same local database used in Step 5.5. No new migration was supplied for 5.6A. Reviewed `scripts/test-learning-schedule-attendance-concurrency.mjs` and `supabase/tests/learning_schedule_attendance_boundaries.sql` without changing them; reran the report rather than relying on its pre-existing PASS values.
- Sweep gate before tests: **false**, independently queried before the concurrency run. No local Cron activation or schedule alteration in this step.
- Sweep gate after tests: **false**, independently queried again after the final harness exited. No commit, push or production operation.

### Database

- Migration count: **84**, confirmed from `supabase_migrations.schema_migrations` before concurrency execution. No clean replay was repeated in 5.6A because this change adds tests only; the 84-migration clean replay was executed in Step 5.5.
- pgTAP PASS / FAIL: **PASS — 23 files, 467 assertions, 0 failures**, 2 wall-clock seconds; ran local CLI `supabase test db --local`, exit 0. This includes all **459** previous assertions plus **8** new boundary assertions. Persistent concurrency fixture setup remains an intentional TAP skip; real races run separately below.
- Timezone/DST tests: **8/8 PASS** in `learning_schedule_attendance_boundaries.sql`. Tests calculate New York spring-forward/fall-back local-midnight cutoffs, Ho Chi Minh midnight conversion, fixed one-microsecond-before/exact-cutoff comparisons and 60-minute elapsed grace arithmetic. These execute SQL expressions with literal dates/instants, **not attendance RPCs under a controlled clock**. In particular, the comparison of original date + 7 days against local_date + 8 differs by a calendar day as well as any offset change; that inequality alone does not isolate DST elapsed-duration behavior. DST boundary through a real RPC and exact-clock acceptance remain NOT EXECUTED in 5.6B below.

### Real Concurrency

- Independent PostgreSQL backend PIDs: final run **A=1605, B=1606, observer=1607**, independently captured from pg_stat_activity application names while the harness ran. The harness also asserts three distinct pg_backend_pid values. Worker transactions use authenticated role plus the fixture owner's JWT claims; observer/setup uses trusted postgres. [Fresh raw report](./phase-05-attendance-concurrency.json), including observedBackendPids and postExitVerification.
- Iterations: **3 per scenario; 8 scenarios including CC-05b = 24/24 PASS**. Ran `node scripts/test-learning-schedule-attendance-concurrency.mjs` from repo root, exit 0. A second fresh run used a temporary external monitor to persist all three PIDs and post-exit cleanup; it also passed 24/24 and supplies the final report. The monitor was removed. This is controlled A-first transaction overlap, not randomized simultaneous-start/load testing or exhaustive reverse orderings.
- CC-01 Complete vs Complete distinct: **3/3 PASS** — A completes; after the observed lock wait B rejects **22023**. Final completed state, one completed event.
- CC-02 Complete exact replay: **3/3 PASS** — same key and original version; after waiting B returns **00000** / original session UUID. Final completed state, one completed event.
- CC-03 Start vs Complete: **3/3 PASS** — A starts; B's old version rejects **PT409** after waiting. Final in_progress state, completed_at null, one started event. This does not test Complete-first or a refreshed version after Start.
- CC-04 Complete vs Skip: **3/3 PASS** — A completes; after waiting B rejects **22023**. Final completed state, one completed event. Skip-first on a scheduled session was not included in this scenario.
- CC-05 Recovery vs Recovery: **3/3 distinct-key PASS** — A recovers missed; B rejects **22023** after waiting. Additional **CC-05b exact-key: 3/3 PASS**, B returns **00000** / same UUID. Both variants end completed with exactly one recovered event.
- CC-06 Recovery vs Skip: **3/3 PASS** — from missed, A recovers; B rejects **22023** after waiting. Final completed state, one recovered event.
- CC-07 Skip vs Recovery: **3/3 PASS** — from missed, A skips; B's old version rejects **PT409** after waiting. Final skipped state, completed_at null, one skipped event. A later retry with refreshed version is outside this case.
- Observed lock waits: **24/24** final-run records contain A (PID 1605) in pg_blocking_pids(B) before A commits. A explicitly holds the Task lock and executes its full command without committing; B issues the competing command on a separate connection. B's result is checked only after the observer confirms blocking and A commits. No sleep-only assumption is used to infer a race. Timeouts: 5-second lock, 10-second statement and 15-second client bound; none reached.
- Final state invariants: **PASS for executed assertions** — observer reads after worker COMMIT/ROLLBACK; final status matches each case, Task remains todo, actual_study_minutes null, completed_at exists only for completed outcomes, and event keys are unique. Full session/event snapshots are retained in JSON. The harness checks returned IDs and final row by session ID, but does not compare every historical identity/time field or every timestamp before/after exact replay; those finer invariants are not newly established by this race suite.
- Audit event counts: **exactly one per final session in all 24 runs**; report records completed for CC-01/02/04, started for CC-03, recovered for CC-05/05b/06 and skipped for CC-07. Harness asserts count/unique keys; event types were additionally checked in the fresh result report. Failed/stale second commands create no additional event. This suite does not inject audit failures; existing rollback pgTAP tests passed again in the full run.
- Fixture cleanup: **PASS** — harness removes its fixture Task and user, verifies **0 open worker transactions**, then closes all three connections. Independent post-exit query confirms **0 attendance-cc fixture users, 0 fixture Tasks, 0 surviving worker backends and 0 worker locks**. Sweep gate stays false. Report contains no credentials. No application or migration implementation was edited.

### Application

- Lint: **PASS** — from apps/web, `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors, 1 existing missing projection dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Vitest: **PASS** — `node node_modules/vitest/vitest.mjs run`, exit 0; **69 files passed / 2 skipped; 612 tests passed / 20 skipped**, **62.44 seconds**. The 19 opt-in Phase 04 direct integration cases and 1 existing Focus integration case were not separately run. pgTAP/races above are additional coverage, not part of the 612 web passes.
- TypeScript: **PASS** — `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: **PASS** — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in **12.8 seconds**, TypeScript finished in **24.6 seconds**, generated **98/98** pages in **901 ms**. Existing .env.local unchanged. Existing Vite config-loader/Supabase deprecation notices were non-fatal. No pgTAP, race or quality-gate failure occurred; `git diff --check` passed after evidence update.

### Pending Step 5.6B

- Sweep vs Attendance commands — **NOT EXECUTED in 5.6A**. Earlier Sweep-vs-Sweep tests do not replace cross-command acceptance.
- Task Close vs Attendance commands — **NOT EXECUTED**.
- Schedule Revision vs Attendance — **NOT EXECUTED**.
- Exact grace cutoff under controlled clock — **NOT EXECUTED**; literal timestamp arithmetic is not a real RPC clock-boundary test.
- Exact recovery cutoff under controlled clock — **NOT EXECUTED**; including lock wait crossing the deadline and replay after the deadline.
- DST boundary through real RPC — **NOT EXECUTED**; historical session timezone versus changed schedule/device timezone remains unexecuted. The eight new SQL-expression assertions do not close the pending REC-B acceptance from Step 5.5.
- Multi-row batch failure rollback — **NOT EXECUTED**; existing single-transition rollback assertions are not a substitute.
- Authorization and privilege hardening — **NOT EXECUTED as a dedicated 5.6B matrix**. Existing pgTAP ownership/execute checks reran, but the race harness has one authenticated owner and is not a cross-owner attack/privilege probe.
- Full cross-command final acceptance — **PENDING**. This foundation covers the listed controlled orderings only; no full HTTP/browser attendance flow, randomized load, reverse-order matrix or production validation was performed.

### Decision

- Step 5.6A PASS / FAIL: **PASS (LOCAL)** for the executed CC-01–CC-07/CC-05b, SQL timezone-expression and regression scope above. This is not a PASS for pending 5.6B/REC-B cases.
- Ready for Step 5.6B YES / NO: **YES**, with pending cases retained explicitly.
- Phase 05 completed: **NO**.
- Production authorized: **NO**.

## Step 5.6B-1 — Sweep / Task Close Cross-Command Concurrency

### Baseline / Changes Reviewed

- Branch: `feature/learning-schedule-foundation`; verified locally on 2026-10-31 (Asia/Bangkok).
- HEAD SHA: **`c524a76fa503d3262a354a5b00e98ca4ba52cba6`**. The cross-boundary harness/report were untracked additions; SHA identifies the baseline, not a commit containing this harness.
- Harness: `scripts/test-learning-schedule-attendance-cross-boundary.mjs`. Local container `supabase_db_lumivox-proj`; no new migration or production code change in this verification.
- Fixture correction retained: prepareOverdue derives UTC and local values from one materialized clock_timestamp anchor. Multiple independent clock calls previously differed by microseconds and triggered 22023 / Noncanonical or nonexistent local study time. The database canonicalization guard remains intact.
- Added measurement/reporting for SKIP LOCKED elapsed time, actual backend PIDs, gate before/after and worker lock cleanup. No production SQL/RPC behavior was relaxed.

### Executed Command / Result

- From repo root: `node scripts/test-learning-schedule-attendance-cross-boundary.mjs`, **exit 0; 30/30 runs PASS** — 10 scenarios repeated 3 times.
- Fresh report: [phase-05-attendance-cross-boundary.json](./phase-05-attendance-cross-boundary.json), **2026-10-31 10:01:50.855–10:01:53.095 UTC**.
- Three independent PostgreSQL backend PIDs: **A=2718, B=2719, observer=2717**. Attendance/Task updates execute with authenticated owner claims; trusted Sweep executes as service_role. Observer independently reads blockers and final persisted state after COMMIT/ROLLBACK.
- This is controlled transaction overlap with the listed first/second ordering, not arbitrary scheduling, load testing or a complete ordering matrix. It does not exercise an exact grace/recovery cutoff.

### SQLSTATE / Final State / Audit Results

| Scenario                           | Runs     | Actual B result                         | Final Session / Task / Schedule | Events per fixture                          |
| ---------------------------------- | -------- | --------------------------------------- | ------------------------------- | ------------------------------------------- |
| Sweep first vs Complete            | 3/3 PASS | 22023                                   | missed / todo / active          | 1 marked_missed                             |
| Sweep first vs Start               | 3/3 PASS | 22023                                   | missed / todo / active          | 1 marked_missed                             |
| Sweep first vs Skip                | 3/3 PASS | PT409                                   | missed / todo / active          | 1 marked_missed                             |
| Sweep first vs Recovery            | 3/3 PASS | PT409                                   | missed / todo / active          | 1 marked_missed                             |
| Task Close first vs Start          | 3/3 PASS | 22023                                   | scheduled / completed / closed  | 0                                           |
| Task Close first vs Complete       | 3/3 PASS | 22023                                   | scheduled / completed / closed  | 0                                           |
| Task Close first vs Skip           | 3/3 PASS | 22023                                   | scheduled / completed / closed  | 0                                           |
| Complete first then Task Close     | 3/3 PASS | 00000                                   | completed / completed / closed  | 1 completed                                 |
| Skip first then Task Close         | 3/3 PASS | 00000                                   | skipped / completed / closed    | 1 skipped                                   |
| Locked Task -> Sweep skip -> retry | 3/3 PASS | Successful batch calls; marked 0 then 1 | missed / todo / active          | 0 while locked, 1 marked_missed after retry |

- Task-close-first fixtures have already started, so they stay scheduled rather than being cancelled as future unstarted occurrences. Their Schedule closes and all competing attendance commands reject; no completion/audit is invented.
- PT409 after Sweep means the source state missed remains eligible for Skip/Recovery, but Sweep changed updated_at. No new event is written by the stale second command. Start/Complete are ineligible from missed and return 22023 instead.
- All final fixtures retain null actual_study_minutes. completed_at is present only for completed outcomes; non-completed final states have null completed_at. Original ID is returned/queried and matches the audit session_id. Authoritative event type/count and Task/Schedule status assertions pass for the executed paths. For Sweep paths active Schedule is source/setup eligibility, not a separate final schedule-status assertion; closed status is explicitly queried in Task Close paths.
- Total final events across the 30 disposable fixtures: **21** — **15 marked_missed, 3 completed, 3 skipped**; the 9 Task-close-first fixtures have zero events. Rejected/stale second commands add no event. Snapshots remain in the JSON report although fixtures are deleted.

### Lock Evidence — Waiting vs SKIP LOCKED

- **27 observed blocking cases**, each with A=2718 in `pg_blocking_pids(2719)` before A commits. This comprises **21 Attendance waiters** (12 after Sweep + 9 after Task Close) and **6 Task Close waiters** after Complete/Skip. Worker B's command is already pending on its separate backend when observer confirms the blocker; only then does A commit. Thus the result is not inferred from a sleep or source review.
- **3 SKIP LOCKED cases are intentionally non-waiting**. No pg_blocking_pids evidence is required/claimed for them. A retains its explicit Task row lock throughout B's first batch call and B's COMMIT; that call finishes before A releases the lock.
- First locked batches each return **marked=0, examined=1**. Measured end-to-end call durations: **2.0351 ms, 1.5642 ms, 1.4561 ms**, all below the explicit **2000 ms** assertion bound and well below the **5-second lock timeout**. These are local observations, not a production latency guarantee.
- While A still holds the lock, the fixture remains scheduled with **0 events**. After A commits, a new trusted B transaction retries and returns **marked=1, examined=1** in all three cases; observer sees missed with exactly one marked_missed event and null completed_at/minutes. This establishes prompt skipping plus eventual retry, not a blocking wait.
- Harness limits: 5-second lock timeout, 10-second statement timeout, 15-second client command deadline; none reached in the final run.

### Cleanup / Gate / Verification Notes

- **Cleanup PASS** — fixture Task and owner user removed; **0 open worker transactions, 0 remaining worker locks** recorded before connection shutdown. All three connections closed. Independent post-exit query confirms **0 attendance-cc fixture users, 0 fixture Tasks and 0 remaining harness backends**.
- Sweep gate **OFF before and after** (`false` in report and independent final query). Existing local Cron remains registered; no gate activation or schedule change was performed. No remote database, production Cron activation, commit or push.
- During instrumentation, one run completed all 30 races but the newly added scalar gate-result JSON parsing failed during report cleanup. Replaced that metadata query with a JSON object; reran all 30 successfully and independently confirmed cleanup. This was a harness/reporting failure, not a failed RPC concurrency assertion. The final linked report is the successful complete run; the earlier partial verification is not counted as acceptance evidence.
- No new migration, web code or dependency changed. Full pgTAP/lint/Vitest/TypeScript/build gates were **NOT RERUN in this B-1 evidence turn**; their last executed results remain in Step 5.6A (467 pgTAP assertions; 612 Vitest passes/20 skips; lint/type/build PASS). Running this changed Node harness supplies its actual syntax/runtime and database verification; previous web results are not presented as fresh runs.

### Remaining Step 5.6B-2 Gaps

All items below remain **NOT EXECUTED / PENDING** unless an earlier section explicitly identifies a narrower executed case. No PASS is inferred from source review:

- **Schedule Revision vs Attendance:** revise-first and attendance-first orderings for Start/Complete/Skip/Recovery, cancellation/supersession and authoritative audit invariants.
- **Remaining Sweep/Attendance orderings:** attendance-first versus Sweep, state-appropriate reverse orderings, command retry with refreshed versions after Sweep and broader exact-key interactions. B-1 covers Sweep-first only, plus locked-Task skip/retry; it is not the full cross-command matrix.
- **Remaining Task Close/Attendance cases:** Recovery on missed/skipped in both orderings, Start-first then close, other close/status paths and future-unstarted cancellation audit interactions. B-1 covers Task-completed-first vs Start/Complete/Skip and Complete/Skip-first vs Task-completed only.
- **Exact grace cutoff under a controlled clock:** just-before/exact/just-after real RPC and Sweep calls, post-lock timing and lock wait crossing the deadline. Literal SQL-expression comparisons from 5.6A do not establish this.
- **Exact recovery cutoff / REC-B under a controlled clock:** just-before/exact/just-after real Recovery/Skip, lock wait crossing cutoff, exact replay after deadline and later parent eligibility changes.
- **DST boundary through real RPC:** spring-forward/fall-back calendar windows, non-UTC historical session timezone versus changed Schedule/device timezone, unusual midnight transitions and calendar days versus elapsed-time behavior. Existing expression tests and ordinary UTC fixtures do not close these gaps.
- **Multi-row batch audit failure rollback:** fail a later audit after earlier rows changed, prove full-batch session/event snapshot restoration; include actual trusted batch entrypoints. Earlier single-transition rollback tests are narrower.
- **Authorization and privilege hardening matrix:** anonymous/authenticated/cross-owner attempts against batch, gated wrapper and control table; function/public/service grants, null/invalid arguments, legacy/mismatched event fingerprints and semantic payload changes. Existing earlier ownership/grant tests are partial coverage, not full B-2 acceptance.
- **Final invariants/coverage expansion:** explicit full identity/time/revision/timestamp comparisons through retries and competing lifecycle changes; multi-candidate batching/fairness/starvation and timeout/error cleanup as applicable. These 30 controlled interleavings are not randomized stress or exhaustive isolation-level testing.
- **Full cross-command final acceptance:** PENDING until the remaining matrix, boundary, rollback and permission checks have actual results and required final regression gates are rerun. Attendance UI/browser integration, Focus reconciliation, reminders and production activation remain outside this B-1 test scope; Phase 05 is not complete.

### Decision

- Step 5.6B-1: **LOCAL PASS** for the documented **30 runs, 27 observed waits and 3 measured non-waiting SKIP LOCKED retries**.
- Step 5.6B-2: **PENDING**; remaining gaps above are not marked PASS.
- Phase 05 completed: **NO**.
- Production authorized: **NO**.

## Step 5.6B-2A — Atomic Batch / Security / Historical Timezone

### Baseline

- Branch: `feature/learning-schedule-foundation`; verified locally on 2026-10-31 (Asia/Bangkok).
- HEAD SHA: **`5c9b81bbe9c4aede8d19e7149ea5ccc1ee72bb22`**. New `supabase/tests/learning_schedule_attendance_hardening.sql` was an untracked working-tree addition; SHA identifies the baseline, not a commit containing the new test.
- Supabase local version: CLI **2.122.0**, container `supabase_db_lumivox-proj`. Ran the installed executable directly because npm/npx shell shims are broken.
- PostgreSQL version: **17.6**, independently queried after tests.
- Migration count: **84**, independently confirmed from supabase_migrations.schema_migrations. No migration/production implementation change or new clean replay in this test-only step; prior 84-migration clean replay is recorded in Step 5.5.

### Tests

- pgTAP existing assertions: **467 PASS**, rerun with the new suite using `supabase test db --local`, exit 0. Persistent concurrency fixture setup remains an intentional TAP skip, not a concurrency execution in this step.
- New HARD-01 to HARD-21: **21/21 PASS** in `supabase/tests/learning_schedule_attendance_hardening.sql`. Added a guard inside the second-row audit-failure trigger: it must observe the first session already missed and its deterministic marked_missed event already present before raising the expected error. This strengthens actual multi-row rollback evidence while retaining the 21 named assertions. No production trigger/RPC was changed.
- Total assertions: **488 PASS across 24 files**, final run 3 wall-clock seconds. Initial supplied suite also passed; the entire pgTAP suite was rerun after strengthening the trigger guard.
- Failures: **0**. All fixtures, temporary helpers and injected trigger run in a transaction ending with ROLLBACK. Independent final query confirms **0** attendance-hardening fixture users and **0** hardening_second_audit_failure triggers. No commit/push.

### Multi-row rollback

- First row was eligible: **PASS** — active Schedule/root todo Task with scheduled occurrence ending four local dates before the anchor, ordered before the second occurrence (three dates before). The injected second-row trigger additionally verifies the first session is already missed and its marked_missed event exists within that same batch before raising the expected failure. If that earlier work is absent, HARD-01 receives a different message and fails.
- Second row audit failure injected: **PASS** — BEFORE INSERT trigger targets only batch_second's marked_missed event, after the earlier row/audit guard succeeds.
- SQLSTATE: **P0001**, message **Injected second-row missed audit failure**, matched by HARD-01. The error is intentional test injection, not a migration/runtime failure.
- Both rows restored: **PASS — HARD-02**, complete persisted session JSON snapshots for both rows match their pre-batch values, including status/timestamps, after the failed batch.
- Event snapshots restored: **PASS — HARD-02**, full event-array snapshot equals the original empty array; the first row's inserted audit is also rolled back, not merely the failing second insert.
- Successful retry marked: **2**, HARD-03; after dropping the injected trigger, the same two overdue candidates are processed by the real ls_mark_missed_batch(100). This invocation runs as trusted postgres in pgTAP, not through HTTP/Cron.
- Final audit count: **2 marked_missed events**, HARD-04, one for each transitioned fixture. This count is observed before the repeated batch and before transaction rollback; no fixture events persist after the suite.
- Repeated batch created no duplicates: **PASS within HARD-05's assertion scope** — repeated real batch returns marked=0. Together with the preceding count of 2 this covers no additional transition; a second event-array/count assertion after that repeated call is not separately present in this suite.

### Historical timezone

- Original Session timezone: **America/New_York**, HARD-06; valid fixture uses local noon two calendar dates before the anchor, and the stored Session timezone is unchanged.
- Current Schedule timezone: **Asia/Tokyo**, HARD-07, changed after the historical Session was created.
- Authenticated Recovery result: **PASS — HARD-08**, the real ls_recover_study_session RPC executes under SET LOCAL ROLE authenticated and the fixture owner's JWT claims, returning the same session UUID. This is actual database RPC execution, not mocked logic; no PostgREST request or browser/device timezone was tested in this step.
- Persisted completion: **PASS — HARD-09**, Session completed, completed_at non-null and actual_study_minutes null inside the transaction.
- Audit recovery cutoff: **PASS — HARD-09**, payload originalTimezone=America/New_York and recoveryCutoff equals midnight at historical Session local_date + 8 in **America/New_York**, despite the Schedule using Tokyo. This executes the historical-timezone branch through the real RPC; it is not an exact-time or DST-transition-boundary acceptance test.
- Exact retry: **PASS — HARD-10**, same event key and original expected version return the original UUID after completion. Full completed row/timestamp equality before/after retry is not separately asserted by this new suite.
- Event count: **1 recovered event**, HARD-11, after exact replay. The entire fixture is rolled back afterward.

### Security

- anon batch execution: **DENIED by effective privilege inspection**, HARD-12: has_function_privilege(..., EXECUTE)=false. This assertion checks catalog/effective grants, not an actual denied HTTP or SET ROLE call.
- authenticated batch execution: **DENIED by effective privilege inspection**, HARD-13, execute=false.
- service_role batch execution: **ALLOWED by effective privilege inspection**, HARD-14, execute=true. No new service_role execution attempt in this suite; the successful trusted service_role batch call in Step 5.4 is earlier evidence, not a freshly repeated case here.
- Cron wrapper grants: **PASS — HARD-15/16/17**, effective execute privilege false for anon/authenticated, true for service_role on ls_run_missed_sweep_if_enabled(). Actual unauthorized execution attempts remain a separate hardening gap; no Cron activation was required.
- Gate table privileges: **PASS — HARD-18/19**, authenticated and anon lack UPDATE privilege on public.ls_missed_sweep_control. This does not exhaustively test SELECT/INSERT/DELETE/TRUNCATE, ownership/role escalation or direct API attempts.
- Gate enabled after test: **false / OFF**, HARD-20 plus independent post-suite query. No gate change or activation in this step.
- Cron job configuration: **PASS — HARD-21**, exactly one matching lumivox-learning-schedule-missed-5m job with schedule `*/5 * * * *`, active=true. Independent final query confirms named-job count=1, same schedule and active=true; command text was not separately compared in the new assertion. Cron registration active does not mean processing gate enabled.

### Regression

- Lint: **PASS** — from apps/web, `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors and 1 existing missing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Vitest: **PASS** — `node node_modules/vitest/vitest.mjs run`, exit 0; **69 files passed / 2 skipped; 612 tests passed / 20 skipped**, **97.14 seconds**. The 19 opt-in Phase 04 integration cases and 1 existing Focus integration case were not separately run. HARD tests are additional pgTAP coverage, not part of the 612 web passes.
- TypeScript: **PASS** — `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: **PASS** — `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in **26.1 seconds**, TypeScript finished in **60 seconds**, generated **98/98** pages in **1111 ms**. Existing .env.local unchanged. Existing Vite config-loader/Supabase deprecation notices were non-fatal. `git diff --check` passed after evidence update. Previous concurrency harnesses were not rerun in this step.

### Remaining

- Schedule Revision vs Attendance: **NOT EXECUTED**, both orderings and cancellation/supersession/audit invariants remain for 5.6B-2B.
- Remaining reverse-order races: **NOT EXECUTED** — remaining Attendance-first vs Sweep, Recovery vs Task Close in both orders, Start-first then Task Close and other unexecuted lifecycle/status paths from B-1 remain open.
- Exact real-RPC grace cutoff: **NOT EXECUTED** — no controlled-clock just-before/exact/just-after command or Sweep calls.
- Exact real-RPC recovery cutoff: **NOT EXECUTED** — no controlled-clock boundary or replay after cutoff/later parent changes. The historical-timezone scenario is now executed, but does not close these other REC-B cases.
- Lock wait crossing cutoff: **NOT EXECUTED**, true post-lock clock behavior at the boundary remains unverified.
- DST transition boundary through RPC: **NOT EXECUTED** — New York historical-timezone Recovery uses an ordinary live-clock fixture away from the boundary. A window whose computed future cutoff crosses an offset change is not a controlled transition-boundary test; spring/fall, unusual midnight and exact cutoff cases remain open.
- Additional scope limits retained from B-1: actual denied role/API calls and full privilege/argument/fingerprint matrix, multi-candidate fairness/starvation, broader identity/timestamp invariants, randomized load/final matrix acceptance, Focus reconciliation and UI/browser flows are not established by these 21 assertions. Multi-row rollback and changed-Schedule-vs-historical-Session timezone are now covered only in the executed forms above.

### Decision

- Step 5.6B-2A: **PASS (LOCAL)** for HARD-01–HARD-21 and freshly executed regression gates, within the stated privilege-inspection and sequential SQL scope. This is not full cross-command/boundary acceptance.
- Ready for 5.6B-2B: **YES**, retaining all NOT EXECUTED cases above. Phase 05 remains **IN PROGRESS**.
- Production deployment authorized: **NO**.

## Step 5.6B-2B.1 — Revision vs Attendance

### Baseline

- Branch: `feature/learning-schedule-foundation`; verified **2026-11-01 (Asia/Bangkok)**.
- HEAD SHA: **`1a00a9d132f8b5ee60eb48539fd0565e1d93a46e`** — `test(learning-schedule): harden attendance batch rollback and privileges`. The new revision-attendance harness/report were untracked working-tree additions at review time; this SHA identifies the committed baseline, not a commit containing those files.
- Reviewed and ran `scripts/test-learning-schedule-revision-attendance-concurrency.mjs` without edits. No new migration, application change, dependency, production operation, commit or push.
- Database: local container `supabase_db_lumivox-proj`, **PostgreSQL 17.6**, **84 migrations** independently confirmed. Test-only verification did not repeat a clean migration replay; prior 84-migration replay remains Step 5.5 evidence.

### Real Concurrency — Executed

- Command from repo root: `node scripts/test-learning-schedule-revision-attendance-concurrency.mjs`, **exit 0; 18/18 executions PASS** — six scenarios repeated three times.
- Fresh [raw report](./phase-05-revision-attendance-concurrency.json): **2026-11-01 13:11:22.163–13:11:30.344 UTC**, corresponding to **20:11:22–20:11:30 Asia/Bangkok**. Pre-existing report values were replaced by this actual run.
- Independent PostgreSQL backend PIDs: **A=446, B=447, observer=454**. Both workers execute the real Revision/Attendance RPCs under authenticated role with the fixture owner's JWT claims; setup/observer use trusted postgres. This is database RPC testing, not a PostgREST or browser test.
- **18/18 observed blockers:** observer confirms A=446 in `pg_blocking_pids(447)` while A's completed RPC transaction remains uncommitted. A commits only after the observed blocker; B's resulting SQLSTATE is then asserted and its transaction committed or rolled back. All six scenarios use real waiting, with no SKIP LOCKED case in this harness.
- This tests the listed deterministic first/second transaction orderings, not simultaneous random load or every status/ordering. Timeouts: 5-second lock, 10-second statement, 15-second command; none reached.

| Scenario                             | Executions | Actual B SQLSTATE                         | Schedule revision / original Session / audit                             | Sessions retained                                                          |
| ------------------------------------ | ---------- | ----------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| REV-01 Revision first vs future Skip | 3/3 PASS   | **22023**                                 | revision 2 / cancelled, reason schedule_changed / 1 cancelled event      | Old revision-1 row retained; one new revision-2 scheduled row, distinct ID |
| REV-02 Future Skip first vs Revision | 3/3 PASS   | **00000**; Revision returns 2             | revision 2 / skipped / 1 skipped event                                   | Old skipped revision-1 row retained; one new revision-2 scheduled row      |
| REV-03 Start first vs Revision       | 3/3 PASS   | **22023**                                 | revision 1 / in_progress / 1 started event                               | Only the original row; failed Revision creates no new occurrence           |
| REV-04 Revision first vs Recovery    | 3/3 PASS   | **00000**; Recovery returns original UUID | revision 2 / historical missed row becomes completed / 1 recovered event | Historical revision-1 row retained; one new revision-2 scheduled row       |
| REV-05 Recovery first vs Revision    | 3/3 PASS   | **00000**; Revision returns 2             | revision 2 / completed / 1 recovered event                               | Completed revision-1 history retained; one new revision-2 scheduled row    |
| REV-06 Complete first vs Revision    | 3/3 PASS   | **00000**; Revision returns 2             | revision 2 / completed / 1 completed event                               | Completed revision-1 history retained; one new revision-2 scheduled row    |

- SQLSTATE totals for B: **6 x 22023**, **12 x 00000**; **no PT409 observed** in these six scenarios. Do not substitute an expected stale conflict for the actual state/revision outcomes above.

### Cancellation Audits / Session History

- REV-01: all three fixtures retain the cancelled original UUID, with cancellation_reason **schedule_changed** and exactly one cancelled event. In addition to harness event-type/count assertions, all three fresh report records were checked for from_status=scheduled, to_status=cancelled, owner actor_id, deterministic key `ls:schedule-change-cancel:<original UUID>`, payload reason=schedule_changed and payload scheduleRevision=1.
- Revision creates a new occurrence with a **different UUID**, schedule_revision=2 and status scheduled in each successful revision. Historical original Session rows retain revision 1 in the recorded session lists. The three Start-first runs remain at revision 1 with only the original in_progress row.
- Skipped/completed historical sessions are retained rather than cancelled by Revision in the executed paths. Historical missed sessions remain recoverable after Revision: REV-04 succeeds with the original expected version. No cancellation event is added to those completed/skipped histories.
- Every original Session has **exactly one event**; across 18 fixtures: **3 cancelled, 3 skipped, 3 started, 6 recovered, 3 completed**. Harness checks event types/counts and unique keys for original Sessions. Audit arrays for newly generated occurrences are not independently queried by this harness; no claim is made about a separately executed new-occurrence audit-count assertion.
- Parent Task remains **todo** and Schedule **active** in all runs. actual_study_minutes remains null. completed_at exists for completed originals and is null for cancelled/skipped/in_progress originals. Returned original Session IDs and new-occurrence distinct IDs are asserted. Full original rows/events and per-Schedule session summaries are retained in JSON.
- Limit: this suite does not compare every historical timestamp/time/identity field against a pre-command full snapshot; it does not test repeated revision idempotency or exact-key attendance retries through every later revision. Recorded final snapshots are not substituted for unexecuted before/after assertions.

### Cleanup / Gate

- Harness **cleanup PASS**, fixture Task/user removed, **0 open worker transactions** verified before closing all three connections.
- Independent post-exit query confirms **0 attendance-cc fixture users, 0 fixture Tasks and 0 remaining harness backends**. No test connection survives; no retained worker transaction is claimed from a mere final-state snapshot.
- Sweep gate is asserted **OFF before the harness** and independently confirmed **OFF afterward**. No Cron activation or schedule alteration. This verification used only local Supabase and did not touch .env.local.

### Database and Web Gates — Fresh Runs

- Database: local CLI `supabase test db --local`, **exit 0; 24 files, 488 assertions PASS, 0 failures**, 11 wall-clock seconds. This reruns HARD-01–21 and previous suites. Persistent concurrency fixture setup is intentionally TAP-skipped; the 18 real executions above are additional evidence, not part of the 488 pgTAP assertions.
- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at `features/focus-sessions/use-focus-v2-audio.ts:104:6`.
- Vitest: `node node_modules/vitest/vitest.mjs run`, **exit 0; 69 files passed / 2 skipped, 612 tests passed / 20 skipped**, **102.23 seconds**. The skipped 19 opt-in Phase 04 integration tests and 1 Focus integration test were not separately run. This is web regression coverage, not an attendance browser/UI acceptance run.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **26.3 seconds**, TypeScript finished in **48 seconds**, generated **98/98** pages in **1055 ms**.
- Existing Vite config-loader/Supabase notices were non-fatal. No database, concurrency or web-gate failure occurred. `git diff --check` passed after evidence update. Earlier 24-run/30-run harnesses were not rerun in this step; their prior results remain historical evidence.

### NOT EXECUTED / Remaining Acceptance

- **Exact grace cutoff: NOT EXECUTED** — no real RPC/Sweep just-before, exact or just-after controlled-clock case.
- **Exact recovery cutoff: NOT EXECUTED** — no controlled Recovery/Skip boundary or replay after the deadline.
- **Lock crossing boundary: NOT EXECUTED** — observed waits above prove serialization, not a wait crossing grace/recovery cutoff or true-clock rejection after that crossing.
- **Reverse Sweep/Task Close cases: NOT EXECUTED in this step** — remaining Attendance-first vs Sweep, Start-first then close, Recovery vs Task Close in both orders and other outstanding status/lifecycle cases remain open. Prior B-1 partial coverage is not a complete reverse-order matrix.
- **Clock-controlled RPC tests: NOT EXECUTED** — including DST spring/fall transitions, unusual midnight, exact cutoff and replay after eligibility changes. Earlier SQL timestamp-expression tests and the historical-timezone RPC test do not close these boundary gaps.
- Remaining Revision scope: Revision-first vs current Start/Complete and other unlisted statuses/orderings, exact-key interactions, broader immutable-history comparisons and failure-injection through competing revisions have not been executed by these six scenarios. Revision-vs-Attendance is covered only to the extent listed above.
- Broader final acceptance, full runtime privilege/API matrix, fairness/load/isolation coverage, Attendance UI/browser integration, Focus reconciliation and production activation remain outside this step. Preserve the remaining 5.6B/REC-B gaps until actual tests close them.

### Decision

- Step 5.6B-2B.1: **PASS (LOCAL)** for the six documented scenarios, **18 executions / 18 observed blockers**, cancellation/history assertions, cleanup and fresh database/web gates.
- Remaining boundary/reverse-order/final acceptance: **PENDING**, with NOT EXECUTED cases above.
- Phase 05 completed: **NO**.
- Production authorized: **NO**. No commit/push performed.

## Step 5.6B-2B.2A — Lifecycle Reverse-order Concurrency

### Baseline

- Branch: `feature/learning-schedule-foundation`; implemented and verified **2026-11-01 (Asia/Bangkok)**.
- HEAD SHA: **`0c8b17d5543843facc85fe054ab0b50ac06e6446`**. New lifecycle harness/report are working-tree additions, not part of this baseline commit.
- PostgreSQL: **17.6**, container `supabase_db_lumivox-proj`, independently queried after execution.
- Supabase local: CLI **2.122.0**, local API `http://127.0.0.1:55321`; local container healthy. CLI status was captured without printing credentials.
- Migrations: **84**, independently confirmed. No new migration or production RPC modification; no clean replay repeated for this test-only change. Prior replay remains recorded in Step 5.5.
- Created `scripts/test-learning-schedule-lifecycle-concurrency.mjs` from the passed Step 5.6A harness, retaining Connection/setup/command/snapshot/observeBlocker/cleanup infrastructure and adding the supplied future fixture, Task Close command, lifecycle executor and five scenarios. Scope follows the pasted guide: implement 2A now; cutoff production changes are deferred to 2B. No commit/push.

### Real Concurrency

- Independent backend PIDs: **A=843, B=844, observer=845**. Harness asserts distinct pg_backend_pid values. Workers use authenticated role plus fixture-owner JWT claims; observer independently checks blockers and persisted state. Actual RPC/database execution, not mocked responses or browser calls.
- Observed lock waits: **15/15** — every record contains A=843 in `pg_blocking_pids(844)` before A commits. A executes the first operation uncommitted, B issues its competing operation and is observed waiting, then A releases its transaction. No SKIP LOCKED cases in this suite. These are fixed-order interleavings, not randomized load or exhaustive orderings.
- LC-01 Start -> Task Close: **3/3 PASS**, B returns **00000** / Task UUID; Session stays **in_progress** with one started event. Task completed, Schedule closed. Exact Start replay afterward succeeds; this also covers **LC-06** from the contract.
- LC-02 Recovery -> Task Close: **3/3 PASS**, from missed; B returns **00000** / Task UUID. Session **completed**, one recovered event and completed_at present. Exact Recovery replay after closure succeeds.
- LC-03 Task Close -> Recovery: **3/3 PASS**, B rejects **22023**. Historical Session remains **missed**, completed_at null, **zero events**. Closed parent state does not produce an unauthorized recovery transition.
- LC-04 Skip -> Task Close: **3/3 PASS**, from missed; B returns **00000** / Task UUID. Session remains **skipped**, one skipped event, completed_at null. Exact Skip replay after closure succeeds.
- LC-05 Task Close -> Future Skip: **3/3 PASS**, B rejects **22023**. The actual future scheduled fixture is changed by Task Close to **cancelled**, cancellation_reason **task_closed**, with exactly one cancelled event. Harness verifies key `ls:task-close:<Session UUID>`, source scheduled and target cancelled. Future fixture local/UTC values derive from the same local day/IANA timezone; canonicalization guard is retained.
- Total executions: **15/15 PASS**, five race scenarios x three iterations. `node --check scripts/test-learning-schedule-lifecycle-concurrency.mjs` and `node scripts/test-learning-schedule-lifecycle-concurrency.mjs` both exit 0. [Fresh raw report](./phase-05-lifecycle-concurrency.json), **2026-11-01 13:19:42.491–13:19:44.006 UTC** (20:19:42–20:19:44 Asia/Bangkok).
- Expected/actual SQLSTATE: all match the supplied contract — B **9 x 00000**, **6 x 22023**; no PT409 observed/expected in these cases. All 9 additional exact replay requests also succeed. First-operation Session/Task UUID and successful second-operation return ID are checked.
- Final Task status: **completed in all 15**.
- Final Schedule status: **closed in all 15**, queried through observer after both worker transactions finish.
- Final Session status: **3 in_progress, 3 completed, 3 missed, 3 skipped, 3 cancelled**. No fabricated actual_study_minutes; completed_at is non-null only for the completed outcomes. Historical rows remain available in final snapshots; no deletion/replacement is performed by these attendance/Task Close paths.
- Audit event counts: **12 total across 15 fixtures** — **3 started, 3 recovered, 3 skipped, 3 cancelled**; the three LC-03 fixtures have zero. Expected event-type arrays and unique event keys are asserted. Task closure preserves prior attendance audit history.
- Exact replay after Task Close: **9/9 PASS**, original event key and expected version reused for Start, Recovery and Skip after Task completed/Schedule closed. Returns the same Session UUID with no extra event. LC-06 is included in LC-01 replay, not counted as a sixth race scenario.
- Full snapshot unchanged on replay: **9/9 PASS**, deep comparison of entire before/after Session row, Task status and audit array. This includes updated_at/completed_at, logical identity/time metadata and all event payloads; not merely an event-count comparison. Timeouts (5-second lock, 10-second statement, 15-second client command) were not reached.

### Isolation and Cleanup

- Sweep gate before: **OFF**, asserted by real query before the loop; no Cron activation in this step.
- Sweep gate after: **OFF**, confirmed by a separate local PostgreSQL connection after the harness exited. No schedule or production configuration changed.
- Remaining fixture users: **0**, independently queried by attendance-cc email pattern after exit; harness also checks its own UUID cleanup.
- Remaining fixture Tasks: **0**, independently queried by the exact fixture title after exit. Cleanup checks owner/title identity before deleting its generated Task; no broad deletion of real data.
- Remaining worker transactions: **0**, asserted by harness after ROLLBACK/cleanup and before shutdown.
- Remaining worker backends: **0**, independently queried with application_name LIKE lumivox-attendance-cc-% after script exit. All three connections closed. Report cleanup **PASS**; no credentials saved in report.

### Regression

- pgTAP: **PASS**, local CLI `supabase test db --local`, exit 0; **24 files / 488 assertions / 0 failures**, **8 wall-clock seconds**. Persistent concurrency fixture setup is an intentional TAP skip; these 15 races and 9 replays are additional harness checks, not included in the 488 assertions.
- Vitest: **PASS**, from apps/web `node node_modules/vitest/vitest.mjs run`, exit 0; **69 files passed / 2 skipped; 612 tests passed / 20 skipped**, **99.56 seconds**. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case were not separately executed; this is not Attendance browser E2E.
- Lint: **PASS**, `node node_modules/eslint/bin/eslint.js .`, exit 0; 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- TypeScript: **PASS**, `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, exit 0.
- Build: **PASS**, `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, exit 0. Next.js 16.2.6 compiled in **24.7 seconds**, TypeScript finished in **58 seconds**, generated **98/98** pages in **1220 ms**. Existing .env.local untouched. Existing Vite config-loader and Supabase deprecated/optional-service notices were non-fatal. No syntax, concurrency, database or web gate failure occurred; `git diff --check` passed after evidence update.

### Pending Final Hardening

- Exact grace cutoff through real RPC — **NOT EXECUTED**. No just-before/exact/just-after controlled-clock RPC/Sweep test in this step.
- Exact recovery cutoff through real RPC — **NOT EXECUTED**. Exact replay after parent closure is now covered; replay after deadline itself is not covered by this live-clock suite.
- Lock wait crossing deadline — **NOT EXECUTED**. Fifteen observed waits prove serialization, not crossing grace/recovery deadlines or post-wait clock rejection.
- DST spring/fall boundary verification — **NOT EXECUTED** through controlled-time RPC calls. No authenticated caller-controlled p_now or weakened production clock was introduced.
- Attendance-first vs Sweep remaining orderings — **NOT EXECUTED**, retained from the earlier partial Sweep matrix.
- HTTP permission/privilege matrix — **NOT EXECUTED in this step**; authenticated database role/JWT claims and earlier effective-grant/ownership checks do not replace real HTTP denial cases.
- Full final acceptance — **PENDING** for 5.6B-2B.2B and subsequent required gates. This closes the five specified lifecycle race scenarios and their replay extensions, not every status/reverse ordering. Existing broader load/fairness/remaining invariants, Attendance UI, Focus reconciliation and production acceptance remain outside this turn.

### Decision

- Step 5.6B-2B.2A: **PASS (LOCAL)** — **15/15 races, 15 observed blockers, 9/9 exact replays**, correct audit/history, clean fixtures and fresh database/web gates.
- Ready for cutoff hardening: **YES**, with all NOT EXECUTED cases above retained.
- Phase 05 completed: **NO**.
- Production authorized: **NO**. No staging/production deployment, commit or push performed.

## Step 5.6B-2B.2B — Grace Cutoff Reliability

### Baseline / Implementation

- Branch: `feature/learning-schedule-foundation`; verified **2026-11-01 (Asia/Bangkok)**. `git pull --ff-only origin feature/learning-schedule-foundation` reported already up to date before implementation.
- HEAD SHA: **`48b2912910de203109b2eb8ca7ea5702f99a8b82`**. New cutoff harness/SQL/report are working-tree additions, not part of this baseline commit.
- Local PostgreSQL **17.6**, container `supabase_db_lumivox-proj`, healthy; Supabase local API `http://127.0.0.1:55321`. CLI status captured without printing credentials.
- Migration count: **84**, independently confirmed after tests. No new migration, production RPC change, test-clock parameter or database-wide configuration change. No clean replay repeated for this test-only change.
- Created `scripts/test-learning-schedule-cutoff-concurrency.mjs` from the Step 5.6A harness; retained original connection/setup/cleanup infrastructure. Added supplied prepareNearGrace and runGraceCrossing helpers, corrected `GREATEST(...)` to use no schema prefix per the guide, removed old scenarios and ran Start/Complete three iterations each. Original Step 5.6A harness unchanged.
- Timeout changes are scoped to test connections only: lock_timeout **15 seconds**, statement_timeout **25 seconds**, client command deadline **30 seconds**. Fixture grace deadline remains **5 seconds ahead**; no widening/retry was needed to make timing assertions pass.
- Created `supabase/tests/learning_schedule_cutoff_precision.sql` with the supplied **12 fixed-instant assertions**. No staging/production deployment, commit or push.

### Live Clock / Lock Crossing — Actual RPC Execution

- `node --check scripts/test-learning-schedule-cutoff-concurrency.mjs`: **exit 0**.
- `node scripts/test-learning-schedule-cutoff-concurrency.mjs`: **exit 0; 6/6 grace-crossing races PASS**, three Start plus three Complete commands, each on a separate newly prepared fixture.
- [Fresh raw report](./phase-05-cutoff-concurrency.json): **2026-11-01 13:39:23.506–13:39:55.545 UTC** (20:39:23–20:39:55 Asia/Bangkok).
- Independent PostgreSQL PIDs: **A=1768, B=1766, observer=1767**. Workers execute real authenticated production Start/Complete RPCs with the fixture owner's JWT claims. No function replacement, fake RPC response, injected p_now or mocked database clock.
- **TIME-01/02/03: 3/3 Start + 3/3 Complete PASS. TIME-04: 6/6 observed waits.** A explicitly locks the parent Task. Both observeBlocker() and observed.blockingPids confirm A in pg_blocking_pids(B) before cutoff. B is already pending before observer waits for the actual database deadline; these are not sleep-only inferred races.
- **TIME-05: 6/6 PASS.** Observer waits until the persisted fixture deadline plus 250 ms, then independently reads PostgreSQL clock_timestamp and asserts after >= deadline before A may COMMIT. The retained Task lock is released only after that read. Fresh report timestamps were independently checked again after execution.

All timestamps below are **2026-11-01, UTC+07:00 (Asia/Bangkok)**; full offset-bearing timestamps are in JSON.

| Run             | B observed blocked at | Grace deadline  | Observer clock before A COMMIT | Actual SQLSTATE |
| --------------- | --------------------- | --------------- | ------------------------------ | --------------- |
| TIME-start-1    | 20:39:23.710859       | 20:39:28.657483 | 20:39:28.914474                | 22023           |
| TIME-complete-1 | 20:39:29.008064       | 20:39:33.948757 | 20:39:34.202609                | 22023           |
| TIME-start-2    | 20:39:34.317635       | 20:39:39.256849 | 20:39:39.511382                | 22023           |
| TIME-complete-2 | 20:39:39.620679       | 20:39:44.551959 | 20:39:44.805331                | 22023           |
| TIME-start-3    | 20:39:44.887906       | 20:39:49.833739 | 20:39:50.087044                | 22023           |
| TIME-complete-3 | 20:39:50.168959       | 20:39:55.118767 | 20:39:55.371850                | 22023           |

- Every observedAt is strictly before deadline, and every afterDeadline.after is >= deadline. Thus these runs genuinely span a deadline while waiting on the Task lock. Timestamp assertions use millisecond Date.parse in the harness; observed margins are seconds/~250 ms, so no exact-microsecond classification is inferred from them.
- Start rejection message, **3/3**: **Session is outside the start window**, SQLSTATE **22023**. Complete rejection message, **3/3**: **Session is outside the completion window**, SQLSTATE **22023**. Rejections are the expected timing result, not PT409, ineligible-state error or lock/statement timeout.
- This establishes that these actual RPC calls reject after a grace deadline crossed during their lock wait. It does not claim execution at the exact cutoff microsecond, all status/timezone orderings or a Recovery deadline crossing.

### Session / Audit Snapshots

- Observer reads after A COMMIT and B ROLLBACK: **all 6 Sessions remain scheduled**, completed_at null, actual_study_minutes null, Task todo and **0 audit events**.
- Full final Session rows and event arrays are saved for all six fixtures in JSON. Existing UTC/local canonicalization is preserved using one materialized clock source for the near-grace fixture; guard/production logic unchanged.
- The supplied live harness asserts the listed status/completion/minutes/Task/event invariants. It does not separately deep-compare every original Session field/timestamp against a pre-command snapshot; the saved final rows are not substituted for such an unexecuted comparison.

### Fixed-instant Precision / DST Arithmetic

- `learning_schedule_cutoff_precision.sql`: **PREC-01–PREC-12, 12/12 PASS** through pgTAP, rolled-back fixtures.
- Grace arithmetic: one microsecond before permits the `< deadline` predicate; exact deadline denies that attendance predicate and satisfies Sweep's `>= deadline`; before deadline does not satisfy Sweep's predicate.
- Recovery arithmetic: local_date + 8 midnight in Asia/Ho_Chi_Minh maps to the expected UTC instant; fixed before/exact/after comparisons follow the exclusive cutoff rule.
- DST/timezone arithmetic: New York spring/fall local-midnight conversions match fixed UTC instants; historical New York versus Tokyo produces different cutoff instants; 60 elapsed minutes remain 60 minutes across spring-forward.
- These **execute SQL expressions using literal timestamps**, not RPCs with injected clock values. They supplement the six live grace-crossing RPC tests; they do not prove exact Recovery cutoff, exact grace RPC execution, DST transition through RPC or trusted-clock injection safety.

### Isolation / Cleanup — TIME-06

- **Cleanup PASS** in report; own fixture Task and owner user removed, **0 open worker transactions** verified before connection shutdown. All three connections close.
- Independent post-exit PostgreSQL queries confirm **0 attendance-cc fixture users, 0 fixture Tasks, 0 harness backends**, and **0 pg_locks entries for PIDs 1768/1766/1767**.
- Sweep gate asserted **OFF before loop**, independently confirmed **false/OFF after execution**. No Cron activation or schedule change. Fixtures are isolated to this harness and each iteration uses a fresh Session.

### Database / Web Gates — Fresh Runs

- Database: local CLI `supabase test db --local`, **exit 0; 25 files, 500 assertions PASS, 0 failures**, **13 wall-clock seconds** — 488 previous plus 12 new precision assertions. Persistent concurrency fixture setup remains an intentional TAP skip; six real clock-crossing races run separately from pgTAP.
- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Vitest: `node node_modules/vitest/vitest.mjs run`, **exit 0; 69 files passed / 2 skipped; 612 tests passed / 20 skipped**, **100.17 seconds**. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case were not separately run; this is not Attendance browser E2E.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **23.7 seconds**, TypeScript finished in **52 seconds**, generated **98/98** pages in **1085 ms**. Existing .env.local unchanged.
- Existing Vite config-loader/Supabase deprecated/optional-service notices were non-fatal. No syntax, live timing, pgTAP or web-gate failure occurred. `git diff --check` passed after evidence update. Earlier concurrency suites were not rerun in this step; their recorded evidence remains historical.

### Remaining Acceptance Gaps

- **Exact Recovery cutoff through real RPC: NOT EXECUTED**, including controlled before/exact/after local-midnight instants, Recovery lock wait crossing deadline and exact replay after the deadline. Fixed timestamp arithmetic does not close these cases.
- **Exact grace cutoff microsecond through RPC / Sweep: NOT EXECUTED.** This step verifies actual live RPC rejection after lock crossing plus literal expression precision; it does not claim an RPC invocation at exact equality or every before/after boundary branch.
- **DST transition through controlled RPC: NOT EXECUTED**, including spring/fall, unusual midnight, multiple non-UTC zones and historical-timezone deadlines under controlled clock. No caller-controlled p_now was introduced.
- **Attendance-first-vs-Sweep remaining orderings: NOT EXECUTED** in this step. Prior partial Sweep/Task Close/Revision/Lifecycle matrices remain scoped to their actual cases.
- **HTTP permissions matrix: NOT EXECUTED**, including actual denied anonymous/authenticated/cross-owner requests to operational endpoints/control table and remaining semantic input/fingerprint variants. Earlier database effective-privilege tests are narrower.
- Broader final acceptance, remaining identity/replay/status combinations, load/fairness/error-path verification, Attendance UI/Focus integration and production readiness remain outside this step. Phase 05 is still in progress; do not close all Step 5.6/REC-B gaps from this evidence alone.

### Decision

- Step 5.6B-2B.2B — Grace Cutoff Reliability: **PASS (LOCAL)** for **6 real grace-crossing races / 6 observed waits**, correct time-window errors, clean state/audit, **12 precision assertions** and fresh database/web gates.
- Remaining Recovery/DST/security/final acceptance: **PENDING**, NOT EXECUTED cases above retained.
- Phase 05 completed: **NO**.
- Production authorized: **NO**. No commit or push performed.

## Step 5.6B-2B.2C — Attendance HTTP Authorization

### Baseline / Implementation

- Branch: `feature/learning-schedule-foundation`, verified **2026-11-01 (Asia/Bangkok)**. `git pull --ff-only origin feature/learning-schedule-foundation` reported already up to date.
- HEAD SHA: **`6e2e93c67d1a40f3ddbe2a5f8d03cbaff6f8d105`**. HTTP harness/report are working-tree additions, not contained in that baseline SHA.
- Created `scripts/test-learning-schedule-attendance-http-security.mjs` from the supplied guide, applying the section 4 Auth correction: omit caller-supplied user ID and validate/use the UUID actually returned by the local Admin API for cleanup.
- Added optional `SUPABASE_CLI_PATH` override while keeping `supabase` as the default executable. Local verification sets that variable to the installed Windows Supabase executable to bypass the broken npm/npx CLI shim. `status -o env` output is captured inside Node; credentials are not printed, saved to .env or written to reports.
- Added sign-out of the disposable real Auth session before user deletion, retaining cleanup even if sign-out fails. Sign-out and deletion passed. No migration, production RPC, frontend/client binding or dependency change.
- Local origin: **`http://127.0.0.1:55321`**, guarded exactly for http, loopback hostname, port and root pathname before any request. Docker queries use only `supabase_db_lumivox-proj`; **PostgreSQL 17.6 / 84 migrations** independently confirmed after execution. No migration replay repeated for this test-only step.

### Actual HTTP Results

- `node --check scripts/test-learning-schedule-attendance-http-security.mjs`: **exit 0**.
- With SUPABASE_CLI_PATH pointing to the installed local CLI, ran `node scripts/test-learning-schedule-attendance-http-security.mjs`: **exit 0; 12/12 HTTP checks PASS**, plus two gate checks and cleanup/configuration checks.
- [Fresh secret-free report](./phase-05-http-security.json), **2026-11-01 14:19:03.101–14:19:06.235 UTC** (21:19:03–21:19:06 Asia/Bangkok).
- Anonymous requests use the local anon credential without a signed-in user. Authenticated requests use an actual access token returned by local Auth password sign-in, not simulated database claims or a fake RPC response. Service credential stays in the Node process and is used only for fixture administration and the disabled wrapper request.

| Check                        | HTTP    | Actual SQLSTATE / result        | Outcome                                                          |
| ---------------------------- | ------- | ------------------------------- | ---------------------------------------------------------------- |
| SEC-anon-batch               | **401** | **42501**                       | Anonymous POST ls_mark_missed_batch denied                       |
| SEC-anon-cron-wrapper        | **401** | **42501**                       | Anonymous POST ls_run_missed_sweep_if_enabled denied             |
| SEC-anon-control-read        | **401** | **42501**                       | Anonymous GET ls_missed_sweep_control denied                     |
| SEC-auth-batch               | **403** | **42501**                       | Signed-in ordinary user cannot execute trusted batch             |
| SEC-auth-cron-wrapper        | **403** | **42501**                       | Signed-in ordinary user cannot execute wrapper                   |
| SEC-auth-control-read        | **403** | **42501**                       | Signed-in ordinary user cannot read activation control           |
| SEC-auth-ownership-start     | **403** | **42501**                       | Start with nonexistent Session UUID denied                       |
| SEC-auth-ownership-complete  | **403** | **42501**                       | Complete with nonexistent Session UUID denied                    |
| SEC-auth-ownership-skip      | **403** | **42501**                       | Skip with nonexistent Session UUID denied                        |
| SEC-auth-ownership-recover   | **403** | **42501**                       | Recovery with nonexistent Session UUID denied                    |
| SEC-auth-invalid-event-key   | **400** | **22023**                       | Whitespace-only Start event key rejected before ownership lookup |
| SEC-service-disabled-wrapper | **200** | Scalar **0**, no error SQLSTATE | Trusted wrapper succeeds without processing while gate OFF       |

- All denials match explicit 401/403 plus 42501 assertions. No HTTP 404/PGRST202 or other schema-cache failure was accepted as a permission PASS.
- Counts: **3 anonymous denials + 3 authenticated operational denials + 4 nonexistent-session ownership denials + 1 input rejection + 1 trusted disabled-wrapper success = 12 HTTP acceptance checks**. Report checks array additionally contains SEC-00/SEC-99 gate entries; Auth setup/sign-out/deletion requests are fixture operations and not inflated into the 12.
- The harness deliberately **does not call ls_mark_missed_batch directly as service_role**, since that direct trusted operation bypasses the wrapper gate and could modify unrelated overdue local sessions. No operational gate enablement occurs.

### Gate / User Cleanup / Configuration

- **SEC-00 gate-before: false/OFF; SEC-99 gate-after: false/OFF**, both queried from local PostgreSQL. Independent post-suite query also confirms gate false. No local/remote Cron activation or schedule modification.
- Disposable user is created via local Auth Admin API, then signed in with its generated password. After tests, session sign-out **PASS**, Admin user deletion **PASS**, own-UUID count **0**. Independent post-suite query confirms **0** users matching ls-security-%@example.invalid.
- Cron configuration **PASS**: exactly one matching lumivox-learning-schedule-missed-5m job, `*/5 * * * *`, active=true, checked in harness and independently afterward. Active registration is distinct from the disabled processing gate. Command text was not newly compared by this check.
- JSON report contains check names/statuses, HTTP status/SQLSTATE, origin, baseline, timestamps and cleanup results. A final scan confirmed no credential fields or JWT values. Keys/access tokens/passwords were not saved in repository files or printed by the harness. Existing .env.local unchanged.

### Database and Web Regression — Fresh Runs

- pgTAP: local CLI `supabase test db --local`, **exit 0; 25 files, 500 assertions PASS, 0 failures**, **21 wall-clock seconds**. Existing concurrency setup file intentionally emits TAP SKIP. No new SQL assertions were added in this HTTP-only step; HTTP checks run separately from pgTAP.
- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Vitest: `node node_modules/vitest/vitest.mjs run`, **exit 0; 69 files passed / 2 skipped, 612 tests passed / 20 skipped**, **89.31 seconds**. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case were not separately executed. No Attendance UI/browser E2E was run.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **24.3 seconds**, TypeScript finished in **45 seconds**, generated **98/98** pages in **997 ms**.
- Existing Vite config-loader and Supabase deprecated/optional stopped-service notices were non-fatal. No syntax, HTTP, cleanup, database or web-gate failure occurred. `git diff --check` passed after evidence update. Earlier concurrency/cutoff harnesses were not rerun; their reports remain historical evidence.

### Scope Limits / Remaining Acceptance

- This closes the **specified 12-check HTTP scope**, not every authorization permutation. Four user-command denials use a random nonexistent UUID; they do not newly prove denial against an existing Session owned by user A. Earlier actual cross-owner reports are separate evidence, not rerun in this harness.
- **Expanded HTTP matrix: NOT EXECUTED here** — anonymous Start/Complete/Skip/Recovery, real A/B Session fixtures, own-session positive commands, control INSERT/UPDATE/DELETE, remaining argument/fingerprint variants, trusted direct batch and service-role control-table access. Control read denial and disabled wrapper success must not be generalized to those unexecuted requests.
- **Exact Recovery cutoff through RPC: NOT EXECUTED**, including controlled before/exact/after, a Recovery lock wait crossing deadline and exact replay after cutoff.
- **Controlled DST transition through RPC: NOT EXECUTED**; earlier literal arithmetic/historical-timezone tests remain narrower.
- **Attendance-first-vs-Sweep remaining races: NOT EXECUTED** in this step. Prior matrices remain scoped to their actual orderings; no complete reverse-order or load/fairness acceptance is inferred from this HTTP harness.
- Remaining clock-controlled/exact-grace RPC equality, broader replay/history and final acceptance, Attendance UI/browser E2E and Focus integration remain pending. No production approval or deployment is implied.

### Decision

- Step 5.6B-2B.2C — Attendance HTTP Authorization: **PASS (LOCAL)** for **12/12 real HTTP checks**, two gate checks, user sign-out/deletion, unchanged Cron registration and fresh database/web gates.
- Recovery/DST/remaining-races/full acceptance: **PENDING** with NOT EXECUTED cases above retained. Phase 05 remains **IN PROGRESS**.
- Production authorized: **NO**. No commit or push performed.

## Step 5.6B-2B.2D — Attendance-first vs Sweep

### Baseline / Implementation

- Branch: `feature/learning-schedule-foundation`; implemented and verified **2026-11-01 (Asia/Bangkok)**. `git pull --ff-only origin feature/learning-schedule-foundation` reported already up to date.
- HEAD SHA: **`f2b61b58517dd3a05a34a7fdca70efe30818ada3`**. New harness/report are working-tree additions, not part of that baseline commit.
- Created `scripts/test-learning-schedule-attendance-first-sweep.mjs` from the passed cross-boundary harness, retaining Connection/setup/command/snapshot/cleanup and finally infrastructure. Added the supplied prepareBeforeSweepDeadline, assertNoOtherOverdueCandidates and runAttendanceFirstSweep helpers; replaced the old execution loop with Start/Complete/Skip repeated three times. No migration or production Attendance/Sweep RPC change.
- Local environment: API `http://127.0.0.1:55321`, healthy container `supabase_db_lumivox-proj`, **PostgreSQL 17.6**, **84 migrations** independently confirmed after execution. CLI status captured without printing credentials. No clean replay repeated for this test-only change.
- The local guard requires **zero unrelated overdue scheduled sessions** before Attendance and immediately before both trusted Sweep calls. All guard checks passed; no unrelated data was deleted or modified to make this test pass. This guard is a local harness precondition, not a production candidate filter.

### Real Concurrency / Timing

- `node --check scripts/test-learning-schedule-attendance-first-sweep.mjs`: **exit 0**.
- `node scripts/test-learning-schedule-attendance-first-sweep.mjs`: **exit 0; 9/9 executions PASS** — SWR-01 Start -> Sweep **3/3**, SWR-02 Complete -> Sweep **3/3**, SWR-03 Skip -> Sweep **3/3**.
- [Fresh raw report](./phase-05-attendance-first-sweep.json): **2026-11-01 14:27:13.505–14:28:10.623 UTC** (21:27:13–21:28:10 Asia/Bangkok).
- Independent backend PIDs: **Attendance A=4010, Sweep B=4012, observer=4011**. A executes the actual authenticated Attendance RPC as the fixture owner; B executes the actual trusted batch as service_role; observer uses a separate PostgreSQL connection.
- Each fixture uses a single materialized database clock anchor and a grace deadline **6 seconds ahead**. Real Start/Complete/Skip must return the same UUID before that deadline; the returned PostgreSQL attendanceFinishedAt is asserted < deadline. No timestamp or source-state rewrite after Attendance success/commit.
- A keeps its successful Attendance transaction uncommitted across cutoff. Observer sees the old committed scheduled row with zero events before the wait and after B's first batch; B therefore scans a real expired committed candidate, not an already-visible completed/skipped row.
- Observer waits to deadline + 250 ms using PostgreSQL time, asserts afterDeadline >= deadline, then B starts its first Sweep transaction while A still holds Task/Schedule/Session locks. A commits only after B finishes and observer confirms the old committed snapshot is still visible.

All timestamps below are **2026-11-01 UTC+07:00 (Asia/Bangkok)**. Raw report retains original PostgreSQL offsets; values here are normalized to the same timezone.

| Run            | Attendance finished | Grace deadline  | Observer after deadline, before first Sweep | First Sweep elapsed ms |
| -------------- | ------------------- | --------------- | ------------------------------------------- | ---------------------- |
| SWR-start-1    | 21:27:13.814844     | 21:27:19.790441 | 21:27:20.048069                             | 4.5064                 |
| SWR-complete-1 | 21:27:20.110210     | 21:27:26.097367 | 21:27:26.352701                             | 2.5481                 |
| SWR-skip-1     | 21:27:26.415166     | 21:27:32.401411 | 21:27:32.657387                             | 1.8046                 |
| SWR-start-2    | 21:27:32.714741     | 21:27:38.701036 | 21:27:38.957270                             | 2.4660                 |
| SWR-complete-2 | 21:27:39.017543     | 21:27:45.003762 | 21:27:45.256377                             | 1.8033                 |
| SWR-skip-2     | 21:27:45.313161     | 21:27:51.299597 | 21:27:51.554570                             | 2.6979                 |
| SWR-start-3    | 21:27:51.612207     | 21:27:57.598581 | 21:27:57.854137                             | 1.7016                 |
| SWR-complete-3 | 21:27:57.908956     | 21:28:03.895186 | 21:28:04.151168                             | 2.0293                 |
| SWR-skip-3     | 21:28:04.210842     | 21:28:10.195827 | 21:28:10.449998                             | 1.5869                 |

- **9/9** Attendance commands finished before cutoff; **9/9** first Sweep calls were issued only after observer confirmed cutoff passed. All these timing conditions were independently rechecked from the fresh JSON report, not inferred from total PASS output.

### SKIP LOCKED / Committed Outcome

- **9/9 first Sweep calls: marked=0, examined=1**, while A remains uncommitted. This proves discovery of the expired scheduled candidate and skipping it under the retained Attendance locks, rather than doing nothing because the deadline was not reached.
- First Sweep durations **1.5869–4.5064 ms**, all below the explicit **2000 ms** assertion bound. This is observed local latency, not a production performance guarantee. All trusted batch/Attendance calls succeed through Connection.ok's SQLSTATE 00000 check; no lock timeout/error was accepted as a successful skip.
- **No blocking-wait requirement or pg_blocking_pids PASS is claimed for these nine SKIP LOCKED cases.** B is expected to return promptly before A releases its locks. The retained lock comes from A's actual uncommitted Attendance RPC, not a sleep-only assumption that B must be waiting.
- After A commits, **9/9 retries: marked=0, examined=0** in fresh JSON. The now-committed Session is no longer scheduled, so it is no longer a missed candidate. This differs intentionally from a locked scheduled candidate that should be marked missed on retry.
- **9/9 full snapshot comparisons PASS:** after the retry, entire persisted Session row, Task status and event array equal the immediately post-A-commit snapshot. This includes updated_at, completed_at, logical identity/time metadata and event payloads.
- Final states: **3 in_progress + 3 completed + 3 skipped**, all parent Tasks todo, all actual_study_minutes null. completed_at is present only for Complete outcomes. Exactly one event per Session with the submitted event key: **3 started + 3 completed + 3 skipped**; **zero marked_missed events** across all nine fixtures.
- Full final snapshots, first/retry batch outputs, PostgreSQL timing values, per-run backend PIDs and elapsed times are preserved in JSON. Historical state is not manufactured by changing timestamps after Attendance commit.

### Isolation / Cleanup / Gate

- Sweep gate **false/OFF before and after**, asserted by harness and confirmed by an independent post-exit query. No Cron gate activation, production operation or schedule change.
- Report cleanup **PASS**, **0 open worker transactions** and **0 remaining worker locks** before shutdown. All three connections close. Independent final query confirms **0 attendance-cc fixture users, 0 fixture Tasks and 0 harness backends**.
- Cleanup checks fixture owner/title before deleting its own generated Task and user; no broad real-data deletion. The unrelated-overdue guard passed at every required checkpoint. Each run uses a distinct Session fixture.
- No migration, dependency, production RPC, browser code or .env.local change. No commit/push.

### Database / Web Regression — Fresh Runs

- Database: local CLI `supabase test db --local`, **exit 0; 25 files, 500 assertions PASS, 0 failures**, **9 wall-clock seconds**. Intentional concurrency setup TAP skip remains; these nine real races are separate harness coverage.
- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Vitest: `node node_modules/vitest/vitest.mjs run`, **exit 0; 69 files passed / 2 skipped, 612 tests passed / 20 skipped**, **105.18 seconds**. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case were not separately run. No Attendance browser/UI E2E executed.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **25.6 seconds**, TypeScript finished in **66 seconds**, generated **98/98** pages in **1257 ms**.
- Existing Vite config-loader/Supabase deprecated/optional-service notices were non-fatal. No syntax, fixture guard, timing, race, database or web-gate failure occurred. `git diff --check` passed after evidence update. Earlier HTTP and other race harnesses were not rerun in this step.

### Remaining Acceptance Gaps

- **Exact Recovery cutoff through real RPC: NOT EXECUTED** — controlled before/exact/after, Recovery lock crossing cutoff and exact replay after deadline remain open.
- **Controlled DST transition through RPC: NOT EXECUTED**, including spring/fall and unusual local-midnight boundaries. Single-anchor canonical fixtures and earlier fixed timestamp arithmetic are narrower evidence.
- **Exact grace equality through RPC/Sweep: NOT EXECUTED** — this suite succeeds clearly before cutoff and scans clearly after it; it does not classify an RPC at the exact microsecond of equality.
- The specified Attendance-first Start/Complete/Skip vs Sweep orderings are now **executed**. Recovery interaction, other eligibility states, multi-candidate contention/fairness, error-path cleanup and broader isolation/load cases are not newly established by these nine runs. Do not treat this as exhaustive Sweep acceptance.
- Expanded HTTP permission/payload permutations remain as scoped in Step 5.6B-2B.2C; that earlier 12-check suite was not rerun here. Remaining final acceptance, Attendance UI/browser E2E, Focus reconciliation and production activation remain pending.

### Decision

- Step 5.6B-2B.2D — Attendance-first vs Sweep: **PASS (LOCAL)** — **9/9 pre-cutoff Attendance successes, 9/9 prompt locked-candidate skips, 9/9 unchanged retry snapshots**, no false missed audit, clean fixtures/gate and fresh database/web gates.
- Recovery cutoff / DST / full final acceptance: **PENDING** with NOT EXECUTED cases above retained. Phase 05 remains **IN PROGRESS**.
- Production authorized: **NO**. No commit or push performed.

## Step 5.6B-2B.2E — Recovery Timezone Matrix

### Baseline / Implementation

- Branch: `feature/learning-schedule-foundation`; implemented and verified **2026-11-01 (Asia/Bangkok)**. `git pull --ff-only origin feature/learning-schedule-foundation` reported already up to date.
- HEAD SHA: **`db24f78d5cc2622b99662d5c9b8605f2af888fd8`**. New matrix SQL is a working-tree addition, not part of this baseline commit.
- Database: independently queried **PostgreSQL 17.6**, container `supabase_db_lumivox-proj`, **84 migrations**. No new migration/production RPC change, clock override, deployment, commit or push. No clean replay repeated for this test-only step.
- Created `supabase/tests/learning_schedule_recovery_timezone_matrix.sql` from the supplied guide, using real authenticated Recovery/Skip RPCs, historical local-noon fixtures and rolled-back transactions. Noon avoids ambiguous/nonexistent DST wall-clock hours and preserves the local/UTC canonicalization contract.
- **Fixture correction:** supplied tokyo_expired initially had status skipped. ls_skip_study_session only permits scheduled/missed, so that fixture would fail eligibility before evaluating the recovery cutoff and could not prove the intended expired-window behavior. Changed only that fixture's initial status to **missed**, so ZONE-08 actually exercises expired missed -> skipped correction. Expected business error remains 22023 / Session is outside the recovery window; production rules unchanged. Tokyo skipped -> completed Recovery remains covered by the separate valid tokyo_skipped case.
- **Assertion-count correction:** the supplied SQL expands to **16 assertions**, not 17: ZONE-01/02 contribute 2, ZONE-03/04/05 contribute 9, ZONE-06–10 contribute 5. Actual full-suite result is therefore **516**, not the guide's forecast 517. No padding assertion was added solely to match the forecast.

### Actual ZONE Results

| Group     | Executed assertions | Actual result                                                                                                                                               | Status   |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ZONE-01   | 1                   | Historical Session timezone remains America/New_York                                                                                                        | PASS     |
| ZONE-02   | 1                   | Current Schedule timezone changed to Asia/Tokyo independently                                                                                               | PASS     |
| ZONE-03   | 3                   | Real Recovery succeeds for NY missed, Tokyo skipped and HCM missed; each returns original Session UUID                                                      | PASS     |
| ZONE-04   | 3                   | Each Session completed with non-null completed_at and null actual_study_minutes; recovered audit has correct source/target/owner and historical-zone cutoff | PASS     |
| ZONE-05   | 3                   | Same key and original expected version replay successfully after completion in all three timezones; original UUID returned                                  | PASS     |
| ZONE-06   | 1                   | Each recovered Session has exactly one audit event after retries                                                                                            | PASS     |
| ZONE-07   | 1                   | 10-local-day-old NY missed Recovery rejects 22023 / Session is outside the recovery window                                                                  | PASS     |
| ZONE-08   | 1                   | 10-local-day-old Tokyo missed Skip rejects 22023 / Session is outside the recovery window                                                                   | PASS     |
| ZONE-09   | 1                   | Both rejected expired Sessions retain their initial status and null completed_at                                                                            | PASS     |
| ZONE-10   | 1                   | Both expired requests append zero audit events                                                                                                              | PASS     |
| **Total** | **16**              | Sequential real database RPC/pgTAP checks                                                                                                                   | **PASS** |

- Execution uses SET LOCAL ROLE authenticated and the fixture owner's actual JWT claims in PostgreSQL. It invokes production functions with their authorization/lock/time/audit logic intact; no fake result or test clock parameter. This is database RPC execution, not a fresh HTTP or browser test.
- Valid fixtures are two local dates old; expired fixtures are ten local dates old. Each has its own root todo Task, active Schedule and Session. These samples are away from midnight cutoff and do not claim exact-boundary execution.

### Audit Cutoff / Historical Timezone / Replay

- For **America/New_York**, **Asia/Tokyo** and **Asia/Ho_Chi_Minh**, ZONE-04 reads the actual persisted recovered event and checks its recoveryCutoff against **((Session.local_date + 8)::timestamp AT TIME ZONE historical_zone)**. Payload originalTimezone equals that Session's saved zone, actor_id equals owner, from_status equals the original missed/skipped state and to_status is completed.
- New York Session's Schedule is deliberately changed to Tokyo before real Recovery. Successful cutoff/audit checks prove this branch uses **historical New York**, not the current Schedule timezone. The test compares actual event values against the expected formula; no concrete cutoff timestamp is invented from source review in this evidence.
- All three real exact retries succeed and final event counts are one each. This suite does not separately deep-compare every timestamp/Session field before and after replay; the full-row replay invariants executed in earlier suites are separate evidence, not a newly repeated assertion here.
- Rejected expired requests are checked for unchanged status, null completed_at and no events. Full pre/post row equality including updated_at is not independently asserted by this new matrix; no stronger no-mutation result is claimed from ZONE-09 alone.

### Database / Cleanup

- Local command: `supabase test db --local` via the installed Windows CLI executable; **exit 0; 26 files, 516 assertions PASS, 0 failures**, **23 wall-clock seconds**. **500 previous assertions + 16 new matrix assertions**. Persistent concurrency fixture setup remains an intentional TAP skip.
- No initial run with a deliberately invalid skipped fixture was counted as evidence; the source mismatch was corrected before acceptance execution. No fixture canonicalization/auth/RPC failure occurred in the run.
- Entire SQL test ends with **ROLLBACK**, including generated Tasks/Schedules/Sessions/events and Auth/profile fixtures. Independent final query confirms **0 recovery-zone fixture users and 0 fixture Tasks** for UUID 57000000-0000-4000-8000-000000000001.
- Sweep gate remains **false/OFF**, independently queried after tests. No Cron activation, production configuration or .env.local change. No new concurrency harness/worker connections in this step.

### Web Regression — Fresh Runs

- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Vitest: `node node_modules/vitest/vitest.mjs run`, **exit 0; 69 files passed / 2 skipped; 612 tests passed / 20 skipped**, **118.68 seconds**. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case were not separately run. New SQL coverage is not counted among the 612 web passes.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **28.6 seconds**, TypeScript finished in **74 seconds**, generated **98/98** pages in **1644 ms**.
- Existing Vite config-loader/Supabase deprecated notices were non-fatal. `git diff --check` passed after evidence update. Earlier HTTP/concurrency harnesses were not rerun; their previous reports remain historical evidence.

### Boundaries / Residual Risks for Final Review

- **Exact Recovery RPC at midnight cutoff: NOT EXECUTED** — no trusted deterministic clock seam was added; ordinary live-clock date samples do not establish just-before/exact/just-after RPC acceptance.
- **Recovery lock wait crossing midnight cutoff: NOT EXECUTED**. Earlier actual grace-crossing Start/Complete tests do not prove Recovery midnight crossing.
- **Controlled DST spring/fall boundary through RPC: NOT EXECUTED**. These tests use three IANA timezones, but deliberately avoid ambiguous/nonexistent local hours and do not force the actual RPC clock to the transition instant. Existing attendance_boundaries/cutoff_precision fixed-instant assertions remain arithmetic evidence only.
- **Replay after deadline / exact grace equality through RPC and broader status/payload/HTTP permutations:** not newly executed by this matrix. Earlier replay and HTTP scopes remain limited to their documented cases.
- Treat exact midnight/DST/clock-control gaps as explicit **residual risks for Step 5.6 final review**, not as implicit PASS or a reason to expose caller-controlled p_now. No production clock/authorization boundary was weakened to satisfy testing.
- Full backend acceptance/residual-risk decision, Attendance UI/browser E2E, Focus integration and Phase 05 final acceptance remain pending. No automatic transition to UI or production authorization in this step.

### Decision

- Step 5.6B-2B.2E — Recovery Timezone Matrix: **PASS (LOCAL)** for **16/16 actual matrix assertions, 516 total pgTAP assertions**, actual historical-zone Recovery/expired Skip behavior, cleanup and fresh web gates.
- Ready for Step 5.6 final review / residual-risk decision: **YES**, with all NOT EXECUTED gaps above preserved.
- Phase 05 completed: **NO**.
- Production authorized: **NO**. No commit, push, merge or deployment performed.

## Step 5.7A — Attendance Server Action Integration

### Baseline / Backend Review Scope

- Branch: `feature/learning-schedule-foundation`; implemented and verified **2026-11-01 (Asia/Bangkok)**. `git pull --ff-only origin feature/learning-schedule-foundation` reported already up to date.
- HEAD SHA: **`0e2bb0dcd0833fce5a5d7908a94827783a88da5b`**. New action/unit tests and regenerated types are working-tree changes, not part of this baseline commit.
- Backend integration readiness follows the supplied Step 5.6 final review: **conditional local integration readiness**, with production readiness still pending. Historical backend reports retain their actual executed scope; this action's mocked unit tests are not substituted for those RPC/concurrency/HTTP integration results.
- Residual risks remain explicit: exact Recovery midnight execution and lock crossing that deadline, controlled DST RPC boundaries, Sweep backlog fairness and in_progress/Focus reconciliation. Sweep still only automates scheduled -> missed; no UI claim that every overdue in_progress session is automatically classified.

### Files / Behavior Implemented

- Added `apps/web/features/learning-schedule/session-attendance.actions.ts`: one async use-server entrypoint, mutateStudySessionAttendanceAction(raw), with typed AttendanceCommand and discriminated AttendanceActionResult unions.
- Added `apps/web/features/learning-schedule/session-attendance.actions.test.ts`: **24 adapter unit tests** using mocked requireUser and Supabase RPC boundary, following the supplied acceptance cases.
- Updated `apps/web/types/database.types.ts` using actual Supabase local type generation; no handwritten RPC type assertion or as any.
- Zod strict discriminated schema accepts only start/complete/skip/recover, UUID Session/event keys and offset-aware expectedUpdatedAt. Only Skip accepts optional nullable reason, max 500 characters before normalization. Additional userId/now/sourceStatus/completedAt fields are outside the accepted schema; unit payload cases explicitly verify forged userId and now rejection before auth/dispatch.
- requireUser supplies the normal user-scoped Supabase client. Action forwards the original Session UUID, expected version and event key with exact PostgreSQL argument names, adding normalized p_reason only for Skip. No service-role client, caller-supplied user identity/clock, pre-read eligibility check or application-side state transition.
- Skip normalization uses JavaScript trim, blank/omitted/null -> null. Same command replay passes identical arguments; no new key or refreshed expected version is generated. Scope is stable normalized commands through this adapter; arbitrary raw direct-RPC whitespace variants are not newly tested here.
- An **8-second AbortSignal timeout** bounds each RPC request. PT409 -> conflict with conflict=true; 42501 -> notAuthorized; 22023 -> notEligible; other known DB codes -> saveFailed. Returned messages are fixed safe text, not raw database errors.
- Empty/no-code network errors, thrown errors after dispatch and unexpected successful RPC data return uncertain=true/code uncertain, without an automatic retry or false success. Auth failure before dispatch returns notAuthorized without calling RPC. Native 8-second elapsed timeout behavior was source-wired, while unit tests exercise abort-signal attachment and simulated network/thrown failures, not a real 8-second network timeout.

### TypeScript Generation

- Existing generated Database types did not contain Attendance RPC signatures. Checked CLI help, then ran local **supabase gen types typescript --local** using the installed Windows executable. Initial sandbox launch was denied; permitted rerun completed against local DB port 55322. No remote generation or credential export.
- Captured stdout and wrote UTF-8 to the existing generated file only after successful generation and required Attendance symbol checks. This legitimately adds four Attendance RPCs, the missed-sweep control table and other current local functions (earliest-local-instant, batch and gated wrapper). Static generated declarations do not modify PostgreSQL grants or enable Sweep.
- Retained generator formatting; trimmed whitespace on the newly generated control-table blank line so git diff --check succeeds. No as any, manual function-signature patch or dependency change. TypeScript and Next build both pass with the generated signatures.

### New Unit Acceptance — 24/24 PASS

- Targeted command from apps/web: `node node_modules/vitest/vitest.mjs run features/learning-schedule/session-attendance.actions.test.ts`, **exit 0; 1 file / 24 tests PASS**, **3.76 seconds**.

| Group                             | Tests  | Actual result                                                                                                       |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Start/Complete/Recovery dispatch  | 3      | Correct RPC name and exact p_session_id/p_expected_updated_at/p_event_key; abort signal attached; same UUID success |
| Non-empty Skip normalization      | 1      | Trimmed reason passed to ls_skip_study_session                                                                      |
| Optional/blank Skip normalization | 4      | undefined/null/empty/ordinary spaces normalize to null                                                              |
| Invalid/extra input fields        | 7      | Bad command/UUID/date, overlong reason, forged userId/now reject before requireUser and RPC                         |
| Safe database error mapping       | 4      | PT409/42501/22023/XX000 map to safe codes without exposing supplied sensitive DB message                            |
| Network uncertainty               | 1      | Empty error code -> uncertain; one RPC call only                                                                    |
| Thrown post-dispatch failure      | 1      | uncertain; no automatic retry                                                                                       |
| Unexpected RPC result             | 1      | Different returned ID -> uncertain, not success                                                                     |
| Authentication failure            | 1      | notAuthorized; no RPC dispatch                                                                                      |
| Exact command identity            | 1      | Two explicit calls pass identical version/key/Session args and return identical success                             |
| **Total**                         | **24** | **PASS**                                                                                                            |

- Unit mocks intentionally isolate the Next.js adapter. They do not establish a fresh Server Action -> real Auth/PostgREST -> database completion path, DB audit idempotency or transaction rollback by themselves; earlier integration evidence remains separate.

### Database / Application Gates — Actual Runs

- Database regression: local CLI `supabase test db --local`, **exit 0; 26 files, 516 assertions PASS, 0 failures**, **8 wall-clock seconds**. Persistent concurrency fixture setup is intentionally TAP-skipped; no backend migration or new SQL assertion in this step.
- Independent database query confirms **PostgreSQL 17.6, 84 migrations, Sweep gate false/OFF**. No clean replay, operational batch activation or production operation performed here.
- Lint from apps/web: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **30.9 seconds**, TypeScript finished in **65 seconds**, generated **98/98** pages in **1772 ms**. Existing .env.local unchanged.
- **Initial full Vitest run: FAIL**, **1 file failed / 69 passed / 2 skipped; 7 failed / 629 passed / 20 skipped**, **113.06 seconds**. First existing DatePicker test timed out at 5000 ms while build/other gates were running; overlapping act warnings followed and six later DatePicker tests failed on missing DOM. New Attendance tests passed. This failure is retained in evidence rather than hidden by the later run.
- **Full Vitest rerun after build finished: PASS**, same `node node_modules/vitest/vitest.mjs run` command, **exit 0; 70 files passed / 2 skipped; 636 tests passed / 20 skipped (656 total)**, **71.02 seconds**. No DatePicker source/test/config or timeout was changed. The rerun did not reproduce the failure; timing/load sensitivity is plausible, but its root cause is not proven by this rerun alone.
- Final 636 web passes = previous 612 + new 24 Attendance tests. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case remain skipped and were not separately executed. Existing Vite config-loader/Supabase generation notices were non-fatal. `git diff --check` passed after whitespace cleanup/evidence update.

### Explicit Limits / Next Step

- **Attendance buttons/refetch/pending/confirmation/conflict UX: NOT IMPLEMENTED**, per Step 5.7B scope. study-sessions-list.tsx, TaskDetailsDrawer and layout/routes were not modified.
- **Browser Attendance flow / accessibility E2E: NOT EXECUTED**, deferred to 5.7C. Next build does not prove browser command/retry/refetch behavior.
- **Real authenticated Server Action integration: NOT EXECUTED in this step.** requireUser/Supabase boundary is mocked in the new tests; direct RPC/HTTP tests from earlier steps are not newly rerun through this action.
- Exact RPC deadline/DST/Recovery/Focus/fairness residual risks from backend review remain open for final risk assessment. No production clock, ownership or audit behavior was weakened to start UI integration.
- No email/reminder, Focus/minutes integration, deployment, staging/production activation, commit or push.

### Decision

- Step 5.7A — Attendance Server Action Integration: **PASS (LOCAL)** for the supplied adapter unit scope, generated types and final database/lint/type/build/Vitest checks, with the initial DatePicker failure/rerun documented above.
- Ready for Step 5.7B Attendance controls: **YES**, retaining browser/integration acceptance and backend residual risks explicitly.
- Phase 05 completed: **NO**.
- Production authorized: **NO**.

## Step 5.7B — Attendance UI State & Interaction

### Baseline / Review

- Branch: `feature/learning-schedule-foundation`; reviewed and verified **2026-11-02 (Asia/Bangkok)**.
- HEAD SHA: **`48ab6fd004628f3ac1333d4cfecbab4677cc68bf`**. Existing user working-tree changes included Session list/Task section wiring, EN/VI translations and new dialog/test files. Preserved those changes; no pull, commit, push, merge or deployment in this verification.
- Main implementation matches the guide: default canAttend=false, state-specific controls, Task/Schedule eligibility wiring, confirmation with historical local date/time/timezone, stable frozen command identity, no optimistic status transition, exact retry after uncertain result, conflict reload and page-zero refetch.
- Applied the React component review checklist for hooks, transient refs, stale responses and accessible dialog/group semantics. No server action, generated database type, migration, production RPC or dependency change in this step.

### Files / Corrections

- Reviewed new `session-attendance-dialog.tsx` and `session-attendance-dialog.test.tsx`; retained the production dialog design and expanded its tests.
- Updated `study-sessions-list.tsx`: added a synchronous shared dialogOpen ref and guarded openReschedule/openAttendance. A second opener cannot win before React commits the first state change. Disabled conflicting Attendance/Reschedule/pagination/retry controls while a dialog is open, and added role=group for the localized Attendance action-group label.
- Reviewed `task-study-schedule-section.tsx`: canAttend and canReschedule independently receive eligible && Schedule active. Existing user formatting changes preserved; no Task layout/route replacement.
- Updated `study-sessions-list.test.tsx` to mock the Attendance Server Action and exercise the real list plus dialogs, pagination, latest-version reload and late-result isolation. Expanded `task-scheduling-ui.test.tsx` with active/ineligible/paused/closed capability cases and actual TaskDetailsDrawer cases for completed/cancelled/in_review/subtask with an existing active Schedule.
- Corrected three callback mock declarations in the new dialog tests: explicit vi.fn<() => void> / vi.fn<(open: boolean) => void> signatures replace broad ReturnType<typeof vi.fn>, which Vitest's constructable/callable union did not satisfy under TypeScript. No as any or runtime behavior change for this correction.
- Reviewed `messages/en.json` and `messages/vi.json`: Attendance objects match the supplied guide exactly; attendanceActionsLabel exists in both. Existing keys preserved. An additional component test renders actual Vietnamese messages and error/retry labels.

### Component Acceptance — Executed

- Initial supplied dialog/list tests: **16/16 PASS**; they did not cover the required real-list Attendance integration cases.
- Expanded targeted run: `node node_modules/vitest/vitest.mjs run features/learning-schedule/components/session-attendance-dialog.test.tsx features/learning-schedule/components/study-sessions-list.test.tsx features/learning-schedule/components/task-scheduling-ui.test.tsx`, **61/61 PASS** across three files. Final rerun after callback typing correction: **exit 0, 8.10 seconds**.
- Final file coverage: **12 dialog tests, 27 list tests, 22 Task scheduling UI tests**. Relative to committed baseline these add **36 tests**: 12 new dialog cases, 16 additional list cases and 8 Task capability/Drawer cases.

| Acceptance                   | Actual executed evidence                                                                                                                                                                      | Result                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Default capability           | Default canAttend=false leaves the existing six-state list without Attendance buttons                                                                                                         | PASS                                        |
| Status mapping               | scheduled -> Start/Complete/Skip; in_progress -> Complete; missed -> Recover/Skip; skipped -> Recover; completed/cancelled -> no mutation buttons                                             | PASS, six explicit list cases               |
| Task/Schedule gating         | Active eligible parent exposes controls; ineligible parent, paused/closed Schedule hide them; actual Drawer completed/cancelled/in_review/subtask hides controls even with an active Schedule | PASS                                        |
| Confirmation context         | Dialog title/description linked by aria attributes; actual local date, start/end and timezone rendered                                                                                        | PASS, component DOM assertions              |
| Four commands                | Actual list/dialog clicks call the mocked Server Action with the right command, Session and saved version; existing Server Action tests reran in full suite                                   | PASS at mocked component/adapter boundaries |
| Pending double-click         | Two immediate confirm clicks dispatch once; Cancel disabled and Escape cannot close pending dialog; no onSaved before result                                                                  | PASS                                        |
| Exact uncertain replay       | Frozen object retained; original UUID/version/key and normalized Skip reason reused, including object identity on retry                                                                       | PASS                                        |
| Locked reason                | Textarea disabled after uncertainty; attempted input change cannot change the submitted exact retry reason                                                                                    | PASS                                        |
| Conflict                     | Confirm disabled; Check latest closes/reloads without another mutation                                                                                                                        | PASS                                        |
| notEligible / thrown request | No automatic retry; localized alert and Check latest/uncertain retry behavior; no optimistic completed status                                                                                 | PASS                                        |
| Page-one success             | Real list discards old pages, reloads page zero, then sends the newly queried updated_at on the next action                                                                                   | PASS                                        |
| Modal exclusivity            | Attendance-first and Reschedule-first opener clicks in the same React act each leave exactly one dialog; Load more/conflicting opener disabled                                                | PASS, both orderings                        |
| Schedule/permission change   | Old rows/dialog removed; late old mutation result ignored; capability revocation removes controls/dialog                                                                                      | PASS                                        |
| Unmounted dialog             | Late success produces no callback or toast on the new context                                                                                                                                 | PASS                                        |
| Localization                 | Guide EN/VI JSON parity checked; Vietnamese dialog/reason/error/retry labels exercised with real messages                                                                                     | PASS                                        |

- The tests mock query/action boundaries while rendering actual components, including the real Task Drawer in gating cases. They do **not** establish browser -> Next Server Action -> Auth/PostgREST -> persisted Session/audit acceptance.
- Native pointer/outside interaction, full focus restoration/tab order, screen-reader output and mobile visual behavior are not newly proven by jsdom title/alert/Escape assertions. Those remain for browser/a11y Step 5.7C.

### Sequential Quality Gates / Failures Retained

- Quality gates ran **sequentially**, per the guide: lint -> full Vitest -> TypeScript -> build -> database. The full-suite retry/callback typing correction and targeted verification below are recorded separately; no heavy build ran concurrently with Vitest in this turn.
- Full lint: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, 0 errors and 1 existing projection dependency warning at features/focus-sessions/use-focus-v2-audio.ts:104:6. After callback type correction, targeted ESLint on session-attendance-dialog.test.tsx also exits 0.
- **Default full Vitest command: FAIL**, **213.27 seconds**. 60 files / 569 tests passed, 2 files / 20 tests skipped, but **11 unhandled forks-worker startup timeouts** prevented other files from running. This was not accepted as a complete suite PASS; the log reports Timeout waiting for worker to respond across unrelated Focus/utility/Workspace files.
- **Full-suite rerun: PASS**, `node node_modules/vitest/vitest.mjs run --maxWorkers=2`, **exit 0; 71 files passed / 2 skipped; 672 tests passed / 20 skipped (692 total)**, **140.13 seconds**. Only worker concurrency was bounded; no test was excluded, no timeout/expectation weakened and no Vitest configuration changed. This execution establishes the full suite under the stated worker setting; it does not claim the default worker-start issue is permanently fixed or prove its root cause.
- **Initial TypeScript run: FAIL**, three TS2322 errors in supplied dialog callback mock types. Explicit callback signatures fixed them. Only erased test type annotations changed after the successful full runtime suite; the final targeted 61 tests and standalone TypeScript were rerun afterward.
- Final TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**. No production/UI logic changed after the successful full-suite run.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build`, including prebuild, **exit 0**. Next.js 16.2.6 compiled in **16.8 seconds**, TypeScript finished in **22.5 seconds**, generated **98/98** pages in **825 ms**.
- Database: local CLI `supabase test db --local`, **exit 0; 26 files, 516 assertions PASS, 0 failures**, **2 wall-clock seconds**. Persistent concurrency setup remains an intentional TAP skip. No new SQL assertions or migration in this UI step.
- Independent final query: **PostgreSQL 17.6, 84 migrations, Sweep gate false/OFF**. No Cron activation, production config or .env.local change. Existing Vite config-loader/Supabase notices were non-fatal; git diff --check passed after evidence update.
- The 20 full-suite skips are the existing 19 opt-in Phase 04 direct integration cases and 1 Focus integration case; they were not separately run. Earlier direct HTTP/concurrency harnesses were not rerun and are not presented as fresh UI integration evidence.

### Remaining / Decision

- **Real browser Attendance flow: NOT EXECUTED**, deferred by the guide to **Step 5.7C**. Controls are now wired into the existing Task detail in code, but no real browser success, two-tab conflict, lost-response transport, persisted audit, keyboard focus, mobile or screen-reader acceptance is marked PASS here.
- Final backend residual risks remain explicit: exact Recovery cutoff, Recovery lock crossing midnight, controlled DST RPC boundaries, Sweep fairness and in_progress/Focus reconciliation. UI status buttons are hints based on loaded state; PostgreSQL remains the authority for time/ownership/eligibility.
- Step 5.7B — Attendance UI State & Interaction: **PASS (LOCAL, component scope)** after the synchronous modal guard/test-type fixes, 61 targeted tests, full **672-test** bounded-worker run, final type/build and **516 pgTAP** assertions. Initial default-worker and mock-type failures remain documented above.
- Ready for Step 5.7C browser E2E/accessibility: **YES**.
- Phase 05 completed: **NO**. Production authorized: **NO**.
- No commit, push, merge or deployment performed.

## Step 5.7C-1 — Real Attendance Browser Workflow

### Environment

- Verification date: **2026-11-02**, local-only execution.
- Branch: `feature/learning-schedule-foundation`.
- HEAD SHA: `f69ff4d78bd30b57e1a4c98c9940e357bc6b9ba5`; acceptance below includes the uncommitted test and focus fix in this working tree.
- Next.js base URL: `http://127.0.0.1:3100`, Next.js **16.2.6**.
- Supabase local API origin: `http://127.0.0.1:55321`; CLI **2.122.0**, database container `supabase_db_lumivox-proj`.
- PostgreSQL version: **17.6**, independently queried after regression gates.
- Migration count: **84** applied migrations. No migration/schema change or clean reset/replay was performed in this browser step.
- Browser: **Chromium**, device timezone **Asia/Tokyo**.
- Playwright workers: **1**, serial execution; no browser test counted as PASS when skipped.
- Sweep gate before/after: **OFF**, checked by the new spec and final SQL query. No Cron activation.
- Environment isolation: existing `.env.local` resolves to a remote Supabase origin. The test server and build used process-only overrides for the local URL, publishable/anon key and server credentials; `.env.local` was not edited and no remote fixture/mutation was performed. Credentials were captured from local CLI status without printing them.
- An existing user-owned Next dev server held the normal development lock. A separate local Next server used port 3100 and isolated `.next/attendance-e2e` output with the repository's loaded Next configuration. It was stopped after E2E; its helper/cache were removed. Next's temporary tsconfig includes were restored; `git diff --exit-code -- apps/web/tsconfig.json` exits 0. The existing user-owned Node server was not stopped, and `.next/dev` was not deleted.

### Browser Tests

- New file: `apps/web/tests/learning-schedule-attendance.spec.ts`, independent from the existing ten-test Schedule suite. Login uses the real `submitLoginForm` helper. Local service-role access creates fixtures and reads persisted results; browser commands use actual UI -> Next Server Action -> Auth/PostgREST -> Attendance RPC -> refetched UI. No mocked Attendance response, direct admin Attendance RPC, or post-command SQL timestamp/status rewrite creates the expected final state.
- Fixtures use a current attendance window (`now - 10 minutes` to `now + 20 minutes`) with matching millisecond local/UTC fields. UTC/Etc-GMT offset selection avoids crossing local midnight; each case owns a separate Task/Schedule/Session. The executed Recovery path is **scheduled -> skipped -> completed**, not a claim of historical missed-session boundary coverage.
- ATE-01 Start -> Complete: **PASS**. UI shows In progress then Completed for the same Session; persisted events are exactly `started`, `completed`, with the owning actor, distinct event keys and correct transitions.
- ATE-02 Skip -> Recovery: **PASS**. UI shows Skipped then Completed; persisted events are exactly `skipped`, `recovered`.
- ATE-03 Two-tab stale version: **PASS**. Both tabs load Scheduled; tab A starts it, tab B submits Complete with its old version, sees the conflict alert and uses Check latest session. Final state remains In progress with exactly one `started` event. The browser verifies the user-visible conflict and persisted effect; it does **not** capture a raw SQLSTATE from the Server Action wire. Source mapping of `PT409` to `conflict` was checked separately.
- Total: **3/3 PASS, 0 skipped**, exit 0. Initial run: **44.1 seconds**. Final rerun after the focus correction: **38.2 seconds**; recorded interval `2026-11-02T07:07:40.184Z`–`2026-11-02T07:08:15.294Z`.
- Test failures: **0 in the final Attendance run**. Existing-suite failures and incomplete runner attempts are retained below rather than treated as successful runs.
- Unexpected page errors: **0**, collected from both tabs in the Attendance spec. Development dashboard Recharts size warnings were observed in server/console output; zero page errors is not a claim of zero console warnings.
- Persisted snapshots and cleanup: [phase-05-attendance-browser.json](./phase-05-attendance-browser.json). This generated report contains Session/audit identifiers and timestamps, not passwords, JWTs or API keys.

### Persisted Data

- Start audit: **PASS**, one `scheduled -> in_progress` event in ATE-01 and one in ATE-03; **2 started events** in total across separate Sessions.
- Complete audit: **PASS**, exactly one `in_progress -> completed` event in ATE-01 and a non-null database `completed_at`.
- Skip audit: **PASS**, exactly one `scheduled -> skipped` event in ATE-02; `completed_at` remains null immediately after Skip.
- Recovery audit: **PASS**, exactly one `skipped -> completed` event in ATE-02 and a non-null database `completed_at`.
- Stale command produced no new event: **PASS**, ATE-03 retains exactly `[started]`; no completed event or state overwrite. Across the three fixtures there are **5 events**, with no extra event from the stale command.
- Parent Task unchanged: **PASS**, persisted snapshots show `todo` for all three Tasks; ATE-01 explicitly asserts this after Complete.
- Focus minutes unchanged: **PASS**, all three final snapshots have `actual_study_minutes = null`; ATE-01/ATE-02 explicitly assert null after completion/recovery. No Focus session was fabricated or credited.
- Session updated_at from database: **PASS**, read with the persisted Session rather than generated from the browser clock. Start -> refetch -> Complete succeeds using the refreshed row version, while the unrefreshed second tab conflicts. Final stored values are `2026-11-02T14:07:52.769379+07:00` (ATE-01), `2026-11-02T14:08:03.413679+07:00` (ATE-02), and `2026-11-02T14:08:13.588615+07:00` (ATE-03).
- Test Auth user cleanup: **PASS**, real cookie-authenticated `/auth/signout` returns **303** after each Attendance case before admin deletion of its test Auth user.
- Remaining fixtures: **0 Sessions / 0 Tasks** asserted by teardown. Final independent SQL confirms **0 audit events / 0 Sessions / 0 Tasks** for the exact actor ID from the report, and **0 Auth users** matching either browser suite's fixture email prefix. Sweep gate remains false.

### Regression

- Existing Learning Schedule browser suite: `node node_modules/@playwright/test/cli.js test tests/learning-schedule.spec.ts --project=chromium --workers=1 --reporter=line`, **10/10 PASS, 0 skipped**, exit 0, **1.7 minutes**. Separate from the three Attendance cases; executed against the same isolated local server. Covers existing Schedule/Reschedule, keyboard/focus, mobile EN/VI and unscheduled Task behavior.
- Final Attendance browser command: `node node_modules/@playwright/test/cli.js test tests/learning-schedule-attendance.spec.ts --project=chromium --workers=1 --reporter=line`, **3/3 PASS**. Both commands used `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100`, local-only `LEARNING_SCHEDULE_TEST_URL` and the local service credential supplied through the process environment.
- Web/database gates ran **sequentially**: lint -> full Vitest -> standalone TypeScript -> build -> pgTAP. No heavy build ran concurrently with Vitest.
- Full Vitest: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot`, default **fork pool**, executed in a **PTY outside the sandbox**. **Exit 0; 71 files passed / 2 skipped; 672 tests passed / 20 skipped (692 total)**, **224.18 seconds**. No assertions, suite selection or timeouts were weakened. The existing 19 opt-in Phase 04 direct integration tests and 1 Focus integration test remain skipped; they were not separately executed here.
- Lint: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, **0 errors / 1 existing warning** at `features/focus-sessions/use-focus-v2-audio.ts:104:6` (projection dependency).
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build`, **exit 0**. Actual `next build` compiled in **19.6 seconds**, finished TypeScript in **36.9 seconds**, and generated **98/98** pages in **1639 ms**. Process-only Supabase overrides pointed to local. **Deviation:** the `prebuild` lifecycle hook was **NOT EXECUTED** because it recursively deletes `.next/dev` used by the existing user server. The production build itself ran fully; no package script was changed.
- pgTAP: local CLI `supabase test db --local`, **exit 0; 26 files / 516 assertions PASS / 0 failures**, **4 wall-clock seconds**. The persistent concurrency fixture remains an intentional TAP skip requiring its separate Node harness; no new concurrency execution is claimed by this step.
- Final SQL: **PostgreSQL 17.6 / 84 migrations / Sweep OFF / zero browser Auth fixtures**, plus zero remaining Attendance fixture events/Sessions/Tasks.
- `git diff --check`: PASS after the evidence update. Existing Vite native-config and Supabase deprecated/optional-service notices are non-fatal.

### Failures and Corrections

- The existing browser suite initially failed **E2E-08**: after Escape closed Reschedule, `expect(opener).toBeFocused()` received an inactive element. A rerun that only waited for the session list to finish loading still failed the same close-focus assertion (**7 passed / 1 failed / 2 not run**); this was not accepted as PASS.
- Cause established from the interaction/source: Step 5.7B disables command openers while either modal is open. Capturing `document.activeElement` only in `onOpenAutoFocus` is too late because disabling the opener blurs it. `use-schedule-dialog-focus.ts` now captures the opener on the dialog's initial render, before that commit disables the buttons, while preserving explicit capture and the existing fallback. The keyboard test also waits for loaded/enabled rows before positioning initial focus. Its Tab/Enter/Escape/focus-restoration assertions remain intact. The final ten-test browser rerun passes without extending timeouts.
- A local CLI status launch failed under the sandbox (`StandardOutputEncoding is only supported when standard output is redirected`), leaving a setup attempt with **10 skipped browser tests**. That attempt was not counted; the actual accepted executions used successful local credential discovery and ran every browser test.
- Three non-PTY full Vitest attempts did not produce completed test results: sandbox fork, elevated fork, and elevated thread-pool diagnostic. They were interrupted and are **INCOMPLETE, not PASS**; fork processes were observed restarting, but no root cause or assertion-failure count is inferred from that observation. A PTY diagnostic ran `lib/local-date.test.ts` with one thread worker (**12/12 PASS, 5.49 seconds**), followed by the accepted full run with the original default fork pool and two workers. This establishes the stated PTY execution, not a permanent fix for the earlier worker issue. Vitest configuration and test timeouts were unchanged.
- Temporary test-cache removal initially hit sandbox access errors; scoped elevated cleanup completed after stopping only the owned test server. No user dev cache was removed. These setup/runner attempts are separate from application acceptance.

### Pending

- Lost-response exact replay through browser: **NOT EXECUTED**, Step 5.7C-2.
- Keyboard focus restoration and tab order for **Attendance**: **NOT EXECUTED**. The repaired Reschedule keyboard regression is executed; it does not substitute for the separate Attendance accessibility gate.
- Mobile EN/VI Attendance dialog: **NOT EXECUTED**. Existing Schedule/Reschedule mobile cases passed, but do not establish Attendance mobile acceptance.
- Anonymous and cross-owner browser restrictions: **NOT EXECUTED**, Step 5.7C-2. Earlier backend authorization evidence is not represented as new protected-browser execution.
- Backend residual cutoff/DST/Focus risks: exact Recovery cutoff, Recovery lock crossing midnight, controlled DST RPC boundaries, Sweep fairness and in_progress/Focus reconciliation are **NOT newly exercised** by these three current-window browser cases. Earlier evidence remains scoped to its original executions.
- Production final acceptance: **NOT EXECUTED**; no production authorization.

### Decision

- Step 5.7C-1: **PASS (LOCAL)**, after the real browser focus regression fix, three Attendance workflows, ten existing browser cases and the regression gates above.
- Ready for 5.7C-2: **YES**.
- Production authorized: **NO**. Phase 05 completed: **NO**.
- No commit, push, merge or deployment performed; the user will handle commit/push.

## Step 5.7C-2 — Attendance Browser Reliability & Accessibility

### Environment / Scope

- Verification date: **2026-11-02**; branch `feature/learning-schedule-foundation`; baseline HEAD **`b4143307c214ddbfc6257d042de25c24c21f7992`**. Results include the uncommitted additions to the existing Attendance Playwright spec.
- Next.js **16.2.6**, isolated browser server **`http://127.0.0.1:3100`**; Supabase local API **`http://127.0.0.1:55321`**; CLI **2.122.0**; PostgreSQL **17.6**; **84** applied migrations, unchanged. No migration, reset/replay, production RPC or production UI change in this step.
- Chromium, **one worker**, serial execution, device timezone **Asia/Tokyo**. ATE-06 additionally uses a **390 x 844** viewport. User B has an independent browser context with the same local base URL and timezone.
- Server/build used process-only local Supabase overrides, including the actual `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` setting. Local service and anon credentials were obtained from CLI status and supplied through environment variables; `.env.local` was not edited. No passwords, API keys, tokens or Authorization headers are saved in evidence.
- Existing fixture/query/login helpers and ATE-01–ATE-03 were retained. Four cases were appended to `apps/web/tests/learning-schedule-attendance.spec.ts`; reporting adds Task/Schedule IDs and case details. Service-role access only prepares fixtures, reads evidence and deletes test Auth users; Attendance commands run through authenticated UI or User B's actual anon-key/JWT client.
- Sweep gate before/after: **OFF**. No Cron activation. The isolated Next helper/cache were removed and Next's temporary tsconfig includes restored after E2E. `git diff --exit-code -- apps/web/tsconfig.json` exits 0; the existing port-3000 server and `.next/dev` were preserved, and port 3100 is no longer listening.

### Browser Execution

- Command from `apps/web`: `node node_modules/@playwright/test/cli.js test tests/learning-schedule-attendance.spec.ts --project=chromium --workers=1 --reporter=line`.
- Accepted execution: **7/7 PASS, 0 skipped**, exit 0, **37.6 seconds**. Report interval: `2026-11-02T07:39:53.260Z`–`2026-11-02T07:40:29.330Z`. ATE-01–ATE-03 reran successfully alongside the four new cases.
- Unexpected page errors: **0**, including the second tab and User B's independent page. The intentionally aborted response in ATE-04 is expected network-fault injection; no runtime overlay prevented recovery. Existing dashboard Recharts size warnings remain separate from page errors.
- Updated [phase-05-attendance-browser.json](./phase-05-attendance-browser.json) now records all seven cases, selected persisted Session/audit fields, command identity, mobile measurements/paths, actual denials and final cleanup verification. It supersedes the previous three-case machine report; the earlier C-1 section remains historical evidence for its original SHA/execution.

### ATE-04 — Lost Response -> Exact Retry

- **PASS**, with a real authenticated Complete request forwarded by `route.fetch()`. After upstream **HTTP 200**, the test independently reads the committed Session and its one completion event **before** calling `route.abort("failed")` on the browser response. No mocked successful/uncertain Server Action response is substituted.
- Committed completion was observed at **`2026-11-02T07:40:13.020Z`**, before response loss; stored `completed_at` is `2026-11-02T14:40:13.000108+07:00`. The observation establishes commit ordering, not a separately measured exact PostgreSQL commit timestamp.
- Session identity: **`fa34f71c-12f6-4a42-8469-415d6d3322b5`**. Original and retry both send command `complete`, `expectedUpdatedAt = 2026-11-02T14:30:11.093+07:00`, and **`eventKey = b2365b10-cc22-4f4d-b008-c85d8b2bd316`**. The database version after completion is `2026-11-02T14:40:12.997882+07:00`; retry retains the original version.
- The actual dialog shows the uncertain alert and **Retry exact command**. Retry reaches the real Server Action, closes the dialog and refetches Completed. Exactly **two Complete command requests** are intercepted; their entire serialized request bodies are identical, and parsed command/session/version/key equality is also asserted.
- Completion audit counts: **1 before response loss / 1 before retry / 1 after retry**. Selected persisted Session fields (`id`, `status`, `completed_at`, `actual_study_minutes`, `updated_at`) and all selected audit fields compare equal before/after retry; actor remains the owner. Retry verified at **`2026-11-02T07:40:13.488Z`**. No SQL/admin state rewrite follows the browser command.

### ATE-05 — Keyboard / Focus

- **PASS**. The actual Skip opener is focused, **Enter** opens Attendance, and the dialog has an accessible name plus non-empty `aria-labelledby` / `aria-describedby` links.
- Fifteen **Tab** steps visit the Reason textarea, Cancel and Confirm skip; each checked focus stays inside the dialog. **Escape** closes without saving and restores focus to the still-mounted Skip opener.
- Persisted Session remains **scheduled**, with **0 events**. No additional production focus change was necessary in this step.
- This verifies automated keyboard behavior for the mounted opener, not a manual NVDA/screen-reader review or the removed-opener fallback.

### ATE-06 — Mobile EN / VI

- **PASS** in both locales at viewport **390 x 844**. Each localized Skip dialog opens, its Reason textarea is visible, and Cancel closes without changing the Session; final state **scheduled**, **0 events**.

| Locale | Content / client width | Rendered dialog width | Viewport / document width | Actual interaction               |
| ------ | ---------------------- | --------------------- | ------------------------- | -------------------------------- |
| EN     | 356 / 356 px           | 358 px                | 390 / 390 px              | Skip -> Reason visible -> Cancel |
| VI     | 356 / 356 px           | 358 px                | 390 / 390 px              | Bỏ qua -> Lý do visible -> Hủy   |

- Both screenshots were opened and visually inspected: localized title/description, Session context, textarea and confirmation/cancel controls fit without horizontal clipping. This is Chromium viewport coverage, not a physical-phone/browser/virtual-keyboard test or mobile mutation acceptance.
- Local artifacts, relative to `apps/web`: `test-results/learning-schedule-attendan-220da-tendance-works-in-EN-and-VI-chromium/attendance-en-mobile.png` and `attendance-vi-mobile.png` in the same directory. They remain ignored Playwright outputs and are **not added to Git**. The old browser suite used a separate output subdirectory so these images remain available locally.

### ATE-07 — Cross-owner Authorization

- **PASS** with two real local Auth users. User B logs in through the actual form in an independent context and cannot see User A's Task in the workspace.
- User B's separate API client uses the **local anon key + its real password-authenticated JWT**, never a service-role Attendance command or a fabricated user ID. RLS Session SELECT returns **HTTP success with zero rows**.

| User B RPC against User A's Session | Actual SQLSTATE | Actual HTTP status | Returned data |
| ----------------------------------- | --------------- | ------------------ | ------------- |
| `ls_start_study_session`            | `42501`         | 403                | null          |
| `ls_complete_study_session`         | `42501`         | 403                | null          |
| `ls_skip_study_session`             | `42501`         | 403                | null          |
| `ls_recover_study_session`          | `42501`         | 403                | null          |

- Owner's selected Session fields are unchanged after all four denials; **0 audit events**. User B's API session and cookie-authenticated browser session are signed out before context closure/Auth-user deletion; cleanup reports PASS.
- Scope is browser visibility plus authenticated user-scoped HTTP/RPC authorization. **Forged Next Server Action payloads and anonymous browser restrictions were NOT EXECUTED** and are not inferred from this case.

### Failures / Corrections Retained

- Initial seven-case attempt: **FAIL**, **3 passed / 1 failed / 3 not run**, **45.9 seconds**. ATE-04 reached its final request-count assertion with **expected 2 / received 4**. The preceding real commit, uncertain/retry UI and unchanged Session/audit assertions had succeeded.
- The supplied interceptor counted every workspace Server Action POST, including read/refetch actions. It now filters the parsed payload to this fixture's **Complete command**; unrelated actions continue normally. The original request is still forwarded to the real server then aborted on return, the retry is still real, and strict **two-command dispatch**, full-body equality and identity/audit assertions remain. No timeout or expected event count was loosened and no production layer was changed to make this test pass.
- After the interceptor correction, the entire seven-case suite reran PASS; no skipped case was accepted as evidence.

### Sequential Regression Gates

- Existing Schedule E2E: `node node_modules/@playwright/test/cli.js test tests/learning-schedule.spec.ts --project=chromium --workers=1 --reporter=line --output=test-results/schedule-regression`, **10/10 PASS, 0 skipped**, exit 0, **52.0 seconds**. The output flag only preserves the Attendance screenshots; no tests were filtered out.
- Full lint: `node node_modules/eslint/bin/eslint.js .`, **exit 0**, **0 errors / 1 existing warning** at `features/focus-sessions/use-focus-v2-audio.ts:104:6` (projection dependency).
- Full Vitest: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot`, default fork pool in **PTY outside the sandbox**, **exit 0; 71 files passed / 2 skipped; 672 tests passed / 20 skipped (692 total)**, **164.38 seconds**. The skips remain the existing 19 opt-in Phase 04 direct integration cases and 1 Focus integration case; they were not separately run. No Vitest configuration, expectations or timeout changed.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build`, **exit 0**, actual `next build` compiled in **16.1 seconds**, finished TypeScript in **28.6 seconds**, generated **98/98** pages in **1201 ms**. Process-only Supabase overrides stayed local. Per the guide, **prebuild NOT EXECUTED** because it deletes the existing user server's `.next/dev`; the production build itself completed and package scripts were unchanged.
- Database: local CLI `supabase test db --local`, **exit 0; 26 files / 516 assertions PASS / 0 failures**, **3 wall-clock seconds**. Persistent concurrency setup is an intentional TAP skip requiring its separate Node harness; no new multi-connection harness execution is claimed here.
- Order: accepted Attendance browser suite -> existing Schedule suite -> lint -> full Vitest -> standalone TypeScript -> build -> pgTAP -> final read-only cleanup verification. No build/full-unit runners ran concurrently. Existing Vite native-config/Supabase notices were non-fatal.

### Persisted State / Cleanup

- The seven accepted snapshots contain **6 events total**: ATE-01 `[started, completed]`, ATE-02 `[skipped, recovered]`, ATE-03 `[started]`, ATE-04 `[completed]`, and ATE-05–ATE-07 `[]`. The exact retry and cross-owner attempts create no extra event.
- All seven parent Tasks remain **todo**, and all selected Sessions have **`actual_study_minutes = null`**. Browser completion does not complete the Task or award Focus minutes.
- Primary Auth user sign-out/teardown reports **PASS**, **0 remaining Sessions / 0 Tasks**; User B cleanup is separately recorded. Final SQL at **`2026-11-02T07:49:48.1162573Z`** confirms **0 matching Auth fixtures**, **0 Tasks / 0 Schedules / 0 Sessions / 0 Events** for the exact reported fixture IDs, and **0 events** for the reported owner/User B actor IDs.
- The same query verifies **PostgreSQL 17.6 / 84 migrations / Sweep gate false**. It is recorded in the JSON's `finalVerification` object after the test-generated snapshots. Cleanup used scoped Auth-user deletion/cascades; no broad SQL DELETE was issued.
- Final `git diff --check`: PASS. Only the Attendance spec, machine report and this evidence file have content changes.

### Remaining / Decision

- Manual screen-reader/NVDA verification, physical-device/virtual-keyboard testing, anonymous browser restrictions and forged Server Action request-boundary tests: **NOT EXECUTED**.
- Backend residual risks concerning exact Recovery cutoff, Recovery lock crossing midnight, clock-controlled DST RPC boundaries, Sweep fairness and in_progress/Focus reconciliation remain for final review. These browser cases and the standard pgTAP rerun do not constitute new execution of the separate residual/concurrency harnesses.
- Step 5.7C-2: **PASS (LOCAL)** for the four cases and regression scope above.
- Ready for **Step 5.8 — Final Acceptance & release review: YES**. That final review is **NOT EXECUTED** in this step; Phase 05 completed: **NO**; staging/production authorized: **NO**.
- No commit, push, merge or deployment performed; the user will handle commit/push.

## Step 5.8A — Acceptance Audit & Risk Register

### Baseline / Read-only Audit

- Review date: **2026-11-02**; branch `feature/learning-schedule-foundation`; tested HEAD **`7d1b0dc2c0d2df33ba782d17ee165b63e292dc8a`**. Initial working tree clean; fast-forward pull already up to date. Fetched comparison refs without checkout/merge. HEAD remained unchanged through all tests and final SQL verification.
- `origin/product-release` and `origin/main`: **`fb2d8fe5e84fcc19033eba463976550129a8d99a`**; feature is **42 ahead / 0 behind** both. `git merge-base --is-ancestor origin/product-release HEAD`: **exit 0**.
- Git delta versus product-release: **125 files, 48,828 insertions, 72 deletions**; **14 migration additions**, no migration modifications/deletions. Release-branch repository contains **70** migration files, feature **84**. Final local version-list comparison matches all **84** repository identifiers. These are not verified remote applied/pending counts.
- Created [phase-05-final-acceptance.md](./phase-05-final-acceptance.md) with requirements traceability, six risk entries (the guide's five groups plus grace contract drift), proposed/unassigned ownership, operational controls, exact 14-file migration inventory, source workflow audit and final decision. Likelihood remains **Unknown**, without fabricated probability or reviewer approval.
- Confirmed v1 Sweep only automates scheduled -> missed; original conditional in_progress/Focus path is deferred. Original strict `>` grace wording differs from implemented/tested `>=` Sweep semantics. Staging Playwright source does not supply the Learning Schedule local-only opt-in configuration; deployed Attendance coverage cannot be inferred from its generic E2E step. No code/workflow/policy fix was made during this audit.
- Historical concurrency/HTTP reports were reviewed with their recorded baselines (all checked as ancestors), not newly executed or combined into same-HEAD race acceptance. Exact Recovery midnight/lock crossing, controlled DST RPC, backlog fairness and Focus reconciliation remain open. Remaining environment/CD flags, remote history/preview, rollback and approval belong to 5.8B/5.8C.

### Fresh Final Regression — Same HEAD

- Attendance Playwright: existing spec, Chromium **one worker**, **7/7 PASS, 0 skipped**, exit 0, **1.0 minute**. Updated [machine report](./phase-05-attendance-browser.json) baseline is the tested HEAD; interval **2026-11-02T08:05:41.839Z–08:06:42.375Z**. Real lost-response retry still yields **1 -> 1 event**, identical Complete bodies, four cross-owner **42501 / HTTP 403** denials, and zero unexpected page errors.
- Existing Schedule Playwright: separate suite and output subdirectory, **10/10 PASS, 0 skipped**, exit 0, **46.9 seconds**. EN/VI Attendance images were reopened/visually inspected and preserved as ignored local artifacts, not added to Git.
- Full lint: **exit 0**, **0 errors / 1 existing warning** at features/focus-sessions/use-focus-v2-audio.ts:104:6.
- Full Vitest: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot`, default fork pool in PTY outside sandbox, **exit 0; 71 files passed / 2 skipped; 672 tests passed / 20 skipped**, **135.32 seconds**. Existing 19 opt-in Phase 04 integration cases and 1 Focus integration case remain skipped; no expectations/configuration/timeouts changed.
- Standalone TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`, **exit 0**.
- Build: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build`, **exit 0**, compile **12.2s**, TypeScript **21.7s**, **98/98** pages in **857ms**. **Prebuild NOT EXECUTED**, preserving the existing user server's .next/dev; actual Next production build completed.
- Database: local `supabase test db --local`, **exit 0; 26 files / 516 assertions / 0 failures**, **2 wall-clock seconds**. Persistent concurrency setup remains an intentional TAP skip, not fresh independent-connection execution. Python/AI tests and remote CI were not run in this source-unchanged audit scope.
- Sequence: Attendance -> Schedule -> lint -> full Vitest -> TypeScript -> build -> pgTAP -> final read-only catalog/cleanup query. No heavy parallel runners. No fresh acceptance failure occurred; Vite/Supabase/Recharts notices and existing warning remain disclosed.

### Controls / Decision

- Final query at **2026-11-02T08:23:22.8868737Z**: **PostgreSQL 17.6 / 84 matching migrations / five RLS-enabled domain tables / Sweep gate false**. Actual RPC privileges/search_path are captured in report finalVerification; ordinary users cannot execute the operational batch/wrapper.
- Cron job remains **active=true**, `*/5 * * * *`, behind the **OFF processing gate**; no activation or schedule change. These are distinct controls. Zero reported Auth/Task/Schedule/Session/Event fixtures and actor events remain; no broad DELETE was issued.
- Next/browser/build used process-only local credentials and isolated port 3100/cache; .env.local unchanged. Owned test server/cache/helper removed, tsconfig restored with zero content diff, existing port-3000 server retained. No new migration, production implementation or test logic.
- Audit deliverable: **COMPLETE (5.8A)**. Phase 05 final decision: **PENDING**. Release disposition: **HOLD FOR STAGING PREFLIGHT**. Staging/production deployment and release-branch merge: **NOT AUTHORIZED**; no reviewer approval or named risk acceptance recorded.
- `git diff --check`: **PASS** after documentation/report update. No db reset, remote link/query, db push/dry-run, commit, push, merge or deployment performed. The user will commit/push the review artifacts; next gate is **5.8B**, not automatic release approval.
