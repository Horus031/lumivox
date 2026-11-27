# RAG Conversation V2 — Phase 0 Evidence

## 1. Objective

Establish an isolated and backward-compatible LLM foundation for conversational RAG, including model compatibility, configuration validation, multi-message generation, bounded fallback, and provider token usage reporting.

## 2. Model Configuration

| Purpose | Primary | Fallback |
|---|---|---|
| Conversational RAG | openai/gpt-oss-20b | openai/gpt-oss-120b |
| Conversation summarization | openai/gpt-oss-20b | openai/gpt-oss-120b |

The existing Gemini embedding model and vector dimensions remain unchanged.

## 3. Implementation Scope

- Updated the shared default Groq chat model chain.
- Introduced RAG-specific configuration.
- Introduced a RAG model capability registry.
- Added an isolated conversational Groq client.
- Added provider error classification and controlled fallback.
- Added token usage and finish-reason reporting.
- Added unit tests and an independent live provider verification script.

## 4. Configuration Baseline

| Setting | Value |
|---|---:|
| Prompt token budget | 4000 |
| Completion token budget | 1200 |
| Summary token budget | 500 |
| Recent turns | 4 |
| Soft conversation limit | 18 |
| Hard conversation limit | 24 |
| Provider request timeout | 8 seconds |
| Generation deadline budget | 18 seconds |
| Attempts per model | 1 |
| Reasoning effort | low |
| Conversation V2 feature flag | false |

These are initial application configuration values. Input token enforcement and conversation lifecycle enforcement are deferred to subsequent phases.

## 5. Verification Results

| Verification | Result |
|---|---|
| Python compile check | PASS |
| RAG model registry unit tests | PASS |
| RAG conversational client unit tests | PASS |
| Existing shared LLM unit tests | PASS |
| Full backend regression suite | PASS |
| GPT-OSS 20B live smoke test | PASS |
| GPT-OSS 120B live smoke test | PASS |
| GitHub Actions CI | PASS |

## 6. Live Provider Measurements

Record actual model names, token usage, latency, and finish reasons from the provider verification script.

## 7. Compatibility and Limitations

No database migration or embedding regeneration is required.

The existing RAG production service remains unchanged and is not yet connected to the new conversational client.

The new client supports multi-message generation, but persistent memory, input token counting, summarization, and conversation handoff have not yet been implemented.

The configured generation deadline is an application fallback budget, not a guaranteed end-to-end HTTP deadline.

No claims about improved learner outcomes are made from Phase 0 verification alone.

## 8. References

- https://console.groq.com/docs/models
- https://console.groq.com/docs/deprecations
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/reasoning
- https://console.groq.com/docs/api-reference

## 9. Release Decision

Pending successful local verification, CI, and review.