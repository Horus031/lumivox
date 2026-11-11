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
