import { requireUser } from "@/lib/auth/require-user";

import type { Task, TaskWithGoal } from "./task.types";

type TasksPageFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  goalId?: string;
};

export async function getTasks() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      goals (
        id,
        title,
        goal_type,
        status
      )
    `
    )
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
    .select(
      `
      *,
      goals (
        id,
        title,
        goal_type,
        status
      )
    `,
      { count: "exact" }
    )
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const search = filters.search?.trim();

  if (search) {
    const normalizedSearch = search.replace(/,/g, " ");
    query = query.or(
      `title.ilike.%${normalizedSearch}%,description.ilike.%${normalizedSearch}%`
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

  const totalCount = count ?? 0;

  return {
    tasks: data as TaskWithGoal[],
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function getTaskById(taskId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      goals (
        id,
        title,
        goal_type,
        status
      )
    `
    )
    .eq("id", taskId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch task: ${error.message}`);
  }

  return data;
}