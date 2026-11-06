# Phase 08 — Email Provider Integration Evidence

## Step 8D — Trusted Resend Worker & Controlled Acceptance

- **Tier A: MOCK / LOCAL PASS. Tier B: LIVE RESEND NOT EXECUTED.** Phase 08 is **not** marked complete or approved for public sending.
- **Baseline HEAD:** `cd41a9956f8de84abb80200f5de8971cb06c3553`, `feature/learning-schedule-foundation`, initially clean. Execution **2026-11-06**, Asia/Bangkok; results include uncommitted 8D code. No commit/push/deploy, provider-account changes, live webhook registration or real email.
- CLI **2.122.0** created **`20261106080118_learning_schedule_controlled_resend_worker.sql`**. Forward-only migration; earlier migrations untouched. Local migration up and clean replay **PASS, 90 applied migrations** (89 baseline), on an empty disposable DB verified before reset. Types regenerated from local with both `public` and `graphql_public` preserved.

### 8D.1 — Trusted context and explicit locale

- Preferences now have nullable `reminder_locale` (`en`/`vi`) plus `locale_confirmed_at`, constrained as a pair. Existing users remain **unconfirmed**, with no English fallback. Separate owner-authenticated locale command and EN/VI Settings select require an explicit save. Locale-only save never enables global consent; existing consent/quiet-hours commands retain their contract.
- Server resolver joins Job → owned Session/Task/Schedule → Auth → preferences; recipient comes from current Auth, and title/timing/key from persisted rows. No recipient/title/locale/owner override is accepted by the dispatcher API. Verified identity, exact recipient allowlist, explicit locale, eligibility and known suppression are checked before preparation; final handoff rechecks current DB state.
- Allowlist is server configuration, max **20 exact addresses**, no wildcard/domain entries. Policy matches 8B HMAC identity: domain lowercased, local part case preserved. The public caller cannot supply `p_allowlisted`; the worker uses the trusted allowlist before its service-only authorization command.
- Context fingerprint captures rendering inputs and lifecycle identity; UTC-normalized timestamp serialization is invariant across tested database connection timezones. Changed context/locale/capability makes an old prepared payload ineligible for handoff rather than silently rebuilding it.

### 8D.2 — Immutable payload and separate worker

- New `resend-reminder-dispatcher.ts`; Phase 07 fake dispatcher/provider left unchanged. Operational store uses committed PostgREST RPCs for claim, trusted resolve, preparation, handoff, outcome and expired-lease reconciliation. No network request runs inside an open database transaction.
- Private RLS `study_notification_resend_payloads`: one immutable snapshot per Job, composite owner constraints, context/payload fingerprints, explicit locale, token hash and encrypted envelope. Browser/anon cannot read it; service role has SELECT only and writes via trusted commands. UPDATE is rejected. Token-hash issuance and snapshot INSERT commit **atomically** before handoff.
- Snapshot uses **AES-256-GCM**, random 12-byte IV, 16-byte tag and Job-bound associated data. Strict canonical base64url decoding, authenticated decryption and plaintext SHA-256 verification precede authorization. Raw email/capability is not stored in plaintext; token registry remains hash-only. Ciphertext contains the recoverable email/capability, protected by private access and a separate server-only 32-byte encryption key. This is encryption at the application boundary, not a claim that encrypted capability material does not exist in DB.
- Concurrent preparation returns the **first stored snapshot**, never the losing candidate. Subsequent attempts load/decrypt that snapshot; they keep the same capability, body, fingerprint and persisted idempotency key. Invalid/revoked capability, changed sender/origin/context or a lost/wrong key holds the Job for investigation, without generating a replacement payload after handoff.
- Service-only prepared-payload authorization verifies snapshot/current context/capability, then delegates existing real-provider eligibility checks: dispatch gate, live lease, verified Auth destination, Session/current schedule, consent, suppression and quiet hours. Exactly one durable `submitting` attempt grants submission. Authorization replay gives no second capability.
- Accepted records Email ID through existing outcome persistence. Timeout, 5xx, concurrent-key 409 or failed outcome persistence never trigger another send. An expired submitting lease is reconciled as uncertain, not requeued. **Conservative v1 retry policy:** all confirmed rejections are persisted terminally too; adapter retryability is classified but automated rate-limit/backoff retries are not enabled. Controlled/manual reconciliation and key rotation remain separate work.

