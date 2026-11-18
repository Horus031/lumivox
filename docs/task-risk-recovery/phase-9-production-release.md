# Task Risk Recovery — Phase 9 production release audit

## Decision

| Gate | Status | Evidence and next condition |
| --- | --- | --- |
| 9A — Production environment audit | PASS — user-confirmed | The user reported that 9A was completed and met its requirements. This audit relies on that confirmation for environment bindings and credential scopes. |
| 9B — Production database and Native ML preflight | HOLD | Production is at 70 migrations while the release baseline contains 99. The three Task Risk migrations and 26 preceding Learning Schedule migrations are pending. Recovery schema, RPCs, input revision and reconciliation cron are absent. The active Native ML registry and serving artifact match. |
| 9C — Monitoring and release safeguards | LOCAL PASS / HOSTED HOLD | Local remediation now separates Production monitoring and enforces DB → ready Render → pinned-SHA Web. Regression tests passed. The workflow is not published on the default branch; observer configuration, scheduled runs, alert receipt and enforced release approvals remain NOT VERIFIED. |
| 9D — Controlled Production deployment | HOLD | A release plan can be prepared for review. The current evidence does not authorize proceeding with Production promotion or deployment. |
| 9E — Post-deployment verification | HOLD | Requires successful controlled 9D deployment at its approved release SHA. |

## Scope and baseline

Audit performed on 2026-11-18, Asia/Bangkok. Production database queries used explicit project `lslybjylsxtnznghrtyj` and Supabase CLI `--read-only`. The Production project reference was resolved from Vercel's Production-scoped `NEXT_PUBLIC_SUPABASE_URL`. The Supabase connector listed only Staging, and authenticated CLI access supplied the Production read-only observations.

The checked release branch is `feature/task-risk-recovery`, fast-forwarded to `9d5afaeb985b1aa77e6fd1fdfd5e15932bb34409`, merge of PR #143. The fetched default branch `main` is at `a2701edc7ead686c4e1882e380a571dca5007f9a`.

