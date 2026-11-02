# Phase 04 — Task Scheduling UI Evidence

## Scope and Evidence Policy

- Source: the supplied Phase 04 / Step 4.1 implementation guide.
- This file is an evidence template only. No component implementation, test execution, database operation, commit or push was performed while preparing it.
- `PENDING` means no verification result has been recorded. Replace it with the actual result, command/output reference and any failures after completing the work.
- Phase 03 results below are carried forward from the supplied acceptance summary, not independently rerun for this document.
- File name follows the user's requested `phase-4-evidence.md`; the pasted guide calls it `phase-04-evidence.md`. Use this file consistently when recording or committing evidence.

## Baseline

- Branch: `feature/learning-schedule-foundation` (required).
- HEAD SHA: PENDING.
- Working tree before verification: PENDING.
- Compared with `product-release`: PENDING — record the compared SHA/ref and ahead/behind counts.
- Verification date/time and timezone: PENDING.
- Environment: PENDING.

## Phase 03 Handoff

- Phase 03: PASS according to the supplied final-acceptance summary.
- Prior migration replay: 79 migrations PASS (reported).
- Prior pgTAP: 322/322 assertions PASS (reported).
- Prior concurrency: 36/36 runs PASS (reported).
- Prior web gates: lint PASS with 1 existing warning; 524 unit tests PASS, 1 skipped; build PASS with 98/98 static pages (reported).
- Ready to begin Phase 04: YES according to the supplied summary.
- Production deployment authorized: NO.
- Merge into `product-release`: not authorized by this guide.

## Step 4.1 — Schedule Draft Editor and Live Preview

### Source

- Component: `apps/web/features/learning-schedule/components/schedule-draft-editor.tsx`.
- Recurrence engine: `apps/web/features/learning-schedule/schedule-engine.ts`.
- Input contract: `StudyScheduleInput` through `initialValue`.
- Continuation contract: optional `onContinue(draft)` callback, reserved for later integration.
- Implementation commit SHA: PENDING.
- Test file(s): PENDING.
- Scope: independent draft editor and recurrence preview only. Task Details integration and authenticated persistence belong to Step 4.2.

### Functional Acceptance

- Render valid initial input: PENDING.
- Edit start/end dates and IANA timezone: PENDING.
- Add weekly slot: PENDING.
- Edit weekday, start time and end time: PENDING.
- Remove weekly slot: PENDING.
- Preview recalculates after draft changes: PENDING.
- Preview matches `generateStudyOccurrences()` rather than a separate UI recurrence algorithm: PENDING.
- Total occurrence count and displayed local dates/times: PENDING.
- Preview truncation: PENDING — reference component shows the first 8 occurrences and a notice when more exist; total count must remain accurate.
- Valid draft passed to `onContinue`: PENDING.

### Validation and Continuation

- Overlapping slots display an error: PENDING.
- Invalid/inverted date range displays an error: PENDING.
- Invalid timezone displays an error: PENDING.
- Recurrence/DST errors are surfaced from the existing engine: PENDING.
- Continue disabled for invalid recurrence: PENDING.
- Continue disabled when there are zero matching sessions: PENDING.
- Continue disabled without an `onContinue` callback: PENDING.
- Add-slot control respects the reference limit of 21 weekly slots: PENDING.
- Validation error clears and preview recovers after correcting input: PENDING.

### Reference Fixture

```ts
const initialValue = {
  startsOn: "2026-11-02",
  endsOn: "2026-11-30",
  timezone: "Asia/Ho_Chi_Minh",
  slots: [
    { weekday: 1, startTime: "19:00", endTime: "20:30" },
    { weekday: 3, startTime: "19:00", endTime: "20:30" },
  ],
};
```

- Actual rendered preview/count: PENDING.
- Comparison with engine output: PENDING.
- Interaction test or manual verification evidence: PENDING.

### Boundary Verification

- Draft changes remain in React component state: PENDING.
- No Supabase calls or database writes from the editor: PENDING.
- No email sending: PENDING.
- No real RPC connection in Step 4.1: PENDING.
- No Task Details wiring in Step 4.1: PENDING.
- Evidence supporting these checks: PENDING.

### Quality Gates

Run from `apps/web` and record actual output; earlier Phase 03 results do not satisfy these gates.

- Lint: PENDING — command `npm run lint`; exit code, errors and warnings: PENDING.
- Unit tests: PENDING — command `npm run test:unit`; test files, passed/failed/skipped counts and duration: PENDING.
- Build: PENDING — command `npm run build`; exit code, TypeScript result and build summary: PENDING.
- Known warnings/skips and their implications: PENDING.
- Failures, fixes and rerun results: PENDING.

### Commit and Review

- Component/test changes reviewed: PENDING.
- Evidence reflects actual verification: PENDING.
- `git diff --cached --check`: PENDING.
- Commit SHA: PENDING.
- Suggested message from guide: `feat(learning-schedule): add schedule draft editor and preview`.
- Push to `origin/feature/learning-schedule-foundation`: PENDING.
- Review outcome: PENDING.

Status: PENDING VERIFICATION.

## Step 4.2 — Task Details Integration and Schedule Creation

- Implementation/source and commit: PENDING.
- `onContinue` integration with `createStudyScheduleAction()`: PENDING.
- Loading, error, success and data refresh behavior: PENDING.
- Verification commands, tests and results: PENDING.
- Failures / outstanding issues: PENDING.
- Status: PENDING.

## Step 4.3 — Schedule Details, Status and Sessions List

- Implementation/source and commit: PENDING.
- Verification commands, tests and results: PENDING.
- Failures / outstanding issues: PENDING.
- Status: PENDING.

## Step 4.4 — Whole-Schedule Revision UI

- Implementation/source and commit: PENDING.
- Verification commands, tests and results: PENDING.
- Failures / outstanding issues: PENDING.
- Status: PENDING.

## Step 4.5 — Single-Session Reschedule UI

- Implementation/source and commit: PENDING.
- Verification commands, tests and results: PENDING.
- Failures / outstanding issues: PENDING.
- Status: PENDING.

## Step 4.6 — Accessibility, i18n, Responsiveness and Integration Tests

- Accessibility verification and results: PENDING.
- EN/VI translations and verification: PENDING.
- Responsive layout verification and results: PENDING.
- Integration test commands and results: PENDING.
- Failures / outstanding issues: PENDING.
- Status: PENDING.

## Step 4.7 — Phase 04 Final Acceptance

- Branch / HEAD / working tree: PENDING.
- Steps 4.1–4.6 evidence reviewed: PENDING.
- Final verification commands and actual results: PENDING.
- Lint / unit tests / build: PENDING.
- Outstanding risks and deferred work: PENDING.
- Phase 04: PENDING VERIFICATION.
- Ready for the next phase: PENDING.
- Production deployment authorized: NO.
