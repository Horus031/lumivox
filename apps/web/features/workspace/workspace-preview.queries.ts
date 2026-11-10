import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { TASK_BOARD_LANES } from "@/features/tasks/task-status";
import type { Task } from "@/features/tasks/task.types";
import { resolveWorkspaceScope } from "./workspace.utils";

export const workspacePriorities = ["low", "medium", "high", "critical"] as const;
export const workspaceDeadlines = ["overdue", "upcoming", "none"] as const;

const filtersSchema = z.object({
  goal: z.string().optional(),
  q: z.string().trim().transform((value) => value.slice(0, 120)).optional(),
  status: z.enum(TASK_BOARD_LANES).optional().catch(undefined),
  priority: z.enum(workspacePriorities).optional().catch(undefined),
  deadline: z.enum(workspaceDeadlines).optional().catch(undefined),
});

const cursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  referenceNow: z.iso.datetime(),
  filters: z.string(),
});

export type TaskSummary = Pick<Task, "id" | "title" | "goal_id" | "status" | "priority" | "due_at" | "created_at" | "updated_at"> & {
  effective_status: Task["status"];
  goal_title: string | null;
  subtask_count: number;
  completed_subtask_count: number;
};

type TaskPage = { tasks: TaskSummary[]; total: number; hasMore: boolean; reviewCount: number };

function readCursor(value: string | undefined) {
  if (!value || value.length > 1600) return undefined;
  try {
    const cursor = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString()));
    return cursor.success ? cursor.data : undefined;
  } catch {
    return undefined;
  }
}

export async function getWorkspacePreview(params: Record<string, string | string[] | undefined>) {
  const raw = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  const filters = filtersSchema.parse(raw);
  const { supabase, user } = await requireUser();

  const goalId = z.uuid().safeParse(filters.goal);
  const selectedTaskId = z.uuid().safeParse(raw.task);
  const [goal, task] = await Promise.all([
    goalId.success
      ? supabase.from("goals").select("id,title").eq("user_id", user.id).eq("id", goalId.data).maybeSingle()
      : null,
    selectedTaskId.success
      ? supabase.from("tasks").select("*,goals(id,title,goal_type,status)").eq("user_id", user.id).eq("id", selectedTaskId.data).maybeSingle()
      : null,
  ]);
  if (goal?.error) throw goal.error;
  if (task?.error) throw task.error;

  const scope = resolveWorkspaceScope(filters.goal, goal?.data ? [goal.data.id] : []);
  const focus = !filters.goal && !filters.q && !filters.status && !filters.priority && !filters.deadline
    && raw.view !== "all" && raw.view !== "goals";
  const documents = scope.type === "goal" && raw.section === "documents";
  const key = JSON.stringify([scope, filters.q || null, filters.status, filters.priority, filters.deadline]);
  const candidate = readCursor(raw.after);
  const cursor = !focus && candidate?.filters === key ? candidate : undefined;
  const referenceNow = cursor?.referenceNow ?? new Date().toISOString();

  const request = documents || raw.view === "goals" ? null : supabase.rpc("get_workspace_task_page", {
    ...(scope.type === "goal" ? { p_goal_id: scope.goalId } : {}),
    p_unassigned: scope.type === "unassigned",
    p_search: filters.q || undefined,
    p_status: filters.status,
    p_priority: filters.priority,
    p_deadline: filters.deadline,
    p_after_created_at: cursor?.createdAt,
    p_after_id: cursor?.id,
    p_reference_now: referenceNow,
    p_focus: focus,
  });
  const goalTasks = () => supabase.from("tasks").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("goal_id", goal?.data?.id ?? "");
  const [result, totalGoalTasks, completedGoalTasks] = await Promise.all([
    request,
    goal?.data ? goalTasks() : null,
    goal?.data ? goalTasks().eq("status", "completed") : null,
  ]);
  if (result?.error) throw new Error(`Failed to load Workspace page: ${result.error.message}`);
  if (totalGoalTasks?.error) throw totalGoalTasks.error;
  if (completedGoalTasks?.error) throw completedGoalTasks.error;

  const page = result ? result.data as TaskPage : { tasks: [], total: 0, hasMore: false, reviewCount: 0 };
  const last = page.tasks.at(-1);
  const next = page.hasMore && last
    ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.created_at, referenceNow, filters: key })).toString("base64url")
    : null;

  const progress = { total: totalGoalTasks?.count ?? 0, completed: completedGoalTasks?.count ?? 0 };
  return { ...page, next, after: cursor ? raw.after : undefined, scope, filters, focus, documents, progress, goal: goal?.data, task: task?.data, missingTask: !!raw.task && !task?.data };
}

export async function getWorkspaceGoalsDirectory(params: Record<string, string | string[] | undefined>) {
  const { supabase, user } = await requireUser();
  const parsed = z.object({
    goalSearch: z.string().trim().max(120).catch("").optional(),
    goalStatus: z.enum(["active", "completed", "paused", "archived"]).optional().catch(undefined),
    page: z.coerce.number().int().min(1).max(10000).catch(1).optional(),
  }).parse(params);
  const search = parsed.goalSearch ?? "";
  const status = parsed.goalStatus;
  const page = parsed.page ?? 1;
  const limit = 20;
  const start = (page - 1) * limit;
  let query = supabase.from("goals").select("id,title,status", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(start, start + limit - 1);
  if (search) query = query.ilike("title", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) throw error;
  return { goals: data, search, status, page, hasNext: start + limit < (count ?? 0) };
}
