# Staging deployment plan

**Decision: NO-GO for 11B.** This is an approval checklist for a later staging execution.

1. The owner confirmed Render and GitHub Actions point to `atbdbbamqjmfkvahqidj`. The 2026-11-08 read found 84 applied migrations and 10 pending. Recheck the ledger before execution. Review the staging advisor findings, confirm privilege boundaries, lock windows and reviewers, and capture the recovery point.
2. Verify critical configuration and credential separation, protected runner and operator access, and ownership for database, web, FastAPI and incident response. Keep Dispatch, Sweep and real send OFF. Confirm current staging deployment IDs and the distinct rollback artifacts against the expanded schema.
3. The pinned CLI and updated config passed the linked staging dry-run. Obtain explicit 11B approval before a push or merge that can trigger CD. Pin the approved SHA and run required CI. Confirm the staging environment, project ref and hook identity before authorizing any migration. Review the workflow migration preview and stop on unexpected drift.
4. In the approved staging window, use the existing staging workflow to apply ordered migrations and deploy the reviewed revision. Verify both runtime SHAs and validate RPC compatibility, owner isolation, RLS, protected health, schedule lifecycle and Focus integration. Keep live provider work for 11C.
5. On failure, hold writes where necessary and verify all gates OFF. Restore the approved prior application artifacts while retaining schema and migration history. Compare persisted data and verify protected health. [Kill switches and rollback](../operations/rollback-and-kill-switches.md)

The current Vercel and Render staging records both show SHA `fb2d8fe5`. Vercel also lists an older distinct READY Preview at `daaabc2a`, and Render lists a deactivated staging deploy for that revision. Artifact retention, restoration and compatibility with the final staging schema need confirmation before counting them as a rollback pair.
