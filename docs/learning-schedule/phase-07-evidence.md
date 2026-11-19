# Phase 07 — Notification Preferences & Durable Outbox Evidence

## Step 7A — Schema, Consent & Outbox Foundation

- **Baseline HEAD:** `377a8aebd71e8aeba1f08b34de0db94088c94cbe`; `feature/learning-schedule-foundation`, clean working tree initially, 4 ahead / 0 behind fetched `origin/product-release`. Execution date **2026-11-04**, Asia/Bangkok. Results include the uncommitted 7A implementation; no commit/push or deployment.
- **CLI-created migration:** `20261104051851_learning_schedule_notification_foundation.sql`. **85 migrations** (84 baseline + 1 new); no old migration edited. Supabase CLI **2.122.0**.
- Docker Desktop was initially stopped; started it in the background. Before migration, local `lumivox-proj` had **0 Auth users / 0 Tasks / 84 migrations**, Sweep processing gate **false**. A temporary existing-user fixture was created before forward apply: afterwards **1 expected fixture / 0 Tasks / 0 preference rows / 85 migrations**, proving no implicit opt-in. Clean local `db reset --local --no-seed` replay then passed. Final replay also includes the restricted browser status-column grants; reset was guarded to refuse unexpected user data.

### Implemented boundaries

- Five `study_notification_*` tables: preferences, Task overrides, jobs, deliveries and independent dispatch control. All have RLS; browser writes are revoked. Preferences/overrides expose owner-only reads; job/delivery reads expose owner-only status columns, excluding lease tokens, idempotency keys, provider message IDs and error diagnostics. Operational control is not browser-readable/writable. Trusted `service_role` has explicit SELECT/INSERT/UPDATE/DELETE, not browser privileges.
- Explicit `ls_set_study_notification_preferences` uses `auth.uid()` and DB `clock_timestamp()`; no browser userId/consentedAt arguments. Missing row means OFF. New default row is OFF / lead 15 / consent null. Repeated true saves preserve latest affirmative consent; opt-out retains that timestamp while effective permission becomes false. The timestamp is a current consent record, **not an append-only consent audit ledger**.
- Secure Task override command checks ownership; effective preference is GlobalOptIn AND TaskNotDisabled. `enabled=true` restores the Task default and cannot bypass global OFF. The helper represents preference permission only, not verified-email/session/dispatch eligibility.
- Database validates lead values 5/15/30/60, quiet-hour endpoints and catalog timezone; overnight quiet-hour configuration is accepted. Definer commands have empty search_path and authenticated-only EXECUTE. Effective read helper is security invoker.
- Outbox enforces globally unique idempotency key and `(session_id, notification_type, schedule_revision)`, matching Session owner **and generation revision**, nonnegative attempts, paired leases and leased-status requirements. Claim index is `(status,next_attempt_at,due_at)`. Delivery attempts are unique per job, with owner-consistent FK. `sent` is provider acceptance, never inbox delivery; attempt delivery states are separate. Provider representation is restricted to **fake** in Phase 07.
- Jobs contain no destination, raw email body or learning content. Dispatch control defaults OFF independently of Missed Sweep. No reminder Cron, enqueue/claim function, worker, provider SDK call or Settings UI was added.
- Added strict owner-scoped read/save Server Actions and Task override save action under `features/learning-schedule`; reads never insert an implicit preference. Generated types preserve both existing `graphql_public` and `public` schemas; only trailing whitespace was normalized.

### Required acceptance

| Case                      | Actual result                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NP-01 new user            | **PASS**, SQL + HTTP: missing row/default row remain OFF, no fabricated consent                                                                                                                    |
| NP-02 explicit opt-in     | **PASS**, SQL + HTTP: timestamp from DB; identical affirmative save preserves timestamp; direct timestamp/owner injection rejected                                                                 |
| NP-03 opt-out             | **PASS for stored consent/effective OFF**. Pending-job invalidation is explicitly **NOT IMPLEMENTED / NOT ACCEPTED until 7B**                                                                      |
| NP-04 lead values         | **PASS**, all four allowed values and invalid/null/noninteger inputs tested                                                                                                                        |
| NP-05 quiet hours         | **PASS for configuration/validation**: overnight/daytime accepted; equal/missing endpoints, 24:00, blank/unknown/numeric-offset zone rejected. Send-time quiet-hours suppression is deferred to 7C |
| NP-06 Task override       | **PASS**, Task disable wins over global ON; Task true cannot override global OFF                                                                                                                   |
| NP-07 owner B             | **PASS**, four-table row isolation; cannot alter A consent/override. Composite FKs reject cross-owner jobs/deliveries/overrides with **23503**                                                     |
| NP-08 direct job mutation | **PASS**, authenticated INSERT/UPDATE/DELETE/provider forgery/control changes denied with **42501**; worker lease/provider internals excluded from browser reads                                   |
| NP-09 logical duplicate   | **PASS**, both logical tuple and idempotency key duplicates rejected with **23505**; wrong generation revision rejected                                                                            |
| NP-10 operations          | **PASS for 7A foundation**: dedicated gate OFF, Attendance gate independently OFF, no reminder Cron/provider call; `resend` cannot be stored as provider                                           |
| NP-11 existing users      | **PASS**, actual pre-migration Auth fixture remained without preferences after forward apply; no backfill of opt-in                                                                                |
| NP-12 clean replay        | **PASS**, all 85 migrations replayed on verified empty local, no seed                                                                                                                              |