### 8D.3 — Headers and authenticated endpoint

- `ReminderEmail` allows a specific `unsubscribeUrl` field, not arbitrary headers. Adapter derives exactly **List-Unsubscribe** and **List-Unsubscribe-Post** from it. HTTPS origin/path/token validation plus raw control-character rejection prevents header injection. No CC/BCC/attachments/private headers are admitted; existing adapter regression retained.
- Node **POST-only** `/api/internal/study-reminders/dispatch`, independent Bearer secret checked with fixed-size SHA-256 digests and `timingSafeEqual`. No cookies/user session/query token authorize dispatch. JSON command accepts only `dryRun` and `batchSize` (1–5), actual body max **512 bytes / 2 seconds**.
- Real requests fail closed when `STUDY_REMINDER_REAL_SEND_ENABLED` is not exactly `true`, allowlist/config/key is missing, or DB gate is OFF. SDK construction is lazy and cannot occur for dry-run/OFF/ineligible cases. Dedicated key only; Send API base URL pinned to `https://api.resend.com`. Real dispatch refuses `RESEND_DEBUG=true` to avoid SDK diagnostic leakage.
- Dry-run is authenticated **read-only inspection**, permitted with sending/DB gates OFF: no claim, token, snapshot, handoff or provider call. Batch logs contain only batch ID, counts, duration and safe classification; API returns aggregate counts, no Job/user/email/provider diagnostics.
- Per-DB-call timeout **4s**, SDK timeout **10s**, worker soft budget **30s**, with **19s remaining required before handoff**, route max duration **45s**. Unused leases are left for bounded recovery rather than submitted after the budget.
- Required server-only operational config names: `STUDY_REMINDER_DISPATCH_SECRET`, `STUDY_REMINDER_TEST_RECIPIENTS`, `STUDY_REMINDER_RECIPIENT_HMAC_KEY`, `STUDY_REMINDER_PAYLOAD_ENCRYPTION_KEY` (canonical base64 32 bytes), `STUDY_REMINDER_FROM`, `STUDY_REMINDER_TRUSTED_ORIGIN`, and dedicated `RESEND_STUDY_REMINDER_API_KEY`. HMAC policy/key must remain consistent with 8B–8C. Encryption v1 key must be retained while snapshots need reconciliation; rotation is not an implemented operator workflow. No values were written into Git or operational env files.

### Tier A acceptance — executed

