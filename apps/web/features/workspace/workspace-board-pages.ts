import { z } from "zod";
import { TASK_BOARD_LANES, type TaskStatus } from "@/features/tasks/task-status";
import type { TaskSummary } from "./workspace-preview.queries";

export const workspacePriorities = ["low", "medium", "high", "critical"] as const;
export const workspaceDeadlines = ["overdue", "upcoming", "none"] as const;

export const workspaceFiltersSchema = z.object({
  goal: z.string().optional(),
  q: z.string().trim().transform((value) => value.slice(0, 120)).optional(),
  status: z.enum(TASK_BOARD_LANES).optional().catch(undefined),
  priority: z.enum(workspacePriorities).optional().catch(undefined),
  deadline: z.enum(workspaceDeadlines).optional().catch(undefined),
});

export type WorkspaceFilters = z.output<typeof workspaceFiltersSchema>;
export type BoardLanePage = { tasks: TaskSummary[]; total: number; hasMore: boolean };
export type BoardLanePages = Record<TaskStatus, BoardLanePage>;

export function isInitiallyOpenLane(lane: TaskStatus, filterStatus?: TaskStatus) {
  return filterStatus ? lane === filterStatus : lane !== "completed" && lane !== "cancelled";
}
