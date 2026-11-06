# Phase 08 — Email Provider Integration Evidence

## Step 8B — Resend Persistence & Signed Webhooks

- **Result: LOCAL PASS**, persistence/webhook acceptance only; Phase 08 and real sending are not approved.
- **Baseline HEAD:** `0a0727f2f69a67126cba2f0bebc71a3b960fd1c1`, branch `feature/learning-schedule-foundation`, initially clean. Executed **2026-11-06**, Asia/Bangkok; results include uncommitted 8B changes. No commit/push/deploy or Resend account changes.
- CLI **2.122.0** created actual migration **`20261106061100_learning_schedule_resend_persistence.sql`**. Inspected the real `pg_constraint` provider CHECK before replacement; migration aborts on an unexpected constraint/baseline rather than retaining the fake-only CHECK silently. No earlier migration modified. Applied locally and completed final clean replay of **88 migrations** (baseline 87); reset used `--no-seed` only after verifying 0 users/Tasks on disposable local DB.

### Implemented persistence / trust boundaries

- Existing fake rows/defaults remain fake. New Resend rows require explicit `provider='resend'`, immutable recipient HMAC, payload SHA-256, handoff token and locale snapshot. Partial unique `(provider, provider_message_id)` rejects duplicate provider IDs. Provider outcome RPC only accepts Resend handoffs; the existing fake outcome RPC now filters `provider='fake'` through this forward migration. No Resend sender/claim/authorization path has been wired into the fake dispatcher.
- Locale policy **`explicit-trusted-command-v1`**: a future trusted submission command must choose and persist explicit `en` or `vi` with its immutable payload fingerprint. No profile locale column was invented; webhook `Accept-Language`/browser headers and silent English defaults are not locale sources. Actual application locale selection/worker integration remains deferred before sending.
- Recipient identity uses versioned HMAC-SHA256, preserving email local-part case and normalizing domain case. Dedicated server key `STUDY_REMINDER_RECIPIENT_HMAC_KEY` must match future handoff processing; key rotation needs a reconciliation plan. Raw recipient, subject, Task content and raw webhook are never persisted in receipts. Typed safe event columns plus hashes are stored; bounded `payload_subset` is exactly `{}`. Entire verified JSON is fingerprinted with deterministic property ordering so changed private/provider fields still cause conflicts without storing them.
- Private RLS receipt table, unique provider/event ID; browser/anonymous have no read or write grants. `service_role` has receipt SELECT only; writes use the trusted ingestion RPC. Duplicate processed receipts return without changing delivery status/timestamps. Same ID with conflicting content raises **22023**; original receipt survives and HTTP emits a sanitized integrity-conflict diagnostic.
- Unknown IDs remain `unmatched`; outcome persistence reconciles them atomically when a trusted Email ID becomes available. Recipient mismatches are retained as `recipient_mismatch`, never applied to another recipient. No guessing from addresses, titles, timestamps or idempotency-key expiration.
- Effective state is recomputed from matching append-only facts, independent of arrival order: late sent cannot erase delivered; bounce/complaint facts both survive and later delivery does not erase them. `provider_accepted_at` is local evidence-recording time; `last_provider_event_at` is the maximum matching provider timestamp. Job `sent` means submission accepted, never inbox confirmation. Verified failure/suppression clears leases without requeueing. Unknown attempts remain held; later explicit trusted provider evidence may resolve them without any send/new key.
- Correlation advisory lock serializes receipt ingestion with acceptance persistence, then owner gate → Job → Delivery locks. Trusted commands must run in fresh transactions, outside parent mutation transactions. This prevents the early-event/ID-commit race in both tested orders.
- Node route **`/api/webhooks/resend/study-reminders`** bypasses user-session refresh/locale redirects only for that exact path; signature verification is its authorization boundary. Body is streamed with a **32 KiB actual byte limit** and **5-second read deadline**, raw UTF-8 verified once through SDK `webhooks.verify()`, including Svix timestamp validation. Only the seven specified event types and a single valid `data.to` recipient are accepted. `email_id`, not RFC Message-ID, is correlation identity.
- Dedicated `RESEND_STUDY_REMINDER_WEBHOOK_SECRET` and identity key are server-only config; absent config returns **503**. Privileged DB client is constructed only after successful signature/payload validation; DB command has a 4-second deadline. Invalid signature **401**, invalid event **400**, oversized body **413**, integrity conflict **409**, persistence failure **503**; success **200** waits for commit. Verification constructs an SDK helper using an inert noncredential value, never a real API key; it performs no provider API call.

