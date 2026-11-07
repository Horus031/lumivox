# Learning Schedule operational release checklist

- [ ] Record application SHA, migration count/head and local drill results in the [phase evidence](../phase-10-evidence.md).
- [ ] Verify the intended environment, access to the monitoring secret and the distinct dispatch credential. Confirm unauthorized access fails and shared output contains only aggregates.
- [ ] Run OR-01 through OR-12 on disposable local Supabase. Verify an observed blocker for the claim fence, zero new submissions before handoff, and a persisted outcome after handoff.
- [ ] Verify that expired pre-handoff leases can reconcile, uncertain attempts remain held after re-enable, and unmatched receipts are visible.
- [ ] Verify fail-closed diagnostics during database and application outages and recovery after service returns.
- [ ] Record rollback target compatibility, persisted data and unchanged migration history. Record explicitly whether the rehearsal restarted the baseline or swapped distinct artifacts.
- [ ] Record post-drill cleanup, both DB gates OFF, no reminder Cron, no external provider requests, and all regression results.
- [ ] Before staging or release, get release-owner approval for deployment identity, migration replay, a compatible rollback artifact, the separate controlled live Resend gate, and monitoring/rollback ownership.
