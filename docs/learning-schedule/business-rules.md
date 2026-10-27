# Learning Schedule — Product & Business Rules

- Status: Proposed Phase 01 baseline; implementation must match or document a reviewed amendment.
- Weekday convention: ISO 8601 (`1=Monday ... 7=Sunday`).

## 1. Eligibility and creation

- BR-001: Any authenticated owner can create/edit a normal Task without a study schedule; behavior is unchanged.
- BR-002: v1 schedules can be attached to **root Tasks only** (`parent_task_id IS NULL`). A Task has at most one active schedule. Subtasks do not independently schedule.
- BR-003: Only `todo` or `in_progress` root Tasks can create/activate a schedule. Completed/cancelled/in-review Task remains viewable, not schedulable until valid Task reopening.
- BR-004: Date range is inclusive: `starts_on <= session.local_date <= ends_on`. Must be finite; server enforces configurable limits.
- BR-005: A schedule has one valid IANA timezone and at least one weekly slot; each slot has weekday and same-day `start_time < end_time`. Multiple slots/day allowed; exact duplicate slots rejected.
- BR-006: Overlapping slots within the same Task rejected in v1; overlapping sessions from **different** Tasks yield a nonblocking conflict warning. No overnight slots in v1.
- BR-007: Deadline `tasks.due_at` is independent of schedule end. Neither automatically overwrites the other.

## 2. Time and recurrence

- BR-010: Local recurrence means 'at the same wall-clock time in the saved IANA timezone', not every 7 × 24 UTC hours.
- BR-011: Occurrences are generated deterministically for every matching local date/slot in the inclusive range, subject to cap. Stored start/end instants are UTC `timestamptz` and carry original local date/time/zone metadata for audit.
- BR-012: DST nonexistent local times (spring-forward gap): reject the schedule if any generated occurrence is nonexistent, with an actionable validation message. DST ambiguous times (fall-back fold): choose the **earlier** valid offset deterministically and capture the selected UTC instant. Document this behavior in UI/help.
- BR-013: Preview may run client-side for UX, but authoritative generation and validation happen server-side.
- BR-014: No historical occurrences may be created by default from before schedule creation. User may select a start date in the past only if supported explicitly by a reviewed backfill policy; v1 creation requires `starts_on >= today in schedule timezone`.

## 3. Session statuses and attendance

- BR-020: Persisted session states: `scheduled`, `in_progress`, `completed`, `missed`, `skipped`, `cancelled`. `rescheduled` is an audit event, not a terminal state.
- BR-021: Time passing does **not** imply studying. A session is `completed` only after explicit authorized manual confirmation; Focus-assisted UX may suggest, not perform, confirmation.
- BR-022: Mark a nonterminal session `missed` after its scheduled end plus **60-minute grace period**, if not otherwise closed. Grace is product policy; implement as versioned configuration and use the same predicate in UI/cron/analytics. A session before the grace cutoff is not missed.
- BR-023: User may explicitly `skip` a scheduled/missed session with optional reason. `skipped` counts as an uncompleted planned obligation.
- BR-024: Late recovery: user can mark a missed or skipped session `completed` within **7 calendar days of its scheduled local date**. Record `completed_at`, `was_late`/derived lateness and an event. After the window, treat it as locked unless a future admin-safe correction workflow is approved.
- BR-025: `completed_at` is the actual confirmation time; never rewrite it to the originally scheduled time.
- BR-026: Client retries, concurrent clicks and race conditions must not generate duplicate completion events or count a session twice.
- BR-027: `actual_study_minutes` can reflect attributed Focus segments or clearly labeled manually reported minutes. Never assume planned duration equals time studied.

## 4. Changing, cancelling and reopening

- BR-030: Editing a schedule creates a new revision. Past, already started and terminal sessions remain as historical facts.
- BR-031: Only future `scheduled` occurrences may be replaced or cancelled by an edited recurrence. A currently in-progress session is protected; schedule edit must not erase or silently reschedule it.
- BR-032: Superseded future occurrences are marked `cancelled` with `schedule_changed` reason; replacement occurrences are generated with a new revision. Never physically delete committed occurrence history.
- BR-033: Rescheduling a single future occurrence retains stable occurrence identity where feasible and records previous/new times in an event; send eligibility uses new time only. If the implementation instead creates a replacement linked to the original, it must enforce exactly one active obligation and preserve ancestry.
- BR-034: Any schedule mutation must invalidate/cancel unsent jobs associated with superseded occurrence/revision. Already accepted email deliveries cannot be recalled.
- BR-035: When parent Task moves to `completed` or `cancelled`, future non-started occurrences and pending notifications are cancelled with cause, while history remains. Do not retroactively mark sessions completed.
- BR-036: Reopening a Task does **not** automatically resurrect previously cancelled occurrences. Explicit user confirmation of resumption/recreation is required.
- BR-037: Deleting a Task follows existing Task authorization and retention policy; linked session and email metadata must honor data retention/deletion policies. Do not expose orphaned personal data.

