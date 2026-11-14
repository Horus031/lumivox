# Phase 11C.5 operational readiness

Staging audit on 2026-11-13 for `39177f576f87b0ef8210817f3fdb4ef3c85e153d`. Hosted checks used read-only access.

## SE-03 · Runtime safety gates

| Check                        | Observed                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Staging             | Dispatch OFF, Missed Sweep OFF, zero reminder Cron matches by job name or command, zero deliveries and zero webhook receipts.                                                                                                                         |
| Vercel Preview configuration | The project-wide Preview variable `STUDY_REMINDER_REAL_SEND_ENABLED` returned `false`. Its last update predates the active deployment, and the branch-filtered query returned no `product-release` override.                                          |
| Active deployment runtime    | **Unverified directly.** Configuration and deployment timestamps support OFF. The running function's effective value was not observed through a deployment-specific runtime check. The authenticated dispatch endpoint was not invoked in this audit. |

Vercel environment edits apply to subsequent deployments. Recheck the effective setting on the selected artifact before re-enabling any worker. [Vercel environment variables](https://vercel.com/docs/environment-variables)

## SE-04 · Database consistency

- The 96 Staging ledger versions exactly matched the 96 tracked migration filenames at the candidate SHA. The head was `20261111071219`. The diff from the previous Staging SHA contains no schema changes. This verifies migration history and the sampled catalog objects. A full schema diff was not run.
- RLS was enabled on all 11 inspected notification and Sweep control tables. Browser roles had no table write grants in the inspected scope. Authenticated reads on preferences and task overrides were restricted by owner policies. The privileged claim, handoff, rate-limit, outcome, lease reconcile, token consume and webhook ingestion signatures were executable by `service_role` and denied to `anon` and `authenticated`.
- Staging Security Advisor reported nine informational RLS-without-policy findings across the project. Seven were notification internals or a gate with restricted browser grants. It also reported a mutable search path for `public.set_updated_at`, callable SECURITY DEFINER warnings for other endpoints including intended authenticated Learning Schedule actions, and leaked-password protection disabled. No inspected dispatch, recovery or ingestion RPC was flagged as browser-executable. Review the wider findings in the production security audit. [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) · [Function grants advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## SE-05 · Kill switch and rollback

Follow the [kill switch runbook](../operations/rollback-and-kill-switches.md) and [incident runbooks](../operations/incident-runbooks.md).

1. The incident lead coordinates the hold. A Staging DB operator with `postgres` privileges can stop both persisted gates. The catalog confirmed `service_role` can update Dispatch and lacks Sweep update privilege. Verify the committed gate state and retain any already-authorized handoff for outcome reconciliation.
2. An authorized Vercel project operator sets the Preview real-send flag to `false`, deploys the approved artifact with that configuration and verifies effective OFF before resuming. The database Dispatch gate provides the immediate submission fence while the deployment is prepared.
3. The immediately preceding paired rollback candidates are Vercel `dpl_AzyhznjAnauzvELk3SbZEdUhZVgL` (READY) and Render `dep-dbrc4fk9v7es73c5inog` (deactivated after replacement), both at `ddf415f610894e43f8c43e7effcc221d85f8b6d3`. Their web source, API source and migration tree match the candidate. Source compatibility is established for that pair. Deployment configuration, rollback permissions and rollback execution remain unverified. Confirm both targets and the database identity before an incident rollback, preserve migrations, and verify health and gates after the switch. [Prior Vercel artifact](https://vercel.com/horus-projects-672b8c47/lumivox/AzyhznjAnauzvELk3SbZEdUhZVgL) · [Render deploy history](https://dashboard.render.com/web/srv-daqdto0jo6nc73e3kme0/deploys) · [Render rollback behavior](https://render.com/docs/rollbacks)
4. The reminder worker on-call investigates uncertain deliveries with the incident lead and escalates to provider support where needed. Named on-call coverage and operator access were not independently verified. No rollback, gate change or deployment was performed in this checkpoint.

## SE-06 · Observability

The Staging operational snapshot RPC returned zero pending due jobs, active or expired leases, uncertain attempts, unmatched webhooks, accepted submissions and delivery failures in their respective windows. The internal health route and operator CLI are present. Authenticated Staging monitoring ingress and alert delivery were not exercised.

| Signal                           | Detection and investigation                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Uncertain delivery               | `inspect-uncertain` and health alert `uncertain_submissions`. Hold the attempt and correlate the original handoff against a verified receipt or trusted provider outcome.                                                                                                      |
| Failed job and exhausted retries | Snapshot `deliveryFailures24h` for aggregate signal. In a restricted DB read, inspect failed jobs with `attempt_count >= 3` and correlate the last delivery outcome to distinguish exhaustion from a hold or definitive rejection.                                             |
| Rate-limited                     | Restricted DB read of delivery `error_code = 'rate_limited'` and the job's `next_attempt_at` and `attempt_count`. The snapshot has no dedicated rate-limit alert.                                                                                                              |
| Bounced or complained            | Restricted delivery-status and webhook receipt correlation. Review the resulting suppression through the trusted provider path.                                                                                                                                                |
| Signature or persistence failure | Signature verification returns `401 invalid_signature`; check sanitized HTTP status or provider webhook attempt logs. Check handler failures and use `inspect-webhooks` for persisted unmatched receipts. The receipt count alone misses requests rejected before persistence. |
| Expired jobs and leases          | `inspect-queue` and repeated snapshot observations for expired leases. Use a restricted job-status aggregate for terminal `expired` jobs. Hold expired post-handoff attempts for review.                                                                                       |

Use counts and sanitized state in the incident record. Keep recipient and capability data in restricted incident access.