### Commands and actual gates

Repository root (installed CLI binary used as `supabase`):

```powershell
git fetch origin
supabase migration new learning_schedule_notification_foundation
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
supabase db advisors --local --type security --fail-on none --output-format json
```

- **pgTAP: PASS**, exit 0; **27 files / 606 assertions / 0 failures**, **3 wall-clock seconds**. New foundation suite contributes **90** assertions over the 516 baseline. Fixtures roll back; persistent concurrency setup is an intentional TAP skip, not new worker-concurrency coverage.
- **Action tests: 30/30 PASS**, 6.16s, `notification-preferences.actions.test.ts`.
- **Real local HTTP integration: 3/3 PASS / 0 skipped**, final run 1.39s, `notification-preferences.integration.test.ts`: real Auth/PostgREST/RPC, DB consent, effective Task/global permission, owner B, direct mutation denial and anonymous **42501**. Only request-cookie binding is mocked. Local URL/key variables were injected from CLI status into process environment; fixtures deleted with zero remaining owned rows asserted. No credentials persisted or printed.
- **Security advisor:** one `function_search_path_mutable` WARN outside the new notification objects; no finding referencing the new tables/functions. This is not a full-platform clean-advisor claim.
- Web gates executed sequentially in `apps/web`: `node node_modules/eslint/bin/eslint.js .` **PASS**, exit 0, 0 errors / 1 existing Focus `projection` hook-dependency warning; then `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot` **PASS**, exit 0, **798 passed / 26 skipped**, **78 files passed / 5 skipped**, **187.32s**, started **12:35:02 UTC+07:00**. The 3 new opt-in integration cases were executed separately above; other opt-in skips are not counted as new 7A passes.
- Then `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: **PASS**, exit 0.
- Then `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build`: **PASS**, exit 0; Next **16.2.6**, compile **21.5s**, TypeScript **26.9s**, **100/100** pages in **1173ms**. **Prebuild NOT EXECUTED**, preserving `.next/dev`; actual production build completed. Build uses process-only Supabase local configuration, `.env.local` unchanged.
- Final read-only local verification: **85 applied migrations / 5 RLS-enabled notification tables / dispatch gate false / Sweep gate false / 0 Auth users / 0 preferences / 0 overrides / 0 jobs / 0 deliveries / 0 reminder Cron jobs**. Both mutating RPCs are definer with empty search_path; effective read helper is invoker with empty search_path. Fixture cleanup passed, `.next/dev` retained, `git diff --check` and explicit new-file whitespace checks **PASS**. No source files outside the 7A migration/tests/actions/types/evidence scope changed.

### Limits / next checkpoint

- **7B NOT IMPLEMENTED:** transactional enqueue, reschedule/revision/Attendance/Task-close job lifecycle, pending/leased invalidation on global opt-out or Task disable. The SQL test deliberately demonstrates that a seeded pending job still exists after opt-out; it is not mislabeled full cancellation acceptance.
- **7C NOT IMPLEMENTED:** claim/lease worker, concurrent claims, lease expiry/reconciliation, retry/backoff, final verified-destination/session/quiet-hours checks, suppression and fake-provider execution. Fake provider is currently a schema representation only; exactly-once submission/inbox delivery is not claimed.
- **7D/08 NOT IMPLEMENTED:** Settings UI/browser acceptance, unsubscribe/webhook/provider suppression, real Resend integration or email sending. No new Cron secret, shared Attendance gate, dispatch activation, remote DB migration or deployment.
- No acceptance test failure occurred in the executed 7A tests. Docker startup, CLI/Vite deprecation notices, and existing lint/advisor warnings are disclosed above. No dependencies installed or changed.
- **Decision: Step 7A Local PASS**, within the schema/consent foundation scope above. Phase 07 overall remains **INCOMPLETE** for 7B–7D; job cancellation, dispatcher and provider execution are not accepted by this checkpoint. User handles commit/push; no remote deployment approved or performed.

## Step 7B — Transactional Outbox & Job Lifecycle

- **Baseline HEAD:** `5eee59e17a410db529c799d39c25a72eec2047d8`, branch `feature/learning-schedule-foundation`; execution **2026-11-04**, Asia/Bangkok. Results include uncommitted 7B changes. No commit/push/deployment.
- **CLI-created forward migration:** `20261104061414_learning_schedule_notification_lifecycle.sql`. Guarded empty-local `supabase db reset --local --no-seed` **PASS**, **86 migrations**. No historical migration changed.
- Triggers synchronize Session create/reschedule/revision/Attendance, Task closure, consent and overrides in the originating transaction. Eligibility checks owner-consistent parents, root active Task, active/current Schedule generation, scheduled future Session, explicit consent and Task permission. New/replanned jobs require future due time; an unchanged already-queued due reminder may remain pending until Session start. Due = UTC start minus elapsed lead minutes.
- Same Session/revision retains job identity. Pending jobs with zero attempts/no deliveries can replan. Suppressed/expired jobs re-arm only with **zero attempts AND no delivery records**. Sent/failed jobs never automatically re-arm; delivery history is untouched. Leased jobs retain status/token/expiry/due and acquire `cancel_requested_at`; cancellation is a fence, **not evidence that an email was recalled**.
- Lock protocol: existing Task → Schedule → Session locks, then per-owner transaction advisory gate, then Job. Consent reconciliation reads parents through MVCC and never waits for Task/Session row locks. New-job FK acquisition uses KEY SHARE **NOWAIT**, returning retryable **55P03** on contention; retry the entire command after rollback. The existing Server Action currently maps this to generic save failure; automatic UI retry is not implemented. Trusted/admin mutations outside these entrypoints are not covered by a universal deadlock guarantee.
- Reconciliation is synchronous and bounded: at most **5,000 future candidates + 5,000 active jobs**; active-job creation/re-arm is capped at 5,000 per owner. Overflow raises **54000** and rolls back the entire preference/mutation transaction; no silent partial success/backlog. Reduce active schedules/scope and retry. Global OFF and Task OFF invalidate **all** scoped pending jobs and fence all scoped leases through indexed active-job updates, without history pagination. Quiet-hours-only saves retain policy for 7C dispatch checks.

### Executed acceptance

| Cases               | Actual result                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NJ-01–03            | **PASS**: OFF creates zero jobs; opt-in reconciles existing Sessions; ON Schedule creation creates one job per occurrence; duplicate sync/unchanged save preserve rows                            |
| NJ-04–06            | **PASS**: actual reschedule updates due while retaining job ID; actual revision suppresses old generation/enqueues new; Task close cancels Sessions and suppresses future jobs                    |
| NJ-07–08            | **PASS**: real Start, Complete from scheduled/in-progress, Skip, Missed batch and Recovery invalidate queued reminders; Recovery creates no new reminder                                          |
| NJ-09–11            | **PASS**: opt-out leaves zero current jobs; Task disable preserves another Task's pending jobs; re-enable and lead changes reconcile; already-passed lead deadline never enqueues late            |
| NJ-12               | **PASS**: injected audit insert failure restores Session/jobs/events snapshot; injected job update failure rolls back Complete and its audit                                                      |
| NJ-13               | **PASS**, real independent PostgreSQL connections; details below                                                                                                                                  |
| NJ-14–15            | **PASS**: sent delivery preserved, failed never re-arms, uncertain delivery prevents replan, leases retain ownership plus cancellation fence; owner B/anon internal-helper calls denied **42501** |
| NJ-16               | **PASS for database scope**: dispatch/Sweep OFF, zero reminder Cron; no provider/network implementation added                                                                                     |
| Budget/late enqueue | **PASS**: 5,001-future-Session fixture causes **54000**, consent stays OFF and no partial pending jobs; reducing scope then retry succeeds                                                        |

- **Full pgTAP: PASS**, exit 0, **28 files / 679 assertions / 0 failures**, **15 wall-clock seconds** (606 baseline + **73 new lifecycle assertions**). Persistent concurrency setup remains an intentional TAP skip, executed instead by the separate harness below. Updated 7A test now expects synchronous suppression rather than the historical deferred behavior.
- `node scripts/test-learning-schedule-notification-concurrency.mjs`: **PASS**, **9 executions** with two actors and one observer, 5s lock / 10s statement / 15s command timeouts. Both reschedule-first and opt-out-first ran **4 times each**: all actor SQLSTATEs **00000**, observed B blocked by A through `pg_blocking_pids()` in all 8 cases; final consent OFF, moved Session, one reschedule event, one suppressed job, zero current jobs/deliveries. Extra forced opt-in/FK contention observed **2 gate waits**, returned **55P03 / 00000**, left consent OFF/no jobs; full retry succeeded with one pending job at the new due time. No **40P01** deadlock or timeout. Raw results: `phase-07-notification-concurrency.json`.
- Harness cleanup verified **0 fixture users / Tasks / jobs / deliveries**; gates false before/after. Final local inspection: **86 migrations / 0 Auth users / 0 Tasks / 0 preferences / 0 jobs / 0 deliveries / 0 reminder Cron**, both gates false; authenticated SELECT on new fingerprint/cancellation columns is false.

### Commands / quality gates

```powershell
supabase migration new learning_schedule_notification_lifecycle
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
node scripts/test-learning-schedule-notification-concurrency.mjs
supabase gen types typescript --local
supabase db advisors --local --type security --fail-on none --output-format json
# apps/web, sequential:
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

