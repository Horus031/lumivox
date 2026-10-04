import type { Task } from "./task.types";

export const TASK_STATUS_VALUES = [
  "todo",
  "in_progress",
  "in_review",
  "completed",
  "overdue",
  "cancelled",
] as const satisfies readonly Task["status"][];

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUS_VALUES.includes(value as TaskStatus);
}

export const TASK_BOARD_LANES = [
  "todo",
  "in_progress",
  "in_review",
  "completed",
  "overdue",
  "cancelled",
] as const;