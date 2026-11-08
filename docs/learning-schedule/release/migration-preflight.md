# Migration preflight

| Source | Observed migration history |
| --- | --- |
| Feature candidate `312cafe` | 94 versioned files. Phase 10 recorded clean local replay of all 94. |
| GitHub `product-release` / `main` | 84 / 70 files at the observed branch tips. These are repository counts. |
| Production project `lslybjylsxtnznghrtyj` | 70 applied, head `20261022062822_extension_distraction_atomic_confirm`. All 70 IDs are in the candidate. The 24 candidate-only versions are a comparison, outside this staging plan. |
| Staging web target `atbdbbamqjmfkvahqidj` | **UNKNOWN**. The connector denied access to migration history and advisors. Confirm this is also the workflow migration target, then read the ledger with approved read access. Pending count is unknown. |

Compare staging against the exact candidate SHA by migration version. Stop for an unexpected remote-only version, a gap in the applied prefix, an unverified project ref, or unreviewed drift. Preserve numeric file order. If staging matches the 84-file release branch, the following ten migrations are the candidate tail. If staging is older, first apply the missing earlier migrations in order, from the foundation through late recovery. Determine the actual set before 11B.

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

If the foundational prefix is pending, `20261027060524` adds a unique constraint on existing Tasks and `20261027063026` requires `btree_gist` for exclusion. The Task-close migration adds a trigger to Tasks. Existing-stack prerequisites include `pgcrypto`, `vector` and `pg_cron`. Check extension availability and permissions on staging. The observed production subset included `pgcrypto` and `pg_cron`; `btree_gist` was absent from installed extensions.

Before approval, measure table/index sizes and review blockers through staging catalogs. Agree an application write window for existing-table DDL and verify lock budgets and recovery steps. Keep deployment gates OFF. After an authorized migration in 11B, verify history, RLS, grants, PostgREST signature exposure, owner isolation and service-role-only RPC access on the new schema. Run staging security advisors before and after. The observed production catalog had no Study Session table, Dispatch gate, Sweep gate or operational snapshot RPC. The production security advisor reported one RLS-without-policy info and 62 signed-in security-definer warnings. These findings are scoped to production and were not inspected as staging findings. [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) · [Security definer advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

Rollback is disable-first and application-only. Confirm the exact prior staging artifacts against the post-migration schema with representative reads and writes, preserving the ledger and data. The distinct Phase 10 rollback was local. Stage-specific compatibility is still open.
