import { z } from "zod";

import type { WorkspaceTask } from "@/features/workspace/workspace.types";
import type { Database } from "@/types/database.types";
import type { NativeTaskRiskAlert } from "./native-task-risk.types";
import type { TaskRiskViewState } from "./task-risk-presentation.types";

type GeneratedTaskRiskSnapshotRow =
  Database["public"]["Functions"]["get_my_native_task_risk_snapshots_for_tasks"]["Returns"][number];

type NullableSnapshotField =
  | "algorithm"
  | "decision_threshold"
  | "effective_due_at"
  | "goal_id"
  | "goal_title"
  | "model_key"
  | "model_version"
  | "predicted_at"
  | "predicted_label"
  | "prediction_id"
  | "risk_probability"
  | "task_completed_at";

// The RPC can return null for optional task fields and missing joined rows.
export type TaskRiskSnapshotRow = Omit<
  GeneratedTaskRiskSnapshotRow,
  NullableSnapshotField
> & {
  [Field in NullableSnapshotField]: GeneratedTaskRiskSnapshotRow[Field] | null;
};

const DAY_MS = 86_400_000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HORIZON_MS = 14 * DAY_MS;
const FUTURE_TOLERANCE_MS = 60_000;

const MODEL_KEY = "native_task_delay_risk_classifier";
const MODEL_ALGORITHM = "logistic_regression_balanced";
const FEATURE_SCHEMA = "native-task-risk-v2";

const reasonSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
});

const actionSchema = z.object({
  action_id: z.string(),
  label: z.string(),
  description: z.string(),
  action_type: z.enum([
    "start_focus",
    "reschedule",
    "split_task",
    "reduce_scope",
    "view_task",
  ]),
  priority: z.number().int().min(1).max(5),
  payload: z.record(z.string(), z.unknown()),
});

const attributionSchema = z.object({
  feature_name: z.string(),
  feature_value: z.number(),
  contribution: z.number(),
  effect: z.enum(["increases_risk", "decreases_risk", "neutral"]),
  rank: z.number().int(),
});

const metadataSchema = z.object({
  prediction_mode: z.enum(["native_ml", "deterministic_fallback"]),
  input_revision: z.number().int().nonnegative(),
  feature_schema_version: z.string(),
  risk_band: z.enum(["low", "moderate", "elevated", "high"]),
  risk_score: z.number().finite().min(0).max(100),
  due_at: z.string().nullable(),
  reason_summaries: z.array(reasonSchema),
  recommended_actions: z.array(actionSchema),
});

export function getEffectiveTaskDueAtMs(
  task: Pick<WorkspaceTask, "due_at" | "due_date">,
): number | null {
  if (task.due_at) {
    const dueAt = Date.parse(task.due_at);

    if (Number.isFinite(dueAt)) {
      return dueAt;
    }
  }

  if (task.due_date) {
    const dateStart = Date.parse(`${task.due_date}T00:00:00.000Z`);

    if (Number.isFinite(dateStart)) {
      return dateStart + DAY_MS;
    }
  }

  return null;
}

function taskIsEligible(task: WorkspaceTask, nowMs: number): boolean {
  if (
    task.status === "completed" ||
    task.status === "cancelled" ||
    task.completed_at !== null
  ) {
    return false;
  }

  const dueAtMs = getEffectiveTaskDueAtMs(task);

  if (dueAtMs === null) {
    return false;
  }

  const remaining = dueAtMs - nowMs;

  return remaining >= 0 && remaining <= HORIZON_MS;
}

export function isTaskRiskEligible(task: WorkspaceTask, now: Date): boolean {
  return taskIsEligible(task, now.getTime());
}

