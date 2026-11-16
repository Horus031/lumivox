# Task Risk Recovery — Phase 5

## Baseline and scope

- Branch `feature/task-risk-recovery`, baseline `78f343361ef1a2b0d0ab049fd5a48c4cbadd1168` from PR #138.
- Local verification date 2026-11-16 (Asia/Bangkok).
- Migration `20261116080605_task_risk_recovery_tracking.sql`.
- The Phase 4 staging run predates these changes. Phase 5 staging deployment and Playwright acceptance are **NOT EXECUTED**.

## Recovery attempts

`task_risk_recovery_attempts` stores the owner, Task, source row from `deadline_risk_predictions`, action, status, original effective deadline, idempotency key, timestamps, and available mutation and reassessment IDs. It has owner-only SELECT via RLS. Browser roles have no table write access or EXECUTE grants on the two privileged write functions. The server resolves the actor through the authenticated Supabase session. The functions constrain evidence to that actor and Task and check any user subject present in the database request.

Review creates an `initiated` attempt after the Phase 2 snapshot adapter and the database validate the current Native ML prediction. An exact replay of the same owner and key returns the same attempt. A changed Task, action, or prediction with that key is rejected. Leaving a form without saving or starting leaves an initiated attempt. The schema supports `abandoned` and rejects completion from that state. This phase has no automatic abandonment or client abandonment action.

| Workflow | Server evidence for applying the attempt |
| --- | --- |
| Start Focus | A newly created Legacy or V2 parent session with the same owner and Task. |
| Split Task | A newly created Subtask with the same owner and reviewed parent ID. |
| Reschedule | A committed Task update whose effective deadline changed, with the exact returned update timestamp. |
| Reduce scope | A committed Task update that decreased `estimated_minutes`, with the exact returned update timestamp. |

The original mutation and tracking write use separate transactions. Recording rechecks the committed evidence and retries the idempotent write once within the request, with a two-second timeout per try. A failure after the mutation commits leaves its application response intact. Persistent tracking failure or process interruption can leave an initiated attempt after a successful mutation. Recovery has no durable reconciliation queue. Do not reissue a user mutation solely to reconcile tracking. Focus creation tracks a session start and leaves completion or elapsed study duration to the existing Focus lifecycle.

## Reassessment and comparison

The action checks owner, applied status and Task eligibility. It reserves a 120-second cooldown per attempt using a conditional update, then requests a persisted Native ML prediction for the single Task. It pairs the returned prediction ID only after the Phase 2 freshness adapter confirms that this exact prediction is ready and its time is after the applied mutation. Reassessment failures leave the Task and Focus unchanged and preserve the retry cooldown.

The history reads owner-scoped rows and only compares the paired, still-fresh prediction with the source for the same model version ID. The source was validated for the expected model key, algorithm and feature schema at selection. The UI shows signed after-minus-before percentage points in EN/VI. The delta measures a change in model estimates. For rescheduling, the original effective deadline is retained separately because the revised deadline is itself a model input.

## Verification

| Gate | Observed result |
| --- | --- |
| Focused pgTAP 1.3.4 on temporary PostgreSQL 18 | **PASS**. Phase 2 14/14 and Phase 5 23/23. Six relevant repo migrations ran in a fresh cluster with minimal Auth role/JWT fixtures and the two Task columns supplied by the roadmap migration. Both test files ran as written and the temporary server was stopped. |
| Phase 5 pgTAP assertions | Owner isolation, direct-write and RPC denials, idempotency and changed payload, selected-only state, invalid evidence, completion replay, abandoned denial, Legacy/V2 session IDs, Subtask linkage, changed/unchanged deadline, decreased estimate, original deadline and stale prediction rejection. |
| Full Supabase local migration replay and complete DB suite | **NOT EXECUTED**. Docker Desktop daemon did not respond. On the isolated stack, `db reset --local --no-seed` timed out and `test db --local` returned `ECONNREFUSED 127.0.0.1:57322`. 98 migration files are present in the branch, including the new migration. The six-migration PostgreSQL check above is the executed database coverage. |
| TypeScript database schema types | Updated the table and RPC signatures in the checked-in type file. Supabase CLI regeneration is **NOT EXECUTED** while the full local stack is unavailable. |
| `npm run lint` | **PASS**, zero errors and five existing warnings in Focus audio and two unrelated test files. |
| `npm run test:unit -- --reporter=dot --exclude '**/.next/**'` | **PASS**, 1,151 passed and 26 skipped across 105 files. Includes Risk Review navigation, Phase 2 freshness logic and probability comparison regressions. After the final server changes, a focused rerun passed 125/125 tests across nine files. |
| `next typegen` and `tsc --noEmit` | **PASS**. |
| `npm run build` | **PASS**, 109 static pages generated with a loopback Supabase URL for the local build. |
| Browser keyboard, real Native ML reassessment and staging E2E | **NOT EXECUTED**. Native buttons and both message catalogs were checked in source. No authenticated run against an actual service was completed for this phase. |
| Two-connection replay and outage after mutation commit | **NOT EXECUTED**. The SQL test checks replay and failed evidence in one connection. |

Phase 5 release acceptance remains open pending the full Supabase gates and staging E2E.
