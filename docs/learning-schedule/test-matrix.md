# Learning Schedule — Test Matrix and Quality Gates

Status: Phase 01 blueprint, implementation phases map scenarios into automated tests. Prefixes: `UT` unit, `DB` DB/RLS integration, `IT` service integration, `E2E` browser, `OPS` reliability/release. `P0` blocks release; `P1` should be covered before GA.

## Phase coverage

| Phase | Test responsibility |
|---|---|
| 02 | clean migration replay, schema constraints, RLS/ownership |
| 03 | recurrence calculations, DST, revisions, race-safe persistence |
| 04 | Task create/edit UX, compatibility, responsive/i18n |
| 05 | attendance transitions, recovery, event idempotency |
| 06 | analytics denominator/numerator/calendar, Today's Plan |
| 07 | notification outbox, leases, retries, fake provider |
| 08 | Resend template, webhook, suppression, unsubscribe |
| 09 | Focus linkage, time attribution, Engagement regressions |
| 10 | full staging E2E, security/load/failure injection |
| 11 | production smoke, flags, rollback and monitoring |

## Functional and compatibility cases

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| UT-001 | P0 | Create/edit unscheduled Task | identical pre-feature behavior |
| IT-002 | P0 | Root Task schedule with Mon/Wed/Fri | correct dated occurrences in inclusive range |
| UT-003 | P0 | Two valid slots in one weekday | both generated distinctly |
| UT-004 | P0 | Duplicate slot/overlapping same-Task slots | validation failure |
| UT-005 | P0 | Invalid end <= start, inverted dates | validation failure |
| UT-006 | P0 | Non-IANA or malformed timezone | validation failure |
| UT-007 | P0 | DST spring-forward nonexistent time | explicit rejection |
| UT-008 | P0 | DST fall-back ambiguous time | earlier offset deterministically chosen |
| UT-009 | P0 | Timezone across month/year boundary | correct local day and UTC instants |
| UT-010 | P1 | Different-Task overlap | warning without forced block |
| IT-011 | P0 | Change weekday/time after past completions | past/terminal unchanged, future regenerated, revision increments |
| IT-012 | P0 | Two editors same revision | exactly one succeeds; stale conflict |
| IT-013 | P0 | Close Task with future sessions | future cancelled, history retained, pending reminders invalidated |
| IT-014 | P0 | Reopen closed Task | no silent restoration of cancelled sessions |
| E2E-015 | P0 | Task create/edit schedule and preview | user sees matching saved occurrences |
| E2E-016 | P1 | Accessibility and mobile layouts | keyboard, screen reader names, responsive UI |
| E2E-017 | P1 | EN/VI labels and local times | correct localized presentation |

## Attendance and analytics

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| IT-020 | P0 | Manual complete scheduled occurrence | completed_at and one event recorded |
| IT-021 | P0 | Double-submit same command | idempotent, no duplicate event |
| IT-022 | P0 | Simultaneous complete and missed sweep | one legal outcome, complete audit |
| IT-023 | P0 | Missed cutoff before/at/after grace | boundary policy respected |
| IT-024 | P0 | Recover missed within 7 local days | completed (late), recovery event |
| IT-025 | P0 | Recover beyond window | rejected, no mutation |
| IT-026 | P0 | Skip does not count as completion | attendance numerator unchanged |
| UT-027 | P0 | 0 eligible due sessions | rate displayed N/A |
| UT-028 | P0 | 8 completed / 12 due | attendance 66.67% (display rounding documented) |
| UT-029 | P0 | Late completed | attendance yes; on-time no |
| UT-030 | P0 | Future sessions | not marked missed; excluded from due-only denominator |
| UT-031 | P0 | Future occurrence proactively cancelled before start | excluded from eligible due |
| UT-032 | P0 | Local day grouping near UTC midnight | grouped in schedule timezone |
| E2E-033 | P1 | Today plan / history / calendar empty states | readable, accessible, consistent |

## Security and tenancy

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| DB-040 | P0 | User B query A's session/slot/event | no visibility |
| DB-041 | P0 | User B mutate A's schedule/session | denied |
| DB-042 | P0 | Cross-owner task-to-schedule FK | rejected |
| DB-043 | P0 | Attempt direct write to audit event/internal job | denied |
| IT-044 | P0 | Anonymous schedule API | 401/authorized denial |
| IT-045 | P0 | Cron invalid/missing token | rejected with no claimed jobs |
| IT-046 | P0 | Webhook invalid signature or replay | denied or safely deduped |
| IT-047 | P0 | Email template malicious task title HTML | escaped; no injection |

## Notification reliability

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| IT-050 | P0 | Existing user did not opt in | no email job sent |
| IT-051 | P0 | Verified opt-in, valid upcoming occurrence | correctly due job created |
| IT-052 | P0 | Task closed after job scheduled | suppressed at final eligibility check |
| IT-053 | P0 | Schedule rescheduled | old job invalidated, new due time |
| IT-054 | P0 | Concurrent cron workers claim same batch | exactly one active lease per job |
| IT-055 | P0 | Timeout after uncertain provider acceptance | no unsafe unconditional duplicate resend |
| IT-056 | P0 | Transient 429/5xx | bounded backoff and expiry before session start |
| IT-057 | P0 | Hard bounce/complaint | recipient suppressed; no automatic re-enable |
| IT-058 | P0 | Duplicate/out-of-order webhook | deduped, state not regressed |
| IT-059 | P0 | Quiet hours wraps midnight | suppressed correctly in configured timezone |
| IT-060 | P0 | Unsubscribe | disables future sends, including already queued jobs |
| IT-061 | P0 | Unverified email / changed destination | no send until verification |
| IT-062 | P0 | Staging with non-allowlisted address | no real email sent |
| OPS-063 | P0 | Email kill switch during backlog | no new provider sends |
| OPS-064 | P1 | Provider unavailable, lease expires | controlled reconciliation with telemetry |
| IT-065 | P1 | Two tasks starting together | default one email/job per session, rate cap enforced; digest deferred |

## Focus and engagement

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| IT-070 | P0 | Focus tied to Task but not Study Session | existing behavior preserved |
| IT-071 | P0 | Focus linked to specific occurrence | owner-checked single attribution |
| IT-072 | P0 | Multiple segments of same Focus | no duplicate attributed minutes |
| IT-073 | P0 | Focus ends without attendance confirmation | Study Session remains noncompleted |
| IT-074 | P0 | Complete Study Session | parent Task unchanged |
| IT-075 | P0 | Existing streak/PBI regression suite | metrics not accidentally inflated |

## Release gates

**Phase 01:** seven docs reviewed, no contradictory invariants, all P0 scenarios mapped to phases, baseline documented.

**Every implementation phase:** lint, unit tests, production build, Python test suite (when impacted), local clean DB migration replay when schema touched, targeted tests, PR review.

**Staging:** exact SHA verification, migrations, Playwright, fake-provider and restricted live-email E2E, load/concurrency/failure injection, accessibility, browser timezone cases.

**Production:** approved release, env isolation, sender/domain verification, per-feature flags, monitoring dashboards, canary opt-in group, kill switch tested, production smoke, documented forward-fix strategy.

## Evidence template for future phases

Include: tested commit SHA and branch, environment, commands/results, test IDs, migration versions, screenshots where meaningful, failure modes, open risks, reviewer decision and rollout readiness. Do not mark tests PASS without execution evidence.
