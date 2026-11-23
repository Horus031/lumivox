import type { Database } from "@/types/database.types";

export type Goal = Database["public"]["Tables"]["goals"]["Row"];

export type GoalOption = Pick<Goal, "id" | "title">;

export type GoalPageItem = GoalOption & Pick<Goal, "created_at"> & {
  completed_tasks: number | null;
  total_tasks: number | null;
};

export type GoalPageCursor = Pick<GoalPageItem, "created_at" | "id">;

export type GoalPage = {
  items: GoalPageItem[];
  nextCursor: GoalPageCursor | null;
};

export type GoalWithProgress = Goal & {
  total_tasks: number;
  completed_tasks: number;
  computed_progress: number;
};
