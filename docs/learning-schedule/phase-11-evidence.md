# Phase 11 evidence

## Step 11A — Staging Readiness & Deployment Preflight

**Decision: NO-GO for Step 11B.** Phase 10 remains Local PASS. Inspection on 2026-11-07 used candidate `312cafe3e88189ac9653d929971953f047d17474`. Git remote heads matched local tracking refs. The candidate was 21 ahead and zero behind `product-release`.

- [Staging environment inventory](release/staging-environment-inventory.md)
- [Migration preflight](release/migration-preflight.md)
- [Environment configuration matrix](release/environment-configuration-matrix.md)
- [CI/CD readiness](release/ci-cd-readiness.md)
- [Staging deployment plan](release/staging-deployment-plan.md)

### Supabase staging recheck — 2026-11-08

Reviewed HEAD `8d8d90bd2b5237c4508b56c321fe88301c2dfbec`. The local Supabase link matched the staging web target `atbdbbamqjmfkvahqidj`. The connector returned `Unknown tool`; authenticated Supabase CLI reads of the staging ledger, catalogs and security advisors succeeded. Staging has **84 applied migrations**, ending at `20261031091300`, and **10 pending** out of 94 candidate versions. The Sweep gate is OFF. Dispatch and the operational snapshot have yet to be installed. There were zero matching Study/Sweep/reminder Cron jobs.

| Case | Result | Evidence |
| --- | --- | --- |
| SR-01 | **PARTIAL** | Remote branches and workflow mapping verified. Classic protection and required checks UNKNOWN. |
| SR-02 | **PASS** | Vercel project, Preview alias, branch and deployed SHA confirmed. Authenticated deployment health returned Preview and `fb2d8fe5`. |
| SR-03 | **PARTIAL** | Render confirmed service `srv-daqdto0jo6nc73e3kme0` tracks `product-release` in `Horus031/lumivox`. The staging workflow log names its public API host. The deployed web binding and paired internal credential still require validation. |
| SR-04 | **PASS** | Staging ledger read via linked CLI. 84 applied, 10 pending. Prior production read recorded 70 applied. |
| SR-05 | **PASS** | Staging web and linked CLI identify `atbdbbamqjmfkvahqidj`, distinct from production. The owner confirmed the Render and GitHub Actions bindings. |
| SR-06 | **BLOCKED** | Critical Learning Schedule credential names absent in inspected Vercel Preview scope. GitHub and Render credential settings remain unverified. |
| SR-07 | **PARTIAL** | Staging Sweep OFF and no matching Cron jobs observed. Dispatch is pending installation. Effective real-send setting and post-migration gate verification remain open. |
| SR-08 | **PARTIAL** | PR #119 into `product-release` passed Web, AI API and Supabase Migration Replay on `4b1518f`. The linked staging dry-run separately listed the expected 10 migrations. Staging deployment and E2E remain unverified for this candidate. [CI run](https://github.com/Horus031/lumivox/actions/runs/42492312536) |
| SR-09 | **PARTIAL** | Exact pending migration set, required extensions, current RLS/grants, relation sizes and security advisors reviewed. Post-migration RPC compatibility and lock budget remain open. |
| SR-10 | **PARTIAL** | Prior deploy records found. Deployable compatible staging rollback pair remains unverified. |
| SR-11 | **BLOCKED** | Vercel deployment access established. The deployed Preview returned HTTP 404 on the Learning Schedule health route. Operator authorization, monitoring credential and ownership require confirmation. |
| SR-12 | **COMPLETE** | NO-GO recorded. The owner confirmed `STAGING_CD_ENABLED=true`. PR #119 has merged, and its first staging run stopped before migration apply. The default-branch hotfix passed main CI. A fresh `product-release` push can trigger staging deployment and migration apply, so it remains subject to 11B approval. |