- Generated types preserve `graphql_public` and `public`, UTF-8 without BOM, existing formatting convention. Security advisor: **1 existing `function_search_path_mutable` WARN**, no new notification finding.
- Lint **PASS**, exit 0, 0 errors / 1 existing Focus `projection` dependency warning. Full Vitest **PASS**, exit 0: **798 passed / 26 skipped**, **78 files passed / 5 skipped**, **181.68s**, started **13:34:18 UTC+07:00**. Opt-in skips are not counted as executed acceptance. TypeScript `--noEmit --incremental false --pretty false` **PASS**, exit 0.
- Additional real local HTTP consent regression: `notification-preferences.integration.test.ts` **3/3 PASS / 0 skipped**, **1.39s**, real Auth/PostgREST/RPC (request-user binding mocked); fixture cleanup asserted. `LEARNING_SCHEDULE_TEST_URL`, `LEARNING_SCHEDULE_TEST_ANON_KEY`, `LEARNING_SCHEDULE_TEST_SERVICE_KEY` injected from local CLI status into this process only; no credentials printed/persisted. This reruns 7A consent/security HTTP coverage, not a new provider/dispatch acceptance claim.
- Actual production build **PASS**, exit 0, Next **16.2.6**: compile **13.2s**, TypeScript **25.7s**, **100/100** pages in **1111ms**. Local Supabase variables injected into build process only; `.env.local` unchanged. `--ignore-scripts` skips the destructive prebuild; actual `next build` ran and `.next/dev` was retained.
- Initial targeted pgTAP failed because the new fixture supplied UUID to the existing **text** event-key argument; fixture corrected and targeted/full suites passed. Initial types write guard rejected quoted schema names in CLI output; guard corrected before writing, both schemas retained. No failed database mutation was accepted as PASS.

