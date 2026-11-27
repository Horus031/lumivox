# RAG Conversation V2 — Phase 6A Reliability and Recovery

## Objective

Recover Ask and New Chat across reloads, lost responses, expired leases, concurrent requests, and feature flag changes.

## Implementation

- The status endpoint returns operation metadata scoped to the authenticated account and Focus Session. Canonical restore supplies conversation content after the document authorization check.
- Canonical restore discovers live and expired Ask operations even when the browser journal is empty. Expired lease recovery takes the user, session, and turn locks before deciding whether to mark the turn failed.
- Browser storage keeps a versioned request reference for up to 24 hours. The recovery UI checks status with bounded polling, allows manual reconciliation, and lets the learner dismiss an unresolved local reference after confirmation.
- A known completion rejection is terminal after the failed state has been written. Uncertain completion keeps the original request identity available for reconciliation.
- The web restores the active conversation on lifecycle conflicts and keys replayed messages by persisted turn ID. It preserves the draft on stale-session rejection and leaves resubmission to the learner.
- Ask requires matching explicit protocol versions when the client supplies one. Continue with context uses the same rolling-memory policy at prepare and commit.
- Restore can be retried, empty restore preserves configured defaults, and the first successful turn replaces a generic New Chat title with a bounded excerpt.

## Verification

| Verification | Evidence |
| --- | --- |
| Migration replay | `db reset` and the local migration list confirmed `20261126121005` on an isolated Supabase stack at port 56722. |
| RPC privileges and generated types | All four new RPCs use invoker privileges. Anonymous and authenticated EXECUTE were false and service-role EXECUTE was true. The corresponding TypeScript entries matched generated UTF-8 output. |
| Database regression | 1,254 assertions passed across 44 pgTAP files, including 33 Phase 6A assertions covering REC01–REC25. |
| Transaction concurrency | All 18 scenarios passed, including the five recovery races. In the replay race, the permission revocation committed while the second connection waited on the session lock. The replay was denied after the lock became available. |
| Backend regression | `compileall` passed. All 245 pytest cases passed with four dependency warnings. |
| Browser journal, restore and protocol rollback | Automated tests verify account isolation, malformed storage, unavailable storage, guarded clearing, bounded polling, canonical restore, duplicate replay, and rollback without legacy generation. |
| Frontend lint, types and build | Lint, standalone TypeScript, and production build passed. Lint reported four existing warnings outside RAG. The local build skipped the prebuild cache cleanup. |
| Frontend full regression | All four Vitest shards passed with 1,282 tests passed and 26 skipped across 116 files. |
| GitHub Actions CI | Pending push. |
| Hosted browser QA | Pending staging deployment. |

## Failure Injection Evidence

The local run used FastAPI and real PostgreSQL RPCs. It injected connection loss through the test adapter and counted calls to a synthetic answer generator. React DOM tests exercised same-tab restore and replay behavior.

| Scenario | Durable state and recovery result | Generation and consistency |
| --- | --- | --- |
| Restore after reservation | Restore discovered the live processing request from server metadata. | One original generation call and zero automatic resubmissions. |
| Lost response after Ask commit | FastAPI reported an unknown outcome. Status returned completed, and restore returned the persisted transcript. | One generation call across initial Ask and replay. Exactly two messages and one completed turn. |
| Lost response after New Chat commit | Status returned completed, and restore loaded the canonical target. The same request ID replayed that target. | Fresh mode made zero generation calls. The target started with zero messages and zero completed turns. |
| Expired lease | Status moved from expired to failed after explicit recovery. | Recovery generated no answer. No messages were attached to the failed turn. |
| Completion versus expiry | A committed turn survived recovery. When expiry won, the late completion failed lease validation. | The completed turn retained its two messages. The expired turn had none. |
| Another tab changes the active session | Ask against the closed source returned a lifecycle conflict. Restore loaded the current target. | The stale Ask made zero generation calls. The web preserved the draft and awaited explicit submission. |

## Data Consistency

SQL on the synthetic run found zero expired processing turns, failed turns containing messages, completed turns missing a message pair, invalid session counters, processing turns in closed conversations, and duplicate active conversations.

## Security and Privacy

- The journal stores operation IDs, focus and session references, protocol and time. It stores no question, document payload, summary, lease token, or credential.
- Ask status checks the session documents. New Chat status checks the target documents and supports a fresh recovery even if access to the old documents was revoked.
- Content restore and completed Ask replay check current authorization. The replay race establishes the documented lock ordering for the tested case.

## Limitations and Release Decision

- A missing committed transition leaves New Chat's outcome unknown. A reference can survive a same-tab reload, and it cannot reconstruct unsent text after refresh.
- Status polling pauses in hidden tabs and stops scheduling automatically after 60 seconds. The manual status control remains available.
- Older clients without a protocol marker still depend on the existing legacy session protection. A first request without a persisted session has no protocol history.
- The migration and application checks passed locally. Keep the recovery flag off by default pending CI and the 12 hosted QA scenarios in the implementation guide.

## Hosted and Live Verification

Functional hosted QA and live provider checks were accepted from the project developer's confirmation supplied with the Phase 6G preparation brief on 2026-11-27. Phase 6G uses that confirmation for prior-phase functional acceptance. Numerical thresholds still require their measured reports or explicit developer confirmation against those thresholds.
