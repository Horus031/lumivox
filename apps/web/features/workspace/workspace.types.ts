import type { Task, TaskWithGoal } from "@/features/tasks/task.types";
import type { TaskStatus } from "@/features/tasks/task-status";

export type WorkspaceScope =
  | {
      type: "unassigned";
    }
  | {
      type: "goal";
      goalId: string;
    };

export type WorkspaceSubtaskCounts = {
  totalSubtasks: number;
  completedSubtasks: number;
};

export type WorkspaceTask = TaskWithGoal & WorkspaceSubtaskCounts;

export type WorkspaceBoardPages = Partial<Record<TaskStatus, number>>;
export type WorkspaceBoardPagination = Record<TaskStatus, { page: number; totalPages: number; total: number }>;

export type WorkspaceView = "list" | "board" | "timeline";

export type WorkspaceListOptions = {
  status?: TaskStatus;
  sort: "asc" | "desc";
  page: number;
};

export type WorkspaceListTask = Pick<
  Task,
  "id" | "title" | "status" | "priority" | "due_at" | "due_date" | "completed_at" | "created_at" | "updated_at"
> & WorkspaceSubtaskCounts;

export type WorkspaceTimelineTask = Pick<Task, "id" | "title" | "status" | "due_at" | "due_date"> & {
  schedule: { starts_on: string; ends_on: string; status: string }[];
};