### Coverage limits / decision

- `ls_study_notification_job_is_current` is a trusted current-record fence, **not complete send authorization**. 7C must additionally enforce gate, verified destination, current quiet hours, and worker/provider protocol while retaining coordinator/Job transaction through the final submission decision.
- **NOT EXECUTED / 7C:** fake-provider lease-versus-cancel race, submission response loss/uncertain recovery, claim/retry/backoff/expiry, concurrent dispatchers, final send authorization. These database tests do not prove exactly-once submission, recalled email or inbox delivery. No real email, provider SDK, reminder Cron, gate activation or remote changes.
- `node --check` on the new harness, `git diff --check`, and explicit whitespace checks for new source files **PASS**. No dependencies installed/changed. Existing lint/advisor and CLI/Vite deprecation notices remain as disclosed.
- **Decision: Step 7B Local PASS** within transactional outbox/lifecycle scope above. Phase 07 remains incomplete for dispatcher/fake provider and Settings UI/browser acceptance (7C/7D). User handles commit/push.

## Step 7C — Dispatcher, Leases & Fake Provider

- **Baseline HEAD:** `bd0a9ad0a37ac8c58174ecc11592bbae75481fd6`, `feature/learning-schedule-foundation`, clean tree initially; execution **2026-11-04**, Asia/Bangkok. Evidence includes uncommitted 7C implementation; no commit/push/deployment or remote mutation.
- **CLI-created forward migration:** `20261104090451_learning_schedule_notification_dispatch.sql`; guarded **0 users / 0 Tasks / 0 jobs** before clean `db reset --local --no-seed`. **87 migrations replayed, PASS**; historical migrations unchanged. Types regenerated with `graphql_public`/`public`, existing formatting and UTF-8 without BOM retained.
- Internal claim/authorize/fake-outcome/expiry/stats RPCs revoke PUBLIC/anon/authenticated; service_role only. Definer functions have empty search_path. New delivery handoff token/outcome fingerprint are excluded from existing browser column grants. No browser service client, worker HTTP/Cron route, provider SDK or real email added.

