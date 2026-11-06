# Phase 08 — Email Provider Integration Evidence

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
