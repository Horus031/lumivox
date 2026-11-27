# RAG Conversation V2 — Phase 6C Context Quality Optimization

## Objective

Improve conversational context, retrieval relevance, and worked-exercise continuity within the existing prompt and provider-call budgets.

## Implementation

- The authorized context RPC loads up to 24 completed pairs, with a default adaptive candidate window of 12. Rolling summary scheduling keeps its separate recent-turn window.
- History packing ranks relevant pairs and tries progressively shorter excerpts. Selected pairs are sent in chronological order.
- Retrieval classifies explicit topic changes, standalone questions, and follow-ups using local lexical rules. It embeds one query and keeps the current question intact.
- Rolling and inherited memory share a 500-token budget that includes the prompt envelope. The extractive fallback records earlier answers, keeps unresolved questions from prior memory, and preserves or omits exact artifacts as units.
- Completion stores adaptive usage, omission, and condensation counts. Grounded responses without evidence keep retrieval metadata and record zero answer-model history and memory usage.
- The learner sees localized indicators for omitted or condensed history.

## Verification

| Verification | Result |
| --- | --- |
| Clean local migration replay and Supabase type generation | PASS — Supabase CLI 2.122.0, UTF-8 types |
| Extended candidate window, RPC privileges, lease checks, ownership, and document scope | PASS — 1,300 pgTAP assertions across the full suite, including 19 Phase 6C assertions |
| Completion metadata, rollback compatibility, and Phase 6B accounting | PASS — pgTAP |
| Existing PostgreSQL and resource-control regressions | PASS — 24 races and Redis stress test |
| Backend full regression | PASS — compileall and 289 pytest tests on local Python 3.12.13 |
| Frontend full regression | PASS — 1,291 tests passed and 26 skipped. The final focused run passed all 41 Study Assistant and Redis admission tests. |
| Frontend lint, typecheck, and production build | PASS — lint reported four existing warnings and zero errors |
| GitHub Actions CI | NOT RUN — branch changes are local |
| Hosted browser QA and live provider evaluation | NOT RUN — Phase 6C has yet to be deployed |

The Redis harness used four processes and 40 synthetic requests. It observed a peak of four calls, 36 busy denials, zero duplicate permits, zero remaining permits, and zero provider calls during the simulated Redis outage. Supabase advisors reported one existing warning on the unrelated `set_updated_at` function.

## Preliminary Comparative Evaluation

The offline runner used the same 30 synthetic English and Vietnamese fixtures for both variants. It checked prompt contents, query selection, scoped fixture chunks, and exact numeric sequences. Both variants made zero provider calls.

| Offline metric | Phase 6B baseline | Phase 6C adaptive |
| --- | ---: | ---: |
| Scenarios | 30 | 30 |
| Earlier detail retained in prompt | 0/6 | 6/6 |
| Follow-up query correctness | 6/6 | 6/6 |
| Explicit topic isolation in query and compressed memory | 0/6 | 6/6 |
| Exact input and result arrays retained in order | 0/6 | 6/6 |
| Grounded fixture query strategy and evidence | 1/6 | 6/6 |
| Adaptive intent classification | Not applicable | 18/18 |
| Adaptive coverage accounting | Not applicable | 30/30 |
| Estimated prompt tokens, mean / max | 826.6 / 932 | 871.5 / 1,160 |
| Combined memory tokens, max | 112 | 161 |
| Prompt violations / memory violations / out-of-scope chunks | 0 / 0 / 0 | 0 / 0 / 0 |

The baseline missed all six long-range, topic-isolation, and worked-exercise fixtures. In five grounded fixtures (`CQ-GROUND-001` through `CQ-GROUND-005`), its query added unrelated history to a standalone question. The grounded metric measures the query and supplied evidence. Live answer correctness remains unmeasured.

## Local RPC Measurement

The measurement alternated 50 executions per window on one local synthetic conversation with 13 completed turns. Latencies measure the RPC inside PostgreSQL. Sizes count UTF-8 bytes in its JSON response.

| History window | Median latency | P95 latency | Response |
| --- | ---: | ---: | ---: |
| 4 pairs | 0.586 ms | 1.269 ms | 528 bytes |
| 12 pairs | 0.590 ms | 1.265 ms | 1,250 bytes |

All five consistency queries returned zero violations on the synthetic fixture, which included one adaptive completion. The queries covered candidate counts, truncated pairs, prompt size, combined memory, and the default provider-call limit.

## Limitations

- Lexical matching approximates relevance. Loaded candidates may still be omitted or condensed.
- Reported summary coverage counts represented exchanges. Prior assistant results can still contain mistakes.
- The synthetic fixtures measure deterministic context behavior. Live provider accuracy, rate limits, latency, and typical staging response sizes are pending.

## Release Decision

GitHub Actions, live provider evaluation, and hosted browser QA remain release gates. The context-quality flag defaults to disabled.

## Hosted and Live Verification

Functional hosted QA and live provider checks were accepted from the project developer's confirmation supplied with the Phase 6G preparation brief on 2026-11-27. Phase 6G uses that confirmation for prior-phase functional acceptance. Numerical thresholds still require their measured reports or explicit developer confirmation against those thresholds.
