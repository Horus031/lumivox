# Task Risk Recovery — Phase 9 production release audit

## Decision

| Gate | Status | Evidence and next condition |
| --- | --- | --- |
| 9A — Production environment audit | PASS — user-confirmed | The user reported that 9A was completed and met its requirements. This audit relies on that confirmation for environment bindings and credential scopes. |
| 9B — Production database and Native ML preflight | LOCAL UPGRADE PASS / RELEASE REVIEW PENDING | An isolated populated database was incrementally upgraded from 70 to 99 migrations; 38 table snapshots / 27 rows were preserved and 1,087 pgTAP assertions passed. The last Production read-only snapshot still defines the pending 29-file release set; actual installation belongs to approved 9D. Native ML registry/artifact matched in the original audit. |
| 9C — Monitoring and release safeguards | TECHNICAL CHECKS PASS / FEATURE PR PENDING | Default-branch observer monitoring, actual password/TLS probe, synthetic GitHub delivery and two scheduled probes PASS. Protected Production preflight ran with the real Vercel token and validated project/root/repository/main binding. Hardened release workflow changes still require the feature PR and full CI before a controlled release. |
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


## Ordered follow-up after review of 855d4b68 — 2026-11-18

Checked HEAD: `855d4b68b2535acee9c8077da565fc6fb9713ff9`, branch `feature/task-risk-recovery`. The earlier baseline findings remain historical. New evidence/reproduction files are uncommitted for the user's review and push. No Production database mutation or deployment was performed. One GitHub Production environment protection rule was changed following the user's explicit reviewer selection.

### 1. Populated incremental upgrade — LOCAL PASS

| Check | Actual result |
| --- | --- |
| Isolation | Fresh project/container `lumivox-risk9-upgrade`, DB port **64322**, seed disabled. Existing `lumivox-proj` on 55322 was not reset. |
| Tool/server | Supabase CLI **2.122.0**, matching CI; PostgreSQL **17.11**. |
| Baseline | Only the first **70** migrations copied/applied. Last version `20261022062822`. |
| Committed synthetic data | Two owners; one Goal; eight Tasks covering all six statuses, a subtask and second-owner Task; Legacy and V2 Focus; distraction history; active model metadata and an existing prediction. |
| Snapshot before upgrade | **38 public tables**, **27 rows**, **11 nonempty tables**. Original-column projections and deterministic JSON ordering preserve an exact comparison despite added columns. |
| Incremental upgrade | Copied the remaining 29 files; **29 applied successfully, total 99**. No reset between committed fixture creation and upgrade. |
| Data preservation | All **38 table snapshots / 27 original rows** matched exactly on original columns. |
| RLS | Seven expected new public tables have RLS enabled. Authenticated owner B could read its own Task and could not read owner A's Tasks. |
| Triggers | Four revision/receipt triggers enabled. Updating an old Task bumped its input revision. Probe mutations rolled back. |
| RPC grants | Seven expected worker overloads deny anon/authenticated and allow service_role. |
| Scheduler | Recovery cron active at `* * * * *`; nine successful runs observed during the subsequent local inspection. |
| Cleanup | Removed the two fixture owners and model; cascades completed, remaining fixture users zero. |
| Complete pgTAP suite on upgraded database | **PASS: 39 files, 1,087 assertions, zero failures**, 15-second reported test wall time. Includes security, receipt rollback and reassessment coverage. |

Executed commands used workspace `C:/Users/Dell/AppData/Local/Temp/lumivox-risk9-upgrade`:

```text
npx --yes supabase@2.122.0 db start --workdir <rehearsal>
docker exec -i supabase_db_lumivox-risk9-upgrade psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
  [set app.rehearsal_target='lumivox-risk9-upgrade'; then fixture SQL]
npx --yes supabase@2.122.0 migration up --local --workdir <rehearsal>
docker exec -i supabase_db_lumivox-risk9-upgrade psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
  [same marker; then verification SQL]
npx --yes supabase@2.122.0 test db --local --workdir <rehearsal>
```

