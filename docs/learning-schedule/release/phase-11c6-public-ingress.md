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
