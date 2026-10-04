import type { TaskWithSubtasks } from "@/features/tasks/task.types";

export type WorkspaceScope =
  | {
      type: "all";
    }
  | {
      type: "unassigned";
    }
  | {
      type: "goal";
      goalId: string;
    };

export type WorkspaceTask = TaskWithSubtasks;