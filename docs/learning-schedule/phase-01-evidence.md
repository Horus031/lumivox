# Phase 01 — Foundation Evidence and Review Checklist

- Initiative: Lumivox Learning Schedule & Smart Reminders
- Date prepared: 2026-10-27
- Working branch: `feature/learning-schedule-foundation`
- Verified initial baseline commit: `fb2d8fe5e84fcc19033eba463976550129a8d99a`
- Phase state: **IN PROGRESS — awaiting commit, CI and detailed review**

## 1. Git baseline verification

The GitHub connector comparison at the start of Phase 01 confirmed:

- `main` compared to `product-release`: `identical`, ahead 0, behind 0.
- `product-release` compared to `feature/learning-schedule-foundation`: `identical`, ahead 0, behind 0.
- All three pointed to `fb2d8fe5e84fcc19033eba463976550129a8d99a` at that time.

This is historical Git verification at the stated point in time, not a claim about current deployed running SHA or subsequent commits. Recheck comparison after documentation push.

## 2. Inspected source contracts

| Area | Observed baseline file | Finding |
|---|---|---|
| Task types | `apps/web/features/tasks/task.types.ts` | Task generated from Supabase DB row; links Goal |
| Task schemas | `apps/web/features/tasks/task.schemas.ts` | create/update schema includes title, description, goal, priority, estimated minutes, dueAt; no recurring schedule |
| Task mutations | `apps/web/features/tasks/task.actions.ts` | authenticated CRUD/transition, concurrency via status/updated_at |
| Task transition | `apps/web/features/tasks/task-transition.ts` | overdue presentation derived from deadline; direct status transition rules |
| Task model | `supabase/migrations/20260514043306_init_lumivox_core_schema.sql` | tasks table and original focus_sessions |
| Focus V2 | `apps/web/features/focus-sessions/focus-v2.queries.ts` | task-linked Focus, plan and segment data |
| Engagement | `apps/web/features/engagement-retention/engagement-retention.background.ts` | activity types Task/Focus only; deferred recalculation |
| Cron | `supabase/migrations/20260924064735_phase4_engagement_cron.sql` | pg_cron enabled/scheduled for engagement |
| Protected cron | `apps/web/app/api/cron/native-task-risk/route.ts` | CRON_SECRET protected route for native risk |
| Delivery | `docs/ci-cd.md` | separated staging/production; migration + deploy + E2E pipeline |

Known limits: full live production/staging schemas, environment values, Resend configuration and cron runtime were not independently verified as part of writing these docs.

## 3. Artifacts supplied for review

- [ ] `architecture.md`
- [ ] `business-rules.md`
- [ ] `data-model.md`
- [ ] `session-state-machine.md`
- [ ] `notification-architecture.md`
- [ ] `test-matrix.md`
- [ ] `phase-01-evidence.md`

Mark these checked only after committing the exact files and reviewing their contents on GitHub.

## 4. Pending design decisions and verification

- [ ] Verify current final `tasks` schema / subtask constraints against **all** migrations after initial schema.
- [ ] Validate timezone and DST implementation/library available in current Next.js environment.
- [ ] Confirm study scheduling limit defaults (max dates/slots/occurrences) and test threshold cases.
- [ ] Confirm proposed 60-minute miss grace period and 7-local-day recovery window as accepted product policy.
- [ ] Specify exact Phase 02 active-occurrence uniqueness constraint and reschedule identity approach.
- [ ] Select strict atomic Task-close -> future occurrence cancellation mechanism.
- [ ] Check Focus V2 schema/transition behavior thoroughly before Phase 09.
- [ ] Validate Resend/cron provider features and credentials only in appropriate later implementation phases.

A pending decision must not be reported as a verified implementation fact.

## 5. Recommended verification commands

From repository root:

```bash
git fetch origin
git branch --show-current
git rev-parse HEAD
git status --short
git diff --check
git ls-files docs/learning-schedule/
```

Then after writing/reviewing docs:

```bash
git add docs/learning-schedule/
git diff --cached --check
git diff --cached --stat
git commit -m "docs(learning-schedule): define phase 01 architecture and contracts"
git push origin feature/learning-schedule-foundation
```

No schema mutation or production release is part of Phase 01. Run normal documentation/content checks if required by CI.

## 6. PASS criteria (do not pre-check)

- [x] Baseline branch equality confirmed at phase start.
- [ ] Seven complete documents committed and visible on branch.
- [ ] Business rules unambiguous: roots, recurrence, DST, attendance, missed/recovery, Task close, schedule revisions.
- [ ] ERD/data contract, owner isolation, event idempotency and transaction boundaries approved.
- [ ] Notification consent/quiet hours/retry/webhook/suppression architecture approved.
- [ ] All release-critical P0 cases present in test matrix and assigned to implementation phase.
- [ ] Source references checked for current branch and documented deviations resolved.
- [ ] CI/status and reviewer verification complete.

**Final decision:** PENDING. Reviewer records PASS / CHANGES REQUESTED, date, SHA and identified deviations after push.

## 7. Future phase preparation

On PASS, Phase 02 begins by converting `data-model.md` into forward-only migrations, ownership/RLS tests and regenerated TypeScript DB types. Feature and email automation remain disabled until their own release gates. Avoid modifying `main` or `product-release` as part of this documentation-only review.
