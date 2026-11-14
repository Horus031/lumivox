# Task Risk Recovery — Phase 1 UI Contract

## Purpose

Build reusable, accessible, localized presentation components
before connecting live prediction data to Workspace.

Base branch: product-release
Feature branch: feature/task-risk-recovery

## Components

### TaskRiskIndicator

Location:
apps/web/features/native-task-risk/components/task-risk-indicator.tsx

Responsibility:

- Present a compact task-level risk label.
- Reuse Lumivox theme tokens.
- Avoid nested interactive elements.
- Hide low-risk and ineligible/unavailable warnings.
- Distinguish loading and stale data.

Must not:

- Query Supabase.
- Trigger predictions.
- Modify tasks.
- Own navigation or drag-and-drop.

### TaskRiskSummary

Location:
apps/web/features/native-task-risk/components/task-risk-summary.tsx

Responsibility:

- Display the model estimate.
- Display the risk band.
- Display prediction time.
- Display up to three explanatory summaries.
- Explain that model output is not a guaranteed outcome.
- Hide outdated prediction values in stale state.

Must not:

- Treat model explanations as proven causation.
- Reuse stale values as fresh values.
- Infer prediction freshness without a data contract.

### TaskRiskRecoveryPanel

Location:
apps/web/features/native-task-risk/components/task-risk-recovery-panel.tsx

Responsibility:

- Display supported recovery action types.
- Localize labels and descriptions.
- Disable unavailable or disconnected actions.
- Emit action-request callbacks.

Must not:

- Write to the database.
- Create Focus sessions.
- Modify deadlines.
- Create subtasks.
- Revise learning schedules.
- Claim that selecting an action means it succeeded.

## Presentation State Contract

Supported states:

- loading
- unavailable
- ineligible
- stale
- ready

Ready state contains a NativeTaskRiskAlert.

Risk bands:

- high
- elevated
- moderate
- low

The model's predicted_label is distinct from its risk_band.

A risk value must not be displayed as verified fresh data
unless the Phase 2 adapter has validated freshness.

## Localization

Namespaces:

- messages/en.json -> taskRiskRecovery
- messages/vi.json -> taskRiskRecovery

UI chrome must resolve through next-intl.

Backend reason strings are not yet guaranteed to be localized.
Their domain-level normalization is planned for Phase 4.

## Accessibility

- Use readable labels, not color alone.
- Keep decorative icons aria-hidden.
- Do not nest buttons inside buttons.
- Preserve keyboard focus visibility.
- Maintain touch-friendly controls.
- Allow text wrapping at narrow viewport widths.
- Avoid flashing warning animations.
- Review both light and dark modes.

## Preview Environment

Route:
/[locale]/dev/task-risk

Available only when NODE_ENV is development.

The preview uses static fixtures.
It must never query personal task data.
Its action callbacks must not perform database writes.

## Integration Boundaries

Phase 2:

- Map owned task predictions to TaskRiskViewState.
- Validate eligibility and freshness.
- Provide batched task-risk data.

Phase 3:

- Integrate TaskRiskIndicator with WorkspaceTaskCard.
- Preserve drag-and-drop behavior.
- Connect task selection with Task Details.

Phase 4:

- Integrate TaskRiskSummary and Recovery Panel with
  task-specific explanation data.
- Normalize and localize model explanation content.

Phases 5–8:

- Implement verified recovery actions and reassessment.

## Phase 1 Exit Criteria

- [ ] All UI components are implemented.
- [ ] TypeScript contracts compile.
- [ ] All eight preview scenarios render.
- [ ] English and Vietnamese text resolve.
- [ ] Light mode is verified.
- [ ] Dark mode is verified.
- [ ] Mobile layout is verified at 320px.
- [ ] Keyboard navigation is verified.
- [ ] Stale predictions do not show old risk values.
- [ ] Recovery callbacks cannot modify tasks on their own.
- [ ] New component tests pass.
- [ ] Full Web lint, tests, typecheck, and build pass.
- [ ] CI passes on the PR commit.
- [ ] No production data or backend contract is changed.
