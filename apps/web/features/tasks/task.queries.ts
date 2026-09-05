import { requireUser } from "@/lib/auth/require-user";

import type { Task, TaskWithGoal, TaskWithSubtasks } from "./task.types";

type TasksPageFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  goalId?: string;
};

const TASK_WITH_GOAL_SELECT = `
  *,
  goals (
    id,
    title,
    goal_type,
    status
  )
`;

export async function getTasks() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_WITH_GOAL_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }

  return data;
}

export async function getTasksPage(filters: TasksPageFilters = {}) {
  const { supabase } = await requireUser();

  const pageSize = filters.pageSize ?? 8;
  const page = Math.max(1, filters.page ?? 1);

  let query = supabase
    .from("tasks")
    .select(TASK_WITH_GOAL_SELECT, { count: "exact" })
    .is("parent_task_id", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const search = filters.search?.trim();

  if (search) {
    const normalizedSearch = search.replace(/,/g, " ");
    query = query.or(
      `title.ilike.%${normalizedSearch}%,description.ilike.%${normalizedSearch}%`,
    );
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  if (filters.goalId) {
    query = query.eq("goal_id", filters.goalId);
  }

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize - 1;

  const { data, error, count } = await query.range(startIndex, endIndex);

  if (error) {
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }

  const rootTasks = (data ?? []) as TaskWithGoal[];
  const rootTaskIds = rootTasks.map((task) => task.id);
  let subtasks: TaskWithGoal[] = [];

  if (rootTaskIds.length > 0) {
    const { data: subtaskData, error: subtaskError } = await supabase
      .from("tasks")
      .select(TASK_WITH_GOAL_SELECT)
      .in("parent_task_id", rootTaskIds)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (subtaskError) {
      throw new Error(`Failed to fetch subtasks: ${subtaskError.message}`);
    }

    subtasks = (subtaskData ?? []) as TaskWithGoal[];
  }

  const subtasksByParentId = new Map<string, TaskWithGoal[]>();

  for (const subtask of subtasks) {
    if (!subtask.parent_task_id) continue;

    const existing = subtasksByParentId.get(subtask.parent_task_id) ?? [];
    existing.push(subtask);
    subtasksByParentId.set(subtask.parent_task_id, existing);
  }

  const totalCount = count ?? 0;

  return {
    tasks: rootTasks.map(
      (task): TaskWithSubtasks => ({
        ...task,
        subtasks: subtasksByParentId.get(task.id) ?? [],
      }),
    ),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function getTaskById(taskId: string | null) {
  const { supabase } = await requireUser();

  if (!taskId) return null;

  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_WITH_GOAL_SELECT)
    .eq("id", taskId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch task: ${error.message}`);
  }

  return data;
}
