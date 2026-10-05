import type { TaskStatus } from "./task-status";

export const DIRECT_TASK_STATUS_TARGETS = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export type DirectTaskStatus = (typeof DIRECT_TASK_STATUS_TARGETS)[number];

export function isDirectTaskStatusTarget(
  value: string,
): value is DirectTaskStatus {
  return DIRECT_TASK_STATUS_TARGETS.includes(value as DirectTaskStatus);
}

export function getTaskCompletedAt(
  task: { status: TaskStatus; completed_at: string | null },
  targetStatus: TaskStatus,
  referenceNow: Date,
) {
  if (targetStatus !== "completed") return null;
  return task.status === "completed"
    ? task.completed_at
    : referenceNow.toISOString();
}

type BoardStatusInput = {
  status: TaskStatus;
  due_at: string | null;
};

export function getTaskBoardStatus(
  task: BoardStatusInput,
  referenceNow: Date,
): TaskStatus {
  if (
    task.status === "completed" ||
    task.status === "cancelled" ||
    task.status === "in_review"
  ) {
    return task.status;
  }

  const dueAt = task.due_at ? new Date(task.due_at) : null;

  if (
    dueAt &&
    Number.isFinite(dueAt.getTime()) &&
    dueAt.getTime() < referenceNow.getTime()
  ) {
    return "overdue";
  }

  // Backward compatibility for old rows whose persisted
  // status was manually stored as overdue.
  if (task.status === "overdue") {
    return "in_progress";
  }

  return task.status;
}

const DIRECT_TRANSITIONS: Record<TaskStatus, readonly DirectTaskStatus[]> = {
  todo: ["in_progress", "completed", "cancelled"],

  in_progress: ["todo", "completed", "cancelled"],

  completed: ["in_progress"],

  cancelled: ["todo", "in_progress"],

  overdue: ["completed", "cancelled"],

  in_review: [],
};

export function canDirectlyTransitionTask(
  from: TaskStatus,
  to: DirectTaskStatus,
) {
  if (from === to) {
    return false;
  }

  return DIRECT_TRANSITIONS[from].includes(to);
}
