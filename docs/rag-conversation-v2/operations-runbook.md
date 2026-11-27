# RAG Conversation v2 operations runbook

## Signals and escalation

Use the backend `rag.operation.finished` JSON event for full Ask and New Chat elapsed time, terminal outcome, and repeated stage counts. For example, `answer_generation` includes Redis admission, authorization, accounting, and the answer-provider call. Read the nested stage timings alongside the parent duration. Track Next.js admission separately from backend service time. Record latency separately for completed, rejected and failed operations.

Keep dimensions low cardinality. Use operation, outcome, environment, provider, model and stage where applicable. Keep trace IDs in restricted logs with bounded retention. Exclude transcripts, documents, file names, lease tokens, vectors, provider bodies and credentials. Operational reports use service-role or database operator access. Never send ledger rows to browsers.

| Symptom | First response |
| --- | --- |
| Redis unavailable or quota controller unavailable | Check Redis connectivity and the configured scope. Reduce protected traffic while recovering the controller. |
| Remote Groq 429 spike | Check cooldown, actual organization/project limits and traffic from other consumers. Compare with local RPM/TPM denials. |
| High request latency | Compare reservation, context, summary, embedding, vector retrieval, packing, provider and completion timings. Check lock waits and deadline reserves. |
| Stuck operation | Use the existing operation status and expiry recovery flows with the original request ID. Keep unknown outcomes open until durable state is known. |
| Unresolved provider usage | Compare ledger intent state with terminal metadata and lease/recovery timestamps. Keep observed tokens and missing usage separate. |
| Repeated fallback failure | Check each model's health, quota, remaining deadline and observed attempt order. |
| Unauthorized dispatch or context | Stop new affected traffic immediately and investigate ACL checks, leases and scopes. |
| Quarantined memory | Keep the quarantine in place and use authorized Fresh where appropriate. |
| Unexpected token growth or debt | Inspect prompt and completion distributions, summary frequency and tokenizer estimates. Check quota settlement and cooldown outcomes. |

Investigate authorization violations immediately. A starting operational window is five minutes with at least 30 eligible requests for latency and 429 percentages. Investigate breaches across three windows. Investigate pending intents beyond lease expiry and the recovery window. Track unexpected permit saturation, repeated quota-settlement failures and underestimation separately. When samples are sparse, inspect individual records and keep the reported sample count.

## Capacity and staged activation

Inventory provider capacity before enabling throughput. Use verified allocations for `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, including RPM/TPM and any input/output or daily limits, from the actual organization or project. Groq's request-limit response header represents the daily request limit. Preserve existing model, concurrency, token and deadline settings. [Groq rate-limit documentation](https://console.groq.com/docs/rate-limits)

| Consumer | Capacity boundary |
| --- | --- |
| RAG v2 answer, rolling summary, handoff | Combined distributed admission and model reservations when enabled |
| Legacy RAG and other AI text generation | Shared Groq generation client, outside the v2 allocation controller |
| Task Review | Separately configured review client |
| Gemini query embedding | Existing operation budget and deadline, durable accounting when enabled |
| Gemini document ingestion | Separate ingestion workload |

Separate environment state with `RAG_RESOURCE_NAMESPACE`. Consumers sharing a provider allocation require the same Redis database and `RAG_PROVIDER_QUOTA_SCOPE` and consistent quota settings. Independent Redis databases require verified suballocations. Inventory or reserve headroom for every outside consumer. The repository controls RAG v2 throughput. Account-wide enforcement depends on provider partitioning and coverage of other consumers.

1. Apply the ledger migration, deploy the compatible API, and enable `RAG_OBSERVABILITY_ENABLED`.
2. Enable `RAG_DURABLE_ACCOUNTING_ENABLED` and measure database and deadline overhead.
3. Obtain verified allocations and configure `RAG_PROVIDER_QUOTA_SCOPE` and `RAG_PROVIDER_QUOTAS_JSON`. The bounded sliding window supports up to 1,000 requests per minute per model allocation.
4. Enable `RAG_PROVIDER_THROUGHPUT_ENABLED` after verifying the shared topology and synthetic tests. Coordinate activation across workers sharing an allocation.
5. Run an isolated hosted smoke and review the [Phase 6F evidence](phase-6f-evidence.md).

Quota admission conservatively reserves estimated input plus maximum configured output. It keeps ambiguous reservations until Redis expiry and records observed overage as debt in the original window. An unconfirmed debt update emits a health signal and attempts a short model cooldown. If Redis is unavailable during settlement, use the unresolved accounting and provider data to reconcile capacity before continuing under load.

## Rollback

Reduce or temporarily pause affected generation traffic. Preserve authorization, privacy, recovery and authorized history access. Keep historical unresolved intents visible when disabling ledger instrumentation. Roll back optional context changes after checking their effect on quality and memory. During a quota incident keep protected admission enabled.

## Local testing

Seed a disposable loopback Supabase stack using the [comparative corpus](../../services/ai-api/evaluation/comparative_v1/README.md). Run `python -m scripts.verify_rag_resource_control --redis-port PORT` against disposable Redis. Run `python -m scripts.verify_rag_performance --mode synthetic --policy phase6f --scenario general --run-id phase6f-local --requests 12 --concurrency 1 --redis-port PORT --corpus-manifest PATH` in the AI API directory. Repeat with `--policy baseline` and the `document` and `replay` scenarios. Use `crash-before-dispatch` or `crash-after-response` with one request and one worker to verify durable interruption. The live mode requires isolated credentials, verified quota configuration, and at most two workers. Keep saturation, outage and crash tests on disposable infrastructure.

Use [operational reports](operations-reports.sql) for aggregate SQL. Review query plans on synthetic data before adding indexes. Treat local latency distributions as instrumentation evidence and measure staging objectives independently.