[CI 44255769377](https://github.com/Horus031/lumivox/actions/runs/44255769377) independently reported success for Web, AI API and Supabase replay. [Staging CD 44256103276](https://github.com/Horus031/lumivox/actions/runs/44256103276) independently reported success for the staging deployment job. These results belong to the release baseline.

This deliverable records 9B, the initial 9C audit, and the subsequent local 9C remediation below. Production SQL execution was limited to read-only metadata and aggregate checks. The initial source findings below describe baseline HEAD, before the working-tree changes.

## 9B — Database and model preflight

Production PostgreSQL reported version `17.6`. Snapshot query time was `2026-11-18T07:30:36Z` (14:30 ICT).

| Check | Status | Observation |
| --- | --- | --- |
| Migration history alignment | HOLD | 70 applied migrations, latest `20261022062822`. The repo has 99. Exactly 29 are pending. No migration version exists only in Production. |
| Phase 2 input revision | HOLD | `20261114103622_task_risk_input_revision_and_batch_read.sql` is absent, including `native_task_risk_input_revisions` and its batch snapshot contract. |
| Phase 5 tracking | HOLD | `20261116080605_task_risk_recovery_tracking.sql` is absent. `public.task_risk_recovery_attempts` does not exist. |
| Phase 6 receipts | HOLD | `20261117070814_task_risk_recovery_reliability.sql` is absent. The receipt and reassessment tables do not exist. |
| Recovery RPC permissions | NOT VERIFIED | None of the ten expected public Recovery write, reconciliation, reassessment or cancellation functions exist. Their execute grants cannot be validated before the schema is installed. |
| Existing prediction/model RLS | PASS | Row-level security is enabled on `deadline_risk_predictions` and `ml_model_versions`. |
| Recovery ownership/RLS | NOT VERIFIED | The new table and policy are absent. Existing prediction RLS cannot substitute for this check. |
| Required extensions | PASS | `pg_cron 1.6.4` and `pgcrypto 1.3` are installed. |
| Recovery scheduler | HOLD | No `task-risk-recovery-reconcile` job exists. |
| Active Native ML registry | PASS | One active version `native-task-risk-v2-20260925-021822`, algorithm `logistic_regression_balanced`. |
| Model feature contract | PASS | Registry `feature_schema.feature_schema_version` is `native-task-risk-v2`. Its 27 `feature_names` match the artifact's `feature_columns` in order. Horizon is 14 days and threshold is 0.4. |
| Serving artifact | PASS | Render Production health reports Native ML ready at the same version, algorithm, schema and threshold. The registry artifact path is `ml/artifacts/native-task-risk/logistic_regression_balanced.joblib`. |
| Production persistence and reassessment | NOT VERIFIED | Preflight read existing metadata only. A live Recovery persistence test requires the installed release schema and belongs to post-deployment acceptance. |

Render Production `srv-d87k12rtqb8s73c0ih10`, [health endpoint](https://lumivox-ai-api.onrender.com/api/v1/health), reported `environment=production` and serving revision `fb2d8fe5e84fcc19033eba463976550129a8d99a`. Vercel's ready Production deployment `dpl_H2pCUCY7AH3TC5KAPZmibkCoVA6J` has the same commit and aliases `www.lumivox.it.com` and `lumivox.it.com`. The release candidate under review is `9d5afaeb...`.

### Pending migration set for separate review

The first 26 files introduce the Learning Schedule schema and operations on which the full release depends. The final three introduce Task Risk input revision and Recovery. All existing Production migration versions are present in the repository.

```text
20261027060524_learning_schedule_foundation.sql
20261027063026_learning_schedule_constrains_hardening.sql
20261027075532_learning_schedule_create_rpc.sql
20261027083912_learning_schedule_revise_rpc.sql
20261027085534_learning_schedule_single_reschedule.sql
20261027093221_learning_schedule_cancellation_audit.sql
20261027100125_learning_schedule_dst_canonicalization.sql
20261027101134_learning_schedule_reschedule_idempotency.sql
20261027104448_learning_schedule_task_close.sql
20261031071036_learning_schedule_start_attendance.sql
20261031073306_learning_schedule_complete_attendance.sql
20261031075444_learning_schedule_skip_attendance.sql
20261031082113_learning_schedule_missed_sweep.sql
20261031091300_learning_schedule_late_recovery.sql
20261104051851_learning_schedule_notification_foundation.sql
20261104061414_learning_schedule_notification_lifecycle.sql
20261104090451_learning_schedule_notification_dispatch.sql
20261106061100_learning_schedule_resend_persistence.sql
20261106070838_learning_schedule_unsubscribe_suppression.sql
20261106080118_learning_schedule_controlled_resend_worker.sql
20261106190648_learning_schedule_focus_attribution.sql
20261107062738_learning_schedule_focus_launch.sql
20261107074822_learning_schedule_operational_observability.sql
20261107114955_learning_schedule_resend_rate_limit_retry.sql
20261109094300_harden_learning_schedule_operational_snapshot.sql
20261111071219_learning_schedule_unsubscribe_reconsent.sql
20261114103622_task_risk_input_revision_and_batch_read.sql
20261116080605_task_risk_recovery_tracking.sql
20261117070814_task_risk_recovery_reliability.sql
```

Review this entire pending set at the intended release SHA. The successful clean CI replay does not exercise upgrading an existing populated Production database from its current 70-migration state. Rehearse that upgrade on an isolated representative database and capture grants, trigger compatibility, affected data checks and cron configuration. Record any necessary correction as a forward-only change.

An absent applied-migration record is an expected consequence of the unreleased feature. It still leaves the requested installed-schema gate open. The schema deployment remains the database stage of an approved 9D release. This preflight prepares the exact migration set for that approval.

## 9C — Monitoring and promotion controls (initial remote/source snapshot)

| Check | Status | Observation |
| --- | --- | --- |
| Default branch | PASS | GitHub metadata and the fetched remote both identify `main`. |
| Monitor on default branch | HOLD | `task-risk-recovery-monitor.yml` exists in the release branch and is absent from `origin/main`. |
| Scheduled execution | HOLD | GitHub scheduled-run API returned zero runs. The schedule cannot run from an absent default-branch workflow. |
| Monitor target | HOLD | The supplied monitor is explicitly named Staging, uses environment `staging`, pins project `atbdbbamqjmfkvahqidj`, and requires `TASK_RISK_MONITOR_ENABLED=true`. It does not monitor Production project `lslybjylsxtnznghrtyj`. |
| Monitor credential and recipient | NOT VERIFIED | Effective observer credentials, the activation variable, notification subscription and recipient acknowledgement were not established in this audit. |
| Render Production auto-deploy | PASS | Live service metadata shows `branch=main`, `autoDeploy=no` and `autoDeployTrigger=off`. |
| Vercel repository Git deployment guard | PASS — source | Both fetched `main` and release `apps/web/vercel.json` set `git.deploymentEnabled.main=false` and `product-release=false`. The Vercel connector confirms the linked GitHub repo. |
| Vercel effective project root and independent triggers | NOT VERIFIED | Available project metadata did not expose the effective root directory or all deploy hooks. The source guard must be confirmed to be the configuration Vercel resolves for this project. It governs automatic Git deployments, while approved deploy hooks and direct deployment remain independent paths. |
| GitHub Production CD condition | PASS — source | Job requires `PRODUCTION_CD_ENABLED=true`, successful CI, a push event and branch `main`. The actual variable value is NOT VERIFIED. |
| Release approval enforcement | NOT VERIFIED | The workflow references environment `production`. Required reviewers, prevention of self-review and branch policies were not returned by the available connector. The branch-protection read returned HTTP 403. The rulesets endpoint returned an empty list, which does not establish the state of legacy branch protection. |
| Database → ready AI API → Web sequencing | HOLD | Source applies DB migrations, triggers Render, immediately triggers Vercel, then waits for AI API readiness. It does not wait for Render to serve the expected revision/model before initiating Web deployment. |
| Exact release SHA | PARTIAL | Render hook receives `EXPECTED_SHA`; Vercel hook is called without an explicit SHA. The workflow checks both service revisions afterward. The Vercel hook's branch and commit resolution must be established before using it for a controlled release. |

GitHub schedules run from the default branch and can be delayed. The existing five-minute schedule and GitHub failed-job annotations do not prove that an operator received an alert. Confirm actual monitor runs and recipient acknowledgement as part of 9C. [GitHub scheduling documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

The repository's Git setting is the documented Vercel mechanism for suppressing automatic deployment of selected branches. It must be resolved from the actual project root. [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled)

## Reviewable closure plan

1. **9B schema approval.** Review the 29 pending files above and rehearse the incremental upgrade from the observed Production state on isolated data. Approve a database-first release plan, including checks of the receipt marker triggers, RPC execution grants, RLS, input revision and minute cron. The current active model registry already matches the deployed Native ML artifact.
2. **9C monitoring.** Bring the reviewed monitor to the default branch through the approved workflow-only/release process. Prepare a distinct Production observer target, environment, read-only credential, TLS CA and activation variable. Preserve the independently configured Staging monitor. Verify an actual scheduled run, controlled alert generation in the approved test environment, delivery to the designated operator and an acknowledgement reference.
3. **9C promotion controls.** Confirm the effective Vercel project root and Git guard, all Production deploy hooks and their branch/SHA resolution, Render auto-deploy off, GitHub's current activation variable, and enforced Production environment approvals. Wait for Render's expected revision and model before initiating the Web deployment. Review these changes before the release PR is eligible.
4. **9D eligibility.** Re-evaluate 9A–9C after the above evidence exists. The controlled release may then run the approved migration dry-run and database deployment, followed by ready AI API and Web, using the final tested release SHA. A merge commit can differ from this audit's baseline and must be captured explicitly.
5. **9E eligibility.** Start post-deployment verification only after 9D checks pass. Verify installed schema and cron, service revision/model, ordinary Task/Focus behavior, Recovery receipts, reassessment pairing and historical display. Observe Production backlog, AI and Redis error metrics through the approved acceptance period.

The decision at this audit timestamp is **HOLD for 9D and 9E**. Missing schema and monitoring evidence cannot be inferred from successful staging CI/CD or the user's completed 9A audit.

## 9C — Local remediation and review, 2026-11-18

Baseline HEAD: `9d5afaeb985b1aa77e6fd1fdfd5e15932bb34409`, branch `feature/task-risk-recovery`, worktree `D:/lumivox-task-risk`. Changes remain uncommitted for the user to review, commit and push. No Production migration, deployment, environment secret, branch protection or notification setting was changed.

### Implemented controls

- The monitor retains the Staging target and adds Production project `lslybjylsxtnznghrtyj`. Repository enable variables are independent: `TASK_RISK_MONITOR_ENABLED` for Staging and `TASK_RISK_PRODUCTION_MONITOR_ENABLED` for Production. The default-branch restriction remains in place. Disabled targets explicitly record that no check ran.
- Production monitoring uses environment `production-monitor`; Production deployment continues to use `production`. This avoids requiring a deployment reviewer to approve every five-minute read-only probe. The monitor environment must have appropriate branch restrictions and observer secrets without an interactive deployment approval requirement.
- `scripts/ci/task-risk-monitor.sh` pins direct/pooler connections to the selected project, forces certificate verification, uses a temporary private CA file, sets read-only transactions and removes connection override variables. Healthy, alert and unavailable outcomes retain exits 0, 1 and 2. CA cleanup runs on each tested outcome.
- The user selected notifications to their own GitHub account. A manual `test_alert=true` job deliberately fails without checkout, database access or secrets. It is a transport test only; it does not substitute for cron/backlog fault acceptance. The normal monitor is skipped during this synthetic test.
- Production CD validates Supabase project, known Web/AI origins, the Render service hook, the current `main` SHA, and Vercel access/project binding before database changes. CI must be a successful push from this repository's `main`. Runner is pinned to Ubuntu 24.04.
- CD now executes DB dry-run/apply → Render trigger at tested SHA → wait for expected AI revision and Native ML model → Vercel deploy at tested SHA → Web revision/smoke checks. A failed prerequisite prevents later steps.
- `scripts/ci/production-vercel-release.mjs` replaces the unpinned Web deploy hook with Vercel REST API deployment using `gitSource.sha`, fixed project/team, repository and Production target. Read-only preflight requires effective root `apps/web` and linked Production branch `main`; it runs before migrations and is repeated before the deploy request. The existing Git auto-deployment guards are checked locally.
- The health waiter now requires HTTP 200 in addition to matching revision/status and model. No provider response body or deploy-hook URL is printed by the new release helper.
- CI Web runs the new safeguard regression suite after installing existing Web dependencies. It uses Node's test runner and the existing `js-yaml` dependency to read the actual workflow.

The exact-SHA deployment request follows the [Vercel deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment); the official OpenAPI schema was inspected for the GitHub `ref` and `sha` fields. Actual hosted creation at the intended SHA is **NOT EXECUTED**.

### Executed verification

| Command/check | Actual result | Coverage limit |
| --- | --- | --- |
| `node --test scripts/ci/production-safeguards.test.mjs` | **PASS — 29 tests**, 0 failures, 0 skipped | Mocked providers/commands; no hosted deployment or database operation. |
| Read-only Vercel preflight tests | **PASS** | Checks correct GET target, root/repo/branch rejection, missing token/invalid SHA and HTTP 401. Actual Production API credential remains unverified. |
| Actual workflow shell executed with command stubs | **PASS** | Correct stage order; failures at preflight, dry-run, apply, Render trigger and AI readiness prevent Web deployment. Stale main SHA and wrong DB target stop early. |
| Monitor wrapper tests | **PASS** | Cross-environment rejection, wrong pooler project, status propagation 0/1/2, TLS and CA cleanup. The health SQL itself was not rerun against Production. |
| Actual readiness waiter with mocked HTTP/JSON commands | **PASS** | Expected SHA/model succeeds; HTTP 403 with a healthy-looking body, old SHA and wrong model fail. |
| Synthetic notification job shell | **PASS — expected exit 1** | Confirms a failed job without credentials. No GitHub-hosted notification has been sent or acknowledged. |
| `actionlint 1.7.12 -shellcheck= -pyflakes= .github/workflows/ci.yml .github/workflows/deploy-production.yml .github/workflows/task-risk-recovery-monitor.yml` | **PASS**, exit 0 | Workflow syntax/expressions. ShellCheck/Pyflakes integrations were disabled. Official binary SHA256 verified against release checksums. |
| `bash -n scripts/ci/task-risk-monitor.sh scripts/ci/wait-for-revision.sh` | **PASS** | Shell syntax only. |
| `git diff --check` | **PASS** | Git reported line-ending conversion notices; no whitespace errors in final check. |
| Web lint / Vitest / TypeScript / build / DB replay | **NOT RERUN in 9C** | No application or migration change. Earlier baseline CI evidence above remains associated with its own SHA. |

During implementation, the first test run had 4 harness failures because Windows drive paths were not translated for Git Bash PATH lookup. The fixtures were corrected and the final complete suite passed. The first actionlint checksum read was not decoded as text; execution was stopped, then the checksum file was downloaded as text, matched successfully, and the verified binary ran. These were local tooling failures, not hosted deployment attempts.

### Hosted activation checklist and outstanding evidence

| Setting/evidence | Required scope/value | Current status |
| --- | --- | --- |
| Reviewed workflow published | Default branch `main`, through the user's approved workflow/release PR process | **NOT EXECUTED** — user retains commit/push control. Do not merge the full feature release merely to enable a monitor. |
| Staging enable variable | Repository `TASK_RISK_MONITOR_ENABLED=true` when Staging monitoring is approved | **NOT VERIFIED**. Existing value was not changed. |
| Production enable variable | Repository `TASK_RISK_PRODUCTION_MONITOR_ENABLED=true` when the observer and compatible schema are ready | **NOT VERIFIED**. Remains disabled unless explicitly configured. |
| Production observer target | Environment `production-monitor`: `TASK_RISK_MONITOR_PGHOST`; optional `TASK_RISK_MONITOR_PGPORT` | **NOT VERIFIED**. Direct host `db.lslybjylsxtnznghrtyj.supabase.co`, or project-qualified pooler user. |
| Observer secrets | In each target environment: `TASK_RISK_MONITOR_PGUSER`, `TASK_RISK_MONITOR_PGPASSWORD`, `TASK_RISK_MONITOR_CA_PEM` | **NOT VERIFIED**. Use a purpose-scoped observer and confirm its aggregate visibility across RLS-protected tables, private receipts/reassessments and cron metadata; a zero-row restricted snapshot is not proof of health. No observer role/grants were provisioned. |
| Deterministic Web deployment credential | Environment `production`: `VERCEL_TOKEN` with access to the fixed team/project | **NOT VERIFIED**. The former `VERCEL_DEPLOY_HOOK_URL` is no longer used by Production CD. Missing access stops before migrations. Do not place the token in public Web variables. |
| Production release approval | Environment `production`: required reviewer, appropriate branch rules, self-review policy; audit actual CD enable variable | **NOT VERIFIED**, previous connector permission limitation remains. |
| Effective independent auto-deploy controls | Render automatic deploy remains off; verify Vercel's root/config and independent hooks | Render **PASS at audit time**; Vercel effective settings/hooks **NOT VERIFIED**. New preflight checks root on each approved release but cannot inventory every independent trigger. |
| GitHub notification subscription | User's [notification settings](https://github.com/settings/notifications), Actions Web/email failed-workflow notifications as desired, and watch this repository | **NOT VERIFIED** — browser navigated to GitHub sign-in. The connector does not expose personal notification preferences. |
| Recipient acknowledgement | User initiates `Task Risk Recovery Monitor` → Run workflow on `main` → `test_alert=true`; save run URL, received timestamp and acknowledgement | **NOT EXECUTED**. The synthetic run is expected to be red. Reset to `test_alert=false` for ordinary probes. |
| Scheduled run and actual alert classification/delivery | Capture normal run URL, expected project, aggregate snapshot, approved non-production fault test, recipient receipt and recovery | **NOT EXECUTED**. Existing local Phase 8 cron/overdue-claim tests do not prove GitHub delivery. |

GitHub documents notifications for workflows the account has triggered, including scheduled-run attribution. Watching the repo or adding an `::error::` annotation alone does not guarantee receipt. Verify both the manually initiated synthetic test and a scheduled monitor alert with the actual recipient. See [workflow notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs) and [notification preferences](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).

Production still lacks the Recovery schema identified in 9B. Its aggregate probe cannot be marked healthy before that schema exists; it will report unavailable. Establish the monitor transport/observer and exercise the real query on compatible Staging before the controlled release, then verify the Production query immediately after the approved database stage. Do not apply Production migrations solely to obtain a green monitoring preflight.

### Review decision

**Local 9C implementation: PASS. Hosted 9C gate: HOLD.** The code review and regression suite found no remaining defect in the tested paths. Account-level notification configuration, environment credentials/approvals, default-branch publication, scheduled execution and actual alert acknowledgement remain required operational evidence. **9D and 9E remain HOLD**; this work does not authorize a Production deployment.

