# Task Risk Recovery — Phase 4 Recovery Workflows

Phase 3 baseline is `4052f4265d20acda8efbcd79721ceea6a3fc1f9a`.

## Recovery actions

The Risk tab in Workspace Task Details shows review buttons for suggestions
returned by a ready snapshot with a moderate, elevated, or high risk band.
The buttons pass the action type to the drawer. Model payload values such as
`days_to_add` are advisory.

| Suggestion | Destination | User confirmation |
| --- | --- | --- |
| Start Focus | Localized `/focus?taskId=<id>` | Start in the legacy form or Focus V2 builder. |
| Split Task | Subtasks tab in the current drawer | Submit the existing Subtask form. |
| Reschedule | Overview tab with Task Edit open | Choose the deadline and click Save. |
| Reduce Scope | Overview tab with Task Edit open | Edit the Task and click Save. |

Focus accepts a single UUID and checks for the Task in the current user's
eligible options. For a Task outside the initial 100 options, the fallback
query filters by ID, owner, and `todo`, `in_progress`, or `overdue` status.
An active Focus session or a `studySession` request takes precedence.

Task Edit submits through `updateTaskAction` with the expected status and
last update timestamp. The Dashboard alerts component's localized Review
deadline link opens `/workspace?task=<id>&tab=overview&edit=1`. The Dashboard
page currently has the alerts section commented out. The component remains
available and the prediction refresh action is retained.

## Verification

- ESLint completed with zero errors and five existing warnings. TypeScript
  and the Next.js production build passed. Vitest passed 1,148 tests and
  skipped 26 with two workers.
- Focus page unit tests exercise available options, the fallback outside 100
  results, owner and status filters, malformed or repeated IDs, and active
  session and study-plan precedence.
- Focus form tests exercise submission with a preselected Task in both forms.
- Recovery UI tests exercise the drawer destinations, navigation on repeated
  Start Focus clicks, the localized Dashboard link, and hidden recovery
  buttons for stale, unavailable, and low risk.
- The local Workspace Playwright suite includes a case that reads the Task
  and Focus session rows before confirmation and after Save or Start.
  This case passed against a production build and local Supabase using the
  legacy Focus form with `FOCUS_V2_ENABLED=false`.
- The Workspace keyboard drag case passed in that run. Two existing Workspace
  cases still timed out locally. The quick-create case could not find the new
  card, and the cancel/restore case timed out waiting for the board to leave
  its busy state after a drag. Full Workspace E2E verification remains open.