Reproduction artifacts: `scripts/task-risk-production-upgrade-fixture.sql` and `scripts/task-risk-production-upgrade-verify.sql`. Both require the named marker and a Unix-socket connection. They are outside migrations and the ordinary pgTAP directory. The fixture commits before the upgrade; the verifier compares old data before rolling back mutation probes. Committed fixtures were cleaned before running the full transactional suite.

Raw test log: `C:/Users/Dell/AppData/Local/Temp/lumivox-risk9-upgrade/upgrade-pgtap.log`. Synthetic baseline snapshots were exported alongside it to `baseline-snapshots.json`. Cleanup via `npx --yes supabase@2.122.0 stop --no-backup --workdir <rehearsal>` succeeded with project filter `lumivox-risk9-upgrade`; the original local stack remained running.

The first start on 58322 failed because Windows reserves 58313–58412; no migration or fixture ran on that attempt. After inspecting exclusion ranges, unused 64322 worked. The separate cached CLI 3.1.0 was not used for the rehearsal.

Limits: synthetic representative shapes, not a Production clone or production-scale load benchmark. Local PostgreSQL 17.11 differs from the earlier Production 17.6 snapshot. No customer data was copied. Final migration-set approval, backup/forward-fix planning and installed-schema checks remain part of controlled 9D/9E.

### 2. Hosted monitoring and notification — PARTIAL / HOLD

Authenticated GitHub UI inspection as `Horus031` established:

- Actions notifications are already enabled for **GitHub and email, failed workflows only**. No personal notification setting was changed.
- Repository subscription is Participating/@mentions; it was not broadened to All Activity. Actual scheduled/synthetic delivery remains untested.
- Default branch remains `main` at `a2701edc7ead686c4e1882e380a571dca5007f9a`; monitor publication is pending.
- Neither monitor enable variable exists at repository scope. No observer secrets exist in repository/Staging environment metadata. Only deployment/E2E credentials are present; encrypted values were not read.
- Environment `production-monitor` does not exist. No observer role/password or hosted grant was created.
- Hosted scheduled run, synthetic alert and recipient acknowledgement: **NOT EXECUTED**.

Prepared `docs/task-risk-recovery/phase-9-monitor-bootstrap.patch` and `phase-9-monitor-bootstrap.md`. The patch contains exactly four monitor files from checked HEAD against main, with no migration, application change, deploy workflow, secret or activation variable. Reverse-application check against the source passed. The guide gives main-based worktree/application commands for the user's review, commit, push and PR process.

The monitor must reach main independently before the full feature release. Do not merge the full release merely to obtain a schedule.

Local cron inspection confirmed that `cron.job` and `cron.job_run_details` belong to `supabase_admin` and use RLS `username = current_user`. SELECT grants alone do not prove a new observer sees postgres-owned cron jobs. Validate its aggregate snapshot against an administrative read-only snapshot, with known cron/backlog data, and test denied writes/worker execution before enabling it. No hosted observer acceptance is claimed.

### 3. Production promotion controls — VERIFIED PARTS / CREDENTIAL GAP

| Check | Actual result |
| --- | --- |
| Repository release flag | **PASS: PRODUCTION_CD_ENABLED=false**, unchanged. Staging flag remains true. |
| Production environment branches | **PASS: main only**, one allowed branch and zero tags. |
| Required reviewer | User explicitly selected **Horus031**. Enabled, saved and verified after page reload. |
| Administrator bypass | **Disabled**, saved and verified. |
| Prevent self-review | **Off**, matching the user-selected owner manual approval model. This is **not independent review**. |
| UI result | GitHub displayed `Environment "Production" updated.`; reload retained reviewer and policy. This did not trigger deployment. |
| Main branch protection | **Not protected**, confirmed by branch metadata and repository banner. No policy was silently added. |
| Environment Web/AI URLs | Match approved Production origins. |
| Vercel API credential | **Missing**: no VERCEL_TOKEN in repository or Production secret metadata; only old deploy hook present. No secret value read. |
| Committed helper with real credential | **NOT EXECUTED**. Owner must securely supply the API credential in the intended environment/runner; slim connector metadata is not equivalent to that preflight. |

### 4. Feature PR validation — DEFERRED

