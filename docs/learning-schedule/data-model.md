# Learning Schedule — Proposed Data Model and Migration Contract

Status: Phase 01 logical design (NOT executable SQL). Existing migrations and generated `database.types.ts` remain authoritative until Phase 02 migration is reviewed.

## Conventions

- UUID primary keys; `user_id uuid not null` for owned data; `created_at`/`updated_at` in `timestamptz` when mutable.
- Session absolute instants are `timestamptz`; recurring local date/time are `date` / `time without time zone` with an IANA timezone string.
- ISO weekday is `1..7` (Monday..Sunday). State types are check constraints or enums selected consistently with current migration practices.
- Existing `tasks` remains authoritative for deadline, Task status, owner and Goal linkage.
- Every cross-table reference must preserve owner integrity, ideally via `(id, user_id)` UNIQUE on referenced tables and `(ref_id, user_id)` composite FK, combined with RLS.

## 1. `task_study_schedules`

| Column | Logical type | Constraint / role |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, owner |
| `task_id` | uuid | NOT NULL FK tasks; only root tasks |
| `starts_on` | date | inclusive range start |
| `ends_on` | date | inclusive range end, >= start |
| `timezone` | text | valid IANA timezone (validate at server and/or trusted DB mechanism) |
| `status` | text | `active`, `paused`, `closed` |
| `revision` | int | NOT NULL >= 1; optimistic concurrency token |
| `created_at`, `updated_at` | timestamptz | audit timestamps |

Only one current schedule per root Task in v1: `UNIQUE(task_id)` unless an archived multi-schedule policy is explicitly adopted. Root-only validation must be performed atomically (e.g. trigger/RPC); a normal FK cannot express `parent_task_id IS NULL`.

## 2. `task_study_schedule_slots`

| Column | Logical type | Constraint / role |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | owner, matches schedule |
| `schedule_id` | uuid | parent FK |
| `weekday` | smallint | CHECK 1..7 |
| `start_time` | time | local time |
| `end_time` | time | strictly greater than start, v1 same-day |
| `created_at` | timestamptz | audit |

Unique `(schedule_id, weekday, start_time, end_time)` and guard against overlapping intervals **within schedule weekday**, including overlapping slots with distinct boundaries. Revision changes should snapshot old slots in schedule revision history or immutable events.

## 3. `task_study_sessions`

| Column | Logical type | Constraint / role |
|---|---|---|
| `id` | uuid | PK |
| `user_id`, `task_id`, `schedule_id` | uuid | ownership-consistent relations |
| `schedule_revision` | int | generation revision |
| `source_slot_id` | uuid nullable | slot identity / historical provenance |
| `local_date` | date | recurrence local date |
| `local_start_time`, `local_end_time` | time | original local wall clock |
| `timezone` | text | immutable timezone used for generation |
| `scheduled_start_at`, `scheduled_end_at` | timestamptz | absolute UTC-instants |
| `status` | text | `scheduled`, `in_progress`, `completed`, `missed`, `skipped`, `cancelled` |
| `completed_at` | timestamptz nullable | actual confirmation timestamp |
| `actual_study_minutes` | int nullable | measured or self-reported, distinguish evidence source |
| `cancellation_reason` | text nullable | e.g. `schedule_changed`, `task_closed`, `manual` |
| `logical_occurrence_key` | text | stable identifier for one planned obligation |
| `replaces_session_id` | uuid nullable | link replacement after reschedule (if used) |
| `created_at`, `updated_at` | timestamptz | audit |

Constraints: `scheduled_end_at > scheduled_start_at`, `actual_study_minutes >= 0`, status-specific completion consistency and revision positive. Use stable occurrence identity **plus a partial unique index on live obligations** or equivalent, so history records can coexist with a replacement without two concurrently active occurrences for the same slot/date. The Phase 02 migration must specify the unique key exactly; never rely on a name-only suggestion from this document. Index `(user_id, scheduled_start_at)` and `(schedule_id, local_date)`.

## 4. `task_study_session_events`

Append-only audit table:

`id`, `user_id`, `session_id`, `event_type`, `from_status`, `to_status`, `actor_id` (nullable for trusted system), `event_key` (deduplication), `payload` (bounded JSON; no sensitive documents), `created_at`.

