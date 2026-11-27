# RAG Conversation V2 — Phase 6E Comprehensive Comparative Evaluation

## Objective

Measure the contribution of recent turns, rolling summaries, adaptive context, and handoff while holding the model chain, document scope, security policies, and resource budgets constant.

## Experimental variants

| Variant | Configuration |
| --- | --- |
| A | Stateless v2 with current question and fresh retrieval |
| B | A with recent conversation history |
| C | B with rolling summaries |
| D | C with adaptive history, retrieval and memory allocation, plus handoff |
| L | Optional actual legacy path, a separate comparison |

The snapshot experiment projects one fixed history per case under each configuration. The lifecycle experiment uses the normal Ask, rolling Summary and New Chat Continue operations. Phase 6E reuses the production query embedding, document search RPC and context builder. Controlled snapshots reserve an authorized turn lease before dispatch and close it without persisting the injected transcript as a completed answer.

## Reproducibility

The implementation is based on `product-release` at `f416582b9bfcdb5e4769b209ef489557d1147231`. The frozen protocol, cohort IDs, corpus document paths, exact relevance passages and artifact digests are in [the comparative manifest](../../services/ai-api/evaluation/comparative_v1/manifest.json). The runner records the revision, runtime and dataset hashes, seed manifest hash, safe configuration, embedding identifier and dimensions, resource budgets, repetition, and execution timestamps.

Frozen manifest SHA-256 is `3c8a78d40797083e3a078862b492396b2a52aaa612dbc6d3f861be4b4429721f`. The tested Python runtime source SHA-256 is `2a1b4bb1a80045892e06f5b0dfb71be79d691d818241562f8106cd1437035377`.

The default answer and summary model chains are `openai/gpt-oss-20b` followed by `openai/gpt-oss-120b`. The configured embedding is `gemini-embedding-001` at 768 dimensions. The offline checks use the 4,000-token prompt limit, 500-token combined memory limit, and existing maximums of four provider calls per Ask and six per Continue. The local database verification uses disposable synthetic users and documents.

## Dataset coverage

| Dataset | Size | Evidence |
| --- | ---: | --- |
| Phase 6C development regression | 30 | 30/30 deterministic checks passed |
| Phase 6D security regression | 36 | 36/36 deterministic checks passed |
| Phase 6E comparative quality | 80 | 40 English and 40 Vietnamese, with eight equally sized categories |
| Phase 6E live security | 36 | Six synthetic cases in each of six groups |
| Phase 6E lifecycle | 8 | Eight predefined trajectories in the quality dataset |

The Phase 6E smoke and stability cohorts were frozen before provider execution. The isolation control document has no eligible vector. Other unanswerable cases select readable documents whose content does not contain the answer.

## Offline comparative results

Offline measurements exercise fixture context projection, evidence packing, privacy filtering and budgets. They use fixture text to build context.

| Metric | A | B | C | D |
| --- | ---: | ---: | ---: | ---: |
| Scenarios executed | 80 | 80 | 80 | 80 |
| Provider calls | 0 | 0 | 0 | 0 |
| Prompt or combined-memory violations | 0 | 0 | 0 | 0 |
| Out-of-scope packed observations | 0 | 0 | 0 | 0 |
| Mean estimated prompt tokens | 1,063.38 | 1,259.15 | 1,286.58 | 1,341.39 |
| Maximum estimated prompt tokens | 2,568 | 3,317 | 3,394 | 3,364 |
| Maximum combined memory tokens | 0 | 0 | 87 | 178 |

## Local integration and regression

- A fresh local Supabase stack replayed project migrations. The seed uploaded and processed 11 synthetic documents, including a private distractor belonging to a separate evaluation user. The actual pgvector RPC returned no chunks for that distractor when queried as the evaluation owner.
- The same stack exercised authorized retrieval, a deterministic no-hit answer, a grounded answer with evidence, and a persisted Ask → Summary → Continue → Ask trajectory. The run used mock embedding and language model responses and mock Redis admission. The seeding cleanup removed the synthetic users and their uploads.
- PostgreSQL pgTAP passed 1,331 assertions across 47 files. The separate Redis regression ran 40 simulated requests with a measured peak of four permits, zero duplicate permits, and zero dispatches during an outage.
- The Python suite passed 340 tests. Compilation and `pip check` passed.
- Vitest passed 1,294 tests across four shards, with 26 tests skipped by the suite. Web lint exited successfully with warnings. Next.js route types, TypeScript, the production build, and all 29 production safeguard tests passed locally.

## Live comparative results

Prior hosted and live functional QA is developer-confirmed. The source results for the numerical comparative gates below were not supplied, so these values remain unreported.

| Metric | A | B | C | D |
| --- | --- | --- | --- | --- |
| Scheduled and completed-case correctness | — | — | — | — |
| Referential follow-up and long-range recall | — | — | — | — |
| Topic isolation and exact artifacts | — | — | — | — |
| Cross-chat continuation | — | — | — | — |
| Grounded correctness and correct abstention | — | — | — | — |
| Recall@5, MRR@5 and packed evidence recall | — | — | — | — |
| Semantic citation precision and completeness | — | — | — | — |
| Known and unknown provider usage | — | — | — | — |
| P50/P95 latency and provider failure rates | — | — | — | — |

## Statistical and security interpretation

Provider runs must retain terminal failures and missing cases. The analyzer reports scheduled and completed-evaluable denominators separately, with Wilson intervals and matched case-level McNemar comparisons where scores exist. Security boundary denials and incomplete provider calls are tracked outside the live attack-success denominator. Blind reviewers assess claim support, citations, abstentions, exact artifacts and failure causes. Independent reviewer agreement remains pending.

The deterministic security suite and local integration use synthetic content. The numerical hosted quality, provider capacity and learner outcomes are outside the measurements recorded here. The frozen release gates are in [the comparative protocol](phase-6e-evaluation-protocol.md).

## Hosted and Live Verification

Functional hosted QA and live provider checks were accepted from the project developer's confirmation supplied with the Phase 6G preparation brief on 2026-11-27. Phase 6G uses that confirmation for prior-phase functional acceptance. Numerical thresholds still require their measured reports or explicit developer confirmation against those thresholds.
