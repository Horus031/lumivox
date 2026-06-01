import type { Database } from "@/types/database.types";

export type Goal = Database["public"]["Tables"]["goals"]["Row"];

export type GoalWithProgress = Goal & {
  total_tasks: number;
  completed_tasks: number;
  computed_progress: number;
};