Phase 10 OR-12 was normalized in the existing JSON using prior execution evidence. The 94-migration local replay, 983 pgTAP assertions, 1,077 Vitest passes, 9 FastAPI passes and 7 Chromium passes are carried forward from Phase 10. This preflight used read-only Git, connector metadata, database catalog/history queries and HTTP GETs. No staging deployment, database migration, gate change, Cron activation or email send was performed.

## Step 11C.4D — Re-consent & Reminder Lifecycle

**Staging PASS, carried forward from the operator's 2026-11-11 verification.** The Settings UI enabled email reminders again and recorded `consented_at = 2026-11-11 07:00:23 UTC`. The November 16 job moved from `suppressed` to `pending` with the same ID and zero attempts. The expired job stayed `expired` and the sent job stayed `sent`.

Replaying the already-used unsubscribe token returned HTTP 200 and left consent enabled and `updated_at` unchanged. Dispatch and Missed Sweep gates were OFF. The operator observed one delivery, two webhook receipts, and one token that was already used. There were zero revoked tokens and zero unused, valid tokens.

## Step 11C.4E — Unused Token After Re-consent

**Local PASS.**

- Baseline `1aedc8e27f6fe2d3198bdd9eb81778af6e2e5bfe`. Supabase CLI 3.1.0 generated `20261111071219_learning_schedule_unsubscribe_reconsent.sql`.
- Baseline regression reproduced the bug. Four of nine assertions failed. The unused token opted out the new consent, changed the preference, suppressed the restored job, and was marked used.
- The preference trigger now revokes the owner's unused tokens in the same transaction as re-consent and job reconciliation. Token consumption uses the same per-owner lock and compares token creation time to the latest consent to reject and revoke historical stale tokens. This also covers re-consent completed before migration installation. Historical tokens are checked on use.
- Regression coverage in `learning_schedule_unsubscribe_reconsent.sql` uses the Settings RPC and real job lifecycle trigger. It checks owner isolation, the same pending job with zero attempts, historical tokens, an already-enabled preference save, a current token, and harmless replay of an already-used token.
- A fresh Supabase local stack replayed 96 migrations with seeding disabled. `supabase test db --local` passed 1,001 assertions across 36 files, including all 18 new assertions. One fixture-only file was skipped by design. The security advisor reported only the existing mutable search path warning for `public.set_updated_at`.
- `node scripts/test-learning-schedule-unsubscribe-concurrency.mjs --reconsent` passed 30 executions with 27 observed blockers and three prompt `SKIP LOCKED` returns. In all six new runs, `pg_blocking_pids()` identified the first transaction and the waiting RPC completed with SQLSTATE `00000`. When re-consent committed first, the old token returned false and was revoked without being marked used. In reverse order, the token was used before re-consent. Both orders ended with consent enabled and zero deliveries for the fixture. Cleanup verified zero fixture rows, Dispatch and Missed Sweep OFF, and zero reminder Cron jobs.
- Web gates passed. `npm run lint` reported one existing React hook warning in `use-focus-v2-audio.ts`. `npm run test:unit` reported 1,077 passed and 26 skipped. `npm --ignore-scripts run build`, including Next.js's TypeScript check, passed on retry with write access to `.next` after the first run failed on `.next/trace-build`.
- Scope is local database and automated tests. Staging deployment and HTTP replay with an unused token are **NOT EXECUTED**. No provider requests or new emails were made. Step 11C.5 remains pending. Gmail Spam remains tracked as technical debt.

## Step 11C.5A — Provider Timeout & Uncertain Outcome

**Local PASS.**

Baseline `e12d55585bdf7a81d35a7da3ba3ffda2e270c4df` on `phase11c5/provider-uncertain-validation`, matching the local and tracking refs for `product-release`. A read-only check of Supabase Staging on 2026-11-12 found migration `20261111071219` installed, Dispatch and Missed Sweep OFF, zero deliveries, and zero webhook receipts. The earlier 11C.4D counts are historical. The reason for the difference in counts and the latest PR CI result were not independently verified in this step.

