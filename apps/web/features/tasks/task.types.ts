import type { Database } from "@/types/database.types";

export type Task =
  Database["public"]["Tables"]["tasks"]["Row"];

export type TaskWithGoal = Task & {
  goals:
    | {
        id: string;
        title: string;
        goal_type:
          | Database["public"]["Enums"]["goal_type"];
        status:
          | Database["public"]["Enums"]["goal_status"];
      }
    | null;
};