# Phase 11C.5 release decision

**11C.5E audit: CONDITIONAL. Production email activation: NO-GO.** Candidate `39177f576f87b0ef8210817f3fdb4ef3c85e153d`, audited November 13, 2026. Proceed to 11C.6 readiness validation with the existing hold.

| Checkpoint | Decision | Basis |
| --- | --- | --- |
| SE-01 · Evidence | PASS | Executed local cases T01–T05, RL-01–RL-06, CR-01–CR-06 and CC-01–CC-08 linked to tested baselines. |
| SE-02 · CI/CD | PASS | GitHub CI and Staging CD succeeded. The deploy logs confirm checkout and both deployed revisions. Playwright passed with explicit skips. |
| SE-03 · Runtime gates | CONDITIONAL | Staging database gates OFF. Vercel Preview config verified false. Direct proof of the active runtime setting remains open. |
| SE-04 · Database | PASS for audited Staging scope | Ledger parity, targeted RLS and RPC grants verified. Broader advisor findings and full-schema drift checks remain outside the verified scope. |
| SE-05 · Kill switch and rollback | CONDITIONAL | Runbook and previous matched artifacts identified. Operator assignments, live configuration and rollback execution remain unverified. |
| SE-06 · Observability | CONDITIONAL | Staging database snapshot and source-level diagnostic paths verified. End-to-end monitor and alert delivery remain unverified. |
| SE-07 · Blockers | PASS for documentation | Outstanding production blockers recorded below. |
| SE-08 · Release decision | Production NO-GO | Public unsubscribe ingress, deliverability and operational validation remain open. |

## Production blockers

| Item | Classification and exit evidence |
| --- | --- |
| Public RFC 8058 one-click unsubscribe ingress | Activation blocker. Historical Staging requests without bypass encountered Vercel Authentication redirect. In 11C.6, prove the public POST path reaches the application without a Vercel cookie, bypass or login, and validate the consent outcome with an approved test fixture. |
| TD-11C-01 · Gmail Spam | Deliverability blocker for expansion. The test email reached Gmail Spam despite reported SPF, DKIM and DMARC PASS. Capture representative inbox placement evidence and an operator decision before expanding recipients. |
| Runtime and incident coverage | Activation blocker. Verify the effective real-send setting on the deployed artifact, name gate and incident operators, confirm rollback permissions/configuration, and exercise monitoring and escalation on the approved environment. |
| Production provenance | Production readiness requirement. Verify production artifact and database identity, migration history and applicable security advisor findings before activation. This checkpoint audited Staging. |

[Safety evidence and workflow links](phase-11c5-safety-evidence-matrix.md) · [Operational readiness and rollback candidates](phase-11c5-operational-readiness.md)
