type LegacyTaskParams = {
  goalId?: string;

  taskId?: string;

  parentTaskId?: string;

  action?: string;
};

export function buildLegacyTaskWorkspaceUrl(params: LegacyTaskParams) {
  const query = new URLSearchParams();

  if (params.goalId) {
    query.set("goal", params.goalId);
  }

  const taskId = params.taskId ?? params.parentTaskId;

  if (taskId) {
    query.set("task", taskId);
  }

  if (params.action === "create-subtask") {
    query.set("tab", "subtasks");
  }

  if (params.action === "edit") {
    query.set("tab", "overview");

    query.set("edit", "1");
  }

  const serialized = query.toString();

  return serialized ? `/workspace?${serialized}` : "/workspace";
}