### Protocol and acceptance boundary

- Bounded discovery examines 250 due candidate rows; owner gates are tried in stable order **before** Job `FOR UPDATE SKIP LOCKED`. Claim batch **1..25**, fixed lease **60 seconds**, maximum **3 claims**. `attempt_count` means successful claims, including a worker dying before handoff; delivery rows mean durable handoff intents, not proof of an external request/acceptance. Gaps in delivery attempt numbers are intentional.
- Authorization checks gate, correct/live lease, cancellation/current fingerprint, parent/session state, due/start clock, trusted `auth.users.email` + `email_confirmed_at`/ban state and current IANA quiet hours. Shared dispatch-control lock serializes gate OFF against short claim/handoff transactions. Quiet-hours-only saves also take the owner coordinator; Auth verification/email updates are fenced through handoff commit by **FOR SHARE NOWAIT**, returning retryable **55P03** on contention. Owner coordinator precedes Job locks; parent records are read without reverse row-lock waits. No email address/content is passed to fake provider/logs; locale defaults to `en` for this local checkpoint.
- **Durable handoff boundary = authorization transaction COMMIT inserting `submitting`, before fake provider invocation.** Authorization replay returns no new submission capability. Provider runs after DB commit, without holding coordinator/Job transaction. Cancellation committed before handoff prevents submission. **Cancellation after handoff may commit before provider acceptance and still yield `sent`/`accepted`; no recall or absolute no-send-after-opt-out guarantee is claimed.** Outcome recording preserves that real acceptance even if consent/gate changed after handoff.
- Accepted → job `sent`, delivery `accepted` (never `delivered`). Known nonacceptance/transient → delivery `failed`, bounded exponential backoff (15s × 2^(claim−1), deterministic 0..3s jitter, max 120s including validated retry-after), or expired if retry reaches Session start; claim 3 exhausts retry. Permanent → `failed`; uncertain/thrown provider error → job `failed`, delivery `uncertain`, held for review without automatic requeue.
- Expired lease without handoff may requeue only while current/uncancelled/before start and below claim cap. Expired `submitting` becomes `uncertain` + failed job, clearing lease. An expired but unreconciled owner may record its durable outcome; after ownership is cleared, late outcome is **PT409** and requires controlled review. Exact outcome replay is idempotent; changed payload **22023**. Stats expose aggregate operational counts only to trusted role.

### Executed tests

| Cases       | Actual result                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ND-01–04    | **PASS**: gate OFF means zero claims/provider calls, including OFF after claim; due job leases once; two workers claim distinct jobs; wrong/expired token **PT409**                                                                                                                                                        |
| ND-05/16    | **PASS**: global opt-out and Task-disable before handoff prevent provider call; actual cancellation/authorization blockers observed. After-handoff race tested separately with accepted outcome and retained cancellation fence                                                                                            |
| ND-06–08    | **PASS**: accepted vs transient/permanent/uncertain remain distinct; exact outcome replay/mismatch, exponential/retry-after bounds, max 3 claims, lost accepted response never blindly retried                                                                                                                             |
| ND-09/10/19 | **PASS**: controlled disconnect/restart before handoff safely retries; after handoff preserves uncertainty; injected outcome transaction failure **P0001** rolls back delivery/job update and restart makes no second submission                                                                                           |
| ND-11/12    | **PASS**: overnight/daytime quiet hours, inclusive start/exclusive end, both New York DST fold instants and spring gap; actual dispatch-time quiet suppression. Trusted local Auth fixture with confirmation timestamp permits handoff; clearing it blocks handoff. This is not Resend/account-email verification evidence |
| ND-13–15    | **PASS**, SQL fixture transitions: completed/skipped/cancelled or old generation cannot handoff; started Session and retry beyond start expire                                                                                                                                                                             |
| ND-17/18    | **PASS**: owner B/anon worker calls denied **42501**, handoff token not browser-readable; loopback target guard before DB/provider access, fake submit has no network/API/SMTP implementation, zero reminder Cron                                                                                                          |
| ND-20       | **PASS**: actual 26-job fixture claims 25 then 1; lease fields/terminal clearing, batch/null/negative/excess retry-delay validation                                                                                                                                                                                        |

