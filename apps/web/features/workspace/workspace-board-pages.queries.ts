import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import type { TaskStatus } from "@/features/tasks/task-status";
import type { BoardLanePages, WorkspaceFilters } from "./workspace-board-pages";

export async function getWorkspaceBoardPages(
  filters: WorkspaceFilters,
  referenceNow: string,
  open: TaskStatus[],
  lane?: TaskStatus,
  after?: { createdAt: string; id: string },
) {
  const { supabase } = await requireUser();
  const goal = z.uuid().safeParse(filters.goal);
  const { data, error } = await supabase.rpc("get_workspace_task_page", {
    p_goal_id: goal.success ? goal.data : undefined,
    p_unassigned: filters.goal === "unassigned",
    p_search: filters.q || undefined,
    p_status: filters.status,
    p_priority: filters.priority,
    p_deadline: filters.deadline,
    p_reference_now: referenceNow,
    p_board_open: open,
    p_board_lane: lane,
    p_after_created_at: after?.createdAt,
    p_after_id: after?.id,
  });
  if (error) throw new Error(`Failed to load Workspace board: ${error.message}`);
  return data as BoardLanePages;
}
