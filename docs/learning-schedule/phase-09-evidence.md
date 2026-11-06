# Phase 09 — Focus Integration Evidence

## Step 9A — Study–Focus Attribution Foundation

- **Result: LOCAL PASS**, attribution identity/authorization only. Steps 9B–9D and Phase 08D Tier B remain unexecuted acceptance gates; no production readiness claim.
- **Baseline HEAD:** `b794956553d2c9e0e44015f9b0c76ed1955dd7c9`, branch `feature/learning-schedule-foundation`, clean initially. Executed **2026-11-07**, Asia/Bangkok; results include uncommitted 9A changes. JSON report timestamps are UTC (Nov 6 UTC corresponds to Nov 7 local). No commit/push/deploy or remote DB changes.
- Supabase CLI **2.122.0** generated actual migration **`20261106190648_learning_schedule_focus_attribution.sql`**. Forward-only, no existing migration modified and no Focus-history backfill. Local migration up and final clean replay **PASS: 91 applied migrations** (90 baseline). Reset used `--local --no-seed` only after verifying empty disposable local DB. Docker/Supabase were started locally; credentials were not printed.

### Implemented v1 policy

- Separate `task_study_focus_attributions`, with stable ID, owner, Study/Focus IDs, fixed trusted source `study_session`, creation/update timestamps and an internal Task identity. `UNIQUE(focus_session_id)` guarantees at most one Study occurrence per Focus. Multiple Focus sessions may be explicitly linked to the same Study occurrence.
- Composite foreign keys `(study_session_id,user_id,task_id)` and `(focus_session_id,user_id,task_id)` enforce both ownership and matching Task, including after link creation. Parent unique constraints support those references. An attributed Focus cannot silently be reassigned to a different Task. Focus without a Task is rejected; ordinary Focus creation does not create attribution.
- New links require owned root Task `todo`/`in_progress`, active current schedule revision, Study status `scheduled`/`in_progress`, and Focus status `ongoing`/`paused`. Both Legacy and Pomodoro parents use the same command. No new retrospective links to completed/cancelled Focus or terminal Study sessions. This is a status/identity policy, not an Attendance time-window or launch policy.
- Exact same-pair replay returns the original ID **before** terminal-state eligibility checks, with no timestamp/source change. Thus cancellation/completion/Task close/revision does not invalidate an existing historical pair. Different Study for the same Focus conflicts with **23505**. Wrong owner/Task or inactive new target uses **22023**; unauthenticated command uses **42501**.
- `ls_link_study_focus` derives identity from `auth.uid()`, accepts only two parent IDs, uses empty search path, and is executable by `authenticated` only (PUBLIC/anon/service-role execution revoked). Lock order **Task → Schedule → Study Session → Focus**. Focus row uses **NOWAIT** to avoid an inverse wait with an existing Focus/Task-FK operation; **55P03** means retry the exact pair after the competing transaction finishes.
- Attribution table has RLS and owner-only SELECT; browser direct INSERT/UPDATE/DELETE is not granted. Service role has SELECT only. No unlink/reassignment command was introduced.
- Logical reschedule/revision/cancellation retains parent identities and attribution. Physical parent deletion cascades link cleanup, while existing Focus history follows its existing parent deletion rules. A BEFORE-DELETE Task cleanup removes its attributions before the existing Focus `task_id SET NULL` action, preserving existing hard-delete behavior. This trigger never runs on status changes.
- New `focus-attribution.actions.ts` provides strict authenticated link/read Server Actions, owner-scoped Session existence/history reads, bounded **200 rows + `hasMore`** indicator, safe error classification and timeouts. Unknown mutation outcome is **uncertain**; no retry creates another Focus. These actions have no UI caller yet.
- No timer, Render create/lifecycle endpoint, minutes aggregation, email settings/gates or Attendance command was changed. Attribution writes only its own table; Focus status/minutes changes never complete Attendance through this feature (**BR-021**).

### Executed acceptance

| Case | Actual result |
| --- | --- |
| FA-01 | **PASS**, matching Task/owner link for Legacy and Focus V2, stable attribution ID. |
| FA-02 | **PASS**, different Task and null Task rejected (**22023**); composite FK also prevents linked Focus Task reassignment (**23503**). |
| FA-03 | **PASS**, both cross-owner directions rejected; direct privileged cross-owner insert violates composite FK (**23503**). Actual authenticated local HTTP owner B link denied (**22023**) and read returns zero rows. |
| FA-04 | **PASS**, anonymous RPC and private table read denied (**42501**); authenticated direct deletion denied too. |
| FA-05 | **PASS**, exact retry returns same ID and entire persisted row, including timestamps/source, remains identical. Actual local HTTP replay included. |
| FA-06 | **PASS**, same Focus/other valid Study occurrence conflicts (**23505**), exactly one persisted link. |
| FA-07 | **PASS**, cancelled and completed Study sessions reject new attribution; terminal Focus cannot receive a new retrospective link. |
| FA-08 | **PASS**, actual `ls_reschedule_session` preserves Session and attribution ID. |
| FA-09 | **PASS**, actual `ls_revise_schedule` cancels prior scheduled occurrences but retains all three prior links/Focus records. Exact historical retry still succeeds, including after Task completion. |
| FA-10 | **PASS**, actual V2 cancel and complete lifecycle RPCs leave Attendance unchanged; cancelled V2 keeps persisted interrupted focus seconds, Legacy cancelled effort is not overwritten to zero. Task completion does not turn the old cancelled occurrence into completed. |
| FA-11 | **PASS**, real PostgreSQL concurrency and rollback behavior below. |
| FA-12 | **PASS**, final clean replay of **91 migrations**, then full DB regression. |

