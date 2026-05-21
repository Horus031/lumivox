import type { Database } from "@/types/database.types";

export type FocusSession =
  Database["public"]["Tables"]["focus_sessions"]["Row"];

export type FocusSessionStatus =
  Database["public"]["Enums"]["focus_session_status"];

export type FocusSessionWithTask = FocusSession & {
  tasks:
    | {
        id: string;
        title: string;
        priority: Database["public"]["Enums"]["task_priority"];
        status: Database["public"]["Enums"]["task_status"];
      }
    | null;
};