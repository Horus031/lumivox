import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { TASK_BOARD_LANES, type TaskStatus } from "@/features/tasks/task-status";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import type {
  WorkspaceBoardPages,
  WorkspaceBoardPagination,
  WorkspaceListOptions,
  WorkspaceListTask,
  WorkspaceScope,
  WorkspaceSubtaskCounts,
  WorkspaceTask,
} from "./workspace.types";

const taskWithGoal = "*,goals(id,title,goal_type,status)";
const subtaskCounts = "subtasks:tasks!parent_task_id(count),completed:tasks!parent_task_id(count)";
const LIST_PAGE_SIZE = 20;
const BOARD_LANE_PAGE_SIZE = 20;
const BOARD_PAGINATION_THRESHOLD = 100;
const ACTIVE_STATUSES = "todo,in_progress,overdue";

type SubtaskCountRows = { subtasks: { count: number }[]; completed: { count: number }[] };
type WithEmbeddedCounts<T> = Omit<T, keyof WorkspaceSubtaskCounts> & SubtaskCountRows;

function workspaceTaskCounts<T extends SubtaskCountRows>({ subtasks, completed, ...task }: T) {
  return {
    ...task,
    totalSubtasks: subtasks[0]?.count ?? 0,
    completedSubtasks: completed[0]?.count ?? 0,
  };
}

// Keep the server-side filter consistent with getTaskBoardStatus.
function effectiveStatusFilter(status: TaskStatus, now: string) {
  if (status === "overdue") return `and(status.in.(${ACTIVE_STATUSES}),due_at.lt.${now})`;
  if (status === "todo" || status === "in_progress") {
    const activeStatus = status === "todo" ? "status.eq.todo" : "status.in.(in_progress,overdue)";
    return `and(${activeStatus},or(due_at.is.null,due_at.gte.${now}))`;
  }
  return `status.eq.${status}`;
}

async function readTaskPage<T>(
  requestedPage: number,
  pageSize: number,
  readPage: (page: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
) {
  const totalPages = (total: number) => Math.max(1, Math.ceil(total / pageSize));
  let page = Math.min(requestedPage, Math.floor(2_147_483_647 / pageSize));
  let result = await readPage(page);

  // A concurrent deletion or a manually entered URL can put the page beyond the end.
  if (page > 1 && (result.status === 416 || result.count === 0)) {
    const first = await readPage(1);
    if (first.error) throw new Error(`Failed to load workspace tasks: ${first.error.message}`);
    page = totalPages(first.count ?? 0);
    result = page > 1 ? await readPage(page) : first;
    if (result.status === 416) {
      page = 1;
      result = first;
    }
  }
  if (result.error) throw new Error(`Failed to load workspace tasks: ${result.error.message}`);

  const total = result.count ?? 0;
  return { rows: result.data ?? [], page, totalPages: totalPages(total), total };
}

export async function getWorkspaceListPage(scope: WorkspaceScope, options: WorkspaceListOptions, now: string) {
  const { supabase, user } = await requireUser();
  const result = await readTaskPage(options.page, LIST_PAGE_SIZE, (page) => {
    const query = supabase
      .from("tasks")
      .select(`id,title,status,priority,due_at,due_date,completed_at,created_at,updated_at,${subtaskCounts}`, { count: "exact" })
      .eq("user_id", user.id)
      .is("parent_task_id", null)
      .eq("completed.status", "completed");

    if (scope.type === "goal") query.eq("goal_id", scope.goalId);
    else query.is("goal_id", null);
    if (options.status) query.or(effectiveStatusFilter(options.status, now));

    const offset = (page - 1) * LIST_PAGE_SIZE;
    return query
      .order("due_at", { ascending: options.sort === "asc", nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + LIST_PAGE_SIZE - 1)
      .overrideTypes<WithEmbeddedCounts<WorkspaceListTask>[], { merge: false }>();
  });

  return { tasks: result.rows.map(workspaceTaskCounts), page: result.page, totalPages: result.totalPages };
}

export async function getWorkspaceLinkedTask(taskId: string): Promise<TaskWithGoal | null> {
  if (!z.guid().safeParse(taskId).success) return null;

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .select(taskWithGoal)
    .eq("id", taskId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load linked task: ${error.message}`);
  return data;
}

export async function getWorkspaceBoard(scope: WorkspaceScope, pages: WorkspaceBoardPages, now: string): Promise<{
  tasks: WorkspaceTask[];
  pagination?: WorkspaceBoardPagination;
}> {
  const { supabase, user } = await requireUser();
  const countQuery = supabase.from("tasks").select("id", { head: true, count: "exact" })
    .eq("user_id", user.id)
    .is("parent_task_id", null);
  if (scope.type === "goal") countQuery.eq("goal_id", scope.goalId);
  else countQuery.is("goal_id", null);

  const { count, error } = await countQuery;
  if (error) throw new Error(`Failed to count workspace tasks: ${error.message}`);
  if (count === 0) return { tasks: [] };

  function readBoardTasks(from: number, limit: number, status?: TaskStatus) {
    const query = supabase
      .from("tasks")
      .select(`${taskWithGoal},${subtaskCounts}`, { count: "exact" })
      .eq("user_id", user.id)
      .is("parent_task_id", null)
      .eq("completed.status", "completed");

    if (scope.type === "goal") query.eq("goal_id", scope.goalId);
    else query.is("goal_id", null);
    if (status) query.or(effectiveStatusFilter(status, now));
    return query
      .order("due_at", { nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + limit - 1)
      .overrideTypes<WithEmbeddedCounts<WorkspaceTask>[], { merge: false }>();
  }

  if ((count ?? 0) <= BOARD_PAGINATION_THRESHOLD) {
    const full = await readBoardTasks(0, BOARD_PAGINATION_THRESHOLD);
    if (full.error) throw new Error(`Failed to load workspace board: ${full.error.message}`);
    if ((full.count ?? 0) <= BOARD_PAGINATION_THRESHOLD) {
      return { tasks: (full.data ?? []).map(workspaceTaskCounts) };
    }
  }

  const lanes = await Promise.all(TASK_BOARD_LANES.map(async (status) => {
    const result = await readTaskPage(pages[status] ?? 1, BOARD_LANE_PAGE_SIZE, (page) =>
      readBoardTasks((page - 1) * BOARD_LANE_PAGE_SIZE, BOARD_LANE_PAGE_SIZE, status),
    );
    return { status, ...result };
  }));

  return {
    tasks: lanes.flatMap(({ rows }) => rows.map(workspaceTaskCounts)),
    pagination: Object.fromEntries(lanes.map(({ status, page, total, totalPages }) =>
      [status, { page, total, totalPages }],
    )) as WorkspaceBoardPagination,
  };
}
