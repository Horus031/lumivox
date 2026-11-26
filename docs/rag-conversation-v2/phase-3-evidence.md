# RAG Conversation V2 — Phase 3 Evidence

## Objective

Introduce context-aware multi-turn generation, history-aware document retrieval, bounded prompt construction, and provider token accounting.

## Implementation

- Load completed history through an atomic database snapshot scoped to the session, owner, live lease, and current document permissions. Restore counters and messages from a second atomic snapshot.
- Use the GPT-OSS `o200k_harmony` tokenizer and conservative message overhead. Preserve the current question and fit fresh evidence before packing the newest completed history pairs.
- Augment eligible follow-up embeddings with bounded recent context. Use the existing embedding and retrieval path for authorized documents. Strict document mode returns an insufficient-evidence response when it has no usable source.
- Persist the selected source excerpts, provider usage, and context metadata in the completion transaction. Keep completed requests replayable after the database ceiling of 24 turns.
- Show completed turns, history usage, and soft or hard limit notices in English and Vietnamese. The default soft and hard limits are 18 and 24.

## Verification

| Verification | Result |
| --- | --- |
| Migration replay | `supabase db reset` and local migration listing passed on an isolated PostgreSQL 17.12 stack. All 102 migrations applied, including `20261126065851`. |
| Context authorization, restore, and hard limit | 24 Phase 3 pgTAP assertions covering CTX01–CTX16 passed on PostgreSQL, including access revocation, expired leases, and replay after 24 completed turns. |
| RPC privileges | The context, restore, reserve, and complete RPCs are invoker functions. For all four, anonymous and authenticated EXECUTE were false and service-role EXECUTE was true. |
| Transaction and concurrency regression | The full pgTAP suite passed with 1,155 assertions across 41 files. Both Phase 2 concurrency races passed with the existing harness against the isolated stack. |
| Generated database types | Generated from the replayed local schema. The updated turn table and both snapshot RPC signatures were verified against CLI output. The committed types outside Phase 3 were preserved. |
| Tokenizer and budget | `tiktoken` 0.14.0 loaded `o200k_harmony` locally. Tests cover Vietnamese and emoji truncation, control markers, and budget rejection before calling the provider. |
| Retrieval, prompt, and generation | 79 targeted backend tests passed across the new suites and Phase 0–2 regression suites. Coverage includes first turns, follow-ups, topic switches, strict mode without usable evidence, and provider fallback. |
| Full backend regression | `compileall` passed. All 168 pytest cases passed, with four dependency deprecation warnings. |
| Local live provider and persistence smoke | Two synthetic General AI turns used GPT-OSS 20B and the actual PostgreSQL RPCs via a temporary test adapter. The follow-up resolved the prior reference, replay returned the stored response, and restore returned four ordered messages. The fixture was removed after verification. |
| Frontend regression and build | Lint, TypeScript, and the production build passed. Next.js generated 109 static pages. ESLint reported four warnings outside the Phase 3 changes. The full frontend suite passed with 1,248 passed and 26 skipped using four workers and a 15-second timeout. The build skipped the prebuild cache cleanup to preserve the running dev server. |
| GitHub Actions CI | Pending push. |
| Hosted tokenizer and six staging conversations | Pending deployment to staging and live QA. |

### Live token and consistency checks

| Turn | History pairs used | Retrieval | Prompt estimate | Provider prompt | Provider completion | Provider total |
| --- | --- | --- | --- | --- | --- | --- |
| First General AI turn | 0 | `none` | 627 | 417 | 32 | 449 |
| General AI follow-up | 1 | `none` | 690 | 456 | 21 | 477 |

Both turns persisted their usage and context metadata. The guide's SQL checks found zero budget violations, sessions above 24 completed turns, completed turns with the wrong message count, failed turns with persisted messages, inconsistent session counts, or sessions with multiple processing turns. Document retrieval was verified by automated tests. Live document QA remains in the staging matrix.

## Offline Evaluation

The proposed dataset has 40 scenarios across reference resolution, follow-up explanations, coding, document follow-ups, topic switches, insufficient evidence, and boundary cases. The dataset version and scored runs are pending. The planned comparison uses GPT-OSS 20B for both arms with identical questions, documents, temperature, reasoning effort, and completion budget. Baseline A uses current-question retrieval with no history. Variant B uses recent completed history and conditional history-aware retrieval.

| Metric | Baseline | Conversational RAG |
| --- | --- | --- |
| Correct follow-up responses | NOT MEASURED | NOT MEASURED |
| Retrieval relevance | NOT MEASURED | NOT MEASURED |
| Grounded answer correctness | NOT MEASURED | NOT MEASURED |
| Unsupported citation count | NOT MEASURED | NOT MEASURED |
| Prompt tokens | NOT MEASURED | NOT MEASURED |
| End-to-end latency | NOT MEASURED | NOT MEASURED |

The initial engineering target is a rubric score of 2 for at least 85% of scenarios, with zero cross-user history leakage. The local provider smoke is a separate integration check.

## Security

- History comes from persisted completed pairs. The client request schema carries the current question and request ID.
- The context RPC requires a live lease. Both snapshot RPCs revalidate document access, and the completion RPC checks access again.
- The prompt separates untrusted historical content from fresh evidence. Grounded answers may cite only supplied fresh sources.
- Database rows store source excerpts and context and usage metadata. Provider budget warnings contain token counts.

## Limitations

- Prompt estimates use local tokenization and a serialization allowance. Actual provider usage can differ.
- Follow-up detection uses bounded English and Vietnamese heuristics. Long historical messages may be excerpted.
- Usage reflects the successful generation, excluding prior provider attempts and embedding calls.
- Rolling summary, New Chat, handoff, and recovery of pending requests after refresh remain deferred. The 24-turn ceiling applies before a New Chat workflow is available.

## Release Decision

Pending CI, staging QA, and offline measurement. Apply the migration before deploying the backend that uses the snapshot RPCs. Keep the production feature flag disabled during Phase 3.
