# RAG Conversation V2 — Phase 6D Security and Privacy Hardening

## Implementation

- The provider-bound copy of text can use centralized credential filtering. Memory filtering also covers recognized email addresses and labeled phone numbers. Original request identities and authorized transcripts stay intact.
- The optional isolated prompt presents historical exchanges as untrusted JSON beside the current question. Generated source markers are checked against the evidence supplied to the model and rendered as text.
- Ask and Continue recheck the active lease and document access before provider dispatch. A denied dispatch releases an acquired permit without recording a provider attempt.
- Service-only quarantine marks Continue descendants and fails pending Ask and Continue operations. Authorized Fresh transitions remain available.
- Conversation titles use neutral labels and timestamps. RAG endpoints bound the request body and return stable errors. The browser uses localized processing notices and quarantine controls.
- CI checks production npm dependencies and pinned Python dependencies. An unavailable scanner fails the gate.

## Verification

| Verification | Result |
| --- | --- |
| Clean migration replay and local migration history | PASS — Supabase CLI 2.122.0 |
| RPC privileges, RLS isolation, memory lineage, old RPCs, document ACLs, and Fresh recovery | PASS — 1,331 pgTAP assertions, including 31 Phase 6D assertions |
| PostgreSQL transaction ordering | PASS — 30 races, including six quarantine cases |
| Redis resource-control regression | PASS — four workers, 40 requests, peak four permits, 36 busy denials, zero duplicate or remaining permits, and zero provider dispatches during simulated outage |
| Backend regression and dependency compatibility | PASS — 311 pytest tests, compileall, and pip check on Python 3.11 with patched dependencies |
| Focused frontend regression | PASS — 80 tests for the Study Assistant, Markdown, server actions, and real Redis admission |
| Frontend production build and TypeScript | PASS — Next.js 16.4.6 build and standalone typecheck |
| Frontend lint and release safeguards | PASS — zero lint errors, 45 warnings, and 29 safeguard tests passed |
| Full frontend regression | PASS — 1,294 Vitest tests passed and 26 skipped across four shards |
| GitHub Actions and hosted browser QA | NOT RUN — Phase 6D is local |

The SQL checks found that all 28 RAG v2 RPCs were inaccessible to `anon` and `authenticated` and executable by `service_role`. RLS was enabled on all seven RAG tables. The populated security fixture had zero lineage violations and zero quarantined processing Ask or Continue operations.

Supabase advisors reported the existing mutable search path warning for `public.set_updated_at`. The Phase 6D RPCs use an explicit empty search path and restricted execution grants.

The flat ESLint configuration surfaces five new React Compiler rules at warning level. The 45 warnings comprise 41 diagnostics from those rules and four existing warnings.

## Preliminary security evaluation

The offline suite passed all 36 cases across six categories. It checked document, history, summary, and handoff isolation, unsupported source markers, and credential filtering. All credential inputs and documents were synthetic. No live model or external provider calls were made. Model behavior under malicious instructions remains unmeasured.

The Phase 6C benchmark was rerun with filtering and context isolation enabled in both variants.

| Offline metric | Baseline | Adaptive |
| --- | ---: | ---: |
| Cases | 30 | 30 |
| Earlier detail retained | 0/6 | 6/6 |
| Follow-up retrieval | 6/6 | 6/6 |
| Topic isolation | 0/6 | 6/6 |
| Exact numeric arrays retained | 0/6 | 6/6 |
| Grounded fixture strategy and supplied evidence | 1/6 | 6/6 |
| Estimated prompt tokens, mean / maximum | 866.7 / 944 | 880.2 / 971 |
| Maximum combined memory tokens | 112 | 161 |
| Prompt or memory budget violations | 0 | 0 |
| Provider calls | 0 | 0 |

The grounded measurement covers retrieval policy and evidence assembly. It does not score factual accuracy of a generated answer. The baseline missed the six long-range, topic-isolation, and exercise cases and five grounded cases that required a standalone query.

## Dependency remediation

The baseline npm scan returned five production findings, including one critical and four high findings. The full scan returned 15 findings.

