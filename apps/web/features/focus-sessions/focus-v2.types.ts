import type { Database } from "@/types/database.types";

export type FocusV2Parent = Pick<
  Database["public"]["Tables"]["focus_sessions"]["Row"],
  | "id"
  | "user_id"
  | "task_id"
  | "session_mode"
  | "status"
  | "planned_minutes"
  | "actual_focus_minutes"
  | "started_at"
  | "ended_at"
>;
export type FocusV2Plan = Database["public"]["Tables"]["focus_session_plans"]["Row"];
export type FocusV2Segment = Database["public"]["Tables"]["focus_session_segments"]["Row"];

export type FocusV2Snapshot = {
  session: FocusV2Parent;
  plan: FocusV2Plan;
  segments: FocusV2Segment[];
  serverObservedAt: string;
};

export type FocusV2Action =
  | "pause"
  | "resume"
  | "complete"
  | "skip_break"
  | "start_next"
  | "cancel";

export type FocusV2TransitionResult = {
  parentStatus: "ongoing" | "paused" | "completed" | "cancelled";
  segmentId: string | null;
  nextSegmentId: string | null;
  parentCompleted: boolean;
  nextStarted?: boolean;
};

export type FocusV2Projection = {
  phase: "running" | "paused" | "awaiting_next" | "completed" | "cancelled" | "invalid";
  current: FocusV2Segment | null;
  next: FocusV2Segment | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  isDue: boolean;
};
