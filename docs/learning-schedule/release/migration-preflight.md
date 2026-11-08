# Migration preflight

| Source | Observed migration history |
| --- | --- |
| Feature candidate `8d8d90b` | 94 versioned files. Phase 10 recorded clean local replay of all 94. |
| GitHub `product-release` / `main` | 84 / 70 files at the observed branch tips. These are repository counts. |
| Production project `lslybjylsxtnznghrtyj` | 70 applied, head `20261022062822_extension_distraction_atomic_confirm`. All 70 IDs are in the candidate. The 24 candidate-only versions are a comparison, outside this staging plan. |
| Staging web target `atbdbbamqjmfkvahqidj` | **84 applied**, head `20261031091300_learning_schedule_late_recovery`. Exact ordered prefix of the candidate, with **10 pending**, zero remote-only versions and no gaps. Verified on 2026-11-08 through the linked CLI and a read of `supabase_migrations.schema_migrations`. |

Recheck the ledger against the exact approved SHA before 11B. Stop for an unexpected remote-only version, a gap in the applied prefix, an unverified project ref, or unreviewed drift. The observed pending set is listed below in application order.

| Version | Dependency and lock review |
| --- | --- |
| `20261104051851` | Notification foundation, tables, RLS, gate and indexes. |
| `20261104061414` | Notification lifecycle, indexes and triggers on Sessions, Schedules and Tasks. Review concurrent Task writes. |
| `20261104090451` | Dispatch, claim/reconcile RPCs and lease index. |
| `20261106061100` | Resend persistence, alters deliveries and adds uniqueness/correlation indexes. |
| `20261106070838` | Unsubscribe and suppression. |
| `20261106080118` | Controlled worker and immutable payload boundary. |
| `20261106190648` | Focus attribution, unique constraint on existing `focus_sessions` and Task delete trigger. Plan around the existing-table constraint build. |
| `20261107062738` | Focus launch RPCs and grants. |
| `20261107074822` | Operational snapshot and five regular indexes. Index creation can block writes on populated targets. |
| `20261107114955` | Service-role 429 outcome RPC. Requires existing durable delivery state and worker contract. |

The foundation and Task-close migrations are already applied on staging. PostgreSQL 17.6 reported `btree_gist` 1.7, `pgcrypto` 1.3, `pg_cron` 1.6.4 and `vector` 0.8.2. The staging catalog measured total relation sizes of 232 KiB for Tasks, 144 KiB for Focus Sessions and 64 KiB for Study Sessions. No waiting database locks were observed in the point-in-time read. This does not establish a migration duration or a safe lock budget.

All five Study Schedule tables had RLS enabled with an authenticated owner-only SELECT policy, no anonymous SELECT and no authenticated direct insert, update or delete privileges. The create, revise and reschedule RPC grants allowed authenticated execution and denied anonymous execution. Sweep execution was service-role only among the checked roles. Sweep was OFF, with zero matching Cron jobs. Dispatch and the operational snapshot RPC were absent on the current schema.

The linked CLI security advisor returned 15 warnings: one mutable search path, six anonymous and seven authenticated security-definer findings, and one for leaked password protection. The advisor flagged anonymous `ls_revise_schedule`, while the live catalog showed the sole signature denied anonymous execution. Resolve the discrepancy with a fresh advisor read and an anonymous PostgREST boundary check before acceptance. The authenticated advisor findings included `ls_start_study_session` and `ls_skip_study_session`. These RPCs intentionally support signed-in callers, and their ownership checks still require staging acceptance. [Supabase security-definer advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)

Before approval, agree an application write window for existing-table DDL and verify lock budgets and recovery steps. Keep deployment gates OFF. After an authorized migration in 11B, verify history, RLS, grants, PostgREST signature exposure, owner isolation and service-role-only RPC access on the new schema, and rerun security advisors. The prior production catalog had no Study Session table, Dispatch gate, Sweep gate or operational snapshot RPC. Its separate security advisor read reported one RLS-without-policy info and 62 signed-in security-definer warnings. [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) · [Security definer advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

Rollback is disable-first and application-only. Confirm the exact prior staging artifacts against the post-migration schema with representative reads and writes, preserving the ledger and data. The distinct Phase 10 rollback was local. Stage-specific compatibility is still open.
