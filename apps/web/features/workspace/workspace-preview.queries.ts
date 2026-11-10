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

type TaskSummary = Pick<Task, "id" | "title" | "goal_id" | "status" | "priority" | "due_at" | "created_at" | "updated_at"> & {
  effective_status: Task["status"];
  goal_title: string | null;
  subtask_count: number;
  completed_subtask_count: number;
};

type TaskPage = { tasks: TaskSummary[]; total: number; hasMore: boolean };

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
  const key = JSON.stringify([scope, filters.q || null, filters.status, filters.priority, filters.deadline]);
  const candidate = readCursor(raw.after);
  const cursor = candidate?.filters === key ? candidate : undefined;
  const referenceNow = cursor?.referenceNow ?? new Date().toISOString();

  const { data, error } = await supabase.rpc("get_workspace_task_page", {
    ...(scope.type === "goal" ? { p_goal_id: scope.goalId } : {}),
    p_unassigned: scope.type === "unassigned",
    p_search: filters.q || undefined,
    p_status: filters.status,
    p_priority: filters.priority,
    p_deadline: filters.deadline,
    p_after_created_at: cursor?.createdAt,
    p_after_id: cursor?.id,
    p_reference_now: referenceNow,
  });
  if (error) throw new Error(`Failed to load Workspace page: ${error.message}`);

  const page = data as TaskPage;
  const last = page.tasks.at(-1);
  const next = page.hasMore && last
    ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.created_at, referenceNow, filters: key })).toString("base64url")
    : null;

  return { ...page, next, after: cursor ? raw.after : undefined, scope, filters, goal: goal?.data, task: task?.data, missingTask: !!raw.task && !task?.data };
}
