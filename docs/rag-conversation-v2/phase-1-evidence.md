# RAG Conversation V2 — Phase 1 Evidence

## 1. Objective

Replace the manually implemented Markdown parser with a standardized, secure, and responsive Markdown rendering pipeline for Lumivox Study Assistant.

## 2. Implementation Scope

- CommonMark rendering through react-markdown.
- GitHub Flavored Markdown tables, task lists, nested lists, and strikethrough.
- LaTeX rendering through remark-math and KaTeX.
- Syntax highlighting for fenced code blocks.
- Clipboard copying with success and failure feedback.
- Responsive horizontal scrolling for wide tables and code blocks.
- Scoped light and dark mode styling.
- English and Vietnamese localization.
- Updated RAG output formatting instructions.
- Security controls for raw HTML, unsafe hyperlinks, external images, and untrusted mathematical expressions.

## 3. Dependency Verification

- `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `remark-math@6.0.0`, `rehype-katex@7.0.1`, `rehype-highlight@7.0.2`, `katex@0.19.1`.
- The initial install resolved KaTeX 0.16.47 through `rehype-katex` and `micromark-extension-math`. The npm override now deduplicates both to 0.19.1, above the 0.18.2 patched version for GHSA-238P-PMPM-9MQ7. All five renderer math tests and the test for blocked KaTeX resource commands passed with the override.
- `npm audit --omit=dev` reported five existing vulnerable packages in both the Phase 0 lockfile and the Phase 1 lockfile. The critical finding is in `next`. The four high findings are in `postcss`, `sharp`, `source-map-js`, and `zod`. The audit reported zero KaTeX findings.

## 4. Automated Verification

| Verification                      | Result  |
| --------------------------------- | ------- |
| Markdown renderer unit tests      | PASS — 27/27 |
| Study Assistant integration tests | PASS — 3/3 |
| Frontend lint                     | PASS — zero errors and four warnings in files outside Phase 1 |
| TypeScript typecheck              | PASS — `tsc --noEmit --incremental false` |
| Full frontend unit tests          | PASS on rerun — 1,231 passed and 26 skipped with `--maxWorkers=4 --testTimeout=15000`. The default run had one existing schedule-editor test time out at 5 seconds. |
| Production build                  | PASS — `next build` compiled the Focus route and generated all 109 static pages. The npm prebuild hook hit `EPERM` while removing the existing `.next/dev` cache. |
| Backend prompt contract tests     | PASS — 10/10 on Python 3.12.13. `compileall` passed. |
| Full backend regression suite     | PASS — 109/109 |
| Dependency security verification  | KaTeX tree PASS. Production audit exit 1 with the same five findings as the baseline. |
| GitHub Actions CI                 | NOT RUN — awaiting push |

## 5. Live Rendering Verification

Manual browser QA was blocked before reaching Focus Workspace. Computer Use stopped because it could not determine the current Chrome URL on Windows. The eight live AI scenarios remain pending, including General AI and Document RAG smoke tests.

| Scenario            | Result  |
| ------------------- | ------- |
| GFM table rendering | BLOCKED |
| Nested lists        | BLOCKED |
| Task lists          | BLOCKED |
| Inline mathematics  | BLOCKED |
| Display mathematics | BLOCKED |
| Syntax highlighting | BLOCKED |
| Code copying        | BLOCKED |
| Vietnamese output   | BLOCKED |
| General AI mode     | BLOCKED |
| Document RAG mode   | BLOCKED |

## 6. Responsive Verification

| Viewport | Light Mode | Dark Mode |
| -------- | ---------- | --------- |
| 375px    | BLOCKED    | BLOCKED   |
| 390px    | BLOCKED    | BLOCKED   |
| 768px    | BLOCKED    | BLOCKED   |
| 1024px   | BLOCKED    | BLOCKED   |
| 1440px   | BLOCKED    | BLOCKED   |

Browser screenshots and responsive checks are pending.

## 7. Security Verification

The renderer unit tests verified these behaviors.

- Raw HTML is not interpreted.
- Unsafe URL protocols are blocked.
- Markdown images do not trigger external resource requests.
- Untrusted KaTeX commands are restricted.
- Clipboard failures are handled explicitly.
- Task list inputs remain read-only.

## 8. Compatibility and Limitations

No database migrations or embedding changes are required.

Existing stored messages remain compatible with the new renderer.

Markdown continues to be stored and transmitted as plain text.

Legacy LaTeX delimiter variants are not automatically normalized.

Conversation persistence, multi-turn context, summarization, and conversation handoff remain outside the scope of Phase 1.

No learner outcome improvements are claimed from rendering verification alone.

## 9. References

- [https://github.com/remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)
- [https://github.com/remarkjs/remark-gfm](https://github.com/remarkjs/remark-gfm)
- [https://github.com/remarkjs/remark-math](https://github.com/remarkjs/remark-math)
- [https://github.com/rehypejs/rehype-highlight](https://github.com/rehypejs/rehype-highlight)
- [https://katex.org/docs/security](https://katex.org/docs/security)
- [https://github.com/advisories/GHSA-238P-PMPM-9MQ7](https://github.com/advisories/GHSA-238P-PMPM-9MQ7)

## 10. Release Decision

Pending manual browser QA, review of the existing production audit findings, GitHub Actions CI, and staging smoke verification.
