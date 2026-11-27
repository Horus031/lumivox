# RAG Conversation V2 — Phase 5 Evidence

## Objective

Allow learners to start a new chat, carry authorized learning context forward, and view previous chats within the same Focus Session.

## Implementation

- New Chat and handoff have separate capability flags. Start fresh changes the document selection and skips summary generation. Continue with context preserves the exact document selection.
- A read-only prepare RPC snapshots source coverage, rolling memory, inherited memory, and uncovered completed exchanges. A commit RPC validates the source revision under lock and atomically closes the source, creates the target, and records the transition and handoff.
- A stable request ID replays the original transition. The UI restores the canonical active chat after success and keeps the existing transcript visible while the outcome is uncertain.
- Handoff covers all eligible exchanges through bounded batches. The application uses deterministic extraction after provider failure or deadline exhaustion.
- Historical chats are read-only. History list and detail are isolated by user and Focus Session. Revocation redacts titles and blocks messages while preserving access to Start fresh with an authorized selection.
- Rolling and inherited memory share the prompt memory budget. Only local rolling coverage filters current-chat history. The web distinguishes memory availability from actual use.

## Verification

| Verification | Result |
| --- | --- |
| Migration replay | Passed on the isolated Supabase stack at port 56622. `supabase db reset` and `migration list --local` confirmed migration `20261126103211`. |
| RPC privileges | All four Phase 5 RPCs are invoker functions. Anonymous and authenticated EXECUTE were false and service-role EXECUTE was true. |
| Ownership, ACL, coverage, history and hard limit | All 35 Phase 5 pgTAP assertions passed. Full suite passed 1,221 assertions across 43 files. |
| Atomic rollback, replay, source revision and concurrency | All seven Phase 5 scenarios and all six earlier races passed. The harness used independent PostgreSQL connections and forced a handoff insert failure inside a rollback-bound transaction. |
| Generated database types | The two new tables, updated turn table and four RPC entries match Supabase CLI output in UTF-8. |
| Handoff builder and combined budget | Unit tests cover all 24 uncovered turns, a single total deadline, extractive fallback, chained seeds, Vietnamese content, known secret patterns, prompt allocations, and no-evidence responses. |
| Backend full regression | `compileall` and all 232 pytest cases passed. Four dependency warnings remain. |
| Frontend build and RAG regression | Next.js TypeScript checks and the production build passed, generating 109 static pages. ESLint reported four existing warnings outside RAG. All 60 targeted RAG tests passed. The build skipped the prebuild cache cleanup. |
| Frontend full regression | Four Vitest shards passed with 1,261 tests passed and 26 skipped across 114 files. Sharding kept memory within workstation limits. |
| Feature flag rollback | In the local smoke test, turning off handoff removed inherited memory from the next answer while Start fresh remained available. |
| GitHub Actions CI | Pending push. |
| Hosted browser QA | Pending deployment to staging. |

## Live Provider Evidence

The local test used FastAPI endpoints, real PostgreSQL RPCs, and Groq with synthetic General AI study data. It also checked stable New Chat replay, canonical restore, read-only source messages, and keyset pagination.

| Metric | Observed result |
| --- | --- |
| Source completed turns | 8 |
| Rolling summary coverage | 2 completed turns |
| Newly processed exchanges | 6 |
| Handoff generation | LLM, `openai/gpt-oss-20b` |
| Handoff stored tokens | 107 |
| Provider prompt and completion tokens | 658 and 199 |
| Handoff generation latency | 1,110 ms |
| New Chat endpoint latency | 1,582 ms |
| First target answer | 123 inherited memory tokens, zero local history pairs, 1,124 ms |

The first target answer recovered the exact synthetic array from the final source exchange with the updated handoff prompt. Earlier runs used inherited memory but omitted those exact values. This fixture measures a single continuation path.

## Data Consistency

SQL on the synthetic transition data found zero duplicate active chats, unclosed transition sources, document scope mismatches, missing or unexpected handoffs, processing turns in closed chats, stored handoff budget violations, or combined prompt memory budget violations.

## Hosted QA

Staging cases awaiting verification include Start fresh after an existing chat, Continue with context, retention of the last uncovered exchanges, continuation at 24 turns, Markdown and read-only history, changing document scope, revoked source access, refresh after a transition, concurrent browser tabs, chained handoffs, Vietnamese UI, and staged flag rollback.

## Security and Limitations

- The browser receives capability and usage metadata. Handoff JSON, source text used to build handoff, and the internal handoff ID stay server-side.
- Persisted memory is untrusted context for continuity. It carries no document permissions and supplies no document evidence.
- Concurrent preparation can result in extra provider calls before a single transition commits. Usage totals reflect successful calls.
- Handoff is lossy. The stored coverage count records the exchanges processed. Semantic retention requires separate evaluation.

## Release Decision

Apply the migration before deploying the API that uses the new RPCs. Keep both Phase 5 flags disabled in production pending CI and hosted QA.
