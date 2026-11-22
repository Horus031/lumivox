import { requireUser } from "@/lib/auth/require-user";
import { z } from "zod";

import type { WorkspaceScope, WorkspaceTask } from "./workspace.types";

const taskWithGoal = "*, goals (id, title, goal_type, status)";

export async function getWorkspaceLinkedTask(taskId: string): Promise<WorkspaceTask | null> {
  if (!z.guid().safeParse(taskId).success) return null;

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .select(taskWithGoal)
    .eq("id", taskId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load linked task: ${error.message}`);
  return data ? { ...data, subtasks: [] } : null;
}

export async function getWorkspaceTasks(scope: WorkspaceScope): Promise<WorkspaceTask[]> {
  const { supabase, user } = await requireUser();

  const rootTasksQuery = supabase
    .from("tasks")
    .select(taskWithGoal)
    .eq("user_id", user.id)
    .is("parent_task_id", null)
    .order("due_at", {
      ascending: true,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: false,
    });

  const { data: rootTasks, error: rootTasksError } = await (scope.type === "goal"
    ? rootTasksQuery.eq("goal_id", scope.goalId)
    : rootTasksQuery.is("goal_id", null));

  if (rootTasksError) {
    throw new Error(`Failed to load workspace tasks: ${rootTasksError.message}`);
  }

  if (!rootTasks?.length) {
    return [];
  }

  const rootTaskIds = rootTasks.map((task) => task.id);

  const { data: subtasks, error: subtasksError } = await supabase
    .from("tasks")
    .select(taskWithGoal)
    .eq("user_id", user.id)
    .in("parent_task_id", rootTaskIds)
    .order("created_at", {
      ascending: true,
    });

  if (subtasksError) {
    throw new Error(`Failed to load workspace subtasks: ${subtasksError.message}`);
  }

  const subtasksByParent = new Map<string, typeof subtasks>();

  for (const subtask of subtasks ?? []) {
    if (!subtask.parent_task_id) {
      continue;
    }

    const existing = subtasksByParent.get(subtask.parent_task_id) ?? [];

    existing.push(subtask);

    subtasksByParent.set(subtask.parent_task_id, existing);
  }

  return rootTasks.map((task) => ({
    ...task,
    subtasks: subtasksByParent.get(task.id) ?? [],
  })) as WorkspaceTask[];
}
