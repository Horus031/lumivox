# RAG Conversation V2 — Phase 2 Evidence

## Objective

Introduce transactional conversation persistence, secure session ownership, idempotent turn processing, and conversation restoration.

## Implementation

- Keep legacy sessions at version 1. Version 2 adds turns, reservation leases, completed-turn counts, and storage for future summaries.
- Reserve, complete, and fail turns through service-role-only RPCs. A successful completion writes both messages and increments the session count in one transaction.
- Validate ownership and document access on reserve, replay, complete, and restore. The message SELECT policy also checks current document access. Only the internal service can execute the document retrieval RPC that accepts a user ID.
- Restore completed messages in Focus Workspace. Show restore status, completed-turn count, locked document scope, and retry feedback in English and Vietnamese.
- Preserve the logical request ID and payload for retries with an uncertain outcome. Require a new ID after a confirmed failure.
- Keep the feature flag off by default. When it is off, a supplied session ID must belong to an existing version 1 session owned by the caller.

## Verification

| Verification | Result |
| --- | --- |
| Migration replay | `supabase db reset` and `supabase migration list --local` passed on an isolated PostgreSQL 17.12 stack. All 101 migrations applied, including `20261126043902`. |
| Database security and transaction atomicity | `supabase test db` passed with 1,131 assertions across 40 files, including 44 assertions covering DB01–DB22. The persistent Learning Schedule fixture reported its expected skip. The RAG matrix covers direct reads after permission revocation and rollback after both message inserts. |
| Database security advisors | The isolated database audit reported zero RAG findings and one warning for the existing `public.set_updated_at` function's mutable search path. |
| Concurrent reservation | Both races passed on independent PostgreSQL connections. Distinct IDs left one processing turn. Duplicate IDs returned the same turn, with a lease only for the first reservation. CI is configured to run both. |
| Generated TypeScript types | Generated from the replayed local schema in UTF-8 without BOM. The four RAG tables and four RAG RPC entries match the generated output. Unrelated generator ordering and formatting changes were excluded from the diff. |
| Backend compile and tests | `compileall` passed. 11 targeted service tests and all 136 backend tests passed. Route tests cover flag routing, request ID validation, and provider error redaction. |
| Frontend regression tests | 45 RAG tests passed, including the Phase 1 Markdown tests. The full suite passed with 1,246 passed and 26 skipped using four workers and a 15-second test timeout. |
| Frontend lint and TypeScript | Passed. ESLint reported four warnings in files outside the Phase 2 changes. |
| Production build | Passed. Next.js compiled the Focus route and generated all 109 static pages. The first concurrent attempt ran out of memory. The isolated retry used a 4 GB Node heap and skipped the prebuild cache cleanup to preserve the running dev server. |
| Conversation restoration | React tests passed for ordered history, empty history, blocked submits during restore and after failure, and stale restore responses after changing Focus Session. |
| Idempotency and ownership | Covered by pgTAP, backend service tests, and React retry regressions. |
| Feature flag rollback | Legacy routing and session version isolation passed automated tests. Browser smoke testing is pending. |
| Local browser QA | Opened the protected Focus Workspace URL and reached the login page. The in-app browser had no authenticated local QA session. Live provider calls, refresh, concurrent tabs, and browser rollback were not verified in this pass. |
| GitHub Actions CI and staging | Pending. |

## Data consistency checks

Ran the four checks from the implementation guide in a read-only transaction on the existing local development database. It contained one version 2 session and four completed version 2 turns at the time of the check.

| Check | Violations |
| --- | --- |
| Completed turns without exactly two messages | 0 |
| Failed turns with persisted messages | 0 |
| Version 2 sessions with inconsistent completed-turn counts | 0 |
| Sessions with multiple processing turns | 0 |

## Compatibility

Existing version 1 sessions remain version 1. Version 2 uses new reservations and completed turns. Historical messages are excluded from model memory. Embedding models and document chunking are unchanged.

## Limitations

- Restore reads the latest 100 completed turns through separate queries. A single consistent snapshot RPC remains follow-up work.
- Phase 2 does not add conversation history to the prompt, persist provider token usage, generate rolling summaries, or hand off conversations.
- Later reservations recover expired leases. A provider may still execute more than once if a request's outcome is uncertain.

## Release Decision

Pending local browser QA, GitHub Actions, and staging smoke tests. Apply the migration on staging first, deploy FastAPI with the flag disabled, then deploy Next.js. Verify the legacy flow before enabling V2 on staging. Keep the production flag disabled for Phase 2. Disabling the feature flag preserves the database schema and stored conversations.
