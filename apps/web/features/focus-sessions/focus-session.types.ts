import type { Database } from "@/types/database.types";

export type FocusSession =
  Database["public"]["Tables"]["focus_sessions"]["Row"];

export type FocusSessionStatus =
  Database["public"]["Enums"]["focus_session_status"];

type FocusSessionTaskPreview = {
  id: string;
  title: string;
};

export type ActiveFocusSessionWithTask = Pick<
  FocusSession,
  | "id"
  | "planned_minutes"
  | "started_at"
  | "total_paused_seconds"
  | "paused_at"
  | "status"
> & {
  tasks: FocusSessionTaskPreview | null;
};

export type RecentFocusSessionWithTask = Pick<
  FocusSession,
  "id" | "planned_minutes" | "actual_focus_minutes" | "status"
> & {
  tasks: FocusSessionTaskPreview | null;
};

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
