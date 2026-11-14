
# Task Risk Recovery — Phase 0 Architecture Baseline

## 1. Purpose

This document freezes the architecture decisions and known gaps for
the Task Risk Recovery initiative.

Review date: 2026-11-14
Repository: Horus031/lumivox
Reviewed branch: product-release
Reviewed baseline commit:
109d2eee112d817fb9ea270b363fe2aacfe2c27e

The implementation branch must record its own starting HEAD.
If source files have changed, revalidate the affected contracts.

The goal is to evolve the existing native task-delay prediction
feature into a task-first risk warning and recovery journey.

## 2. Scope

In scope:
- Native Lumivox task-delay prediction.
- Risk indicators inside Workspace task cards.
- Risk explanation inside Task Details.
- Actionable recovery recommendations.
- Focus V2 integration.
- Subtask creation.
- Study Schedule integration.
- Prediction freshness and reassessment.
- Testing, staging, and production readiness.

Out of scope for Phase 0:
- Model retraining.
- Changing model thresholds.
- Database schema migrations.
- UI redesign implementation.
- Automatic task or schedule modifications.
- Production deployment.

## 3. Separate Risk Systems

Three related systems exist and must remain distinct.

### 3.1 Native Task Risk ML

Primary service:
services/ai-api/app/services/native_task_risk_service.py

Feature builder:
services/ai-api/app/services/native_task_risk_features_v2.py

API:
services/ai-api/app/api/routes/native_task_risk.py

This is the primary prediction system for this initiative.

### 3.2 Native Task Risk Assessment / Insight

Related services:
services/ai-api/app/services/native_task_risk_insight_service.py

Related storage:
native_task_risk_assessments
ai_insight_cards

This is a separate assessment and explanation flow.
Do not assume its scores are interchangeable with ML probabilities.

### 3.3 Legacy Deadline Risk ML

Primary service:
services/ai-api/app/services/deadline_risk_service.py

Legacy artifact:
ml/artifacts/deadline-risk/random_forest.joblib

Do not replace this artifact with the native-task-risk model.

## 4. Current Native ML Contract

Model:
- Algorithm: logistic_regression_balanced
- Feature schema: native-task-risk-v2
- Prediction horizon: 14 days
- Decision threshold: 0.4
- Number of model features: 27

Reference artifact metadata:
services/ai-api/ml/artifacts/native-task-risk/
logistic_regression_balanced_metadata.json

The trained model currently exposes:
- risk_probability
- risk_score
- risk_band
- predicted_late
- decision_threshold
- reasons
- reason_summaries
- recommended_actions

The model's offline metrics are not production outcome metrics.

A risk band is not equivalent to predicted_late.
For example, moderate risk starts at probability 0.35,
while predicted_late uses the configured model threshold.

Risk explanations must not claim proven causation.

## 5. Current Prediction Flow

Manual refresh:

1. Web Server Action authenticates the current user.
2. Candidate tasks are read from a Supabase RPC.
3. A batch request is sent to the AI API.
4. Native V2 features are constructed.
5. The model calculates risk.
6. Reasons and recommended actions are generated.
7. Predictions and attributions are persisted.
8. Web retrieves the latest stored alerts.

Relevant Web files:
- features/native-task-risk/native-task-risk.actions.ts
- features/native-task-risk/native-task-risk.queries.ts
- features/native-task-risk/native-task-risk.types.ts

All Web paths above are relative to apps/web.

Current manual refresh defaults:
- Horizon: 14 days
- Candidate limit: 8 tasks

The API batch request supports up to 20 task IDs.
These limits are not suitable as the final Workspace coverage policy.

## 6. Background Refresh

Web route:
apps/web/app/api/cron/native-task-risk/route.ts

AI API route:
/api/v1/native-task-risk/cron-refresh

Current request parameters:
- horizon_days: 14
- max_users: 50
- max_tasks_per_user: 8
- skip_recent_hours: 6

The cron candidate RPC excludes recently predicted tasks.

The source contains the cron route but does not prove
that an external scheduler currently invokes it.

Scheduler configuration must be verified before release.

## 7. Current Persistence

Primary stored prediction data:
- deadline_risk_predictions
- deadline_risk_feature_attributions
- ml_model_versions

Current user-facing RPC:
public.get_my_latest_native_task_risk_alerts(integer)

Relevant migrations:
- 20260905054045_add_native_task_risk_web_alerts.sql
- 20260905060909_add_actionable_native_task_risk_alerts.sql
- 20260905061841_add_native_task_risk_cron_candidates.sql

The current alert RPC selects the latest prediction per task.

Known limitation:
It does not provide a complete freshness contract for changes
to task fields, Focus activity, schedule data, or model versions.

Future queries must enforce authenticated ownership and
avoid cross-user data exposure.

