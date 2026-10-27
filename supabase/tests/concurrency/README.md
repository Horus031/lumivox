# Learning Schedule real concurrency (LOCAL ONLY)

Run from the repository root with Node.js and Docker Desktop:

```powershell
node scripts/test-learning-schedule-concurrency.mjs --iterations 3
```

The harness uses three independent `psql` processes inside
`supabase_db_lumivox-proj`. It accepts no remote database URL and needs no host
PostgreSQL client or new application dependencies. Local Supabase must already
be running with all current migrations applied. It does not reset the database.

The setup SQL commits the exact fixture IDs specified in Step 3.5D-B. The harness
checks fixture identity before setup/cleanup, repeats each scenario three times,
and removes only this fixture Task/user afterward. Do not run pgTAP concurrently
with this harness: earlier tests reuse some fixture IDs.

Each controlled race holds a Task lock on A, starts B, and uses an observer
connection to assert that `pg_blocking_pids(B)` contains A before releasing it.
Both RPC operations then run as the authenticated fixture owner. Every
postcondition is read through the independent observer after COMMIT/ROLLBACK.
This checks deterministic interleavings, not arbitrary load or every isolation
level. Audit-failure checks cover reschedule, revision and Task-close.

Timeouts: 5-second lock timeout, 10-second statement timeout and a 15-second
client deadline per command. Results, backend PIDs, SQLSTATEs and final fixture
snapshots are written to `docs/learning-schedule/concurrency-results.json`.

For manual setup against a verified local DB only:

```powershell
psql $env:DB_URL -v ON_ERROR_STOP=1 -v LS_CONCURRENCY_SETUP=1 -f supabase/tests/concurrency/learning_schedule_setup.sql
```

Without the opt-in variable, the setup SQL emits a TAP SKIP plan, so normal
`supabase test db --local` discovery cannot accidentally persist these fixtures.