Examples: `created`, `started`, `completed`, `marked_missed`, `skipped`, `recovered`, `rescheduled`, `cancelled`, `correction`. Unique `(session_id, event_key)` for idempotent commands. No client direct UPDATE/DELETE; allow inserts via secure command path only. Event history is source of audit, session row the canonical latest state.

## 5. `task_study_schedule_revisions` (recommended)

`id`, `user_id`, `schedule_id`, `revision`, `starts_on`, `ends_on`, `timezone`, `slots_snapshot` (validated JSON), `changed_by`, `change_reason`, `created_at`. Unique `(schedule_id, revision)`. Prefer this to losing past slot definitions upon edit.

## 6. `notification_preferences`

`user_id` PK/FK; `study_email_enabled` default false; `lead_minutes` constrained to [5,15,30,60], `quiet_hours_enabled` default false, `quiet_start_local`, `quiet_end_local`, `timezone`, `updated_at`. If per-Task override is supported, use a separate `(user_id, task_id)` preferences table or explicit nullable override with ownership checks. Enforce unsubscribe/suppression separately from user-selected preferences.

## 7. `notification_jobs` + `notification_deliveries`

Separate durable scheduling/claiming from individual provider send attempts:

**Jobs:** `id`, `user_id`, `session_id`, `schedule_revision`, `notification_type`, `due_at`, `status` (`pending`,`leased`,`sent`,`suppressed`,`expired`,`failed`), `lease_until`, `lease_token`, `attempt_count`, `next_attempt_at`, `idempotency_key`, `last_error_code`, `created_at`, `updated_at`. Unique `idempotency_key`; index `(status, next_attempt_at)`.

**Deliveries:** `id`, `job_id`, `user_id`, `provider`, `provider_message_id` nullable, `attempt_number`, `status` (`submitted`,`delivered`,`bounced`,`complained`,`failed`), `error_code`, `created_at`, `updated_at`; provider message ID indexed unique when present; append webhook receipt identifiers separately or ensure uniqueness on `(provider, provider_event_id)`.

Never place provider API keys or unencrypted message content in DB. Provider response and webhook may arrive in arbitrary order; use monotonic validated delivery state transitions.

## 8. Focus evidence integration (Phase 09)

Suggested `task_study_focus_links`: `user_id`, `study_session_id`, `focus_session_id`, `attributed_minutes`, `created_at`. Unique `(focus_session_id)` in v1 if one Focus belongs to at most one scheduled occurrence; add owner-consistent FKs. Only count completed/verified segments according to documented Focus V2 semantics. Do not reuse Task `completed_at` as attendance proof.

## 9. RLS and command security

- SELECT own schedules/slots/sessions/events/preferences; never other users'.
- Writes through authenticated actions/RPC checking `auth.uid()`, parent Task ownership, root Task rule, allowable transitions, expected revision and time bounds.
- Privileged cron role reads bounded eligible jobs using dedicated claim function; never allow public clients to enumerate email addresses or access delivery records across owners.
- Revoke direct mutations to append-only events and internal jobs from `anon` / generic `authenticated` role where appropriate. Test policies explicitly with owner A, owner B, anonymous and service role.
- Preserve strict staging/production separation and migrate only using tracked migrations.

## 10. Atomic operations

1. `create_schedule_with_sessions`: validate owner/Task, slots and timezone; generate bounded occurrences; insert schedule/revision/slots/sessions atomically.
2. `revise_schedule`: compare expected revision; snapshot old revision; cancel eligible future occurrences/jobs; create new slots/occurrences/jobs atomically; leave historical rows.
3. `complete_study_session`: compare expected status or idempotency key; transition; append event; suppress future reminder; return canonical row.
4. `claim_due_notification_jobs`: row-level locking / SKIP LOCKED; lease and attempts; batch cap; prevent concurrent double-claims.
5. `close_task_schedule`: triggered on Task completion/cancellation; cancel only future eligible occurrences/jobs.

## 11. Phase 02 migration checklist

- Create tables, FK ownership guarantees, indices, checks and RLS in forward-only migrations.
- Add DB validation for status-specific invariants and parent Task ownership.
- Protect state transitions and event inserts in transactions.
- Regenerate `apps/web/types/database.types.ts` from target schema (verify actual location in branch).
- Replay from clean local Supabase and run tenant isolation tests.
- No actual reminder dispatch or production data backfill in Phase 02.
