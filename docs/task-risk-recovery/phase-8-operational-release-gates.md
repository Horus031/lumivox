# Task Risk Recovery — Phase 8 operational release gates

## Baseline and executed scope

- Branch `feature/task-risk-recovery`, baseline `9d0fba227f4424b10e69f5ee2a8d2a50a1d990a7`, including PR #141 and the PR #142 Playwright discovery fix.
- Verification date 2026-11-18, Asia/Bangkok.
- Connector verification confirmed success for the Web, AI API and Supabase jobs in [CI 44130734369](https://github.com/Horus031/lumivox/actions/runs/44130734369) and the staging deployment job in [CD 44131315334](https://github.com/Horus031/lumivox/actions/runs/44131315334).
- Read-only Supabase Staging inspection confirmed both Recovery migrations, one active Native ML model, active minute cron, 30 successful recent runs, zero failed runs, and zero attempts, receipts and reassessment records. Anonymous and authenticated worker execution is denied. Service-role execution is granted.
- The user confirmed that an isolated hosted QA environment does not yet exist. Hosted fault injection and Legacy Focus acceptance remain open. The existing staging flags and Redis service were left in their operational state.

## Upstash inspection

The Upstash connector identified `lumivox-redis` as database `81a566a5-0c43-4f62-96af-ca0c59d00bdd`, active, free plan, global region with `eu-west-1` primary and TLS enabled. Its endpoint `expert-moray-135816.upstash.io` matches the workspace Redis configuration. A read-only REST `PING` returned `PONG`. Statistics were retrieved without a refresh. Upstash usage counters lag activity and are observational.

QStash listed zero schedules in both available account regions. The repo workflows had no Task Risk monitor before this change. Visible Vercel environment metadata showed no Task Risk monitor/alert, Slack, Discord or PagerDuty configuration. These checks establish the inspected surfaces. GitHub encrypted secret contents and all external notification systems were not inventoried.

The connector did not provide evidence that this Redis endpoint is isolated for QA or that a specific alert recipient is configured. All Redis fault injection must use a dedicated QA endpoint. Connectivity is verified and the hosted operational failure gates remain open.

## Prepared monitor

`.github/workflows/task-risk-recovery-monitor.yml` supplies a disabled-by-default scheduled monitor. It runs only when `TASK_RISK_MONITOR_ENABLED=true`, only from the repository default branch, and uses the protected `staging` environment. The interval is five minutes, the shortest [GitHub Actions schedule interval](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule). GitHub scheduling can be delayed. This workflow requires the file to reach the default branch through the usual review process before its schedule can run.

Configure `TASK_RISK_MONITOR_PGHOST` and optional `TASK_RISK_MONITOR_PGPORT` as staging variables, and `TASK_RISK_MONITOR_PGUSER`, `TASK_RISK_MONITOR_PGPASSWORD`, `TASK_RISK_MONITOR_CA_PEM` as staging secrets. Use a read-only observer credential with access to the existing aggregate health query. The workflow checks the known Supabase Staging hostname or project-qualified pooler login and verifies TLS certificates.

A health alert exits 1, an unavailable probe exits 2, and the run records aggregate JSON and annotations. Failed workflow notification subscriptions must be configured for the designated recipient. This commit supplies the schedule and checks. Activation, hosted execution and actual recipient delivery are **NOT EXECUTED**. A failed job is insufficient proof of alert receipt. If a one-minute operator monitor is required, select an approved scheduler with that resolution.

## Acceptance matrix

| Gate | Evidence | Status |
| --- | --- | --- |
| Quota exhaustion and Redis outage | Added local tests for provider quota denial and provider connection failure using the actual `checkRateLimit` wrapper with a mocked provider. Hosted QA has not been provisioned. | **LOCAL PASS**. Hosted **NOT EXECUTED**. |
| AI timeout before persistence | Server-action test expects failure, an active reservation fence and one inference dispatch across retry. | **LOCAL PASS**. |
| AI timeout after persistence | Existing test checks a committed result after HTTP failure. New delayed-persist retry test checks that retry pairs the existing request without dispatching inference again. | **LOCAL PASS**. Hosted **NOT EXECUTED**. |
| Hosted Legacy Focus | Phase 7 local Legacy evidence retained. The shared staging deployment serves V2. No Legacy-enabled hosted QA exists. | **NOT EXECUTED**. |
| Alert classification | `scripts/test-task-risk-recovery-monitor.mjs` ran on disposable loopback Supabase. Cron inactive returned exit 1. A failed cron history row was simulated within a rolled-back transaction and emitted `cron_failure`. An 11-minute unfinished claim emitted `worker_claim_overdue` and stayed unfinished. Fixture cleanup and cron reactivation passed. | **LOCAL PASS**. |
| Alert delivery | No designated recipient or configured Task Risk notification channel established from the inspected surfaces. The user asked to check existing configuration. | **UNVERIFIED**. |
| Production credential isolation | Visible Vercel metadata has `SUPABASE_SECRET_KEY` for Preview only and no Production `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` entry. Supabase public URL entries exist for both scopes. Render lists separate `lumivox-ai-api-staging` on `product-release` and `lumivox-ai-api` on `main`. Actual credential bindings and Production database identity remain unverified. | **OPEN**. |
| Phase 8 Web/AI quality gates | Vitest 1,165 passed and 26 skipped, AI API 77 passed, TypeScript and lint passed with five existing warnings. Workflow YAML parsed successfully. Production-mode build passed with 109 static pages generated. | **LOCAL PASS**. |
| Phase 8 CI/CD | Local changes have no merge/deployment SHA yet. | **NOT EXECUTED**. |

## Remaining execution requirements

1. Provision or designate non-production QA with its own Web, AI API, Supabase and Redis configuration. Obtain the QA origin, project reference and secret-store names. Preserve the loopback and hosted target guards in the existing acceptance suites. Enable Legacy only on the designated QA deployment.
2. Run real Redis quota exhaustion for the dedicated QA account, then verify both ordinary Task and Focus completion remain functional. Route Redis failure through a QA-only fault proxy to test fail-closed reassessment without making shared Redis unavailable.
3. Run QA-only AI faults before persistence and after persistence. Correlate request UUID and the inference call count. Retry after a lost response must reuse an existing persisted prediction. Verify the absence of extra inference, receipts and user entities.
4. Activate the monitor only after its reviewed workflow, read-only credentials, TLS CA and approved operator recipient exist. Test actual alert receipt for cron failure and overdue worker claims. Capture timestamp, alert code, monitor-run reference and operator acknowledgement.
5. Audit the Web and Render Production bindings with their owners. Configure keys belonging to the Production Supabase project in Production-only secret scopes. Record the project and credential metadata without copying Staging values.
6. Apply the Phase 7 forward-fix playbook for any incident. Claimed workers remain fenced until an operator verifies the old process stopped. Age by itself never clears a reservation.

**Production release — HOLD** until hosted fault tests, Legacy Focus, alert delivery and credential isolation have independent acceptance evidence.