| Case | Expected | Observed |
| --- | --- | --- |
| T01 · SDK timeout | `uncertain / transport_error` | Provider deadline and controlled `TimeoutError` covered. Dispatcher recorded uncertainty against the handoff. One SDK call. |
| T02 · Connection reset | `uncertain / transport_error` | Injected `ECONNRESET` returned the expected classification at both layers. Dispatcher recorded uncertainty. One SDK call. |
| T03 · HTTP 503 | `uncertain / provider_unavailable` | Adapter classified the mocked 503 as uncertain. Dispatcher recorded uncertainty. One SDK call. |
| T04 · Missing message ID | `uncertain / invalid_provider_response` | Dispatcher recorded uncertainty. Provider tests also verified malformed response variants. One SDK call per fixture. |
| T05 · Accepted, then record fails | Preserve handoff and avoid resend | Dispatcher reported one held item. The mocked store retained the same submitting delivery and payload snapshot. One SDK call and one failed outcome write. |

In T01–T05, authorization preceded submission. The dispatcher ran again with the same claim in each test. The stateful mock denied a second handoff and the SDK call count stayed at one. The existing deferred-authorization test also verified that submission waits for authorization to resolve. Both Resend suites passed all 85 tests. Fault injection used mocks on the local machine and sent zero real provider requests. This checkpoint needed no migration or runtime code change.

- `supabase test db --local` passed 1,001 pgTAP assertions across 36 files on the isolated stack, including the controlled Resend worker SQL suite. The existing worker harness passed 23 executions with nine observed lock blockers using the real worker, local Supabase, and injected SDK. Its timeout case recorded an `uncertain` delivery and a `failed` job, then returned no claim for that job. Cleanup verified zero fixture rows, both local gates OFF, and zero reminder Cron jobs.
- The first Vitest invocation hit Windows module resolution errors and collected duplicate tests from a prior Playwright scratch copy in `.next`. The rerun with local filesystem access and `npm run test:unit -- --exclude '**/.next/**' --reporter=dot` passed 1,083 tests with 26 skipped across 99 source suites.
- `npm run lint` passed with the existing React hook warning in `use-focus-v2-audio.ts`. `npm --ignore-scripts run build` passed with the Next.js TypeScript check. The build skipped the prebuild script to preserve the running dev server's artifacts.

11C.5B–11C.5E remain pending, including database lease expiry and crash recovery after the T05 failure. Gmail Spam and Staging one-click unsubscribe ingress remain open.

## Step 11C.5B — Rate Limit & Durable Retry

**Local PASS.**

Baseline `6485974857aa80bfd17de4cda0ec3d0238155e3c` on `phase11c5/rate-limit-retry-validation`, matching the local and tracking refs for `product-release` after PR #127 merged 11C.5A. The operator verified the Staging alias on READY deployment `dpl_WdMof1Abv7jUchxGPmsTkty4eJk4` at that SHA. A fresh read-only Supabase Staging query found Dispatch and Missed Sweep OFF, zero deliveries, zero webhook receipts, and token migration `20261111071219` installed.

| Case | Expected | Observed |
| --- | --- | --- |
| RL-01 | Confirmed HTTP 429 rejection records a 30-second backoff | The adapter and dispatcher routed `rate_limit_exceeded` to `ls_notification_record_resend_rate_limit`. PostgreSQL recorded a failed delivery with `error_code=rate_limited`, no provider message ID or acceptance timestamp, and a pending job with both lease fields cleared. The retry timestamp fell within the measured 30-second window and replay preserved it. |
| RL-02 | A due reminder cannot be claimed before `next_attempt_at` | The claim RPC returned no lease for the fixture during backoff. |
| RL-03 | The due retry can claim again and increment the attempt | Moving the fixture retry timestamp into the past let the real claim RPC issue a fresh lease and increment the attempt to 2. The original due time, idempotency key, ciphertext and payload fingerprint were retained. Replaying the first 429 left the new lease intact, and repeating authorization on the new lease yielded `handoff_already_started`. |
| RL-04 | Three attempts exhaust the budget | The second rejection scheduled backoff. The third returned the same job to `failed` with both lease fields cleared and exactly three failed delivery rows. Reconciliation left it terminal and the claim RPC returned no further lease. |
| RL-05 | A backoff crossing session start expires the job | With fewer than 30 seconds until the session, the rejection moved the job to `expired`. Reconciliation preserved that state and no further claim was granted. |
| RL-06 | Quota 429, concurrent 409, and 503 bypass the short retry | Both quota variants used the generic rejected outcome RPC. The 409 and 503 used the generic uncertain outcome RPC. PostgreSQL kept the rejected and uncertain fixtures terminal after reconciliation, and converting either to a short retry returned `PT409`. |

