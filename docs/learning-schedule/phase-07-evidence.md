# Phase 07 — Notification Preferences & Durable Outbox Evidence

## Step 7A — Schema, Consent & Outbox Foundation

- **Baseline HEAD:** `377a8aebd71e8aeba1f08b34de0db94088c94cbe`; `feature/learning-schedule-foundation`, clean working tree initially, 4 ahead / 0 behind fetched `origin/product-release`. Execution date **2026-11-04**, Asia/Bangkok. Results include the uncommitted 7A implementation; no commit/push or deployment.
- **CLI-created migration:** `20261104051851_learning_schedule_notification_foundation.sql`. **85 migrations** (84 baseline + 1 new); no old migration edited. Supabase CLI **2.122.0**.
- Docker Desktop was initially stopped; started it in the background. Before migration, local `lumivox-proj` had **0 Auth users / 0 Tasks / 84 migrations**, Sweep processing gate **false**. A temporary existing-user fixture was created before forward apply: afterwards **1 expected fixture / 0 Tasks / 0 preference rows / 85 migrations**, proving no implicit opt-in. Clean local `db reset --local --no-seed` replay then passed. Final replay also includes the restricted browser status-column grants; reset was guarded to refuse unexpected user data.

### Implemented boundaries

- Five `study_notification_*` tables: preferences, Task overrides, jobs, deliveries and independent dispatch control. All have RLS; browser writes are revoked. Preferences/overrides expose owner-only reads; job/delivery reads expose owner-only status columns, excluding lease tokens, idempotency keys, provider message IDs and error diagnostics. Operational control is not browser-readable/writable. Trusted `service_role` has explicit SELECT/INSERT/UPDATE/DELETE, not browser privileges.
- Explicit `ls_set_study_notification_preferences` uses `auth.uid()` and DB `clock_timestamp()`; no browser userId/consentedAt arguments. Missing row means OFF. New default row is OFF / lead 15 / consent null. Repeated true saves preserve latest affirmative consent; opt-out retains that timestamp while effective permission becomes false. The timestamp is a current consent record, **not an append-only consent audit ledger**.
- Secure Task override command checks ownership; effective preference is GlobalOptIn AND TaskNotDisabled. `enabled=true` restores the Task default and cannot bypass global OFF. The helper represents preference permission only, not verified-email/session/dispatch eligibility.
- Database validates lead values 5/15/30/60, quiet-hour endpoints and catalog timezone; overnight quiet-hour configuration is accepted. Definer commands have empty search_path and authenticated-only EXECUTE. Effective read helper is security invoker.
- Outbox enforces globally unique idempotency key and `(session_id, notification_type, schedule_revision)`, matching Session owner **and generation revision**, nonnegative attempts, paired leases and leased-status requirements. Claim index is `(status,next_attempt_at,due_at)`. Delivery attempts are unique per job, with owner-consistent FK. `sent` is provider acceptance, never inbox delivery; attempt delivery states are separate. Provider representation is restricted to **fake** in Phase 07.
- Jobs contain no destination, raw email body or learning content. Dispatch control defaults OFF independently of Missed Sweep. No reminder Cron, enqueue/claim function, worker, provider SDK call or Settings UI was added.
- Added strict owner-scoped read/save Server Actions and Task override save action under `features/learning-schedule`; reads never insert an implicit preference. Generated types preserve both existing `graphql_public` and `public` schemas; only trailing whitespace was normalized.

### Required acceptance

| Case | Actual result |
| --- | --- |
| NP-01 new user | **PASS**, SQL + HTTP: missing row/default row remain OFF, no fabricated consent |
| NP-02 explicit opt-in | **PASS**, SQL + HTTP: timestamp from DB; identical affirmative save preserves timestamp; direct timestamp/owner injection rejected |
| NP-03 opt-out | **PASS for stored consent/effective OFF**. Pending-job invalidation is explicitly **NOT IMPLEMENTED / NOT ACCEPTED until 7B** |
| NP-04 lead values | **PASS**, all four allowed values and invalid/null/noninteger inputs tested |
| NP-05 quiet hours | **PASS for configuration/validation**: overnight/daytime accepted; equal/missing endpoints, 24:00, blank/unknown/numeric-offset zone rejected. Send-time quiet-hours suppression is deferred to 7C |
| NP-06 Task override | **PASS**, Task disable wins over global ON; Task true cannot override global OFF |
| NP-07 owner B | **PASS**, four-table row isolation; cannot alter A consent/override. Composite FKs reject cross-owner jobs/deliveries/overrides with **23503** |
| NP-08 direct job mutation | **PASS**, authenticated INSERT/UPDATE/DELETE/provider forgery/control changes denied with **42501**; worker lease/provider internals excluded from browser reads |
| NP-09 logical duplicate | **PASS**, both logical tuple and idempotency key duplicates rejected with **23505**; wrong generation revision rejected |
| NP-10 operations | **PASS for 7A foundation**: dedicated gate OFF, Attendance gate independently OFF, no reminder Cron/provider call; `resend` cannot be stored as provider |
| NP-11 existing users | **PASS**, actual pre-migration Auth fixture remained without preferences after forward apply; no backfill of opt-in |
| NP-12 clean replay | **PASS**, all 85 migrations replayed on verified empty local, no seed |

