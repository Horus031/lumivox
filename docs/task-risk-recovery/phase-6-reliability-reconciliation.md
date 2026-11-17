# Task Risk Recovery — Phase 6

## Baseline

- Branch `feature/task-risk-recovery`, baseline `f5b7d1a23e2b3f46072049990fbba0190a599b32` from PR #139.
- Verification date 2026-11-17, Asia/Bangkok.
- Forward migration `20261117070814_task_risk_recovery_reliability.sql`. The applied Phase 5 migration stays intact.

## Mutation receipt and reconciliation

Task Edit, Subtask and Legacy Focus carry an attempt marker on the existing authenticated write. A database trigger verifies the action and ownership, writes a receipt in that transaction, and clears the marker before storage. A Reschedule receipt requires a changed effective deadline. Reduce Scope requires a lower estimated duration. Focus V2 forwards the marker through the existing AI API and wraps the existing create RPC in the same receipt transaction. The V2 retry returns the original session for identical settings and rejects changed settings with `PT409`.

A private receipt is unique per attempt and records the actor, Task, action, changed entity and capture time. Receipt and entity changes roll back together. A conflicting attempt cannot run a second mutation. Phase 6 attempts explicitly opt into receipt-only completion. Legacy callers remain compatible during a rolling deployment, and a replay of a Phase 5 attempt preserves its original evidence policy.

`reconcile_task_risk_recovery(50)` is scheduled every minute where pg_cron is installed. It selects matching receipts using row locks and `SKIP LOCKED`. It updates tracking only. Users can cancel a newly selected attempt through an owner-scoped RPC while there is no receipt. An older unresolved attempt without a receipt is shown as unverified. A committed receipt awaiting reconciliation and an applied attempt awaiting reassessment have separate EN/VI labels.

## Reassessment and historical results

The Web action applies a Redis quota of ten requests per user per hour with fail-closed dispatch. PostgreSQL serializes reservation per user and Task, applies a 120-second cooldown, and grants one AI worker claim. The persisted prediction ID equals the reservation UUID. A timeout after persistence can be recovered without another inference or an available Redis quota. Pairing checks provenance, ownership, input revision, deadline, Native ML mode, model and freshness before saving the prediction ID.

An unclaimed reservation expires. A claimed worker holds the fence until it finishes. If that worker terminates before persistence and cannot record its exit, the Task remains fenced until an operator confirms termination and closes that reservation. Automatic reclaim of this case remains open because a lease alone cannot prove that an earlier worker stopped computing.

Recovery History reads the recorded prediction pair, checks time order, model-version equality and Native ML feature schema, and labels the delta as a historical change in model estimates. Latest risk and its staleness continue to use the existing Phase 2 snapshot flow. A reschedule retains its original deadline.

## Verification

| Gate | Observed result |
| --- | --- |
| Local migration replay and pgTAP | **PASS**. Supabase CLI 3.1.0 replayed 99 migrations with `db reset --local --no-seed`. `test db --local` passed 1,087 assertions across 39 files. Local cron was active and recorded successful runs. `gen types typescript --local` ran and its Phase 6 fields and RPC signatures were checked against the committed-format types. |
| Focused PostgreSQL 18 / pgTAP | Phase 2 14/14, Phase 5 26/26, Phase 6 32/32. Includes failed entity insert rollback, Focus Legacy/V2 evidence, Subtask and Task Edit, abandonment, worker bounds, stale-prediction rejection and timeout reuse. |
| Two-contender integration | **PASS** on a disposable PostgreSQL cluster. A committed Subtask survived a disconnected mutation client, a second reconciliation worker skipped the locked attempt, the final entity ID matched, PostgreSQL reported the competing Task reservation blocker via `pg_blocking_pids()`, and one of two AI claims succeeded. |
| Web unit tests | **PASS**. Full Vitest run passed 1,155 and skipped 26 across 106 files. Includes Redis outage, timeout after persistence, persisted reuse and historical pairing. |
| AI API unit and API tests | **PASS**, 77 tests. Two Phase 6 cases verify that only the approved worker calls inference and that it records exit on inference failure. |
| TypeScript, lint, build | **PASS**. `next typegen`, `tsc --noEmit` and `npm run build` passed. ESLint exited zero with five pre-existing warnings. |
| Recovery-specific Playwright | **PASS**, 5/5 on Chromium with the local Web, AI API and Supabase. Legacy Focus, V2, Subtask, Reschedule and Reduce Scope each wrote and reconciled a receipt and verified the committed entity or changed fields. The first cold-start run timed out at login in two cases. After increasing the login wait, the complete rerun passed. Cleanup left zero test users, attempts and receipts in the isolated stack. |
| Hosted Redis and live-model timeout injection | **NOT EXECUTED**. Rate-limit and AI failures used mocks. Persisted-prediction recovery and concurrent claim were also verified against PostgreSQL. |
| Phase 6 staging CI/CD and E2E | **NOT EXECUTED** for this local changeset. |

Run the concurrency test with a disposable loopback database using `TASK_RISK_TEST_DATABASE_URL` and `node scripts/test-task-risk-recovery-concurrency.mjs`. The Playwright spec uses `TASK_RISK_E2E_SUPABASE_URL`, `TASK_RISK_E2E_SERVICE_KEY` and a loopback app with the same Supabase backend. Execute Focus coverage once each with `TASK_RISK_E2E_FOCUS_MODE=legacy` and `v2` and set the matching app-side Focus release flag.
