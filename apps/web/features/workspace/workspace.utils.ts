import { TASK_BOARD_LANES, TaskStatus } from "../tasks/task-status";
import type { WorkspaceScope, WorkspaceTask } from "./workspace.types";

export function resolveWorkspaceScope(
  value: string | undefined,
  goalIds: readonly string[],
): WorkspaceScope {
  if (!value || value === "all") {
    return {
      type: "all",
    };
  }

  if (value === "unassigned") {
    return {
      type: "unassigned",
    };
  }

  if (goalIds.includes(value)) {
    return {
      type: "goal",
      goalId: value,
    };
  }

  return {
    type: "all",
  };
}

export function getWorkspaceScopeKey(scope: WorkspaceScope) {
  if (scope.type === "goal") {
    return scope.goalId;
  }

  return scope.type;
}

export function groupWorkspaceTasksByStatus(
  tasks: WorkspaceTask[],
): Record<TaskStatus, WorkspaceTask[]> {
  const groups = Object.fromEntries(
      TASK_BOARD_LANES.map((status) => [status, []])
  ) as unknown as Record<TaskStatus, WorkspaceTask[]>;

  for (const task of tasks) {
    groups[task.status].push(task);
  }

  return groups;
}
