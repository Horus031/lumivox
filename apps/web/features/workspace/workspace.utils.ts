import { TASK_BOARD_LANES, TaskStatus } from "../tasks/task-status";
import { getTaskBoardStatus } from "@/features/tasks/task-transition";
import type { WorkspaceScope, WorkspaceTask } from "./workspace.types";

export function resolveWorkspaceScope(
  value: string | undefined,
  selectedGoalId: string | undefined,
): WorkspaceScope | null {
  if (value === "unassigned") {
    return {
      type: "unassigned",
    };
  }

  if (selectedGoalId) {
    return {
      type: "goal",
      goalId: selectedGoalId,
    };
  }

  return null;
}

export function getWorkspaceScopeKey(scope: WorkspaceScope) {
  if (scope.type === "goal") {
    return scope.goalId;
  }

  return scope.type;
}

export function groupWorkspaceTasksByStatus(
  tasks: WorkspaceTask[],
  referenceNow: Date,
): Record<TaskStatus, WorkspaceTask[]> {
  const groups = Object.fromEntries(
    TASK_BOARD_LANES.map((status) => [status, []]),
  ) as unknown as Record<TaskStatus, WorkspaceTask[]>;

  for (const task of tasks) {
    groups[getTaskBoardStatus(task, referenceNow)].push(task);
  }

  return groups;
}
