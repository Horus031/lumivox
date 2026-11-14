# Task Risk Recovery — Phase 2 Data Contract

## Objective

Provide a secure, batched, task-keyed read path for Native Task
Risk ML predictions before integrating the UI into Workspace.

## Source of truth

Tasks:

- public.tasks

Focus history:

- public.focus_sessions

Native ML predictions:

- public.deadline_risk_predictions
- public.deadline_risk_feature_attributions
- public.ml_model_versions

Input revision:

- public.native_task_risk_input_revisions

## Ownership

The batch RPC uses auth.uid().

A caller may supply task IDs but may only receive rows
belonging to their authenticated user.

Service-role keys must not be exposed to the browser.

## Batch size

Maximum 100 task IDs per RPC.

The Web query chunks larger Workspace collections.
No per-task network request is required.

## Eligibility

A task is ineligible if:

- It is completed or cancelled.
- completed_at is non-null.
- It has no valid effective deadline.
- Its effective deadline is in the past.
- Its deadline is outside the 14-day prediction horizon.

Overdue task handling remains separate from future delay risk.

## Snapshot freshness

A snapshot is accepted only if:

1. It is from the expected Native ML model.
2. The model version remains active.
3. The feature schema matches.
4. The recorded input revision matches the current revision.
5. The task has not been updated after prediction.
6. The effective deadline is unchanged.
7. The prediction is no older than six hours.
8. The prediction and read occur on the same UTC date.
9. The probability and threshold are valid numbers.
10. The prediction metadata passes runtime validation.

Legacy predictions without input revision are stale.

A fresh snapshot means that it satisfies this bounded
freshness policy. It does not mean the model continuously
recomputes risk in real time.

## Invalidation sources

Task INSERT, UPDATE, DELETE.
Focus session INSERT, UPDATE, DELETE.

These cover the database inputs used by the current
native-task-risk-v2 feature builder.

If new feature sources are introduced, update invalidation
coverage before enabling their predictions in the UI.

## Prediction generation coverage

Batch reading does not create new predictions.

The existing manual refresh and cron candidate limits
remain separate constraints.

A task without a stored prediction is unavailable,
not low-risk.

Do not claim complete prediction coverage until generation
and refresh policies have been verified.

## Model modes

Only native_ml snapshots may become ready.

deterministic_fallback is not displayed as verified
Native ML risk.

Risk band and predicted_label are distinct outputs.

## Phase 2 exclusions

- No Task Card warning integration.
- No Task Drawer risk tab.
- No automatic recovery actions.
- No new model training.
- No ML threshold change.
- No production deployment.

## Release checks

- Ownership tests pass.
- Revision trigger tests pass.
- Feature builder revision checks pass.
- Batch query tests pass.
- Adapter staleness tests pass.
- Existing prediction routes remain functional.
- Existing alert RPC remains unchanged.
- TypeScript generated schema is updated.
- Web and AI API CI pass.
- Migration replay passes from a clean database.
- Staging deployment and E2E pass.
