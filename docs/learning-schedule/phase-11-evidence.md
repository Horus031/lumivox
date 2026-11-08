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
| SR-08 | **PARTIAL** | The historical staging preview failure was addressed by renaming `[inbucket]` to `[local_smtp]` and pinning CLI 2.122.0 in all three workflows. The linked staging dry-run exited 0 and listed the expected 10 migrations. The updated GitHub workflows and staging E2E remain unverified. |
| SR-09 | **PARTIAL** | Exact pending migration set, required extensions, current RLS/grants, relation sizes and security advisors reviewed. Post-migration RPC compatibility and lock budget remain open. |
| SR-10 | **PARTIAL** | Prior deploy records found. Deployable compatible staging rollback pair remains unverified. |
| SR-11 | **BLOCKED** | Vercel deployment access established. The deployed Preview returned HTTP 404 on the Learning Schedule health route. Operator authorization, monitoring credential and ownership require confirmation. |
| SR-12 | **COMPLETE** | NO-GO recorded. 11B requires a fresh decision after resolving the open checks. |

Phase 10 OR-12 was normalized in the existing JSON using prior execution evidence. The 94-migration local replay, 983 pgTAP assertions, 1,077 Vitest passes, 9 FastAPI passes and 7 Chromium passes are carried forward from Phase 10. This preflight used read-only Git, connector metadata, database catalog/history queries and HTTP GETs. No staging deployment, database migration, gate change, Cron activation or email send was performed.