## 8. Current Workspace Integration

Workspace page:
apps/web/app/[locale]/(protected)/workspace/page.tsx

Data query:
apps/web/features/workspace/workspace.queries.ts

Board:
apps/web/features/workspace/components/workspace-board.tsx

Task card:
apps/web/features/workspace/components/workspace-task-card.tsx

Task drawer:
apps/web/features/tasks/components/task-details-drawer.tsx

The Workspace currently loads root tasks with subtasks.
It does not attach native risk snapshots to each task card.

The existing drawer supports:
- overview
- subtasks
- documents
- review

Decision:
Risk warnings will be task-first.
A large, independent list of risk cards is not the primary UI.

## 9. Existing Recovery Capabilities

### 9.1 Focus

Focus V2 supports task-associated sessions.

Current risk action links to:
/focus?taskId=<task-id>

The Focus page currently handles studySession input,
but does not consume this taskId deep link.

Required future work:
- Validate the selected task.
- Preselect the task in Focus V2.
- Handle active session conflicts.

### 9.2 Split Task

Existing action:
createSubtaskAction

Existing UI:
TaskSubtasksPanel

Current native risk action opens the subtasks tab.

Required future work:
- Reviewable split suggestions.
- User confirmation.
- Safe multi-subtask persistence.
- Retry and duplicate protection.

### 9.3 Study Schedule

Existing capabilities:
- createStudyScheduleAction
- reviseStudyScheduleAction
- generateStudyOccurrences
- TaskStudyScheduleSection

Schedules support revision checks and timezone-aware occurrences.

Required future work:
- Estimate feasible additional study time.
- Compare old and proposed schedules.
- Validate conflicts and deadlines.
- Require confirmation before changes.

## 10. Current Security Contract

The browser must not call the privileged AI API directly.

Next.js Server Actions authenticate the current user.

fetchAiApi supplies:
x-lumivox-internal-key

The native prediction endpoints must enforce the same
internal API key contract.

Phase 0 adds this dependency to:
- POST /api/v1/native-task-risk/predict
- POST /api/v1/native-task-risk/batch-predict

The cron endpoint retains its separate
NATIVE_TASK_RISK_CRON_SECRET contract.

Never log or commit API secrets.

## 11. Required Data Contract for Phase 2

Every task risk snapshot must be associated with:
- user ownership
- task_id
- prediction_id
- model identity and version
- probability and risk band
- decision threshold
- predicted_at
- prediction mode
- relevant input freshness information
- reasons and recommended actions

Future eligibility states:
- eligible
- ineligible
- unavailable

Future freshness states:
- fresh
- stale
- unavailable

These are design decisions, not existing database columns.

Never display a stale snapshot as a verified fresh prediction.
Completed and cancelled tasks must not show active risk warnings.
Overdue status must remain distinct from future delay risk.

## 12. Recovery Action Principles

Actions are suggestions, not commands.

Each action must have:
- validated task context
- eligibility checks
- a clear user-facing explanation
- preview when data would change
- explicit confirmation
- success and error feedback
- a reassessment policy

No recovery action may silently alter task or schedule data.

Do not claim a numerical risk reduction without a valid
model-based recalculation or separately validated estimate.

## 13. Risk Register

P0:
- Missing internal authentication on prediction endpoints.

P1:
- Limited task coverage during refresh.
- Stale predictions after input changes.
- Missing task-level warning UI.
- Focus deep-link mismatch.
- Non-transactional recovery actions.
- Incomplete schedule feasibility validation.
- No intervention lifecycle.

P2:
- Incomplete localization.
- Missing user-facing prediction freshness.
- Limited recommendation personalization.
- Unverified background scheduling.
- Insufficient post-release effectiveness monitoring.

## 14. Delivery and Release Constraints

Feature development starts from product-release.

Release flow:
feature branch -> PR -> product-release -> staging ->
validated release PR -> main -> production

Staging and production use distinct infrastructure.

The product-release and main branches had diverged
at the review date. Reconcile changes before production merge.

Never treat a successful CI run as proof of deployment.
Verify the actual Web and AI API revision SHAs.

## 15. Phase 0 Acceptance Criteria

- [ ] Feature branch created from product-release.
- [ ] Internal authentication added to prediction routes.
- [ ] Missing-key tests pass.
- [ ] Invalid-key tests pass.
- [ ] Valid-key tests pass.
- [ ] Cron authentication regression test passes.
- [ ] Existing native model tests pass.
- [ ] Artifact compatibility verification passes.
- [ ] Full FastAPI unit suite passes.
- [ ] Architecture baseline committed.
- [ ] No database migration or model artifact changed.
- [ ] Changes reviewed before merge.

Phase 0 must not be marked PASS until the checks above
have been verified against the implementation commit.