- **Full pgTAP PASS**, exit 0: **29 files / 761 assertions / 0 failures**, final **13 wall-clock seconds** (**679 baseline + 82 dispatcher assertions**). This was rerun after final SQL lock hardening and clean replay. Persistent concurrency fixture remains an intentional TAP skip; separate harness executes the real concurrency cases.
- **Dispatch harness PASS**, `node --experimental-strip-types scripts/test-learning-schedule-notification-dispatch.mjs`, final execution **09:36:01–09:36:04 UTC**; raw report `phase-07-notification-dispatch.json`. Uses the actual TypeScript fake provider/dispatcher with service_role RPC transactions through three PostgreSQL connections, 5s lock/10s statement/15s command timeouts and controlled fake-provider barriers. Hard-refuses remote URL and nonempty disposable local DB before enabling gate.
- **26 executions**: gate OFF ×1; concurrent claimers ×3; actual locked-Job SKIP LOCKED ×3; pre-handoff global opt-out ×3 and Task-disable ×3; concurrent quiet-hours-only save ×3; post-handoff opt-out ×3; accepted response lost ×3; Auth verification update contention ×1; pre-handoff restart ×1; post-handoff restart ×1; accepted/outcome-commit failure ×1. **9 observed `pg_blocking_pids()` waits** for pre-handoff cancellation/quiet changes. Busy-owner/Job skips returned in **4.95–8.70ms**, and processing after release succeeded; these skip cases correctly require no blocker wait. Auth update contention returned **55P03** without handoff, then retry after commit correctly denied unverified destination.
- Fake provider: **14 calls / 14 simulated acceptances**, including accepted-but-response-lost/fault cases; no real sending. Ordinary SQL commands assert **00000**; injected outcome failure **P0001**. Pre-handoff cancellation ends `suppressed`, zero deliveries/provider calls; two claimers end two sent jobs/two accepted deliveries. After-handoff opt-out commits in **5.92–7.03ms** while fake provider is paused, then acceptance is recorded with cancellation fence retained. Lost-result/restart cases end failed job + one uncertain delivery, no blind retry. Pre-handoff restart consumes claim 2 and creates only one delivery (attempt 2). Lease expiry is advanced on disposable fixture rows, not by altering global DB/system clock or waiting 60s.
- Harness finally cleanup **PASS**: zero fixture users/Tasks/jobs/deliveries, dispatch and Sweep **false**. Final local inspection: **87 migrations / 0 users / 0 Tasks / 0 jobs / 0 deliveries / 0 reminder Cron**, both gates OFF; browser SELECT on both new delivery internals **false**. Security advisor retains **one baseline `function_search_path_mutable` WARN**, no new notification finding.

### Commands / web gates

