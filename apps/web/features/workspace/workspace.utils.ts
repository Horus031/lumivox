import { isTaskStatus, TASK_BOARD_LANES, type TaskStatus } from "../tasks/task-status";
import { getTaskBoardStatus } from "@/features/tasks/task-transition";
import type { WorkspaceBoardPages, WorkspaceListOptions, WorkspaceScope, WorkspaceTask, WorkspaceView } from "./workspace.types";

export function resolveWorkspaceView(value: string | undefined): WorkspaceView {
  return value === "list" || value === "timeline" ? value : "board";
}

export function resolveWorkspaceListOptions(params: {
  status?: string;
  sort?: string;
  page?: string;
}): WorkspaceListOptions {
  const page = typeof params.page === "string" && /^\d+$/.test(params.page) ? Number(params.page) : 1;
  return {
    status: params.status && isTaskStatus(params.status) ? params.status : undefined,
    sort: params.sort === "desc" ? "desc" : "asc",
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
  };
}

export function workspaceViewParams(goal: string, view: WorkspaceView, list?: WorkspaceListOptions) {
  return {
    goal,
    view: view === "board" ? undefined : view,
    status: view === "list" ? list?.status : undefined,
    sort: view === "list" && list?.sort === "desc" ? list.sort : undefined,
  };
}

export function workspaceHref(goal: string, view: WorkspaceView, list?: WorkspaceListOptions, task?: string) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(workspaceViewParams(goal, view, list))) {
    if (value !== undefined) params.set(name, value);
  }
  if (view === "list" && list && list.page > 1) params.set("page", String(list.page));
  if (task) params.set("task", task);
  return `/workspace?${params}`;
}

export function resolveWorkspaceBoardPages(value: string | undefined): WorkspaceBoardPages {
  const pages: WorkspaceBoardPages = {};
  if (typeof value !== "string") return pages;

  for (const entry of value.split(",")) {
    const [status, rawPage] = entry.split(":");
    if (!isTaskStatus(status) || !/^\d+$/.test(rawPage ?? "")) continue;
    const page = Number(rawPage);
    if (Number.isSafeInteger(page) && page > 1) pages[status] = page;
  }
  return pages;
}

export function workspaceBoardHref(goal: string, pages: WorkspaceBoardPages) {
  const lanes = TASK_BOARD_LANES.flatMap((status) => {
    const page = pages[status] ?? 1;
    return page > 1 ? [`${status}:${page}`] : [];
  });
  const href = workspaceHref(goal, "board");
  return lanes.length ? `${href}&${new URLSearchParams({ lanes: lanes.join(",") })}` : href;
}

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