| Case | Actual result |
| --- | --- |
| RI-01 | **PASS**, flag OFF produces no claim/preparation/submission; actual authenticated HTTP real request returns **503**. |
| RI-02 | **PASS**, DB gate OFF yields zero submissions/claims. Authenticated read-only dry-run remains available. |
| RI-03 | **PASS**, exact-address allowlist rejects unrelated/case-different local parts and wildcard/domain config; no handoff. |
| RI-04 | **PASS**, real Auth fixture with verification removed is refused before preparation/provider. |
| RI-05 | **PASS**, active recipient suppression stops the worker; final authorization remains the independent fence. |
| RI-06 | **PASS**, no implicit locale; actual EN/VI browser Settings actions persist confirmation, and respective deliveries snapshot locale. New unconfirmed user is dry-run ineligible. |
| RI-07 | **PASS**, actual SDK adapter forwards exactly two fixed headers. Worker-issued capability is GET without mutation, then POSTed through the actual local unsubscribe endpoint. |
| RI-08 | **PASS**, three two-connection preparation races with different candidates and connection timezones preserve one ciphertext/capability/fingerprint and one token. Final actual worker submits that original snapshot once. |
| RI-09 | **PASS, MOCK ACCEPTANCE**, injected SDK returns ID; actual outcome RPC persists it. The local signed callback correlates that same ID and projects delivered. This is not live Resend acceptance/delivery. |
| RI-10 | **PASS**, injected SDK timeout persists uncertain, Job failed/held, no automatic claim/resend. Persistence failure never triggers another provider request. |
| RI-11 | **PASS**, SDK 409 remains on the persisted key, uncertain for concurrent-key response; no key rotation or blind retry. Existing mismatch-409 adapter coverage retained. |
| RI-12 | **PASS**, unsubscribe transaction A holds owner coordinator while actual worker B authorizes; after commit B gets no capability/submission. |
| RI-13 | **PASS**, opt-out after committed handoff preserves cancellation fence and actual mock accepted outcome. HTTP pipeline also consumes the real capability during injected SDK handoff, before accepted outcome persistence. |
| RI-14 | **PASS**, two actual workers compete at PostgreSQL claim: busy-owner worker promptly skips, first worker commits and alone submits. No blocker is expected for SKIP behavior. |
| RI-15 | **PASS**, actual HTTP missing/wrong Bearer **401**, GET **405**, caller-selected recipient **400** before DB/SDK activity. |
| RI-16 | **PASS**, final fixtures zero, dispatch/Sweep OFF, reminder Cron zero, real provider requests zero. |

- [`phase-08-resend-worker.json`](./phase-08-resend-worker.json): **23 case executions** using the actual repository worker/store/SDK adapter with only `emails.send` injected. Includes **12 repeated concurrency cases** (RI-08/12/13/14 ×3), **9 observed `pg_blocking_pids()` blockers**, three prompt SKIP cases, payload/source fingerprints, final states and cleanup. Standalone harness transpiles actual TS modules to ignored `.next/step-8d-runtime`; it does not implement a substitute worker. Full TypeScript checking is a separate gate.
- [`phase-08-resend-worker-http.json`](./phase-08-resend-worker-http.json): **10 HTTP/Chromium checks PASS** on owned `127.0.0.1:3110`, including locale Settings Server Actions, OFF/auth/body gates, read-only dry-run, full mock worker → real unsubscribe HTTP → accepted persistence → signed callback. Dry-run creates **zero** tokens/snapshots/attempts. One SDK mock submission in the full pipeline; **zero real provider requests**. Two Analytics requests from ordinary Settings pages were intercepted/blocked, not sent externally. Safe batch log fields checked. EN/VI **390×844** screenshots under `evidence/step-8d/` visually inspected; no horizontal overflow.
- [`phase-08-8d-webhook-regression.json`](./phase-08-8d-webhook-regression.json): existing signed HTTP/webhook regression **6 two-connection races / 6 blockers PASS**, cleanup/OFF/zero provider requests. Historical 8B/8C artifacts retained separately.

### Commands / quality gates

