# Step 11C.6A · Public one-click unsubscribe ingress

**Public Staging ingress BLOCKED. Production email activation NO-GO.**

Audit date 2026-11-13. Branch `phase11c6/public-unsubscribe-ingress` started at `f98b45f146bd2500c4107b85e08b1d93d56c14f4`, the PR #131 merge. Vercel resolved the Staging alias to READY deployment `dpl_GUxSKqaniJmo5HLjbJC5yndECiXP` at that SHA on `product-release`. The supplied verification reports Render Staging LIVE at the same SHA. Individual GitHub Actions jobs for this merge were outside this ingress verification. [Vercel deployment](https://vercel.com/horus-projects-672b8c47/lumivox/GUxSKqaniJmo5HLjbJC5yndECiXP)

## Staging edge probes

Probes used the existing Staging alias, no cookies, Authorization or bypass, and manual redirect handling. The RFC 8058 action was sent in the form body. The invalid token could not be issued by Lumivox. The dispatch probe used dry-run and omitted its secret. [RFC 8058 §3](https://www.rfc-editor.org/rfc/rfc8058.html#section-3)

| Request | Actual result |
| --- | --- |
| GET unsubscribe API without a token | `302` to Vercel SSO |
| POST unsubscribe API with a URL-encoded action and invalid token | `302` to Vercel SSO |
| POST unsubscribe API with JSON | `401`, Vercel Authentication JSON |
| POST internal dispatch dry-run without a secret | `401`, Vercel Authentication JSON |
| GET internal monitoring and GET admin | Both `302` to Vercel SSO |

Redirects targeted `https://vercel.com/sso-api`. Edge responses used `Cache-Control: no-store, max-age=0`. Redirect bodies were plain text and the two 401 bodies were JSON. Callback query values and cookies are omitted. These responses establish the Edge boundary. Application-level behavior is verified locally below.

Read-only Staging SQL confirmed Dispatch OFF, Missed Sweep OFF, zero reminder Cron jobs, zero deliveries and zero receipts. Vercel Preview project configuration returned `STUDY_REMINDER_REAL_SEND_ENABLED=false`. Effective runtime flag verification on the active deployment remains open. No valid Staging capability was used.

## Ingress design

Vercel project metadata returned enabled SSO with policy `all_except_custom_domains`. The observed Staging alias is protected. Documented Deployment Protection Exceptions apply to a domain, and the path allowlist applies to OPTIONS preflight. No POST-only Deployment Protection exception was verified. [Deployment Protection Exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions) · [OPTIONS Allowlist](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/options-allowlist)

Select a dedicated public ingress with only the unsubscribe API exposed. Preserve Deployment Protection on the existing Staging host. Scope public access to GET and POST on the exact unsubscribe path, deny other paths at the ingress, and apply route-scoped rate limiting that returns an HTTP status without a browser challenge. Keep the capability token as authorization and preserve the existing opt-out transaction. The worker must emit the final public HTTPS URL directly in `List-Unsubscribe`, because RFC 8058 requires the POST target to avoid redirects. Confirm the host, provisioning and rate-limit behavior before changing infrastructure. [Vercel rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) · [RFC 8058 §3.1](https://www.rfc-editor.org/rfc/rfc8058.html#section-3.1)

Infrastructure provisioning, public URL wiring, active rate limiting and hosted fixture acceptance remain pending. The audit did not change Vercel project settings, deploy an artifact, change a hosted gate or send email.

## Local protocol coverage

The app handler accepts bounded RFC 8058 multipart and URL-encoded forms. The parser keeps the 512-byte streaming limit, exact action and opaque token validation, and generic responses. Malformed multipart, duplicate action fields and files are rejected before persistence. The focused unsubscribe and dispatcher suites passed 84 tests, with targeted ESLint passing.

The production Next.js build passed, including TypeScript. The first build caught a Buffer/Web BodyInit type mismatch, fixed by passing a typed byte array to the multipart parser. Full lint passed with the existing React hook warning in `use-focus-v2-audio.ts`. Full Vitest passed 1,092 tests with 26 skipped after excluding build artifacts under `.next`. The disposable Supabase stack had 96 migrations through `20261111071219`. pgTAP passed 1,015 assertions across 36 files.

The HTTP harness ran against that stack and the local production build, without cookies or Vercel credentials. It verified:

| Check | Actual response and state |
| --- | --- |
| GET with and without a token | `200`, consent ON, 1 pending job, 0 used tokens. The no-token GET returned `Referrer-Policy: no-referrer`. |
| URL-encoded POST with a definitely invalid token, JSON POST | `400` and `415`, respectively. Fixture state stayed unchanged. |
| Multipart POST with a valid fixture token | `200` with no redirect or cookie. Consent became OFF, pending jobs went to 0 and used tokens to 1. |
| Re-consent, then replay used token and submit a previously unused token | Re-consent restored consent ON and 1 pending job. Used replay returned `200`; old unused token returned `400`. Consent, counts and preference `updated_at` stayed unchanged. |
| Internal dispatch | Without its secret, `401`. With the local fixture secret and real-send OFF, `503 real_send_disabled`. Consent state stayed unchanged. |

Run `node --experimental-strip-types scripts/test-learning-schedule-unsubscribe-http.mjs --public-ingress` with `LUMIVOX_RESEND_TEST_WORKDIR` pointing to the disposable `lumivox-11c5d` stack (API 56321, DB 56322) and `SUPABASE_CLI_PATH` pointing to the CLI if needed. Node 22.13 requires the flag for the existing TypeScript import. Cleanup verified zero fixture rows, both gates OFF and zero reminder Cron jobs. Zero Resend requests and zero emails.

## Step 11C.6A.2 · Dedicated ingress

Baseline `bbf10160cc28065726a35bf67226d57242f73319` on `phase11c6/dedicated-public-ingress` matches the tracked `product-release` merge of PR #132. Provider metadata confirmed Vercel deployment `dpl_HbqP9YS8yFDTMDiCNMaYCi4gEeJN` READY and Render deploy `dep-dbrdvv3m8hqs73cp0nmg` LIVE at that SHA. Individual Actions jobs for this merge were not re-audited. Read-only Staging checks confirmed both DB gates OFF, zero reminder Cron, deliveries and receipts. Preview real-send configuration was `false`; the active function's effective flag was not directly probed.

### Implementation and credential boundary

The independent Vercel project root is `apps/unsubscribe-ingress`, with one function and an empty static output. It reuses the bounded RFC 8058 parser and canonical token hashing from the web app. It sends a SHA-256 digest to a fixed internal path with a dedicated bearer secret and a short-lived Vercel OIDC token. The bridge authenticates the bearer, validates the digest and calls the existing consume RPC. Redirects from the upstream are rejected. The project receives no Supabase, email-provider, dispatch or monitoring credentials.

The initial direct database role design was dropped after the local catalog showed 16 `SECURITY DEFINER` functions in `public` executable by PostgreSQL `PUBLIC`. A narrow explicit RPC grant alone would leave those inherited privileges. The bridge keeps PostgreSQL ACLs and migrations intact.

The worker reads `STUDY_REMINDER_PUBLIC_UNSUBSCRIBE_ORIGIN` from server configuration. With it set, `List-Unsubscribe` goes directly to the public HTTPS API and contains only the capability token query parameter. The localized confirmation link in the email body still uses the app origin. An existing immutable delivery snapshot targeting a different origin is held before authorization. The previous URL behavior remains available before the dedicated origin is configured.

### Local acceptance

| Case | Observed locally |
| --- | --- |
| PI-01 · GET | `200` without redirect or DB call. Consent ON, one pending job and zero used tokens. |
| PI-02 · Invalid POST | `400` for an invalid capability, `415` for JSON. Consent and job state unchanged. |
| PI-03 · Path isolation | Loopback ingress returned `404` for admin, dispatch, monitor, bridge, root and source-file probes. |
| PI-04 · Valid capability | Multipart POST passed ingress and bridge, returned `200`, disabled consent, suppressed the pending job and marked one token used. |
| PI-05 · Replay and re-consent | Re-consent restored one pending job. Used-token replay returned `200`, the old unused token returned `400`, and preference timestamp, consent and counts stayed unchanged. |
| PI-06 · Rate limit contract | Blocked limiter fixture returned plain-text `429` without redirect or persistence. Unavailable limiter returned `503`. Vercel WAF was simulated at the service boundary. |
| PI-07 · URL generation | Mock SDK received the public HTTPS API URL with only the capability token in its query. Switching the configured origin held the old snapshot before authorization. |
| PI-08 · Safety | The bridge rejected the dispatch secret with `401` and a malformed hash with `400`. Dispatch returned `401` without its secret and `503 real_send_disabled` with the local dispatch secret. Both local DB gates stayed OFF. |

The separate ingress tests passed 2 suites of assertions covering HTTP behavior and the server bundle. A strict TypeScript check of the entry point passed. Web Vitest passed 1,093 tests with 26 skipped, and lint and production build passed with the existing React hook warning in lint. The first end-to-end run returned `503` because Next.js exposed an empty POST as a stream. The bridge now validates the hash header independently of the ignored body; the rebuilt loopback-to-Supabase run passed. Run the existing HTTP harness with `--dedicated-ingress` in place of `--public-ingress`, after `npm ci` in the ingress project. Cleanup verified no fixture rows or reminder Cron and zero real sends.

The bundle tests found no canary credential and no frontend or Supabase client imports in the ingress server graph. HTTP checks kept the canary and OIDC value out of the response and out of the upstream URL. A scan of 92 Next.js client assets found no bridge credential or internal header markers. Hosted platform request-log behavior still requires verification. pgTAP passed 1,015 assertions across 36 files and the disposable stack was stopped after validation.

### Hosted follow-up after review

1. Create the same-team ingress project rooted at `apps/unsubscribe-ingress`, framework Other, Node 22, with source files outside its root included during the build. Expose only the isolated hostname. Keep the existing web project's Deployment Protection in place. [Vercel monorepo source settings](https://vercel.com/docs/monorepos/monorepo-faq)
2. Enable OIDC and add the exact ingress project and source/target environment pair to the protected app's Trusted Sources. Scope `UNSUBSCRIBE_BRIDGE_ORIGIN` to the protected Staging host and install an independent random `UNSUBSCRIBE_BRIDGE_SECRET` in the two server environments. Avoid enabling broad same-team access. Verify the selected tier supports the required rule before enabling the public host. [Vercel Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)
3. Configure an SDK rate-limit rule on the ingress project and supply its ID in `UNSUBSCRIBE_INGRESS_RATE_LIMIT_ID`. Verify a plain HTTP `429` without challenge or redirect, and verify that unavailable policy yields `503`. Review runtime log and tracing fields to keep bearer/OIDC headers, token digests and raw capability URLs out of shared logs. [Vercel rate limiting SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)
4. Verify the deployed SHA and PI-01–PI-08 from a client with no cookies, auth or bypass on the public host. Verify direct anonymous bridge access and a call from the wrong Trusted Source both fail. Use only an approved Staging fixture for a valid token. After validation, set the worker's public HTTPS origin on Staging and check old snapshots before any controlled send. Keep all send gates OFF during ingress validation.

Hosted provisioning, the Trusted Sources rule, live WAF limits, provider log redaction and public fixture acceptance remain **NOT EXECUTED**. No Vercel protection configuration, database gate or hosted data was changed. Production email activation remains **NO-GO**.