The dispatcher tests exercised the real provider adapter and store RPC routing with mocked SDK and database clients. Each of the five provider fixtures made exactly one mock SDK call and one outcome RPC call. The SQL tests used fixture timestamps and the real PostgreSQL claim and reconciliation functions. These checks cover replay and the per-lease duplicate fence. The dedicated multi-connection race scenarios remain pending under 11C.5D.

- The two Resend suites passed 90 tests. The full `npm run test:unit -- --exclude '**/.next/**' --reporter=dot` run passed 1,088 tests with 26 skipped. The exclusion omits the prior Playwright scratch copy.
- `supabase test db --local` passed 1,015 assertions across 36 files on the isolated stack, with 14 added assertions in the controlled worker SQL suite. After rollback, the stack had zero Auth fixtures, jobs, and deliveries, and both gates were OFF.
- `npm run lint` passed with the existing React hook warning in `use-focus-v2-audio.ts`. `npm --ignore-scripts run build` passed, including the Next.js TypeScript check.

The existing SQL suite changes the local Dispatch gate only inside its rollback transaction. The standalone worker harness was skipped in this checkpoint because it commits a temporary Dispatch gate change. Fault injection used local mocks and made zero real Resend requests. No production TypeScript or migration change was needed. 11C.5C–11C.5E and 11C.6 remain pending. Gmail Spam and Staging one-click unsubscribe ingress remain open.

## Step 11C.5C — Lease Expiry & Crash Recovery

**Local PASS.** Baseline `12a1e9d1affe76bef8082a07ff9f7dd204f85521` on `phase11c5/crash-recovery-validation`, matching fetched `origin/product-release` after PR #128. The operator reported Vercel Staging READY (`dpl_DAv2twcPBoS8ArZ1v3BwR7bGx2F3`) and Render Staging LIVE (`dep-dbqn2mafngtc738466o0`) at that SHA. GitHub Actions job results and the Production database ledger remain unverified. A read-only Staging query confirmed migration `20261111071219` installed, Dispatch and Missed Sweep OFF, zero deliveries, and zero webhook receipts.

| Case | Before recovery | After recovery and next worker | Mock SDK calls before → total |
| --- | --- | --- | --- |
| CR-01 | Job `leased`, attempt 1, zero deliveries | Reconciled to `pending` at attempt 1. Next worker got a fresh lease, submitted once, and finished `sent` at attempt 2 with one accepted delivery. | 0 → 1 |
| CR-02 | Job `leased`, committed `submitting` delivery, SDK never entered | Same delivery became `uncertain` with `lease_expired_after_handoff`. Job became `failed`; no further claim. | 0 → 0 |
| CR-03 | SDK accepted. Outcome RPC executed inside a separate transaction, then injected SQLSTATE `22012` forced rollback. Observer saw `leased/submitting` with no provider message ID. | Same delivery became `uncertain` with `lease_expired_after_handoff`. Job became `failed`; no further claim. | 1 → 1 |
| CR-04 | Job `leased`, delivery injected as `uncertain` with `transport_error` | Job became `failed`. Delivery ID, status and error code were preserved; no further claim. | 0 → 0 |
| CR-05 | Each fixture had one expired lease to reconcile | First reconciliation returned 1 and cleared both lease fields without changing attempts or delivery count. Second reconciliation returned 0 and preserved each observed snapshot. | No added calls |
| CR-06 | Fresh worker after CR-02, CR-03 and CR-04 | Claim RPC returned zero claims in each case. Job and delivery snapshots stayed unchanged. | No added calls |
| Consent safety | Token consumed after claim and before handoff; consent OFF and cancellation requested | Job became `suppressed`, consent stayed OFF and the next worker got no claim. | 0 → 0 |

