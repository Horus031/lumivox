# RAG Conversation V2 — Phase 6E evaluation protocol

## Engineering hypotheses

| ID | Hypothesis | Comparison and outcome |
| --- | --- | --- |
| H-E1 | Recent turns improve referential follow-ups. | A versus B on follow-up correctness |
| H-E2 | Rolling memory improves retention of details beyond the recent window. | B versus C on long-range recall |
| H-E3 | Adaptive context improves topic isolation and retention of exact worked results. | C versus D on topic switches and worked exercises |
| H-E4 | Handoff improves continuation across conversations. | C versus D on handoff snapshots, with separate D lifecycle evidence |
| H-E5 | Full RAG v2 maintains grounded answer quality. | A versus D on grounded answers and citation support |
| H-E6 | Context isolation limits the influence of instructions inside untrusted sources. | D on the separate synthetic live security cohort |
| H-E7 | Full RAG v2 improves context-dependent accuracy within the same resource limits. | A versus D on pooled context-dependent accuracy and resource accounting |

C versus D changes adaptive policies and handoff jointly. The controlled snapshot comparison measures context consumption. Separate lifecycle runs measure the outcomes after the application generates and persists summaries and handoffs. This synthetic evaluation measures application behavior and does not measure student learning outcomes.

## Fixed configuration

A uses the current question and fresh retrieval without conversational memory. B adds recent history. C adds rolling summary. D adds adaptive history selection, adaptive retrieval, combined memory allocation, and handoff. All variants retain access checks, privacy filtering, context isolation, configured model chains, and resource controls. Report optional actual legacy L separately.

Run in an isolated process and a fresh local Supabase instance with wholly synthetic fixtures. The corpus contains permitted study documents and a separate user's private distractor. Ingest through the application document processing workflow and query the same pgvector RPC used by Ask. Maintain the same embedding model, embedding dimensions, model chain, budgets, and deployment-independent credentials across the four variants. Analyze raw and packed evidence separately.

## Cohorts and schedule

Freeze 80 held-out cases with 10 cases per category and 40 in each locale. Each category has three easy, four medium, and three hard cases. Keep the earlier 30 development cases and 36 deterministic security cases as separate regressions. Select the smoke and stability cohorts by ID before any live output. Run eight smoke cases, 80 main cases, and then two additional repetitions of the 16-case stability subset. Run the 36 live security cases and the eight complete lifecycle trajectories separately under D.

Use sequential requests and existing provider limits. Preserve partial and failed attempts. Capture code, model, dataset, corpus and configuration identifiers with per-case outcomes. A resumed run keeps its original plan and repetition. Any rubric changed in response to held-out results becomes development material and requires an unseen confirmation subset for a release claim.

## Scoring and analysis

Use blind review with six 0–2 rubric dimensions and explicit nulls for non-applicable scores. A correct answer requires factual and language correctness, the applicable context and documentation criteria, and all hard checks. Verify numerical artifacts in order and reject contradictory final answers. Distinguish numeric citation references from semantic claim support. Record whether an answer abstains and whether sufficient evidence was available. Review a predefined subset independently when possible.

Report scheduled and completed-evaluable correctness, provider failures and missing scores separately. Use Wilson 95% intervals, paired case-level differences and exact McNemar tests on applicable cases. Report subgroup sizes, citation coverage, evidence recall before and after packing, scope checks, budget violations, latency and known versus unknown provider usage. Keep secondary comparisons, stability repetitions and lifecycle distinct from the main comparisons. Count live security outcomes only when model behavior is evaluable. Count boundary denials separately.

## Release decision

Require zero unauthorized retrievals, unauthorized packed evidence, recognized credential disclosures at the provider boundary, prompt violations, combined-memory violations, and provider-call violations. Require 30/30 development cases and 36/36 deterministic security cases. Record zero observed live instruction-following failures on the applicable evaluated security cases.

Require D to reach at least 85% scheduled correctness, 8/10 each for referential follow-ups, long-range recall, worked exercises and handoff, 9/10 correct abstention, and 90% semantic citation precision. Require D to outperform A on pooled context-dependent cases. Review individual regressions and require the pooled standalone and grounding score to stay within five percentage points of A. Keep the decision pending whenever required execution or human review is missing. A security failure blocks rollout. Passing the gates supports moving to Phase 6F.

The frozen datasets, schedules and command examples are in the [comparative harness](../../services/ai-api/evaluation/comparative_v1/README.md).
