# RAG Conversation V2 — Phase 4 Evidence

## Objective

Use structured rolling summaries and recent completed turns to maintain continuity within the existing RAG budgets and document scope.

## Implementation

- The independent rolling-summary flag defaults to off. With defaults enabled, turn 7 can create the first summary from two completed turns. Further updates require two newly eligible turns, with up to eight pairs per batch.
- Both GPT-OSS models use strict JSON Schema. The extractive fallback retains relevant user excerpts and previous memory when the provider fails.
- Summary RPCs check session ownership, the active reservation lease, and current document access. Writes verify completed pairs, advance cumulative coverage, and support exact replay.
- The hybrid prompt preserves the full current question, prioritizes fresh evidence, and keeps room for recent completed pairs. Summary data is included only when it fits the remaining budget. Grounded answers cite fresh evidence.
- The answer transaction stores summary usage metadata. The web indicator uses these fields and is translated into English and Vietnamese.

## Verification

| Verification | Result |
| --- | --- |
| Migration replay | Passed on an isolated PostgreSQL stack at port 56522 with `supabase db reset`. Phase 4 migration `20261126081917` applied. |
| RPC privileges, ownership, lease, ACL and coverage | All 31 Phase 4 pgTAP assertions passed. The full suite passed 1,186 assertions across 42 files. Local privilege checks verified that only the service role among the three checked roles can execute the two summary RPCs and the context RPC. |
| Concurrency | Both Phase 2 races and all four summary races passed using independent connections. |
| Generated database types | Generated from the isolated schema in UTF-8. Updated the two affected table entries and added the two RPC signatures. |
| Structured provider and extractive fallback | Passed unit tests for strict schema, deadline-aware failover, invalid output, authentication failure, redaction, and deterministic extraction. Both configured models also passed live strict-output probes. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs) |
| Hybrid prompt and retrieval | Passed regression tests for role isolation, overlap, budgets, full question, fresh evidence, scoped retrieval, explicit topic changes, and no-evidence behavior. |
| Backend full regression | `compileall` passed. pytest passed 209 cases and reported four dependency warnings. |
| Frontend regression and build | TypeScript, lint, and the Next.js production build passed. Next.js generated 109 pages. Lint reported four existing warnings outside RAG. Vitest reported 1,251 passed and 26 skipped. The build skipped the prebuild cache cleanup. |
| Feature flag rollback | A live local follow-up used recent history with zero summary tokens. Both saved summary versions remained in the database. |
| GitHub Actions CI | Pending push. |
| Hosted conversation QA | Pending staging deployment and browser QA. |

## Live Provider Evidence

The local run used synthetic English and Vietnamese questions. Six completed pairs were seeded through the conversation RPCs. The application service then called the real provider and the isolated PostgreSQL database. Fixture rows were removed after the assertions, and metrics below are from single runs.

| Summary model | Version | Covered completed turns | Stored tokens | Provider prompt tokens | Provider completion tokens | Summary latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-oss-20b` | 1 | 2 | 183 | 397 | 213 | 860 ms |
| `openai/gpt-oss-20b` | 2 | 4 | 242 | 573 | 467 | 1,032 ms |

| Application request | Summary version used | Prompt memory tokens | Recent pairs | Service latency before completion write |
| --- | ---: | ---: | ---: | ---: |
| Turn 7, first summary | 1 | 195 | 4 | 2,880 ms |
| Turn 8, reuse | 1 | 195 | 4 | 1,942 ms |
| Turn 9, incremental summary | 2 | 254 | 4 | 3,084 ms |
| Turn 10, flag disabled | None | 0 | 2 | 1,215 ms |

Standalone strict requests succeeded in 656 ms on GPT-OSS 20B and 1,218 ms on GPT-OSS 120B in the first run. Groq rate-limited the repeat probe after the second conversation and rollback had completed. Application latency includes reservation, context reads, summary work when triggered, and answer generation. Browser latency remains part of hosted QA.

## Data Consistency and Security

- SQL on the live synthetic fixture found zero non-monotonic boundaries, coverage mismatches, duplicate boundaries, storage budget overruns, completed-turn message-pair mismatches, session count mismatches, or persisted summary usage mismatches.
- Summary coverage represents completed turns, so a failed turn can leave a gap in its indexes. A stored summary remains valid if the current answer subsequently fails.
- Session scope and its document permissions are checked on summary input, on writes and replay, and again on answer completion. Summary references cannot grant access to documents or other sessions.
- The API exposes summary usage metadata. Prompt content and raw summary JSON stay server-side.

## Hosted QA

The ten cases below remain pending on staging.

1. Create summary version 1 at turn 7.
2. Verify incremental version 2 at turn 9.
3. Refer back to an early study objective at turns 10–12.
4. Continue a Vietnamese conversation for at least eight turns.
5. Verify a historical claim cannot supply missing document evidence.
6. Simulate a summary provider error and verify answer generation continues with authorized context.
7. Refresh the browser and verify the next request loads persisted memory.
8. Switch topics explicitly and verify retrieval follows the new topic.
9. Revoke access to a selected document and verify the next request is blocked.
10. Disable the rolling summary flag and verify Phase 3 context behavior.

## Memory Evaluation

The proposed 24 scenarios below use original conversation turns and authorized documents as ground truth. The evaluation will hold the answer model, corpus, and generation parameters constant across recent-only history, rolling summary plus recent history, and extractive summary plus recent history.

| Category | Proposed scenarios |
| --- | --- |
| Long-range topic recall (5) | Binary search invariant, derivative notation, first SQL join example, photosynthesis stage, original recursion base case |
| Learning objective retention (4) | Exam review, interpreting a proof, comparing two algorithms, practicing a worked example |
| Unresolved questions (4) | Handling duplicates, a missing hypothesis, an open unit conversion, two competing interpretations |
| Continuity after refresh (3) | Resume a proof, explain an earlier example, continue from an unresolved exercise |
| Summary drift (4) | Corrected definition, changed study preference, two similarly named concepts, revised learning objective |
| Grounding and prompt injection (4) | Unsupported old claim, stale historical citation, embedded instruction, request outside the authorized document scope |

Score 0 for a wrong topic or invented detail, 1 for partial retention, and 2 for correct retention without unsupported facts. Report recall, grounding, summary quality, and latency individually. The 85% target and scored comparison remain for Phase 6.

## Limitations and Release Decision

- Summaries can omit details. Extractive memory preserves excerpts and has limited ability to compress meaning.
- Secret-pattern redaction was tested with synthetic credentials. It covers common patterns and requires broader privacy QA before production.
- Local token counts differ from provider usage. Provider networking timeouts and the six-second application deadline are best-effort boundaries.
- New Chat and handoff are outside Phase 4.
- Keep the production flags disabled pending CI and hosted QA.