- `supabase test db --local` passed 1,015 assertions across 36 files on the fresh isolated stack. `node --check scripts/test-learning-schedule-resend-worker.mjs` passed.
- `node scripts/test-learning-schedule-resend-worker.mjs --crash-recovery` passed 28 executions. This includes 23 existing worker checks with nine observed blockers and five new recovery fixtures covering CR-01–CR-06 plus consent safety. The recovery mode uses `LUMIVOX_RESEND_TEST_WORKDIR` for a disposable Supabase project named `lumivox-11c5c`, with API port 56321 and database port 56322. Set `SUPABASE_CLI_PATH` if using a different CLI location.
- The harness committed fixture handoffs on local Supabase before expiry and ran the production dispatcher and store with an injected Resend SDK. Cleanup verified zero fixture users, tasks, jobs, deliveries, payloads, tokens, identities and suppressions. Local Dispatch and Missed Sweep were OFF, and there were zero reminder Cron jobs. No real provider requests were made. Staging access was read-only.
- Changes are limited to the Node harness and evidence. Web Vitest, lint, and build were not rerun for this harness-only change. The dedicated 11C.5D concurrency scenarios, 11C.5E safety evidence and 11C.6 production readiness remain pending.

## Step 11C.5D — Duplicate Dispatch & Multi-Worker Concurrency

**Local PASS.** Baseline `ddf415f610894e43f8c43e7effcc221d85f8b6d3` on `phase11c5/multiworker-concurrency-validation` matched `origin/product-release` after PR #129. The supplied verification reports Vercel Staging READY (`dpl_AzyhznjAnauzvELk3SbZEdUhZVgL`) and Render Staging LIVE (`dep-dbrc4fk9v7es73c5inog`) at that SHA. Individual GitHub Actions jobs remain unverified. A read-only Staging query on November 13, 2026 confirmed Dispatch and Missed Sweep OFF, zero deliveries and zero webhook receipts.

| Case | Observed outcome per execution | Leases / attempts / deliveries / mock SDK calls |
| --- | --- | --- |
| CC-01 · Claim vs claim | B returned no claim while A held its uncommitted lease. A alone dispatched. Final `sent/accepted`. | 1 / 1 / 1 / 1 |
| CC-02 · Authorize same lease | B waited for A, then returned `handoff_already_started`. The winning handoff submitted once. Final `sent/accepted`. | 1 / 1 / 1 / 1 |
| CC-03 · Submission vs reconcile | Active lease reconciled 0. With an expired lease and the SDK paused, reconcile processed 1, changed delivery to `uncertain` and granted no claim. The existing SDK call later recorded `accepted`. In reverse order, reconciliation skipped the in-flight outcome transaction and processed 0 after commit. Final `sent/accepted` in all three variants. | 1 / 1 / 1 / 1 |
| CC-04 · 429 record vs claim, then two retry claims | Claim returned empty during outcome recording and during backoff. When the fixture retry became due, only one retry lease was issued. The retry reused the same idempotency key and payload fingerprint. First delivery failed with `rate_limited`; the retry finished `sent/accepted`. | 2 / 2 / 2 / 2, one SDK call per authorized attempt |
| CC-05 · Unsubscribe vs authorize | Unsubscribe first denied handoff and recovery left the job `suppressed`. Authorize first permitted the committed handoff to finish `sent/accepted`. Both ended with consent OFF, cancellation requested and no additional claim. | Unsubscribe first 1 / 1 / 0 / 0. Authorize first 1 / 1 / 1 / 1. |
| CC-06 · Conflicting outcome records | Tested accepted-first and rejected-first. The first outcome persisted. The competing record returned SQLSTATE `22023` (`Outcome replay mismatch`). Exact replay preserved the snapshot. This case injected outcome records after authorization. | 1 / 1 / 1 / 0 in both orders |
| CC-07 · Reconcile vs unsubscribe | Unsubscribe first made the busy owner skip, then reconciliation suppressed the job. Reconcile first let unsubscribe wait and suppress the recovered job after commit. Both ended `suppressed`, with consent OFF and no new claim. | 1 / 1 / 0 / 0 in both orders |
| CC-08 · Independent owners | A held owner A's advisory lock while worker B claimed and dispatched owner B's job to `sent/accepted`. Owner A's job stayed `pending` with zero attempts and deliveries. | Owner B 1 / 1 / 1 / 1. Owner A 0 / 0 / 0 / 0. |

