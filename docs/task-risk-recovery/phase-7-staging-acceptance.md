# Task Risk Recovery — Phase 7 staging acceptance

## Phase 6 baseline

- Local branch `feature/task-risk-recovery` fast-forwarded to `ae8ba1d440b28cdcd5bcc1d8c2e6d5b44581ba0c`, merge of PR #140.
- [GitHub CI](https://github.com/Horus031/lumivox/actions/runs/44048022346) independently reported success for Web, AI API and Supabase replay. [Staging CD](https://github.com/Horus031/lumivox/actions/runs/44048411225) reported success for database apply, revision/model checks and the general staging Playwright step.
- [Vercel staging alias](https://lumivox-nine.vercel.app) resolved to the ready [product-release deployment](https://vercel.com/horus-projects-672b8c47/lumivox/ABpRbod8XWpNrC6cLFh3ViN143uz) at the merge SHA. [Render staging](https://dashboard.render.com/web/srv-daqdto0jo6nc73e3kme0) reported live deployment `dep-dbu152ou01pc73dc9p2g` at the same SHA.
- Supabase staging `atbdbbamqjmfkvahqidj` showed migration `20261117070814` applied, private receipt and reassessment tables present, and RLS on attempts. The staging grant check confirmed worker execution for service role and denial for authenticated and anonymous roles. Abandonment execution was granted to authenticated and denied to anonymous.
- At 18:27 ICT on 2026-11-17, the read-only staging probe observed an active once-per-minute scheduler, ten successful recent runs, no cron failures in 15 minutes, no pending receipts or overdue worker claims, and zero attempts. These are infrastructure observations with an empty Recovery workload.
- [Phase 6 local evidence](phase-6-reliability-reconciliation.md) covers five local mutation flows, pgTAP and contention. The Phase 6 hosted general suite skipped the loopback-only Recovery suite.

## Run hosted acceptance

Run the separate `apps/web/tests/task-risk-recovery-staging.spec.ts` against the exact allowlisted staging project or a distinct non-production QA project. The local Phase 6 spec retains its loopback guard. The new suite verifies Web revision and environment before interacting with a fixture, blocks sign-in requests to any other Supabase origin, and scopes observation and cleanup to a random Task ID. The fixture account must be dedicated, onboarded and empty of Tasks and Focus sessions. The runner uses PostgreSQL with certificate and hostname verification for hosted targets. For the pinned Staging project, it can also use an already authenticated Supabase CLI with the necessary database scopes. Use a trusted runner with environment-scoped secrets and a PostgreSQL client that supports `PGSSLROOTCERT=system`, or supply a trusted CA file.

| Variable | Purpose |
| --- | --- |
| `TASK_RISK_ACCEPTANCE=1` | Explicit opt-in. |
| `TASK_RISK_ACCEPTANCE_TARGET` | `staging` for `atbdbbamqjmfkvahqidj`, `qa` for its own non-production project, or `rehearsal` for loopback only. |
| `PLAYWRIGHT_BASE_URL`, `TASK_RISK_ACCEPTANCE_ORIGIN` | Same approved Web origin, with no additional path. |
| `TASK_RISK_ACCEPTANCE_REVISION` | Full deployed merge SHA. Compare the Render revision and ready Native ML model before running the live inference case. |
| `TASK_RISK_ACCEPTANCE_PROJECT_REF`, `TASK_RISK_ACCEPTANCE_SUPABASE_ORIGIN` | Exact project reference and its Supabase API origin. |
| `TASK_RISK_ACCEPTANCE_PRODUCTION_PROJECT_REF` | Required for the QA lane to reject the production project. |
| `TASK_RISK_ACCEPTANCE_DATABASE_URL` | Protected connection URL for this project, using a direct host or a project-qualified Supabase pooler login. |
| `TASK_RISK_ACCEPTANCE_USER_ID`, `TASK_RISK_ACCEPTANCE_EMAIL`, `TASK_RISK_ACCEPTANCE_PASSWORD` | Dedicated fixture identity. The account survives cleanup. |
| `TASK_RISK_ACCEPTANCE_SUPABASE_CLI` | Alternative to the DB URL for the pinned Staging project only. Set to the CLI executable. Observations use read-only mode. Fixture writes, permission checks and cleanup use scoped transactions. |
| `TASK_RISK_ACCEPTANCE_PSQL`, `TASK_RISK_ACCEPTANCE_CA` | Optional psql binary and TLS root certificate path. |
| `TASK_RISK_ACCEPTANCE_VERCEL_BYPASS` | Optional scoped automation bypass secret for protected Web. The health request uses the header and requests a cookie for follow-up requests. |
| `TASK_RISK_ACCEPTANCE_FOCUS_MODE` | Select `legacy` or `v2` to match the deployed release flag. |
| `TASK_RISK_ACCEPTANCE_NATIVE_ML=1` | Execute actual browser-triggered reassessment and a controlled latest-snapshot change for the history check. |
| `TASK_RISK_ACCEPTANCE_REDIS_QUOTA=1`, `TASK_RISK_ACCEPTANCE_REDIS_URL`, `TASK_RISK_ACCEPTANCE_REDIS_TOKEN` | Opt in to saturating the dedicated account's quota against the deployment's hosted Redis. Run after the live ML case or with a separate dedicated account. The account remains rate limited until its quota window expires. |

From `apps/web` after setting the target and secrets:

```sh
npx playwright test tests/task-risk-recovery-staging.spec.ts --workers=1 -g 'Legacy Focus|Split Task|Reschedule|Reduce Scope'
npx playwright test tests/task-risk-recovery-staging.spec.ts --workers=1 -g 'Focus V2'
npx playwright test tests/task-risk-recovery-staging.spec.ts --workers=1 -g 'Native ML and historical pair'
npx playwright test tests/task-risk-recovery-staging.spec.ts --workers=1 -g 'Redis quota isolation'
```

Use a QA deployment already configured for Focus V2 if staging creation is off. If staging has V2 enabled, run the Legacy case on an appropriate QA deployment. Record each result against its own environment and revision. A skipped lane does not count. Protected requests follow [Vercel's automation bypass documentation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

The five mutation cases first observe an initiated attempt with no receipt, then check that the receipt row and changed entity share a PostgreSQL transaction ID. They wait up to 125 seconds for `applied` and a successful cron run. The suite makes no reconciliation RPC call. It asserts the entity ID and count, or the exact updated field and preserved original deadline. It also checks cross-owner reads and browser/service RPC permissions. Its cleanup removes task-scoped Focus, Task, prediction, receipt and reservation fixtures and asserts zero residue.

The Native ML case uses a marked prediction fixture solely to open the initial Recovery workflow. The prediction from **Reassess risk** must be a distinct Native ML result, tied to the reserved request ID, with the current input revision and expected model version. After real reassessment, the suite creates a separate marked prediction fixture to move the latest snapshot forward and verifies the historical text remains unchanged. The later fixture is counted only as a history independence check. The Redis case exhausts only the designated account key, expects a denied reassessment with no reservation, then performs an ordinary subtask and Focus start. For a separate QA failure exercise, use an isolated fault proxy for the designated account. First return an error before the upstream inference and check that there is no paired result and ordinary writes work. Then forward once and drop the Web response only after upstream completion. Verify the persisted request ID before retry, retry from the same attempt, and check that the existing prediction is paired with a single upstream call. Schedule a Redis outage exercise in isolated QA and check fail-closed dispatch with ordinary writes still available. Record the proxy and database outcomes separately from hosted successful inference.

## Operational monitoring

Use a read-only operator connection with access to the aggregates in `scripts/task-risk-recovery-health.sql`. Configure its standard `PG*` environment and run `node scripts/check-task-risk-recovery-health.mjs` at a one-minute cadence in the approved monitor. Use TLS verification for hosted connections. The command emits only aggregate JSON, exits 1 when a threshold is crossed, and exits 2 when probing fails. Route nonzero results to the on-call channel through the monitor. The monitor is supplied in this change. Hosted alert delivery and routing still require verification.

| Alert | Initial threshold and check |
| --- | --- |
| Cron inactive, failed or silent | Inactive, any failed run in 15 minutes, or no successful run in the last 3 minutes. Check scheduler state and the failing job message. |
| Receipt backlog | Any initiated receipt older than 3 minutes. Inspect the oldest committed receipt and successful worker runs. |
| Missing Native ML results | At least 3 finished requests without a Native ML row within 15 minutes. Compare AI service errors and model readiness. Persisted but unpaired rows are counted separately. |
| Claimed worker overdue | Any unfinished claim older than 10 minutes. Correlate the request with Render worker logs and verify the process stopped before closing the reservation. |

## Forward fix and rollback

1. Verify the target project, compatible database schema and service-role boundaries. Reconcile production key metadata and the bound production project with the owners of Web and AI API. Confirm credentials are scoped to that production project and stored in production-only environments. Record variable names and project IDs with no values. Vercel metadata exposed separate Production and Preview entries for `NEXT_PUBLIC_SUPABASE_URL`. In the visible metadata, `SUPABASE_SECRET_KEY` appeared under Preview only and no `SUPABASE_SERVICE_ROLE_KEY` entry appeared. Production runtime credential separation remains **UNVERIFIED**.
2. Release database compatibility first, then AI API and Web at the intended revision. Run non-production smoke tests before requesting a separate production release decision. After release, watch cron, receipt backlog, paired prediction outcomes and worker claims.
3. For scheduler failure, restore compatible cron execution forward and let the worker consume existing receipts. Never recreate a user's Focus session, Subtask or Task update. If Web or API regresses, restore a known compatible revision and keep receipt data and migrations. Roll forward so receipt-aware paths resume. Revalidate smoke tests and backlog before closing the incident.
4. For a fenced reassessment, capture request ID and exact `started_at`, determine the worker's deployment and termination from logs, and check for an existing prediction. If a result exists, use the normal reassessment retry to pair it. If the old worker is confirmed stopped and there is no prediction, a privileged operator can close exactly the verified claim in a transaction. Lock the reservation row, verify `request_id`, `started_at`, `finished_at is null` and absence of the prediction, then call `finish_task_risk_reassessment` with the row's owner, Task and request ID. Record the investigation and old/new state. If logs or deployment termination cannot establish that the old worker stopped, leave the claim fenced. Age triggers an alert and never releases a claim on its own.

## Gate results

| Gate | Status |
| --- | --- |
| Baseline CI/CD and infrastructure | **VERIFIED** for Phase 6 SHA, as described above. |
| Read-only staging health | **PASS** at the timestamp above. |
| New-suite local rehearsal | **PASS**, 5/5 on 2026-11-17. Legacy Focus, Split Task, Reschedule and Reduce Scope passed in 3.5 minutes. Focus V2 passed in 58.3 seconds in its own app process. All five verified the transactional receipt, automatic scheduler reconciliation, mutation counts, scope and cleanup. No rehearsal fixture users, attempts or receipts remained. |
| Local Web checks | **PASS**. Vitest 1,160 passed and 26 skipped. TypeScript and production-mode build passed. ESLint exited zero with five existing warnings. |
| Health probe CLI | **PASS**. Local healthy snapshot exited zero. An unavailable loopback database exited 2. Pausing the disposable cron via `cron.alter_job` triggered `cron_inactive` with exit 1, then the job was restored to active. |
| Hosted Task mutation flows | **PASS** for Split Task, Reschedule and Reduce Scope. All three verified the shared transaction ID, automatic cron, scope, integrity and cleanup. Reschedule and Reduce Scope passed after waiting for the drawer and allowing for hosted observation latency. |
| Hosted Focus flows | **PASS** for Focus V2. The actual hosted flow stored one Pomodoro session, the receipt matched its ID and the scheduler applied the attempt. Legacy is **BLOCKED** on hosted acceptance because this Staging deployment serves the V2 builder. Legacy passed in the loopback Legacy lane. |
| Hosted Native ML reassessment and historical comparison | **PASS** after registering the real model and updating the history scenario. Browser-triggered Native ML persisted and paired the exact request ID, current input revision and deployed model after the mutation. The saved historical text stayed identical after a separately marked newer snapshot became latest. Render Staging health returned the expected release SHA and Native ML ready for `native-task-risk-v2-20260925-021822` with algorithm `logistic_regression_balanced` and schema `native-task-risk-v2`. The serving health check and Supabase registry are separate. A read-only query found zero rows for `native_task_delay_risk_classifier` in Staging. The persistence path resolves an active matching registry ID before writing a prediction. With explicit approval, one active row for the exact deployed artifact was registered in Staging. The row uses the repository's model metrics, feature schema and training dataset SHA-256. The operation did not replace any active row. Hosted acceptance was restarted after verification. |
| Hosted fixture cleanup | **PASS**. The dedicated account remains available. The final Staging query returned zero Tasks, Focus sessions, attempts, receipts, reservations and marked predictions. The approved model remains active. |
| Hosted Redis quota and controlled failures | **NOT EXECUTED**. The real reassessment exercised the allowed path. Quota exhaustion, Redis outage and live timeout injection remain open. |
| Hosted alert delivery and production credential isolation | **UNVERIFIED**. |
| Latest runner checks | **PASS** for TypeScript, focused ESLint and six acceptance-target unit tests. |
| Phase 7 CI/CD at its merge SHA | **NOT EXECUTED**. |

Production promotion remains a separate release decision after hosted acceptance.