The requested ordering cannot advance to a completed hosted 9C or final feature PR validation while monitor publication/observer setup and real Vercel preflight remain open. The user retains commit/push control over the new evidence. No premature PR into product-release was created, and no CI result is claimed for unpushed changes.

Next: publish the reviewed monitor-only patch on main, securely configure observer credentials and VERCEL_TOKEN, run/acknowledge synthetic and scheduled checks, then commit/push the evidence and create the feature PR into product-release for full CI on its exact head SHA.

**Decision:** populated local upgrade **PASS**; owner manual approval configuration **PASS**; hosted monitor and credential-dependent preflight **HOLD**; **9D/9E remain HOLD**.


## Monitor bootstrap merged and GitHub alert delivered — 2026-11-18

| Check | Actual evidence |
| --- | --- |
| Bootstrap PR | [PR #144](https://github.com/Horus031/lumivox/pull/144), merged into main. |
| Main merge SHA | `548982f41303fc309a4a08aee82f43cc8676296a`. |
| CI on merge SHA | [CI 44337348127](https://github.com/Horus031/lumivox/actions/runs/44337348127): **SUCCESS**. This validates the monitor-only main commit, not the complete unmerged Recovery feature. |
| Production CD | [Run 44337733940](https://github.com/Horus031/lumivox/actions/runs/44337733940): **SKIPPED**. |
| Staging CD | Run 44337734105: **SKIPPED**. |
| Monitor source on main | Confirmed published, with independent environment flags and manual test_alert input. The prior publication blocker is closed. |
| Hosted synthetic test | [Run 44338014449](https://github.com/Horus031/lumivox/actions/runs/44338014449), manually triggered as Horus031 on the merge SHA at **2026-11-18 15:38:41 UTC / 22:38:41 ICT**, test_alert=true. |
| Expected controlled failure | Synthetic notification job failed at `Emit controlled failure`; set-up/complete steps succeeded. The normal database monitor job was **SKIPPED**. This is the intended test result, not an operational database incident. |
| GitHub notification delivery | **PASS — observed in the authenticated Horus031 notification inbox**, titled `Task Risk Recovery Monitor #1 ... workflow run failed for main branch`, linking to that exact run, displayed at **22:39 ICT**. |
| Human acknowledgement / email | Human acknowledgement remains unrecorded. Email inbox was not inspected; no email delivery claim is made. |
| Release flag | Rechecked in GitHub UI: `PRODUCTION_CD_ENABLED=false`, unchanged. |
| Monitor activation | Rechecked: neither Task Risk monitor repository enable variable is configured. Real health probing remains disabled. |
| Credentials | Rechecked repository/environment secret names: no observer secrets and no VERCEL_TOKEN. Existing encrypted values were not opened. |

No database access, deployment, workflow-file edit or activation-variable change was performed by the synthetic test. Hosted notification transport to the GitHub account is now established; this does not prove the SQL probe works with a dedicated observer or that scheduled fault alerts are delivered.

Next: provision/validate a correctly scoped Staging observer, configure its host/port and three monitor secrets in the staging environment, then set repository TASK_RISK_MONITOR_ENABLED=true and execute normal/manual plus scheduled health checks. Configure a Production VERCEL_TOKEN securely and run the committed read-only preflight with that credential. Keep Production CD off and do not enable the Production monitor against an absent Recovery schema.

9C status: **publication PASS; synthetic GitHub delivery PASS; actual observer/scheduled health checks HOLD; credential-dependent Vercel preflight HOLD**. 9D/9E remain HOLD.


## Scoped observer setup prepared — 2026-11-18

User requested concrete connection values, secret-generation commands and observer/Vercel-token setup instructions. Prepared Vietnamese guide `phase-9-observer-setup.md`, operational SQL `scripts/setup-task-risk-observer.sql` and local-only test `scripts/test-task-risk-observer.sql`.

The previous direct-table monitor query cannot by itself establish a scoped observer's RLS/cron visibility. Prepared a correction: query one owner-context aggregate view in a private schema. The observer has LOGIN, no password initially, no superuser/BYPASSRLS/createdb/createrole, no privileged membership, and only explicit SELECT on that view. Default transactions are read-only. Existing owner postgres can SET the role for permission acceptance. Browser roles cannot access the schema.

`phase-9-observer-bootstrap.patch` contains two files only: setup SQL (not automatically executed) and updated monitor query. Application code/migrations/deploy workflows are absent. Apply-check against the bootstrap worktree passed. This patch still requires reviewed publication on main before enabling the monitor; the earlier merged monitor continues to use the original query until then.

Local isolated project `lumivox-risk9-upgrade` was recreated with 99 migrations and seed disabled. Results:
- Setup SQL executed successfully.
- **13 observer assertions PASS**: owner-equivalent aggregate, cron visibility, protected overdue backlog/alert, role flags/membership, worker denial, three raw-read denials, two write denials and browser isolation. Synthetic fixtures rolled back.
- Actual TCP login as observer with an ephemeral local password succeeded; `default_transaction_read_only=on`.
- Actual Node health probe using observer returned `alerts=[]`, active cron with recent success and zero backlog.
- **29 safeguard regression tests PASS**.
- Existing fault script PASS: cron inactive, simulated cron failure, overdue claim stays fenced, fixture cleanup and cron restore.
- The initial SET ROLE test failed because PostgreSQL 17 requires SET membership; setup was corrected to grant the existing owner that permission. Retest passed. The observer was not made a member of postgres.
- Final diff check PASS.

Exact pooler metadata was read without outputting credentials from the workspace linked to project `atbdbbamqjmfkvahqidj`: host `aws-0-ap-south-1.pooler.supabase.com`, port `5432`. Custom observer pooler username is `task_risk_observer.atbdbbamqjmfkvahqidj`. The guide asks the owner to confirm current Session pooler details in Connect.

Only the password is randomly generated. Username is fixed by role/project and CA_PEM must contain the actual downloaded certificate. VERCEL_TOKEN must be issued by Vercel with an appropriate project scope; it is not a random application secret.

No hosted role/view/password, GitHub secret or enable variable was changed. No Vercel token was created. No commit/push/merge was performed.


## Step 5 publication prepared; hosted observer verified — 2026-11-18

The user reported completion of setup steps 1–4. Created worktree `D:/lumivox-monitor-observer`, branch `codex/phase9-monitor-observer`, based on main `548982f41303fc309a4a08aee82f43cc8676296a`. Applied the reviewed patch and staged exactly two files: setup SQL and the view-based health query. Cached diff check passed; both files match the locally tested source after line-ending/trailing-newline normalization. No commit, push or merge was performed.

Read-only Supabase Staging checks used the Primary connection exposing project `atbdbbamqjmfkvahqidj`. The first owner-context aggregate was healthy. A second transaction used `SET LOCAL ROLE task_risk_observer` and confirmed at `2026-11-18T16:22:38Z` / `23:22 ICT`:
- current_user task_risk_observer; login true; superuser/BYPASSRLS/createdb/createrole false.
- Raw attempts SELECT and Task INSERT privileges false.
- Aggregate view readable, cron active with recent success and zero recent failures; alerts empty, receipts and overdue claims zero.

This verifies hosted role/view authorization through the connector's read-only transaction. GitHub observer password/TLS connection and the owner's Vercel token are not independently exercised by this check. Wait for the user's commit/push, CI and merge of the two-file observer PR into main before enabling TASK_RISK_MONITOR_ENABLED and running the real workflow. Production CD remains outside this publication task.

## Observer merge and real monitor attempt — 2026-11-18/19 ICT

PR #145 merged into main at `2da236e8e444550c7c0e5fa35e0d8f717306d94c`. CI run 44350948906 succeeded; Production CD 44351301463 and Staging CD 44351300965 were skipped.

Enabled repository TASK_RISK_MONITOR_ENABLED=true after verifying the new main and Staging host/port, then dispatched real monitor with test_alert=false: https://github.com/Horus031/lumivox/actions/runs/44351572205 . Staging job 134968341429 failed with probe-unavailable exit 2. Production job only recorded its disabled state and skipped checkout/probe; its success is NOT Production health evidence. Synthetic job skipped as intended.

Diagnosis: Staging Supavisor logs at the failed run contain `ClientHandler: (EAUTHQUERY) unsupported or invalid secret format`, state auth_scram_first_wait, user task_risk_observer. An additional read-only catalog query returned only the password format classification `not_set` for that role, without returning password/verifier contents. The database role has not been assigned a password even though the GitHub secret exists. Health advisors reported no lints.

Temporarily set TASK_RISK_MONITOR_ENABLED=false and verified the saved value at 00:02 ICT on 2026-11-19 to avoid repeated configuration-failure alerts. PRODUCTION_CD_ENABLED remained false; Production monitor was not activated. No database password, secret value, schema or application code was changed.

User requested psql connection instructions to set the role password themselves. Resume after they run owner-session password setup with the same value stored in GitHub, then re-enable and rerun real/manual and scheduled checks. Actual observer monitor, Vercel credential preflight and 9D/9E remain HOLD.

## Observer password fixed; real GitHub probe PASS — 2026-11-19 ICT

After the user completed owner-side password setup, a read-only catalog check confirmed task_risk_observer has a SCRAM-SHA-256 verifier, LOGIN enabled and no expired validity. No password or verifier value was returned.

Restored TASK_RISK_MONITOR_ENABLED=true in GitHub and verified PRODUCTION_CD_ENABLED=false. Re-ran the failed Staging job through the GitHub connector: run 44351572205, attempt 2, same main SHA `2da236e8e444550c7c0e5fa35e0d8f717306d94c`. The run completed SUCCESS. Staging job 134995556351 succeeded at Check recovery health, exercising the configured observer password, session pooler and verify-full TLS from the GitHub runner.

The authenticated run summary showed snapshot checked_at `2026-11-18T17:29:34.271109Z` / `2026-11-19 00:29:34 ICT`: cron active, last success `17:29:00.040904Z`, failures_15m=0, alerts=[], pending receipts=0, receipts older_than_3m=0, claimed_older_than_10m=0, persisted_unpaired_15m=0 and finished_without_native_result_15m=0.

Production job 134995555560 only recorded that its target is disabled; checkout and health probe skipped. Synthetic notification job skipped. Neither is a Production health acceptance result. Existing synthetic notification delivery evidence from run 44338014449 remains separate.

Manual end-to-end Staging monitor: PASS. The real scheduled execution is still awaiting verification at this checkpoint. No Production deploy/migration, password reset, secret-value read, commit or push was performed by the agent. Vercel real-credential preflight and full feature PR CI remain independent outstanding release gates.

## Remaining 9C gates and prepared read-only preflight — 2026-11-19 ICT

After real monitor success, repeated read-only Staging inspection at `2026-11-18T17:57:46Z` / `00:57:46 ICT` remained healthy: cron active/recent success, failures_15m=0, alerts=[] and all backlog indicators zero. GitHub scheduled-run API still returned total_count=0 at the observed checkpoint. Authenticated workflow menu offered Disable workflow, confirming it is enabled. Actual schedule-triggered execution remains NOT EXECUTED; manual success does not close this separate evidence requirement. GitHub documents schedule delays/dropped queued jobs under load, but no provider incident or specific cause for this repository was established.

Authenticated Production environment inspection confirmed VERCEL_TOKEN is now declared, required reviewer Horus031 remains configured, self-review prevention is off as selected by the owner, admin bypass is off and only main is allowed. No token value was read. Runtime access with that token remains untested.

Prepared worktree `D:/lumivox-production-preflight`, branch `codex/phase9-production-preflight`, based on main `2da236e8e444550c7c0e5fa35e0d8f717306d94c`. Exactly two files staged: `.github/workflows/production-read-only-preflight.yml` and the previously tested `scripts/ci/production-vercel-release.mjs`. Workflow is manual, main-only, uses the existing protected Production environment, sets only VERCEL_TOKEN/EXPECTED_SHA and invokes the helper with fixed `preflight` mode. It performs project-binding GET, no migration, deployment or write API request. The helper retains its existing deploy function, but that mode is not exposed or selected by this workflow.

Validation: actionlint 1.7.12 PASS, Node syntax PASS, cached diff check PASS. Mock execution confirmed one GET for successful preflight; missing token, HTTP 401 and wrong project binding reject; workflow main restriction, Production approval environment and sole preflight command were asserted. No real credential/API test or hosted workflow run is claimed for these unpublished files. No commit/push/merge performed.

Owner handoff: commit/push the two staged files, open a PR to main, review/merge after CI, then manually run Production Read-only Preflight on main and have Horus031 approve the read-only job. This is separate from authorizing a Production release. Keep PRODUCTION_CD_ENABLED=false. Feature PR full CI and final 9D eligibility remain pending; do not mark all of 9C PASS until scheduled and real-token preflight evidence is captured.

## Preflight bootstrap merged; scheduled monitor PASS — 2026-11-19 ICT

PR #146 merged into main at `127120faf9b3cb48a10469b1a0440c83df652fad`. Merge CI 44484422379 SUCCESS; Production CD 44484733722 and Staging CD 44484733855 SKIPPED. The remote main workflow was read and confirms manual/main-only execution, protected Production environment and fixed `node scripts/ci/production-vercel-release.mjs preflight` command. The call path performs one project-binding GET; it does not enter the helper's deploy path.

The actual scheduled-run gap is now closed for Staging: run 44414037462 and run 44454334650 both use event=schedule, main SHA `2da236e8e444550c7c0e5fa35e0d8f717306d94c`, and conclusion SUCCESS. Their Staging jobs 135189471028 and 135325577732 ran Check recovery health successfully. Production probes skipped, so no Production health claim is made. These observations establish scheduled execution, not a guaranteed five-minute delivery SLA.

Real preflight execution is still pending. The GitHub connector can read runs and rerun existing jobs but exposes no new-workflow dispatch action. The previous browser tool is no longer available; the current Windows Computer Use runtime failed initialization twice (trusted Node process reset). The owner was asked to run the reviewed workflow on main and approve its existing Production gate as Horus031. No attempt was made to change/bypass approval, extract secrets, install new tools, perform migrations or deploy.

Monitor publication/observer/manual/scheduled execution and synthetic GitHub delivery: PASS. Vercel real-token preflight: NOT EXECUTED at this checkpoint. Feature PR full CI/release review and 9D/9E remain HOLD. New evidence is uncommitted for the user's review/push.

## Real Vercel preflight PASS; ready for feature PR validation — 2026-11-19

Owner started and approved Production Read-only Preflight run https://github.com/Horus031/lumivox/actions/runs/44485714154 on main SHA `127120faf9b3cb48a10469b1a0440c83df652fad`. It was first observed waiting at the existing Production reviewer gate, then completed SUCCESS after owner approval. Job 135428548549 ran Verify project binding with GET only successfully. The owner also explicitly acknowledged running/approving it in chat.

Helper output at `2026-11-19T08:14:22Z` / `15:14:22 ICT` was projectId `prj_SE0K3y3prJEcNFdUugAHZblAtyEq` and the same main SHA. The checked main helper returns from preflight only after a successful authenticated project GET and checks effective root `apps/web`, GitHub org/repo `Horus031/lumivox`, Production branch `main`, fixed team/project and disabled automatic Git deployments in the resolved root configuration. The deploy-mode POST path was not entered. No migration, deploy or new token was performed by this workflow, and no token value was read by the agent.

This closes the real-credential preflight gap. Together with manual observer probe 44351572205 attempt 2, scheduled probes 44414037462/44454334650 and observed GitHub delivery for synthetic alert 44338014449, the technical monitoring/preflight acceptance is PASS. GitHub scheduling remains best effort; no guaranteed five-minute SLA or email-inbox delivery claim is made. Production database monitoring/install checks remain part of the approved database stage, not a result of Staging probes.

The release branch still needs the user's evidence/source commit and push, followed by a feature PR into product-release and full CI on that PR's exact head SHA. The CI successes on bootstrap main commits do not substitute for that feature PR's validation. Hardened release workflow source remains on the feature branch for that review; actual controlled Production execution is not authorized by this preflight. 9D and 9E remain HOLD pending the feature PR/release approval.