- **pgTAP: 38 new assertions PASS** in `supabase/tests/learning_schedule_focus_attribution.sql`. Includes RLS, FK enforcement, idempotency, actual reschedule/revise/V2 lifecycle integration, terminal-state rejection and physical Task delete compatibility. All fixtures rolled back.
- **Concurrency: 12 case executions**, four orders/scenarios × three repetitions: same-pair replay; conflicting Study IDs; first insert rolled back; Focus row busy then exact retry. **9 blockers observed with `pg_blocking_pids()`** for waiting cases. Busy-Focus cases returned **55P03 in 1–2 ms**, with zero inserted rows, then succeeded after the lock was released; those NOWAIT cases intentionally do not require a wait/blocker.
- Actual SQLSTATEs: successful/replay/rollback replacement **00000**; committed conflicting pair **23505**; busy Focus **55P03**, followed by successful retry **00000**. Every concurrency final state: **one link**, correct Study ID, both Study occurrences still `scheduled`, Focus still `ongoing`. No Attendance mutation.
- **6 authenticated local PostgREST/HTTP checks PASS**: owner link/replay, different Study conflict, cross-owner denial, owner read versus other-user isolation, denied browser mutation and anonymous denial. Local Auth fixture accounts were created/confirmed without email, signed out and deleted afterward. This is direct Supabase HTTP integration, not browser/Render launch E2E.
- Report: [`phase-09-focus-attribution.json`](./phase-09-focus-attribution.json), containing baseline SHA, UTC execution times, observed PIDs, SQLSTATEs, latency, final states, HTTP outcomes and cleanup.
- **16 Server Action unit tests PASS**: strict input/no client owner, auth before DB access, exact RPC parameters, conflict/NOWAIT/uncertain mapping, owner-scoped reads, failure handling and explicit overflow signaling. They mock the Next authentication/client boundary; DB authorization is exercised independently by pgTAP/HTTP.

### Actual effort / double-counting boundary

- **Source reviewed, no 9C projection implemented:** current V2 cancellation sums persisted `focus` segment `actual_seconds` for `completed`/`interrupted` segments and caches floored minutes on the parent. Legacy already stores `actual_focus_minutes`. The V2 cancellation test confirms nonzero persisted effort survives cancellation.
- Future 9C must use one authoritative source per mode, exclude breaks/planned duration and document rounding; parent V2 minutes and child seconds must never be added together. Attribution itself does not compute totals or equate cancelled work with zero effort. No analytics/time-projection PASS is inferred from 9A tests.

### Commands / quality gates

```powershell
# repo root; local-only installed Supabase CLI 2.122.0
supabase migration new learning_schedule_focus_attribution
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
node scripts/test-learning-schedule-focus-attribution.mjs
supabase db advisors --local --type security --fail-on none --output-format json

# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/focus-attribution.actions.test.ts --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

| Gate | Actual result |
| --- | --- |
| Final clean replay | **91 migrations PASS** |
| Full pgTAP | **919 assertions PASS / 33 files** reported; one existing fixture-only concurrency entry intentionally skipped; baseline 881 retained |
| Attribution Server Actions | **16 PASS / 1 file / 5.66s** |
| Full Vitest | **1037 PASS / 26 skipped**, **89 files passed / 5 skipped (94)**, **180.69s**, start **02:23:34 UTC+7**, Nov 7 |
| ESLint | **PASS**, zero errors; one existing `use-focus-v2-audio.ts:104` missing-`projection` dependency warning |
| TypeScript | **PASS**, standalone `--noEmit --incremental false --pretty false` and actual build typecheck |
| Production build | **PASS**, Next **16.2.6**, compile **14.7s**, TypeScript **25.9s**, **105 pages / 810ms** |
| Generated types | **PASS**, final local schema with both `public` and `graphql_public`; contents/exit checked before replacing output |
| Security advisors | One pre-existing `public.set_updated_at` mutable-search-path WARN; no new attribution findings |

- Build used local Supabase process env and reminder flags OFF. `.env.local`, timer/Render code and dependencies unchanged; `.next/dev` retained. `--ignore-scripts` skipped prebuild cleanup only; actual `next build` ran.
- **Corrected failure:** initial composite FK implementation obstructed physical Task deletion because existing Focus rows use `SET NULL`. Added narrowly scoped BEFORE-DELETE cleanup in the new migration and an indexed Task lookup, then clean-replayed and reran full pgTAP plus concurrency. Both hard-delete regression assertions now pass; logical cancellation/revision history remains preserved.
- Final local DB read: **91 applied migrations**, **0 users / Tasks / Study Sessions / Focus Sessions / attributions**, Dispatch **OFF**, Missed Sweep **OFF**, **0 reminder Cron**. Fixtures cleaned and Auth sessions signed out. No real email/provider call, staging/production migration or operational configuration change.

### Not executed / next steps

- **NOT EXECUTED:** Study Plan launch UI, Focus timer integration, Next → Render → Supabase create-and-link workflow, partial-create/timeout reconciliation, minutes/analytics projection and browser Focus E2E. These belong to **9B–9D**; 9A introduces no timer button or automatic attribution on ordinary `/focus` starts.
- Read action returns the first bounded page with `hasMore`; it must not be treated as a complete aggregate when true. Full history pagination/effort projection remains later work. No production load/deployment checks are claimed.
- **Phase 08D Tier B remains NOT EXECUTED**, retained as a release gate. No live Resend approval or activation is inferred from continuing Phase 09.
- Primary references checked for constraints/RLS: [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Local execution above, not source review alone, supports Step 9A PASS.
