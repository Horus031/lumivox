import { requireUser } from "@/lib/auth/require-user";

import type { Task, TaskWithSubtasks } from "./task.types";

type TasksPageFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  goalId?: string;
};

type TasksPageRpcResponse = {
  tasks: TaskWithSubtasks[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getAvailableFocusTasks() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title")
    .in("status", ["todo", "in_progress", "overdue"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to fetch available focus tasks: ${error.message}`);
  }

  return data ?? [];
}

export async function getTasksPage(filters: TasksPageFilters = {}) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc("get_my_tasks_page", {
    p_page: Math.max(1, filters.page ?? 1),
    p_page_size: filters.pageSize ?? 8,
    p_search: filters.search?.trim() || undefined,
    p_status: filters.status,
    p_priority: filters.priority,
    p_goal_id: filters.goalId || undefined,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      `Failed to fetch tasks: ${error?.message ?? "Invalid response"}`,
    );
  }

  const result = data as unknown as TasksPageRpcResponse;

  return {
    tasks: result.tasks ?? [],
    totalCount: result.totalCount ?? 0,
    page: result.page ?? 1,
    pageSize: result.pageSize ?? (filters.pageSize ?? 8),
    totalPages: result.totalPages ?? 1,
  };
}
