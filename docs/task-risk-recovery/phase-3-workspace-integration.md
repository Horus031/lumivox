# Task Risk Recovery — Phase 3 Workspace Integration

## Goal

Integrate validated Native Task Risk snapshots into the
existing Workspace without modifying the task lifecycle.

## Architecture

Workspace Page
-> getWorkspaceTasks
-> getWorkspaceTaskRiskStates
-> WorkspaceBoard
-> WorkspaceLane
-> WorkspaceTaskCard / TaskDetailsDrawer

The server is responsible for validating prediction data.

The client is responsible for additional display-time
freshness and local mutation invalidation.

## Risk UI

Task Card:

- Show high, elevated and moderate indicators.
- Show stale when a previous snapshot needs refresh.
- Hide low, unavailable and ineligible indicators.

Task Details:

- Add a Risk tab.
- Display prediction probability and timestamp.
- Display model explanations.
- Display localized, read-only recovery suggestions.
- Never show stale probabilities.

## Mutation policy

Optimistic task transitions invalidate all current
ready risk states.

Task edits, Subtask changes and relevant Drawer callbacks
also invalidate the visible risk snapshots.

New server data replaces optimistic risk state.

## Failure policy

Risk RPC errors must not prevent Workspace rendering.

Unavailable is not equivalent to low risk.

No recovery action runs during Phase 3.

## Known limitations

- Existing prediction refresh still has task coverage limits.
- Prediction freshness is validated on server reads.
- External changes on another device do not instantly push
  new revision information to an already-open Workspace.
- Free-form model explanations are not fully localized yet.
- Recovery workflows are deferred to later phases.

## Exit criteria

- [ ] Workspace loads with risk snapshots.
- [ ] Workspace remains usable when risk RPC fails.
- [ ] Indicators render on the correct task.
- [ ] No nested buttons.
- [ ] Drag and drop remains functional.
- [ ] Optimistic mutation invalidates risk.
- [ ] Drawer displays matching task risk.
- [ ] Stale probability is hidden.
- [ ] Suggestions are read-only.
- [ ] EN/VI labels work.
- [ ] Unit, lint, typecheck and build pass.
- [ ] Staging E2E and deployment pass.