- The existing worker harness ran 13 contention variants three times each using independent PostgreSQL connections and the actual dispatcher, store and injected SDK. All 39 new runs passed. `pg_blocking_pids()` identified the expected blocker in 18 runs. The measured waiting operations took 30–53 ms including barrier and commit overhead. Prompt skip and claim observations took 1–5 ms. Six competing outcome writes returned the expected `22023`; all other exercised paths succeeded. No unexpected deadlock or timeout occurred.
- The full harness passed 62 executions including 23 existing worker checks. The CC cases made 27 mock SDK calls, zero duplicate submissions for the same authorization, and zero real provider requests. The existing unsubscribe harness was reviewed for coverage. Both CC-05 and CC-07 orders ran in the worker harness with the actual database functions.
- The disposable stack replayed 96 migrations. `supabase test db --local` passed 1,015 assertions across 36 files. `node --check scripts/test-learning-schedule-resend-worker.mjs` and `git diff --check` passed. Web lint, Vitest and build were not rerun for this harness-only change.
- Reproduce with `node scripts/test-learning-schedule-resend-worker.mjs --multiworker`. Set `LUMIVOX_RESEND_TEST_WORKDIR` to the disposable stack configured as `lumivox-11c5d` with local API port 56321 and DB port 56322, and `SUPABASE_CLI_PATH` to the local CLI executable if needed. The harness checked the project, endpoints, empty Auth fixtures, gates OFF and no reminder Cron before enabling fixture dispatch locally. Cleanup verified zero fixture users, tasks, jobs, deliveries, payloads, tokens, identities and suppressions, both gates OFF and zero reminder Cron jobs.
- 11C.5E and 11C.6 remain pending. Public one-click unsubscribe ingress and Gmail deliverability remain open.

## Step 11C.5E — Safety Evidence & Release Gate

**Audit CONDITIONAL. Production email activation NO-GO.** Candidate `39177f576f87b0ef8210817f3fdb4ef3c85e153d` after PR #130. On November 13, 2026, GitHub API results and job logs confirmed CI and Deploy Staging success for this candidate, including both revision checks and Playwright (56 passed, 47 skipped). Direct provider metadata confirmed Vercel READY and Render LIVE at that SHA.

Read-only Supabase checks found both Staging gates OFF, zero reminder Cron jobs, zero deliveries and receipts, and exact parity across 96 migration versions. Vercel Preview configuration returned real-send `false`; direct runtime evidence remains open. The preceding paired rollback artifacts and source compatibility were verified. Live rollback, named operator access and authenticated monitor delivery remain unverified. Public one-click unsubscribe and Gmail deliverability remain open for 11C.6.

- [SE-01–02 · Safety evidence matrix and CI/CD links](release/phase-11c5-safety-evidence-matrix.md)
- [SE-03–06 · Operational readiness](release/phase-11c5-operational-readiness.md)
- [SE-07–08 · Release decision and blockers](release/phase-11c5-release-decision.md)
