import type { TaskWithGoal } from "@/features/tasks/task.types";
import type { TaskRiskViewState } from "./task-risk-presentation.types";

import {
  getEffectiveTaskDueAtMs,
  isTaskRiskEligible,
} from "./task-risk-snapshot.adapter";

type RiskDisplayTask = Pick<
  TaskWithGoal,
  "id" | "status" | "completed_at" | "updated_at" | "due_at" | "due_date"
>;

const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 60_000;

export function getTaskRiskDisplayState(
  task: RiskDisplayTask,
  storedState: TaskRiskViewState | undefined,
  now: Date,
  invalidated = false,
): TaskRiskViewState {
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    return { status: "unavailable" };
  }

  if (!isTaskRiskEligible(task, now)) {
    return { status: "ineligible" };
  }

  if (!storedState) {
    return { status: "unavailable" };
  }

  if (storedState.status !== "ready") {
    return storedState;
  }

  const { alert } = storedState;

  // Do not associate a risk estimate with another task.
  if (alert.task_id !== task.id) {
    return { status: "unavailable" };
  }

  const predictedAtMs = Date.parse(alert.predicted_at);
  const updatedAtMs = Date.parse(task.updated_at);

  const taskDueAtMs = getEffectiveTaskDueAtMs(task);
  const snapshotDueAtMs = alert.due_at ? Date.parse(alert.due_at) : NaN;

  if (
    !Number.isFinite(predictedAtMs) ||
    !Number.isFinite(updatedAtMs) ||
    taskDueAtMs === null ||
    !Number.isFinite(snapshotDueAtMs)
  ) {
    return { status: "stale" };
  }

  const ageMs = nowMs - predictedAtMs;

  if (
    invalidated ||
    ageMs < -FUTURE_TOLERANCE_MS ||
    ageMs > MAX_AGE_MS ||
    updatedAtMs > predictedAtMs ||
    taskDueAtMs !== snapshotDueAtMs
  ) {
    return { status: "stale" };
  }

  const currentUtcDay = new Date(nowMs).toISOString().slice(0, 10);

  const predictionUtcDay = new Date(predictedAtMs).toISOString().slice(0, 10);

  if (currentUtcDay !== predictionUtcDay) {
    return { status: "stale" };
  }

  return storedState;
}