```powershell
supabase migration new learning_schedule_notification_dispatch
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
node --experimental-strip-types scripts/test-learning-schedule-notification-dispatch.mjs
supabase gen types typescript --local
supabase db advisors --local --type security --fail-on none --output-format json
# apps/web, sequential:
node node_modules/vitest/vitest.mjs run features/learning-schedule/notifications/ --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

- Focused fake-provider/worker Vitest **17/17 PASS**, **3.83s**. Lint **PASS**, exit 0, 0 errors / 1 existing Focus `projection` dependency warning. Full Vitest **PASS**, exit 0: **815 passed / 26 skipped**, **79 files passed / 5 skipped**, **181.43s**, started **16:25:26 UTC+07:00**. Opt-in skips are not counted as new acceptance. TypeScript `--noEmit --incremental false --pretty false` **PASS**, exit 0.
- Actual Next **16.2.6** production build **PASS**, exit 0: compile **16.8s**, TypeScript **29.4s**, **100/100** pages in **1142ms**. Local Supabase variables injected into build process only; `.env.local` unchanged. Prebuild skipped with `--ignore-scripts`, actual `next build` ran, `.next/dev` preserved. Web source/types remained unchanged during subsequent SQL lock hardening; final local type regeneration matched the tested types byte-for-byte. Final replay/pgTAP/concurrency/advisors were rerun against hardened SQL.
- Initial harness execution stopped at a duplicate `const` declaration before any DB connection/fixture; fixed and final harness passed. No SQL acceptance failures occurred. CLI/Vite and Node type-stripping/module-detection notices are informational; no dependencies/package settings changed to suppress them.

### Limits / decision

- **NOT EXECUTED / out of local 7C scope:** remote/staging dispatcher or test-recipient allowlist (remote execution is refused), real Resend/SMTP, provider lookup/webhooks/idempotency recovery, real account confirmation-email flow, real network/process-kill/load testing, operational manual resolution UI, Cron scheduling, Settings UI/browser acceptance (7D). Controlled connection disconnect/restart and fixture lease expiry above are not labeled a production process/clock test.
- Quiet-hour cutoff and DST pure-policy cases use explicit `asOf`; production authorization uses DB `clock_timestamp()` after locks. No claim of exhaustive clock-boundary races, inbox delivery, exactly-once external submission or recall. Uncertain attempts intentionally remain held for review rather than guessed successful/failed.
- New-source whitespace checks, harness `node --check` and `git diff --check` **PASS**. **Decision: Step 7C Local PASS** within fake-dispatch protocol scope above. Phase 07 still requires 7D; Phase 08 will revisit real-provider submission/reconciliation and staging destination controls. User handles commit/push.

## Step 7D — Reminder Settings UI & Browser Acceptance

- **Baseline HEAD:** `05aa95e801ab8f62e4fa89e656a16877ac50a22a`, `feature/learning-schedule-foundation`, clean initially. Executed **2026-11-05**, Asia/Bangkok; results include uncommitted 7D changes. No migration/schema/type changes in this step: **87 migrations** remain. No commit/push/deploy or remote DB work.
- Added independent reminder form below the existing Profile/Appearance Settings form, loaded through an independent Suspense boundary and the authenticated preferences action. Read failure renders localized error/Retry, with no fabricated OFF/default editor. Opening Settings does not insert preferences. The existing profile form/action is unchanged.
- Explicit Save snapshots only the seven command fields; toggle changes alone do not save. In-flight guard + disabled fieldset prevent duplicates; success follows confirmed RPC response only. Failures retain draft; **Check latest saved settings** explicitly replaces it with persisted values. Ambiguous save/transport errors advise checking latest before a manual retry; **55P03 → conflictRetryable** is localized, with no automatic retry. Opt-out uses the last valid stored policy and changes consent only, so an invalid unrelated draft cannot block it.
- **UI feature flag `STUDY_REMINDER_SETTINGS_ENABLED` defaults OFF** on the server; controls new UI opt-in independently of dispatcher activation. Existing opt-ins can still be turned OFF. This flag governs UI availability, not authorization or the existing authenticated consent RPC contract. Local browser server sets it true in process only. UI explains delivery is not active and quiet-hours reminders are suppressed, not postponed; no provider/lease/operational fields are exposed.
- Added Task-level control **only when a Task Schedule exists**. Dedicated owner-scoped read action first verifies Task ownership, then reads override + global consent with explicit owner predicates/RLS. Missing override means true independently of global OFF. Labels distinguish “use global preference” from effective sending; global OFF cannot be bypassed. Task controls save separately and retain keyed Task identity/request invalidation. EN/VI catalogs share labels, errors and fixed lead choices; native switches/radios, fieldsets/legends, disabled quiet controls, live status/error and `aria-busy` support keyboard/screen readers. React checklist/source review completed separately from executed tests below.

### Real browser acceptance (local Chromium)

| Case        | Actual result                                                                                                                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NS-01       | **PASS**: new Settings opens OFF, no preference row/jobs; keyboard Space changes draft without saving; existing profile/theme form remains present                                                                                                                                           |
| NS-02/03/10 | **PASS**: explicit consent saved with DB timestamp; reload restores ON; keyboard Enter saves; lead 15→30 replans two future jobs, preserving IDs and moving due by −15 minutes                                                                                                               |
| NS-04/09    | **PASS**: 22:00–07:00 + America/New_York persisted; EN/VI **390×844**, no horizontal overflow, keyboard Check latest works; screenshots visually inspected                                                                                                                                   |
| NS-05       | **PASS**: opt-out persists OFF; both jobs suppressed and trusted current-job check false; enabling Task override while global OFF creates no eligible job                                                                                                                                    |
| NS-06       | **PASS**: Task disable/read-after-reload persists false; only that Task's job suppressed while the other stays pending                                                                                                                                                                       |
| NS-07       | **PASS**: separate B browser shows B's consent/lead; A's rows invisible to B, direct write denied **42501**; B's UI save changes only B                                                                                                                                                      |
| NS-08       | **PASS**: real local SELECT revocation produces visible initial read error/no switches, restored grant + Retry recovers; invalid timezone shows VI validation without saving; real injected **55P03** shows VI conflict, keeps draft, DB remains unchanged; Check latest restores stored OFF |
| NS-11       | **PASS**: actual Server Action response held **after RPC commit**; UI stays busy/no success, Save disabled; two additional `requestSubmit()` events yield **one** action request and no duplicate jobs. Release produces confirmed success                                                   |
| NS-12       | **PASS**: both gates OFF throughout; **0 delivery attempts**, 0 observed email-provider requests, 0 reminder Cron; anonymous Settings redirects to login                                                                                                                                     |

- **Playwright final PASS**, exit 0, **9/9 tests**, **52.3s**, report **2026-11-05T09:37:23Z–09:38:14Z**. Raw results: `phase-07-reminder-settings-browser.json`; screenshots: `evidence/step-7d/reminders-en-mobile.png`, `reminders-vi-mobile.png`. Cases use real browser/Auth/Server Actions/PostgREST/RPC and persisted jobs; no successful action/Auth/DB responses mocked. Fault injection is limited to disposable local fixtures; response barrier delays a real response. No page errors/hydration errors in final suite; existing dashboard chart-size warnings are outside reminder flow and were not treated as new reminder failures.
- Docker Desktop was initially stopped; started in background, then started existing local Supabase without reset. Tests guard local URL/ports, both gates OFF and zero initial users/Tasks/jobs before global permission fault injection. Two uniquely owned fixture users were created; teardown restored SELECT grants, dropped fault trigger/function, signed out/deleted both users and asserted zero remaining owned Tasks/Schedules/Sessions/preferences/overrides/jobs/deliveries. Cleanup **PASS**; both gates false, zero reminder Cron/provider requests.
- Isolated browser server used port **3100**, cache `.next/step-7d`, process-only local Supabase credentials and UI flag. `.env.local` unchanged; temporary Next/TypeScript config backed up/restored after server stopped; `.next/dev` preserved. No remote server, staging email or dispatcher run.

### Commands / quality gates

```powershell
# apps/web; local credentials injected from CLI status, never printed/persisted
node node_modules/vitest/vitest.mjs run features/learning-schedule/components/study-notification-settings.test.tsx --maxWorkers=2 --reporter=dot
node node_modules/@playwright/test/cli.js test tests/study-notification-settings.spec.ts --project=chromium --workers=1 --reporter=line
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
# repository root
supabase test db --local
```

- Targeted component + Server Action tests **48/48 PASS** (12 component + 36 action), **7.80s**; final targeted component rerun **12/12 PASS**, **4.74s**. Includes independent flag OFF/existing opt-out, snapshot/duplicate guard, ambiguous/conflict draft preservation, error Retry, overnight validation, opt-out with invalid draft, VI, missing/disabled Task override, forged owner/Task read denial and keyed stale-response isolation.
- Final lint **PASS**, exit 0, 0 errors / 1 existing Focus `projection` dependency warning. Full Vitest **PASS**, exit 0: **833 passed / 26 skipped**, **80 files passed / 5 skipped**, **197.04s**, started **16:41:02 UTC+07:00** (815 baseline + 18 new tests). Opt-in skips are not claimed as executed acceptance. Final TypeScript `--noEmit --incremental false --pretty false` **PASS**, exit 0.
- Actual Next **16.2.6** production build **PASS**, exit 0: compile **15.2s**, TypeScript **26.7s**, **100/100** pages in **1114ms**. Local Supabase configuration and UI flag false injected into build process only; `.env.local` unchanged. Skipped only prebuild via `--ignore-scripts`; actual `next build` ran, `.next/dev` retained.
- Final `supabase test db --local` **PASS**, exit 0: **29 files / 761 assertions / 0 failures**, **25 wall-clock seconds**. Existing persistent concurrency setup remains a TAP skip; no new concurrency-harness execution is claimed. Final local read: **87 migrations / 0 users / 0 Tasks / 0 preferences / 0 overrides / 0 jobs / 0 deliveries / 0 reminder Cron**, dispatch false, Sweep false, authenticated preferences SELECT restored, fault trigger/function absent. `git diff --check` and explicit new-file whitespace checks **PASS**; no dependencies changed.
- Failures resolved: first browser assertion used generic “Appearance” instead of actual catalog heading “Theme preference”; corrected selector. Initial mobile screenshot injected Playwright caret styles during streamed Suspense hydration; retained strict console checks and used `caret: initial`, then full-page captures to avoid sticky header obscuring section screenshots. Final browser suite clean. Lint found one unused test fixture and a new ref-cleanup warning; resolved the unused argument and replaced cleanup counter with request identity tokens. No SQL implementation failure or real email occurred.

### Limits / decision

- New UI flag OFF behavior is verified by component/source checks; real browser acceptance deliberately enables the UI flag only on local. Browser tests verify semantic labels, native keyboard operation and layout; no external screen-reader audit or accessibility scanner is claimed. Native time-input AM/PM display follows Chromium locale; stored wall-clock values remain 22:00/07:00.
- **NOT EXECUTED / outside 7D:** remote/staging/production UI, real provider/SMTP/webhooks/unsubscribe, active reminder Cron/dispatcher, real verification emails or inbox delivery. Step 7C's after-handoff cancellation/uncertain limitations remain; saving consent does not activate dispatch. No full clean replay or dispatch harness rerun is claimed for this UI-only step.
- **Decision: Step 7D Local PASS** for Settings/Task controls, EN/VI mobile browser acceptance and regression gates above. Phase 07 local checkpoints 7A–7D are complete within their recorded scopes; real email/provider/remote release is not approved by this evidence. User handles commit/push; no production activation.