export function resolveTaskRiskSnapshot(
  task: WorkspaceTask,
  row: TaskRiskSnapshotRow | undefined,
  now: Date,
): TaskRiskViewState {
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    return { status: "unavailable" };
  }

  if (!taskIsEligible(task, nowMs)) {
    return { status: "ineligible" };
  }

  if (!row || row.task_id !== task.id) {
    return { status: "unavailable" };
  }

  if (
    row.task_status === "completed" ||
    row.task_status === "cancelled" ||
    row.task_completed_at !== null
  ) {
    return { status: "ineligible" };
  }

  if (!row.prediction_id || !row.predicted_at) {
    return { status: "unavailable" };
  }

  const metadataResult = metadataSchema.safeParse(row.prediction_metadata);

  if (!metadataResult.success) {
    // Includes legacy predictions without input_revision.
    return { status: "stale" };
  }

  const metadata = metadataResult.data;

  if (metadata.prediction_mode !== "native_ml") {
    return { status: "unavailable" };
  }

  if (
    !row.model_active ||
    row.model_key !== MODEL_KEY ||
    row.algorithm !== MODEL_ALGORITHM ||
    !row.model_version ||
    metadata.feature_schema_version !== FEATURE_SCHEMA
  ) {
    return { status: "stale" };
  }

  if (
    !Number.isSafeInteger(row.current_input_revision) ||
    metadata.input_revision !== row.current_input_revision
  ) {
    return { status: "stale" };
  }

  const predictedAtMs = Date.parse(row.predicted_at);
  const taskUpdatedAtMs = Date.parse(row.task_updated_at);

  if (!Number.isFinite(predictedAtMs) || !Number.isFinite(taskUpdatedAtMs)) {
    return { status: "stale" };
  }

  const ageMs = nowMs - predictedAtMs;

  if (
    ageMs < -FUTURE_TOLERANCE_MS ||
    ageMs > MAX_AGE_MS ||
    taskUpdatedAtMs > predictedAtMs
  ) {
    return { status: "stale" };
  }

  // The model has time-dependent features, including weekday.
  if (
    new Date(nowMs).toISOString().slice(0, 10) !==
    new Date(predictedAtMs).toISOString().slice(0, 10)
  ) {
    return { status: "stale" };
  }

  const taskDueAtMs = getEffectiveTaskDueAtMs(task);
  const snapshotDueAtMs = metadata.due_at ? Date.parse(metadata.due_at) : NaN;

  const databaseDueAtMs = row.effective_due_at
    ? Date.parse(row.effective_due_at)
    : NaN;

  if (
    taskDueAtMs === null ||
    !Number.isFinite(snapshotDueAtMs) ||
    !Number.isFinite(databaseDueAtMs) ||
    taskDueAtMs !== snapshotDueAtMs ||
    taskDueAtMs !== databaseDueAtMs
  ) {
    return { status: "stale" };
  }

  if (
    row.risk_probability === null ||
    row.predicted_label === null ||
    row.decision_threshold === null ||
    !Number.isFinite(row.risk_probability) ||
    !Number.isFinite(row.decision_threshold) ||
    row.risk_probability < 0 ||
    row.risk_probability > 1 ||
    row.decision_threshold < 0 ||
    row.decision_threshold > 1
  ) {
    return { status: "unavailable" };
  }

  const parsedAttributions = z
    .array(attributionSchema)
    .safeParse(row.top_attributions);

  const alert: NativeTaskRiskAlert = {
    prediction_id: row.prediction_id,
    task_id: task.id,
    goal_id: row.goal_id,
    task_title: row.task_title,
    goal_title: row.goal_title,

    risk_probability: row.risk_probability,
    predicted_label: row.predicted_label,
    decision_threshold: row.decision_threshold,
    risk_score: metadata.risk_score,
    risk_band: metadata.risk_band,

    reason_summaries: metadata.reason_summaries,
    recommended_actions: metadata.recommended_actions,

    days_until_due: Math.max(0, Math.ceil((taskDueAtMs - nowMs) / DAY_MS)),
    due_at: new Date(taskDueAtMs).toISOString(),

    model_key: row.model_key,
    model_version: row.model_version,
    algorithm: row.algorithm,
    predicted_at: row.predicted_at,

    top_attributions: parsedAttributions.success ? parsedAttributions.data : [],
  };

  return {
    status: "ready",
    alert,
  };
}