### Commands and actual gates

Repository root (installed CLI binary used as `supabase`):

```powershell
git fetch origin
supabase migration new learning_schedule_notification_foundation
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
supabase db advisors --local --type security --fail-on none --output-format json
```

- **pgTAP: PASS**, exit 0; **27 files / 606 assertions / 0 failures**, **3 wall-clock seconds**. New foundation suite contributes **90** assertions over the 516 baseline. Fixtures roll back; persistent concurrency setup is an intentional TAP skip, not new worker-concurrency coverage.
- **Action tests: 30/30 PASS**, 6.16s, `notification-preferences.actions.test.ts`.
- **Real local HTTP integration: 3/3 PASS / 0 skipped**, final run 1.39s, `notification-preferences.integration.test.ts`: real Auth/PostgREST/RPC, DB consent, effective Task/global permission, owner B, direct mutation denial and anonymous **42501**. Only request-cookie binding is mocked. Local URL/key variables were injected from CLI status into process environment; fixtures deleted with zero remaining owned rows asserted. No credentials persisted or printed.
- **Security advisor:** one `function_search_path_mutable` WARN outside the new notification objects; no finding referencing the new tables/functions. This is not a full-platform clean-advisor claim.
- Web gates executed sequentially in `apps/web`: `node node_modules/eslint/bin/eslint.js .` **PASS**, exit 0, 0 errors / 1 existing Focus `projection` hook-dependency warning; then `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot` **PASS**, exit 0, **798 passed / 26 skipped**, **78 files passed / 5 skipped**, **187.32s**, started **12:35:02 UTC+07:00**. The 3 new opt-in integration cases were executed separately above; other opt-in skips are not counted as new 7A passes.
- Then `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: **PASS**, exit 0.
- Then `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build`: **PASS**, exit 0; Next **16.2.6**, compile **21.5s**, TypeScript **26.9s**, **100/100** pages in **1173ms**. **Prebuild NOT EXECUTED**, preserving `.next/dev`; actual production build completed. Build uses process-only Supabase local configuration, `.env.local` unchanged.
- Final read-only local verification: **85 applied migrations / 5 RLS-enabled notification tables / dispatch gate false / Sweep gate false / 0 Auth users / 0 preferences / 0 overrides / 0 jobs / 0 deliveries / 0 reminder Cron jobs**. Both mutating RPCs are definer with empty search_path; effective read helper is invoker with empty search_path. Fixture cleanup passed, `.next/dev` retained, `git diff --check` and explicit new-file whitespace checks **PASS**. No source files outside the 7A migration/tests/actions/types/evidence scope changed.

### Limits / next checkpoint

- **7B NOT IMPLEMENTED:** transactional enqueue, reschedule/revision/Attendance/Task-close job lifecycle, pending/leased invalidation on global opt-out or Task disable. The SQL test deliberately demonstrates that a seeded pending job still exists after opt-out; it is not mislabeled full cancellation acceptance.
- **7C NOT IMPLEMENTED:** claim/lease worker, concurrent claims, lease expiry/reconciliation, retry/backoff, final verified-destination/session/quiet-hours checks, suppression and fake-provider execution. Fake provider is currently a schema representation only; exactly-once submission/inbox delivery is not claimed.
- **7D/08 NOT IMPLEMENTED:** Settings UI/browser acceptance, unsubscribe/webhook/provider suppression, real Resend integration or email sending. No new Cron secret, shared Attendance gate, dispatch activation, remote DB migration or deployment.
- No acceptance test failure occurred in the executed 7A tests. Docker startup, CLI/Vite deprecation notices, and existing lint/advisor warnings are disclosed above. No dependencies installed or changed.
- **Decision: Step 7A Local PASS**, within the schema/consent foundation scope above. Phase 07 overall remains **INCOMPLETE** for 7B–7D; job cancellation, dispatcher and provider execution are not accepted by this checkpoint. User handles commit/push; no remote deployment approved or performed.