```powershell
# repo root; local-only Supabase CLI 2.122.0
supabase migration new learning_schedule_controlled_resend_worker
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
node scripts/test-learning-schedule-resend-worker.mjs
node scripts/test-learning-schedule-resend-worker-http.mjs
node --experimental-strip-types scripts/test-learning-schedule-resend-webhooks.mjs --next-http --8d-regression
supabase db advisors --local --type security --fail-on none --output-format json

# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/notifications/ --maxWorkers=2 --reporter=dot
node node_modules/vitest/vitest.mjs run features/learning-schedule/notifications/ features/learning-schedule/notification-preferences.actions.test.ts features/learning-schedule/components/study-notification-settings.test.tsx --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

| Gate | Actual final result |
| --- | --- |
| Clean replay | **90 migrations PASS** |
| pgTAP | **881 PASS / 32 files** reported, one existing fixture-only SQL entry intentionally skipped; new worker suite **30 assertions**, baseline 851 retained |
| Notifications Vitest | **199 PASS / 9 files / 7.90s** |
| Notifications + Actions/Settings | **253 PASS / 11 files / 12.09s** |
| Full Vitest | **1021 PASS / 26 skipped**, **88 files passed / 5 skipped (93)**, **241.66s**, start **15:31:56 UTC+7** |
| ESLint | **PASS**, zero errors, one existing `use-focus-v2-audio.ts:104` missing-`projection` warning |
| TypeScript | **PASS**, standalone `--noEmit --incremental false --pretty false` |
| Production build | **PASS**, Next **16.2.6**, compile **20.7s**, TypeScript **42s**, **105 pages / 1227ms** |
| Security advisors | One pre-existing `public.set_updated_at` mutable-search-path WARN, no new notification findings |

- Build uses local Supabase process env and inert `G-TESTPRIVACY`; `.env.local` unchanged and `.next/dev` preserved. `--ignore-scripts` skips only prebuild cleanup; actual `next build` ran. No dependency changes.
- Initial checks caught the expanded missing-row locale contract in an old assertion, a noncanonical base64url envelope edge, PostgREST abort-signal ordering and an overly specific environment test type. Corrected with retained/expanded assertions and final regression above; no test was disabled to obtain PASS.
- Final DB read: **90 migrations**, **0 users / Tasks / jobs / deliveries / payloads / tokens / receipts / identity bindings / suppressions**, dispatch **OFF**, Sweep **OFF**, **0 reminder Cron**. Owned test servers stopped. Fixture tests temporarily enabled the DB gate only while invoking injected transports; owned HTTP server real-send flag stayed **false** and no operational flags/env were edited.

### Tier B — LIVE RESEND NOT EXECUTED / remaining gates

- The supplied guide requires **“explicit approval cho recipient và môi trường gửi thử.”** No approved live recipient/environment was supplied. Therefore no sending-domain/key provisioning, live send, live webhook setup, deployment or provider account mutation was attempted. Local mock PASS does not satisfy live acceptance or complete Phase 08.
- **NOT EXECUTED:** verified sending domain, scoped dedicated live API key, approved exact test recipients, real HTTPS webhook/unsubscribe reachability, external reverse-proxy/deployment access-log **query-token redaction**, SPF/DKIM/DMARC, DKIM coverage of both unsubscribe headers from a received email, live bounce/complaint safety and restoration of a real controlled window. Application batch logs are sanitized locally; that is not proof that an external ingress/access log redacts capability URLs.
- Before Tier B, review the concrete local code/artifacts and the approved environment/recipient list, confirm external log redaction and sender/header infrastructure, then enable flags/gate only for that controlled window and restore OFF afterward. No recurring Cron is created. Accepted must not be called delivered/inbox without corresponding external evidence.
- Manual uncertain reconciliation, automatic known-nonacceptance backoff, encrypted snapshot key rotation/retention and production process-kill/load tests are not implemented/claimed here. Unknown outcomes never authorize a fresh key/payload or resend after Resend's 24-hour deduplication window. Capability landing privacy limits and separate suppression reversal controls from 8C remain in force.
- References checked: [Resend Send API/custom headers](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). User guide's uncertainty/approval constraints override generic retry recommendations in the email skill.

## Step 8C — One-Click Unsubscribe & Suppression

- **Result: LOCAL PASS**, unsubscribe/suppression readiness only; Phase 08 and real sending remain unapproved.
- **Baseline HEAD:** `2652fdf4cd92782bd9c13b57865588b309b03fa7`, `feature/learning-schedule-foundation`, clean initially. Execution **2026-11-06**, Asia/Bangkok, including uncommitted 8C changes. No commit/push/deploy, live webhook registration, Cron creation or real provider request.
- CLI **2.122.0** generated **`20261106070838_learning_schedule_unsubscribe_suppression.sql`**. Forward-only migration, earlier migrations unchanged. Local migration up and final clean replay **PASS: 89 migrations** (88 baseline). Reset used `--no-seed` after verifying an empty disposable local DB.

### Implementation / policy

- Opaque **32-byte / 256-bit** random base64url tokens; only SHA-256 hashes persist. Expiry is **90 days**. Trusted issuer supports explicit replacement; service-only revoke command is idempotent. Issuance checks the exact current verified Auth email under `SHARE NOWAIT`, never grants consent, and stores no raw token/email. Confirmation/one-click links use an explicit HTTPS origin, not Host/browser query input. `renderIssuedReminderEmail` composes successfully persisted issuer links with the existing EN/VI renderer; offline preview rendering remains available.
- Token consumption discovers owner without a row lock, then owner coordinator → token → preferences → Job invalidation. Valid first use atomically switches global consent OFF, suppresses pending jobs, fences leases and records `used_at`. Exact used-token replay is harmless and never opts in; it also does not undo a later explicit Settings opt-in. Expired/revoked/unknown tokens are refused. Old email links remain user-global capabilities until expiry/revocation, rather than becoming an implicit opt-in for another address.
- Existing Settings preference RPC now takes the owner coordinator **before** preference row locks; this avoids an owner/preference inversion with unsubscribe. Concurrency cases verify both Settings/unsubscribe commit orders. Explicit Settings opt-in committed after unsubscribe may win, but never removes provider suppression.
- Private RLS token, suppression and recipient-identity tables; no browser/anonymous access, and no direct service-role writes. Writes go through trusted commands. Composite identity/owner and delivery/owner foreign keys prevent reassignment. A private secondary SHA-256 of the normalized email binds the trusted recipient HMAC to Auth's current address without storing raw email or the HMAC secret in PostgreSQL.
- Global consent and suppression remain independent. `Permanent` bounce → `hard_bounce`; complaint → `complaint`; provider suppression and unclassified/Transient bounce → conservative `provider_suppressed`. Delayed events create no suppression. Missing historical proof is never invented as hard bounce. Suppression survives late delivered events and Settings opt-in; no self-service unsuppress RPC exists.
- Receipt → delivery/recipient correlation → suppression fact → pending/lease fence commits atomically. Unmatched/mismatched receipts cannot guess an owner. Late provider-ID correlation applies suppression in the same outcome transaction. Matched historical 8B facts are backfilled conservatively. Full payload hash preserves exact legacy replay even when old receipts lack typed `bounce_kind`.
- Bulk fencing covers the known current verified identity or attempts already bound to that fingerprint. Historical identities lacking a current Auth binding are not guessed; the new real-provider final authorization still checks suppression after binding the actual verified destination. Existing fake handoffs/outcomes remain separate.
- **`ls_notification_authorize_resend_attempt`** is service-only and explicitly creates `provider='resend'` with immutable context. In the transaction it rechecks dispatch gate, lease/current Session/consent, current verified Auth email, quiet hours, suppression, and an explicit trusted allowlist attestation (**default false**). This is a DB handoff boundary, not a connected sender. The future worker must derive HMAC/allowlist eligibility from trusted configuration/Auth data; none comes from a public caller. Authorization commit remains the point after which opt-out/suppression cannot promise email recall.
- Public API **`/api/study-reminders/unsubscribe`**: GET performs no token lookup or mutation; POST accepts URL-encoded `List-Unsubscribe=One-Click`, uses only the opaque capability, never requires login/cookies/Origin, and never redirects. Actual body is bounded to **512 bytes / 3 seconds**. Success **200**, unavailable token **400**, unsupported content type **415**, oversize **413**, persistence failure **503**. Replies contain no user/email/Task/account details; no-store, no-referrer, noindex headers applied.
- Public EN/VI confirmation pages use a native POST form with explicit button and no mutation on GET. Middleware bypasses session refresh for these exact public paths. Analytics is not mounted on capability landing pages, including initial render; normal app analytics remains intact. Token URLs are intended for full-document email navigation, not internal SPA links. Chromium tests used an inert configured GA fixture ID to avoid testing only an empty configuration.

### Executed acceptance

| Case | Actual result |
| --- | --- |
| US-01 | **PASS**, API GET and EN/VI browser GET leave consent ON, one pending Job, token unused. No login/redirect. |
| US-02 | **PASS**, actual keyboard confirmation POST → Next route → local Supabase atomically changes consent OFF, pending count 1→0, used token count 0→1; DB tests verify leased cancellation marker too. |
| US-03 | **PASS**, HTTP and DB replay no-op, same generic success, never opts in. |
| US-04 | **PASS**, expired, explicit-revoked and forged token all return the same **400** body. Replacement revokes older tokens; issuer rejects stale/unverified Auth identity (**PT409**). |
| US-05/06 | **PASS**, fresh browser/no session and cookie-free one-click POST succeed; responses omit token, user/email and account data, no Location/Set-Cookie. |
| US-07 | **PASS**, actual Svix-signed Permanent bounce through Next HTTP creates one hard-bounce fact for the exact correlated identity; duplicate remains one. Pending/leased fences verified in pgTAP. |
| US-08 | **PASS**, complaint plus bounce retained independently; late delivered event cannot clear suppression. Real HTTP late-delivery regression included. |
| US-09 | **PASS**, delayed event adds no suppression; Transient/missing proof never classified hard bounce. |
| US-10/11 | **PASS**, unknown/mismatched event creates no guessed suppression; later trusted Email ID correlates and suppresses the correct identity atomically. |
| US-12 | **PASS**, Settings OFF→ON does not revoke suppression; a new leased Job is denied at real-provider final handoff. |
| US-13 | **PASS**, fixture changes to a new verified Auth email do not enable global consent; old destination suppression does not automatically attach to the new fingerprint after explicit opt-in. This simulates verified identity, not a live Auth re-verification email flow. |
| US-14 | **PASS**, **24 real PostgreSQL executions**, eight orders × three repetitions, all **00000**; **21 observed `pg_blocking_pids()` blockers**. The remaining three unsubscribe-first/claim cases correctly skip busy owner and return promptly, without expecting a blocker. |
| US-15 | **PASS**, Owner B/anon denied private records; browser denied token consumption and real handoff RPCs; direct service-role token mutation denied (**42501**); all three tables have RLS. |
| US-16 | **PASS**, final dispatch/Sweep OFF, zero reminder Cron, provider requests zero; local fixtures and owned servers cleaned. |

- Additional atomicity checks **PASS**: injected suppression insertion fault rolls back receipt and delivery projection; injected token-mark fault rolls back both consent and pending invalidation (**P0001**). A hash-only replay regression covers receipt schema evolution without conflicting typed metadata.
- Concurrency orders: unsubscribe/claim, claim/unsubscribe, unsubscribe/handoff, handoff/unsubscribe, Settings/unsubscribe, unsubscribe/Settings, suppression/handoff, handoff/suppression. Handoff-first cases retain one durable submitting attempt plus cancellation fence; no send is performed and no recall guarantee is inferred. Report: [`phase-08-unsubscribe-concurrency.json`](./phase-08-unsubscribe-concurrency.json).
- **11 actual HTTP/Chromium checks PASS** on owned production server `127.0.0.1:3109`; EN/VI **390×844**, no horizontal overflow, button usable by keyboard, **zero external requests**, including Analytics. Two screenshots under `evidence/step-8c/` visually inspected. Report: [`phase-08-unsubscribe-http.json`](./phase-08-unsubscribe-http.json).
- Existing 8B regression **PASS**, **6 two-connection races / 6 blockers**, actual signed Next HTTP ingestion and cleanup, zero provider calls. New report [`phase-08-8c-webhook-regression.json`](./phase-08-8c-webhook-regression.json); historical 8B report left intact.

### Commands / quality gates

```powershell
# repo root; installed Supabase CLI 2.122.0
supabase migration new learning_schedule_unsubscribe_suppression
supabase migration up --local
supabase db reset --local --no-seed
supabase test db --local
supabase gen types typescript --local
node scripts/test-learning-schedule-unsubscribe-concurrency.mjs
node --experimental-strip-types scripts/test-learning-schedule-unsubscribe-http.mjs
node --experimental-strip-types scripts/test-learning-schedule-resend-webhooks.mjs --next-http --8c-regression
supabase db advisors --local --type security --fail-on none --output-format json