### Executed acceptance

| Case | Actual result / evidence |
| --- | --- |
| RW-01 | **PASS**, real HMAC/Svix verifier rejects forged, expired, future, tampered raw body and malformed headers before DB client/write. Actual Next production route returned **401**, receipt count stayed zero. |
| RW-02 | **PASS**, seven supported event types parsed after verification. Actual Next POST → local PostgREST → PostgreSQL committed receipt, returned **200**. |
| RW-03 | **PASS**, exact duplicate returns **200**, one receipt; pgTAP compares entire delivery row including timestamps to prove no-op. |
| RW-04 | **PASS**, duplicate event ID with changed payload raises **22023**; original fact unchanged. Handler/route contract maps conflict to **409**, with sanitized diagnostic. |
| RW-05/06 | **PASS**, early receipt remains unmatched then trusted acceptance/ID reconciles to delivered, Job sent. Both real-connection commit orders exercised. |
| RW-07 | **PASS**, delivered followed by sent remains delivered. |
| RW-08 | **PASS**, bounce then late delivery retains bounce; complaint retained too; both receipt facts remain. Actual suppression enforcement is 8C, not claimed here. |
| RW-09 | **PASS**, unknown Email ID stays unmatched; recipient mismatch never changes another delivery. |
| RW-10 | **PASS**, Owner B and anon denied receipt access; authenticated browser cannot invoke ingestion or read private delivery fingerprints (**42501**). |
| RW-11 | **PASS**, duplicate real-provider Email ID rejected (**23505**) and assignment rolled back; fake outcome cannot write a Resend attempt (**PT409**). |
| RW-12 | **PASS**, injected delivery projection failure rolls back inserted receipt; injected Job update failure rolls back provider ID/outcome. Original state remains intact (**P0001** fault injection). |
| RW-13 | **PASS**, persistence failure returns **503**, no success before commit barrier releases. Faulted persistence port/route mock used; no real DB outage was induced. |
| RW-14 | **PASS**, SDK verification tests assert zero global fetch/provider requests; actual route only performs local Supabase persistence. No sends, retrieval, key rotation or webhook registration. |

- **pgTAP: 803 PASS**, **30 files** reported (one existing concurrency-fixture SQL entry skipped deliberately); new webhook suite **42 assertions**, baseline **761** retained. Existing NP-10 expectation updated from the Phase 07 fake-only CHECK error to **22023 immutable fake identity** under the expanded 8B provider contract; its coverage was retained, not removed.
- **Targeted notifications: 121 PASS / 5 files / 4.65s**: 89 existing + **28 signed-boundary/parser tests + 4 actual route-module tests**. Real SDK verification uses locally generated test signatures; no mocked cryptography in signature acceptance.
- **Concurrency: 6 executions**, three repetitions per order (**acceptance-first**, **webhook-first**), all **00000**, **6 observed `pg_blocking_pids()` blockers**. Each final state: **Delivery delivered, Job sent, exactly 1 receipt**. Final run also exercised the owned Next production server at `127.0.0.1:3108`; signed/duplicate POSTs used the actual route and local PostgREST. Detailed PIDs, results and cleanup are in [`phase-08-resend-webhooks.json`](./phase-08-resend-webhooks.json).

### Commands / quality gates

