import type { WorkspaceTask } from "./workspace.types";

export function workspaceTask(
  overrides: Partial<WorkspaceTask> = {},
): WorkspaceTask {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    goal_id: null,
    parent_task_id: null,
    title: "Study task",
    description: null,
    source_roadmap_id: null,
    source_roadmap_node_id: null,
    status: "todo",
    priority: "medium",
    estimated_minutes: null,
    due_at: null,
    due_date: null,
    completed_at: null,
    created_at: "2026-10-04T10:00:00Z",
    updated_at: "2026-10-04T10:00:00Z",
    goals: null,
    subtasks: [],
    ...overrides,
  };
}