# apps/web
node node_modules/vitest/vitest.mjs run features/learning-schedule/notifications/ --maxWorkers=2 --reporter=dot
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" --ignore-scripts run build
```

| Gate | Actual result |
| --- | --- |
| Final clean replay | **89 migrations PASS** |
| Full pgTAP | **851 assertions PASS**, **31 files** reported; one existing fixture-only entry intentionally skipped. New suite **48 assertions**, baseline 803 retained. |
| Notification Vitest | **164 PASS / 8 files / 8.53s** |
| Full Vitest | **980 PASS / 26 skipped**, **87 files passed / 5 skipped (92)**, **228.72s**, start **14:32:15 UTC+7** |
| Lint | **PASS**, zero errors, one existing Focus `use-focus-v2-audio.ts:104` dependency warning |
| TypeScript | **PASS**, standalone `--noEmit --incremental false --pretty false` |
| Production build | **PASS**, Next **16.2.6**, compile **17.4s**, TypeScript **38.1s**, **104 pages / 1901ms** |
| Types | **PASS**, local-generated `public` + `graphql_public`; contents/exit checked before replacing output |
| Security advisors | One existing `public.set_updated_at` mutable-search-path WARN; no new notification findings |

- Build used local Supabase process env and inert **`G-TESTPRIVACY`** process-only measurement fixture. `.env.local` unchanged; no new dependencies. `--ignore-scripts` skips prebuild cleanup only; actual Next build ran and `.next/dev` was preserved. Unit secrets/token material existed in test memory/process env only; screenshots/reports contain no raw tokens or keys.
- Final state: **89 applied migrations**, **0 users / Tasks / jobs / deliveries / receipts / tokens / suppressions / identity bindings**, dispatch **OFF**, Sweep **OFF**, **0 reminder Cron**. Test ports **3108/3109** stopped. Concurrency temporarily enabled the DB gate only for fixture claim/handoff tests and restored it in `finally`; no worker/provider was invoked.

### Corrections / limits before 8D

- Privacy review found the shared Analytics component could otherwise see an email capability URL; added the path guard and verified with configured inert GA plus blocked/countable external requests. Initial privacy unit test referenced an uninstalled testing-library package; replaced it with existing React DOM server rendering, without dependency changes. Final full regression passes. Review also hardened exact legacy receipt replay so typed bounce metadata introduced by 8C cannot reject the same full payload hash.
- **NOT EXECUTED:** real email delivery, Resend API acceptance/deduplication, provider dashboard/webhook registration, actual DKIM coverage of List-Unsubscribe headers, real HTTPS receiver interoperability, recipient allowlist management, live Auth re-verification, key rotation, load/retention tests and production crash tests. Signing/sending headers belongs to **8D**. The allowlist boolean is a required trusted attestation, not a completed allowlist-management service.
- Suppression reversal remains a separately verified privileged workflow; Settings cannot clear it, and no public unsuppress interface is exposed. Manual-block reason is supported by schema but no admin UI is enabled. Historical/unmatched provider outcomes still require trustworthy correlation; no automatic resend or newly generated idempotency key is allowed on uncertainty.
- Before exposing capability URLs externally, configure URL-query redaction in deployment/proxy/access logs and keep Analytics/third-party scripts off the landing flow. Tests cover fresh full-document email navigation; an already-loaded third-party script on a previous SPA page cannot be recalled, so no internal SPA links to token URLs are wired. Production URL/origin, HTTPS and sender/DKIM approval remain outside local PASS.
- References: [RFC 8058 POST/cookie/DKIM contract](https://www.rfc-editor.org/rfc/rfc8058), [Resend bounce classification](https://resend.com/changelog/email-bounce-details). Phase 08 remains incomplete until controlled integration/release requirements are satisfied.

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