```powershell
# repo root; installed Supabase CLI 2.122.0
supabase migration new learning_schedule_resend_persistence
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
node --experimental-strip-types scripts/test-learning-schedule-resend-webhooks.mjs --next-http
supabase db advisors --local --type security --fail-on none --output-format json

# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/notifications/ --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

- **Types PASS**, regenerated from local with both `public` and `graphql_public`, exit/contents checked before replacing output. No schema restriction or partial overwrite.
- **Lint PASS**, zero errors; one existing `features/focus-sessions/use-focus-v2-audio.ts:104` missing-`projection` dependency warning.
- **Full Vitest PASS**, **937 passed / 26 skipped**, **84 files passed / 5 skipped (89)**, **204.85s**, start **13:29:26 UTC+7**.
- **Standalone TypeScript PASS**, `--noEmit --incremental false --pretty false`.
- **Production build PASS**, Next **16.2.6**, compile **15.8s**, build TypeScript **25.9s**, **101 pages / 979ms**. Local Supabase process env only; `.env.local` unchanged. `--ignore-scripts` skips only destructive prebuild cleanup; the actual `next build` ran and `.next/dev` was retained.
- **Security advisors:** no new notification findings; one existing `public.set_updated_at` mutable-search-path WARN, captured in [`phase-08-security-advisors.json`](./phase-08-security-advisors.json).
- **Final local state:** **88 applied migrations**, **0 users / Tasks / jobs / deliveries / receipts**, dispatch **OFF**, Missed Sweep **OFF**, **0 reminder Cron**. Owned test server stopped; temporary keys existed only in test memory/process env. No secret/key files or configuration edits; no Resend outbound requests/account mutations/live webhook setup.

### Failures corrected / remaining limits

- Initial pgTAP run found PostgreSQL's bounded-regex repetition limit (`{1,256}`); changed SQL validation to explicit length + character checks, then clean replayed successfully. First harness target check used `inet_server_port()` on a Unix socket (NULL); switched to server `port` setting before any fixtures. Initial full regression caught obsolete NP-10 CHECK expectation; updated it to verify immutable fake identity. Final full DB regression passes after all migration hardening, including true no-op replay and provider separation.
- **NOT EXECUTED / deferred to 8C–8D:** real Resend submission/deduplication, live webhook configuration or delivery, external network failures, inbox/client delivery, unsubscribe endpoint/token lifecycle, bounce/complaint suppression enforcement and reversal, persisted application locale selection and real worker/handoff wiring. No suppression table/policy was enabled in 8B. Receipt history is preserved to support that work; this is not production send approval.
- Uncertain attempts lacking trustworthy Email ID correlation remain held for explicit reconciliation; absence of a webhook or expiry of Resend's 24-hour key window never authorizes resend. No automatic reconciliation Cron, bulk backlog/load test, key-rotation exercise, retention/purge policy or production process-kill test is claimed.
- Primary references checked: [Resend raw-body verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [per-recipient event contract](https://resend.com/changelog/webhook-event-visibility), pinned SDK **6.37.0** source/types. User guide's commit-before-acknowledgement/raw-body/privacy requirements take precedence over generic skill examples that acknowledge before persistence or reserialize/log full payloads.

## Step 8A — Resend Adapter & EN/VI Templates

- **Baseline HEAD:** `302843ada6448066a9d496280db81a084b40015c`, `feature/learning-schedule-foundation`, clean initially; execution **2026-11-06**, Asia/Bangkok. Results include uncommitted 8A changes. No commit/push/deploy, Resend account mutation or real email send.
- Scope: injected `EmailTransport`/`ReminderEmail` contract, inert Resend adapter, pure strict-context EN/VI HTML + text renderer, mocked tests and offline previews. Phase 07 fake provider/dispatcher, Server Actions, DB schema/provider CHECK and operational gates remain unchanged. No new migration; baseline inventory **87**, pgTAP **761** from 7D, **NOT RERUN in 8A**.
- Registry verified **resend 6.37.0**, installed with `npm install resend@6.37.0 --save-exact --ignore-scripts --no-audit --no-fund`; actual lockfile is `apps/web/package-lock.json`. npm generated both manifest/lockfile changes; no manual lockfile editing. Five new lock entries (SDK + four dependencies); **no existing dependency version changed**. npm also normalized optional-package metadata. Node **22.13.1**; no API key was read or created.

### Implemented boundaries

- Adapter uses a **type-only** Resend SDK import and an explicitly injected `emails.send` client plus configured sender policy. No singleton, environment-driven activation, network-on-import or connection to dispatcher/HTTP routes. Browser construction is refused. All executions below inject a mock, never a real SDK client. SDK send options forward the existing persisted key unchanged and apply a **10-second AbortSignal** deadline; adapter performs **one call**, no retries/key rotation.
- Runtime request validation rejects unknown/private fields, invalid recipient/sender, header controls and invalid/oversized keys. Exact payload projection includes only from, one recipient, subject, HTML and text. Configured sender equality is enforced; syntax/policy validation is **not evidence of Resend sender/domain approval**. Raw provider messages and recipient addresses are never logged/returned by this adapter.
- Accepted requires a nonempty, bounded opaque provider ID, trimmed without changing case; it means provider acceptance, **not delivered**. Validation/configuration rejects are nonretryable; a named confirmed rate-limit rejection is conditionally retryable by the future caller; quota exhaustion requires operational handling. Timeout, SDK null-status transport error, malformed/contradictory response, unknown 409/429 and 5xx remain uncertain. Payload-mismatch 409 is a nonretryable contract failure; concurrent same-key 409 is held as `idempotency_in_flight`, without creating a new key.
- Templates accept only Task ID/title, strict `en`/`vi`, Session UTC instants/IANA timezone and allowed lead minutes. HTML escapes all user title characters; plain text remains plain text. Date/time follows Session timezone, including fold/gap instants and UTC/local date rollover; cross-local-day/inverted intervals are refused. Subject/copy are localized; HTML has lang/dir on root/body wrapper, ordered headings, presentational table and meaningful links, with no external assets/tracking.
- Task/Settings links are built from an explicit HTTPS **trusted-origin config**, never Host headers/user URLs. Unsubscribe URL must be HTTPS, same origin, without credentials/fragment; query attributes are escaped. Unknown document/notes/prompt/recipient/Host fields are rejected by the renderer. Unsubscribe is a **preview contract only**, not an operational endpoint; no emails may be enabled on this implementation alone.

### Executed acceptance

| Case | Actual result |
| --- | --- |
| RE-01/02 | **PASS**, English/Vietnamese subject + HTML + text, localized dates, 19:00–20:00 Session time, locale Task/Settings links |
| RE-03/04 | **PASS**, escaped HTML injection, unsafe scheme/origin/credentials/path config, spoofed Host/Task link rejected |
| RE-05 | **PASS for adapter contract**, same persisted logical key forwarded on explicit retry; one call per invocation, no generated key/automatic retry. Real provider deduplication NOT EXECUTED |
| RE-06/07 | **PASS**, accepted ID normalization; 400/422 validation and 401/403/404/405 configuration errors never auto-retry |
| RE-08/09 | **PASS**, thrown timeout, controlled abort, SDK null status and 5xx uncertain; 409 mismatch distinguished from concurrent in-flight request |
| RE-10 | **PASS**, strict minimum template/request fields, no document/notes/prompt/attachments/CC/BCC/header payload, normalized errors omit recipient/raw diagnostics |
| RE-11/12 | **PASS**, global fetch stubbed/zero calls; mock client only; module import/constructor remain inert with API-key/UI-flag fixture env set; browser construction refused |

- Final targeted notifications Vitest **PASS**, **3 files / 89 tests**, **4.86s**: **28 template + 44 adapter + 17 existing fake-provider/worker tests**. Includes malformed provider responses, max key length, sender mismatch, quotas, bounded abort signal, DST folds/gap, date rollover, accessible HTML and deterministic rendering.
- Offline preview script **PASS**, `node --experimental-strip-types scripts/preview-learning-schedule-reminder-email.mjs`: EN/VI HTML + plain text, Chromium **640px and 390px**, no horizontal overflow and **zero HTTP(S) requests**. Four screenshots visually inspected at representative desktop/mobile sizes; artifacts under `evidence/step-8a/` use fixture titles, `.test` origin and `preview-only` unsubscribe token. This is Chromium HTML QA, not Gmail/Outlook/inbox/client-delivery acceptance.

### Commands / quality gates

```powershell
# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/notifications/ --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
# repository root, offline preview only
node --experimental-strip-types scripts/preview-learning-schedule-reminder-email.mjs
```

- Lint **PASS**, exit 0, 0 errors / 1 existing Focus `projection` dependency warning. Initial test-local variable `module` violated Next lint naming; renamed to `adapterModule`, final lint passed.
- Full Vitest **PASS**, exit 0: **905 passed / 26 skipped**, **82 files passed / 5 skipped**, **151.96s**, started **11:55:10 UTC+07:00** (**833 baseline + 72 new tests**). Opt-in skips are not claimed as executed tests. TypeScript `--noEmit --incremental false --pretty false` **PASS**, exit 0.
- Actual Next **16.2.6** production build **PASS**, exit 0: compile **17.1s**, TypeScript **26.4s**, **100/100** pages in **1604ms**. Supabase local variables and UI opt-in false injected into build process only; `.env.local` unchanged. Skipped prebuild with `--ignore-scripts`; actual `next build` ran, `.next/dev` retained.
- Final read-only local inspection: **87 migrations / 0 Auth users / 0 Tasks / 0 jobs / 0 deliveries / 0 reminder Cron**, dispatch false, Sweep false; delivery provider constraint still **`CHECK ((provider = 'fake'::text))`**. No fixtures were created by 8A tests. New-source whitespace checks, preview script `node --check` and `git diff --check` **PASS**.
- npm's initial registry query was sandbox-denied; repeated with approved network access, exact version verified before install. Docker Desktop was initially unavailable; recovered with Desktop CLI before local build configuration. No source test failure occurred; CLI/Vite/Node type-stripping/module notices and baseline lint warning are informational. No credentials persisted/printed.

### Scope limits / next checkpoint

- **NOT IMPLEMENTED / NOT EXECUTED:** real Resend sends, approved live sender/recipient tests, live account/domain verification, real idempotency/24-hour replay behavior, persistence/provider CHECK expansion, webhook signature/event receipt processing, bounce/complaint suppression, one-click unsubscribe endpoint, remote/staging/production worker/Cron activation. No Resend connector sending/configuration tool was invoked.
- Existing `profiles` schema has **no locale column**. 8A requires an explicitly confirmed `en`/`vi` value in its trusted input contract; it does **not** fabricate a profile locale, infer it from browser headers, or implement a DB/Auth context resolver. Before real sending, 8B–8D must establish that persisted locale source, verified Auth recipient/ownership/allowlist resolution, immutable rendered payload/key fingerprint and working unsubscribe/suppression.
- New transport results are intentionally **not mapped into the fake-only outcome RPC**. Future integration must persist provider outcomes separately and preserve Phase 07's durable handoff/uncertain limitations. Provider key lifetime is not durable duplicate protection. Confirmed 429 retryability does not perform a retry or bypass relevance/consent/gates; Retry-After/recovery policy remains a caller/persistence concern.
- **Decision: Step 8A Local PASS** for injected adapter/template contracts and the executed mock/offline tests above. **Phase 08 remains INCOMPLETE for 8B–8D.** User handles commit/push; no real-provider activation.

### Primary references checked for the adapter

- Resend Node send payload/options: [Send Email](https://resend.com/docs/api-reference/emails/send-email).
- Named 409/429 and other provider errors: [Errors](https://resend.com/docs/api-reference/errors). Lumivox deliberately keeps ambiguous 5xx/transport outcomes uncertain per the pasted plan.
- Key forwarding, 256-character limit and 24-hour retention: [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys). Durable lifecycle history must continue to protect beyond that provider window.