Two standard `npm ci` runs passed on the final lockfile, including the install in the workspace. The post-remediation production scan and the separate full scan both completed with **zero findings**. Next.js, MDX, third-parties tooling, and eslint-config-next are pinned to 16.4.6. React and React DOM are pinned to 19.2.9. [Next.js security advisories](https://github.com/vercel/next.js/security/advisories) · [React releases](https://react.dev/versions)

| Runtime dependency path | Before → after | Highest severity | Advisory IDs |
| --- | --- | --- | --- |
| `node_modules/next` | 16.2.6 → 16.4.6 | critical | `GHSA-6gpp-xcg3-4w24`, `GHSA-m99w-x7hq-7vfj`, `GHSA-89xv-2m56-2m9x`, `GHSA-68g3-v927-f742`, `GHSA-4633-3j49-mh5q`, `GHSA-4c39-4ccg-62r3`, `GHSA-p9j2-gv94-2wf4`, `GHSA-q8wf-6r8g-63ch`, `GHSA-955p-x3mx-jcvp`, `GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`, `GHSA-vcvr-r3jv-pc5j`, `GHSA-4jqv-mc3x-m676`, `GHSA-39w2-rjm5-chcv`, `GHSA-f87g-xv8r-7p7x`, `GHSA-mcj8-r9mp-w47p`, `GHSA-cjq9-62q9-8jv4`, `GHSA-2464-fhr4-w9xw`, `GHSA-p3m5-59mp-jv5r`, `GHSA-673q-mjm6-r5xr`, `GHSA-vc7v-qv4w-wrv8`, `GHSA-7qx7-33qx-rqx2`, `GHSA-f3mh-rxg3-f5g2`, `GHSA-pc58-hwjq-p385`, `GHSA-rhh4-g77r-r9qj` |
| `node_modules/next/node_modules/postcss` | 8.4.31 → 8.5.23 | high | `GHSA-qx2v-qp2m-jg93`, `GHSA-6g55-p6wh-862q`, `GHSA-fxqj-rqcc-2cmp`, `GHSA-r28c-9q8g-f849` |
| `node_modules/sharp` | 0.34.5 → 0.35.5 | high | `GHSA-f88m-g3jw-g9cj`, `GHSA-rgj7-g3m4-5g8c`, `GHSA-wq5f-xc86-pv6w` |
| `node_modules/source-map-js` | 1.2.1 → 1.2.2 | high | `GHSA-68fv-2mgg-jv7q` |
| `node_modules/zod` | 4.4.3 → 4.6.6 | high | `GHSA-mrhx-c7xc-m3w5` |

Development-only findings were also remediated.

| Development dependency path | Before → after | Highest severity | Advisory IDs |
| --- | --- | --- | --- |
| `node_modules/@typescript-eslint/eslint-plugin` | 8.59.3 → 8.74.0 | moderate | Transitive finding |
| `node_modules/@typescript-eslint/parser` | 8.59.3 → 8.74.0 | moderate | Transitive finding |
| `node_modules/@typescript-eslint/type-utils` | 8.59.3 → 8.74.0 | moderate | Transitive finding |
| `node_modules/@typescript-eslint/typescript-estree` | 8.59.3 → 8.74.0 | moderate | Transitive finding |
| `node_modules/@typescript-eslint/utils` | 8.59.3 → 8.74.0 | moderate | Transitive finding |
| `node_modules/@vitest/mocker` | 4.1.11 → 4.1.12 | moderate | `GHSA-qxg6-89mg-rqv8`, `GHSA-xp26-3454-mjgp` |
| `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch` | 10.2.5 → 11.0.9 | moderate | `GHSA-g3hv-75wg-m249` |
| `node_modules/undici` | 7.30.0 → 7.30.1 | high | `GHSA-4qv8-2p9j-2685`, `GHSA-f72v-6w45-q472`, `GHSA-xjj6-f33q-929c`, `GHSA-4w7w-5xrc-9h26`, `GHSA-2m5v-pch6-74hx`, `GHSA-qrxm-fqhp-jwvm`, `GHSA-9fm3-97px-rjf6`, `GHSA-55wc-3pg8-jfw6` |
| `node_modules/vite` | 8.3.2 → 8.3.3 | high | `GHSA-698v-4r3x-3vcv`, `GHSA-r825-w8mm-5pxw`, `GHSA-587h-7wmj-h5pm`, `GHSA-9jrq-w75r-8gcw`, `GHSA-rq7h-c2jc-7f22`, `GHSA-vfpm-58rq-9qcg` |
| `node_modules/vitest` | 4.1.11 → 4.1.12 | moderate | Transitive finding |

The pinned Python scan completed with **zero known vulnerabilities** after targeted pin updates. The scanner did not provide severity classifications.

| Python dependency | Before → after | Dependency path | Advisory IDs |
| --- | --- | --- | --- |
| `certifi` | 2026.7.22 → 2026.11.20 | HTTP clients | `PYSEC-2026-4320` |
| `pillow` | 12.3.0 → 13.0.0 | Matplotlib | `CVE-2026-112390`, `CVE-2026-112391`, `CVE-2026-112393`, `CVE-2026-112395`, `CVE-2026-112399`, `CVE-2026-112400`, `CVE-2026-112401`, `CVE-2026-112404`, `CVE-2026-112406`, `CVE-2026-112891`, `CVE-2026-112892`, `CVE-2026-112893`, `CVE-2026-112894`, `CVE-2026-112895`, `CVE-2026-112897`, `CVE-2026-112899`, `CVE-2026-112900`, `CVE-2026-128066`, `CVE-2026-128067`, `CVE-2026-96638`, `CVE-2026-96640`, `CVE-2026-96778`, `GHSA-78g4-xqwv-q3g8`, `PYSEC-2026-4326`, `PYSEC-2026-4327`, `PYSEC-2026-4328`, `PYSEC-2026-4329`, `PYSEC-2026-4330`, `PYSEC-2026-4331`, `PYSEC-2026-4332`, `PYSEC-2026-4333`, `PYSEC-2026-4334`, `PYSEC-2026-4335`, `PYSEC-2026-4336`, `PYSEC-2026-4337`, `PYSEC-2026-4338`, `PYSEC-2026-4339`, `PYSEC-2026-4340`, `PYSEC-2026-4341`, `PYSEC-2026-4342`, `PYSEC-2026-4343`, `PYSEC-2026-4363` |
| `pyasn1` | 0.6.4 → 0.6.5 | Google authentication dependencies | `CVE-2026-119194`, `CVE-2026-119195`, `CVE-2026-119196`, `CVE-2026-119197` |
| `pypdf` | 6.19.0 → 6.21.4 | Direct PDF parser | `CVE-2026-113786`, `CVE-2026-113789`, `CVE-2026-113790`, `CVE-2026-113791`, `CVE-2026-113792`, `CVE-2026-113793`, `CVE-2026-113794`, `CVE-2026-113795`, `CVE-2026-115572`, `CVE-2026-115580`, `CVE-2026-115585`, `CVE-2026-119203`, `CVE-2026-119204`, `CVE-2026-119205`, `CVE-2026-119206`, `CVE-2026-119207`, `CVE-2026-119208`, `CVE-2026-119209` |

## Residual risks and release decision

- Pattern-based filtering can miss sensitive content. Isolated JSON is a prompt boundary, and models can still follow instructions in untrusted data.
- Document permission can change after dispatch. Completion rechecks permissions, and provider requests already in flight cannot be recalled.
- Quarantine prevents future memory use. It retains transcripts, published answers, backups, and data already sent to providers. Existing document embeddings require separately authorized reindexing.
- Rotate the internal API key through the secret configuration for Next.js and FastAPI in the same rollout. Verify authorization with the replacement key and remove the previous value from both deployments.
- Hosted QA, CI, and live model evaluation remain release gates. `RAG_PRIVACY_FILTER_ENABLED` and `RAG_CONTEXT_ISOLATION_ENABLED` default to disabled for controlled rollout. Quarantine, authorization, and safe error handling apply independently of both flags.