## 5. Analytics definitions

- BR-040: A calendar day is determined in the **schedule's timezone**, not the viewer device timezone or UTC date.
- BR-041: For a reporting period, eligible due occurrences are original planned obligations whose grace cutoff falls at/before `as_of`, excluding those proactively cancelled due to schedule change or Task closure before their start; count each logical obligation once.
- BR-042: `completed_due` = eligible due occurrences whose latest state is `completed` (including approved late recovery). `attendance_rate = completed_due / eligible_due` as a percentage. If denominator 0, display `N/A`, not 100% or 0%.
- BR-043: `on_time_rate` = eligible due occurrences completed by their scheduled end divided by eligible due; late completions remain completed for attendance but not on-time.
- BR-044: `planned_coverage` = total completed *eligible* scheduled occurrences divided by all eligible planned occurrences in the selected full schedule period; upcoming entries remain in denominator in this distinct metric. UI explicitly labels the difference from attendance rate.
- BR-045: `missed`, `skipped`, `scheduled`, `in_progress`, `completed`, `cancelled` have distinguishable presentation. Future sessions are never marked `missed` just for being incomplete.
- BR-046: A later correction can change historical reported analytics; keep audit records and do not imply that an earlier snapshot has never changed.
- BR-047: Task completion, attendance, Focus minutes and Engagement streak are **distinct** metrics. Phase 09 defines any coupling explicitly; no implicit scoring changes.

## 6. Daily plan and conflict alerts

- BR-050: Today's Study Plan lists sessions whose local scheduled date is today in their own schedule timezone; label displayed timezone. Allow quickly opening Task/Focus/check-in.
- BR-051: Conflicts across Tasks are warnings: show overlapping date/time and conflicting Task; don't prevent saving. Within the same Task, duplicate/overlapping weekly slots are rejected.
- BR-052: Client must handle empty state, locale, accessibility and mobile widths.

## 7. Reminder consent and notifications

- BR-060: Email reminders are **off by default**; existing accounts do not receive them without an affirmative opt-in.
- BR-061: User can choose lead time from `5, 15, 30, 60` minutes; default presented choice is 15 minutes, but nothing sends before opting in.
- BR-062: Send only to the current verified account email; do not treat user-input arbitrary email addresses as destinations. Recheck email validity/consent at dispatch time.
- BR-063: User can disable all study reminders globally and optionally per Task. Effective permission requires all applicable settings enabled and the session still eligible.
- BR-064: Quiet hours suppress sending. No automatic late catch-up after a quiet window for the initial release. Inform the learner that suppressed reminders will not be delayed.
- BR-065: A `completed`, `skipped`, `cancelled`, or otherwise ineligible occurrence must not trigger a new reminder. Recheck just before provider request.
- BR-066: Reschedules invalidate pending notifications tied to old occurrence revision. One logical reminder per occurrence/notification type/revision, with database uniqueness.
- BR-067: Hard bounces/complaints/unsubscribes cause suppression until user action and provider policy permit future sending. Verified sender, branded template, unsubscribe and privacy compliance are required.
- BR-068: Delivery confirmation is informational; not evidence of message being read or session completed. Temporary provider/network failure may retry within an explicit relevance window, after which expire the job.
- BR-069: Staging can only send to allowlisted test accounts; production sends only to opted-in verified addresses. Environments use separate secrets/providers/configuration.

## 8. Release invariants

- No implicit backfill or reminders for existing unscheduled Tasks.
- No email before explicit opt-in.
- No cross-user Task/Session/Email access.
- No silent Task status change after a session completion.
- No destructive rewrite of occurrence history on schedule edit.
- No scheduled job treated as exactly-once external email delivery.

## 9. Decision changes

Amend business rules via reviewed versioned change with affected tests, migrations and analytic definitions. Default durations/limits are proposed product decisions, not claims about existing Lumivox behavior; they may be tuned deliberately before Phase 02 implementation.
